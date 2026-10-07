"""Column-level lineage of the pandas scripts the platform runs on a dataset (``/api/execute``).

The script reads and writes the DataFrame ``df``. Two independent analyses establish which input columns every output
column depends on and how:

Static data-flow analysis (``analyse``)
    An abstract interpretation of the script over its syntax tree. Every write to a column creates a *version node*
    that records the nodes it reads as values (``data``, with the OpenLineage subtype IDENTITY / TRANSFORMATION /
    AGGREGATION), the nodes that decide which rows or branches are affected (``control``: masks, ``np.where`` and
    ``if`` conditions), group-by keys, the lookup tables it maps through and the operations applied. Version nodes keep
    the graph acyclic and separate overwritten writes from the writes that reach the output. Loops over literal column
    lists are unrolled, ``if col in df.columns`` guards are decided, user functions (``apply``) are followed.

Runtime verification (``trace``, ``probe``)
    ``trace`` replays the script statement by statement in the platform's sandbox and records every cell each statement
    changes; ``probe`` re-runs the script with one input column perturbed, emptied or filled and reports which output
    columns change - an empirical dependency test that does not rely on the static analysis.
"""
from __future__ import annotations

import ast
import copy
import math
import re
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Callable, Dict, Iterable, List, Optional, Set, Tuple

import numpy as np
import pandas as pd

_MISSING = object()
_LEVEL = {"IDENTITY": 0, "TRANSFORMATION": 1, "AGGREGATION": 2}
FRAME_ATTRIBUTES = set(dir(pd.DataFrame))
MAX_UNROLL = 400
MAX_CALL_DEPTH = 6
MAX_LOOKUP_ENTRIES = 200

SAFE_BUILTINS: Dict[str, Any] = {
    name: getattr(__builtins__, name, None) if not isinstance(__builtins__, dict) else __builtins__.get(name)
    for name in (
        "len", "range", "enumerate", "zip", "sorted", "reversed", "list", "tuple", "dict", "set", "str", "int", "float",
        "bool", "min", "max", "sum", "abs", "round", "any", "all", "isinstance",
    )
}
_BUILTIN_NAMES = {
    "len", "range", "enumerate", "zip", "map", "filter", "sum", "min", "max", "abs", "round", "int", "float", "str",
    "list", "dict", "set", "tuple", "print", "isinstance", "type", "sorted", "reversed", "any", "all", "bool", "next",
    "iter", "callable", "getattr", "hasattr", "divmod", "pow", "format",
}
_NULL_CHECKS = {"isna", "isnull", "notna", "notnull"}
_COMPARISONS = {"eq", "ne", "lt", "le", "gt", "ge", "between", "isin", "duplicated"}
_STRING_MASKS = {"contains", "startswith", "endswith", "match", "fullmatch", "isnumeric", "isdigit", "isalpha", "isalnum", "isspace", "islower", "isupper"}
_AGGREGATIONS = {
    "sum", "mean", "median", "min", "max", "count", "std", "var", "nunique", "prod", "product", "first", "last", "mode",
    "quantile", "idxmax", "idxmin", "size", "sem", "skew", "kurt", "any", "all",
}
_CUMULATIVE = {"cumsum", "cumprod", "cummax", "cummin", "rolling", "expanding", "ewm", "rank"}
_SHIFTS = {"shift", "diff", "pct_change"}
_CASTS = {"astype", "convert_dtypes", "infer_objects"}
_ROUNDING = {"round", "floor", "ceil", "clip", "abs"}
_ARITHMETIC_METHODS = {
    "add", "sub", "mul", "div", "truediv", "floordiv", "mod", "pow", "radd", "rsub", "rmul", "rdiv", "rtruediv",
    "multiply", "subtract", "divide", "dot",
}
_PASSTHROUGH = {"copy", "to_list", "tolist", "to_numpy", "squeeze", "reset_index", "sort_index", "rename", "set_axis", "reindex", "view", "item"}
_LIST_MUTATORS = {"append", "extend", "insert", "remove", "pop", "sort", "reverse", "clear"}
_DICT_MUTATORS = {"update", "pop", "setdefault", "clear"}
_NP_MATH = {
    "maximum", "minimum", "round", "around", "abs", "absolute", "log", "log10", "log2", "log1p", "exp", "sqrt", "floor",
    "ceil", "clip", "sign", "power", "fmax", "fmin", "fabs", "trunc", "nan_to_num", "where", "select",
}


class LineageError(Exception):
    """The script cannot be analysed (syntax error, no DataFrame result)."""


# --------------------------------------------------------------------------------------------------
# Abstract values
# --------------------------------------------------------------------------------------------------

class Deps:
    """Dependencies of a value: version nodes read as data (with subtype), control and group-by nodes, lookups."""

    __slots__ = ("data", "control", "group", "join", "lookups", "uses", "ops")

    def __init__(self, data=None, control=None, group=None, lookups=None, uses=None, ops=None, join=None):
        self.data: Dict[int, str] = dict(data or {})
        self.control: Set[int] = set(control or ())
        self.group: Set[int] = set(group or ())
        self.join: Set[int] = set(join or ())
        self.lookups: Set[str] = set(lookups or ())
        self.uses: Set[str] = set(uses or ())
        self.ops: List[str] = list(ops or ())

    def copy(self) -> "Deps":
        return Deps(self.data, self.control, self.group, self.lookups, self.uses, self.ops, self.join)

    def add(self, other: Optional["Deps"], as_control: bool = False) -> "Deps":
        if other is None:
            return self
        if as_control:
            self.control |= set(other.data) | other.control | other.group | other.join
        else:
            for node, level in other.data.items():
                self._data(node, level)
            self.control |= other.control
            self.group |= other.group
            self.join |= other.join
            for name in other.ops:
                self.op(name)
        self.lookups |= other.lookups
        self.uses |= other.uses
        return self

    def _data(self, node: int, level: str) -> None:
        current = self.data.get(node)
        if current is None or _LEVEL[level] > _LEVEL[current]:
            self.data[node] = level

    def lift(self, level: str) -> "Deps":
        for node, current in list(self.data.items()):
            if _LEVEL[current] < _LEVEL[level]:
                self.data[node] = level
        return self

    def op(self, *names: str) -> "Deps":
        for name in names:
            if name and name not in self.ops:
                self.ops.append(name)
        return self

    def nodes(self) -> Set[int]:
        return set(self.data) | self.control | self.group | self.join


@dataclass
class Col:
    """A column of an abstract frame: a materialised version node, or pending dependencies of a frame expression."""

    node: Optional[int] = None
    deps: Optional[Deps] = None
    renamed_from: Optional[str] = None

    def as_deps(self) -> Deps:
        if self.node is not None:
            return Deps(data={self.node: "IDENTITY"})
        return (self.deps or Deps()).copy()

    def clone(self) -> "Col":
        return Col(self.node, self.deps.copy() if self.deps is not None else None, self.renamed_from)


@dataclass
class Frame:
    columns: Dict[str, Col] = field(default_factory=dict)
    row_ops: List[Dict[str, Any]] = field(default_factory=list)  # filters, sorts, joins: indirect for every column

    def copy(self) -> "Frame":
        return Frame({name: col.clone() for name, col in self.columns.items()}, [dict(op) for op in self.row_ops])


@dataclass
class Value:
    kind: str
    deps: Deps = field(default_factory=Deps)
    literal: Any = _MISSING
    frame: Optional[Frame] = None
    func: Any = None
    name: str = ""
    base: Optional["Value"] = None
    column: Optional[str] = None
    items: Optional[List["Value"]] = None
    keys: Optional[Deps] = None
    selected: Optional["Value"] = None
    accessor: str = ""
    approx: bool = False
    choices: Optional[Tuple[Any, ...]] = None  # the literal values a non-literal value can take (``a if c else b``)
    source: Optional[ast.AST] = None


class _FrameProxy:
    """Stands in for a frame during literal evaluation: only ``.columns`` is available."""

    def __init__(self, columns: List[str]):
        self.columns = _ColumnList(columns)


class _ColumnList(list):
    def tolist(self) -> List[Any]:
        return list(self)

    to_list = tolist


class _Cancelled(Exception):
    pass


# --------------------------------------------------------------------------------------------------
# Static analysis
# --------------------------------------------------------------------------------------------------

class _Analyzer:
    def __init__(self, code: str, input_columns: List[str]):
        self.code = code
        self.nodes: List[Dict[str, Any]] = []
        self.versions: Dict[str, int] = {}
        self.steps: List[Dict[str, Any]] = []
        self.unresolved: List[Dict[str, Any]] = []
        self.lookups: Dict[str, Dict[str, Any]] = {}
        self.lookup_uses: List[Dict[str, Any]] = []
        self.var_lines: Dict[str, Tuple[int, int]] = {}
        self.scopes: List[Dict[str, Value]] = [{}]
        self.global_decls: List[Set[str]] = [set()]
        self.control: List[Tuple[Deps, Dict[str, Any]]] = []
        self.bindings: List[Tuple[str, Any]] = []
        self.returns: List[List[Value]] = []
        self.fn_conditions: List[Deps] = []
        self.refs: Dict[int, str] = {}
        self.ref_nodes: Dict[int, int] = {}
        self.step: Optional[Dict[str, Any]] = None
        self.statement: Optional[ast.stmt] = None
        self.call_depth = 0
        self.quiet = 0
        self.possible = 0  # inside a loop over a computed column selection: writes may or may not happen
        self.full_branch_writes: List[Set[str]] = []
        frame = Frame()
        for column in input_columns:
            frame.columns[column] = Col(node=self._node(column, "source", Deps()))
        self.scopes[0]["df"] = Value("frame", frame=frame, name="df")

    # ---------------------------------------------------------------- helpers

    def _source(self, node: Optional[ast.AST]) -> str:
        if node is None:
            return ""
        segment = ast.get_source_segment(self.code, node)
        if segment is None:
            try:
                segment = ast.unparse(node)
            except Exception:
                segment = ""
        return segment

    def _lookup(self, name: str) -> Optional[Value]:
        for scope in reversed(self.scopes):
            if name in scope:
                return scope[name]
        return None

    def _bind(self, name: str, value: Value, node: Optional[ast.AST]) -> None:
        scope = self.scopes[0] if name in self.global_decls[-1] else self.scopes[-1]
        scope[name] = value
        if len(self.scopes) == 1 and node is not None:
            self.var_lines[name] = (node.lineno, getattr(node, "end_lineno", node.lineno) or node.lineno)
            if self.step is not None and name not in self.step["defines"]:
                self.step["defines"].append(name)

    def _unresolved(self, node: Optional[ast.AST], reason: str, detail: str = "") -> None:
        if self.quiet:
            return
        line = getattr(node, "lineno", None) or (self.statement.lineno if self.statement else 0)
        entry = {"line": line, "reason": reason, "detail": detail[:240], "code": self._source(self.statement)[:400] if self.statement else ""}
        if entry not in self.unresolved:
            self.unresolved.append(entry)
        if self.step is not None:
            self.step["unresolved"] = True

    def _node(self, column: str, kind: str, deps: Deps, **extra: Any) -> int:
        version = self.versions.get(column, -1) + 1
        self.versions[column] = version
        statement = self.statement
        node = {
            "id": len(self.nodes),
            "column": column,
            "version": version,
            "kind": kind,
            "step": self.step["id"] if self.step is not None and kind != "source" else None,
            "line": statement.lineno if statement is not None and kind != "source" else None,
            "end_line": (statement.end_lineno or statement.lineno) if statement is not None and kind != "source" else None,
            "data": dict(deps.data),
            "control": sorted(deps.control),
            "group": sorted(deps.group),
            "join": sorted(deps.join),
            "lookups": sorted(deps.lookups),
            "uses": sorted(deps.uses),
            "ops": list(deps.ops),
        }
        node.update(extra)
        self.nodes.append(node)
        return node["id"]

    def _read_column(self, frame: Frame, column: Any, node: ast.AST, row_deps: Optional[Deps] = None) -> Value:
        name = column if isinstance(column, str) else str(column)
        col = frame.columns.get(column) if column in frame.columns else frame.columns.get(name)
        if col is None:
            self._unresolved(node, "missing_column", name)
            return Value("series", Deps(), column=name)
        deps = col.as_deps()
        if row_deps is not None:
            deps.add(row_deps, as_control=True)
        self.refs[id(node)] = name
        if col.node is not None:
            self.ref_nodes[id(node)] = col.node
        if self.step is not None and name not in self.step["reads"]:
            self.step["reads"].append(name)
        return Value("series", deps, column=name, frame=frame)

    @staticmethod
    def _options(value: Value) -> Optional[List[Any]]:
        """The literal values a value can take: its literal, or the alternatives of a conditional choice."""
        if value.literal is not _MISSING:
            try:
                hash(value.literal)
            except TypeError:
                return None
            return [value.literal]
        if value.choices:
            return list(value.choices)
        return None

    def _literal_of(self, node: Optional[ast.AST]) -> Any:
        if node is None:
            return _MISSING
        return self.eval(node).literal

    def _try_literal(self, node: ast.AST) -> Any:
        """Evaluate an expression that only involves literals, safe builtins and ``df.columns``."""
        bound_inside: Set[str] = set()
        for sub in ast.walk(node):
            if isinstance(sub, ast.comprehension):
                for target in ast.walk(sub.target):
                    if isinstance(target, ast.Name):
                        bound_inside.add(target.id)
        namespace: Dict[str, Any] = {}
        for sub in ast.walk(node):
            if isinstance(sub, ast.Attribute) and sub.attr.startswith("_"):
                return _MISSING
            if isinstance(sub, (ast.Lambda, ast.NamedExpr, ast.Await, ast.Yield, ast.YieldFrom, ast.Starred)):
                return _MISSING
            if isinstance(sub, ast.BinOp) and isinstance(sub.op, (ast.Pow, ast.LShift)):
                return _MISSING
            if isinstance(sub, ast.Constant) and isinstance(sub.value, int) and not isinstance(sub.value, bool) and abs(sub.value) > 10 ** 6:
                return _MISSING
            if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Attribute) and sub.func.attr in (_LIST_MUTATORS | _DICT_MUTATORS | {"add", "discard"}):
                return _MISSING
            if isinstance(sub, ast.Name) and isinstance(sub.ctx, ast.Load) and sub.id not in bound_inside:
                value = self._lookup(sub.id)
                if value is not None and value.literal is not _MISSING and not value.approx:
                    namespace[sub.id] = copy.deepcopy(value.literal)
                elif value is not None and value.kind == "frame":
                    namespace[sub.id] = _FrameProxy(list(value.frame.columns))
                elif value is None and sub.id in SAFE_BUILTINS and SAFE_BUILTINS[sub.id] is not None:
                    namespace[sub.id] = SAFE_BUILTINS[sub.id]
                else:
                    return _MISSING
        try:
            result = eval(compile(ast.Expression(body=node), "<lineage>", "eval"), {"__builtins__": {}}, namespace)
        except Exception:
            return _MISSING
        if isinstance(result, _FrameProxy) or callable(result):
            return _MISSING
        if isinstance(result, (map, filter, zip, enumerate, range, reversed)) or type(result).__name__.endswith("iterator") or isinstance(result, type((x for x in []))):
            try:
                result = list(result)
            except Exception:
                return _MISSING
            if len(result) > MAX_UNROLL:
                return _MISSING
        return result

    def _uses_frame_columns(self, node: ast.AST) -> Optional[Frame]:
        for sub in ast.walk(node):
            if isinstance(sub, ast.Attribute) and sub.attr == "columns" and isinstance(sub.value, ast.Name):
                value = self._lookup(sub.value.id)
                if value is not None and value.kind == "frame":
                    return value.frame
        return None

    # ---------------------------------------------------------------- expressions

    def eval(self, node: ast.AST) -> Value:
        if isinstance(node, ast.Constant):
            return Value("literal", literal=node.value)
        if isinstance(node, (ast.List, ast.Tuple, ast.Set, ast.Dict, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp,
                             ast.Compare, ast.BinOp, ast.BoolOp, ast.UnaryOp, ast.Call, ast.Subscript, ast.JoinedStr, ast.Attribute, ast.IfExp)):
            literal = self._try_literal(node)
            if literal is not _MISSING:
                return Value("literal", literal=literal)
        method = getattr(self, f"_eval_{type(node).__name__}", None)
        if method is not None:
            return method(node)
        deps = Deps()
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.expr):
                deps.add(self.eval(child).deps)
        return Value("unknown", deps.lift("TRANSFORMATION"))

    def _eval_Name(self, node: ast.Name) -> Value:
        value = self._lookup(node.id)
        if value is not None:
            if value.kind in ("series", "mask", "scalar", "unknown") and node.id in self.var_lines:
                result = copy.copy(value)
                result.deps = value.deps.copy()
                result.deps.uses.add(node.id)
                return result
            if value.literal is not _MISSING and isinstance(value.literal, (dict, list)) and node.id in self.var_lines:
                result = copy.copy(value)
                result.deps = value.deps.copy()
                result.deps.uses.add(node.id)
                result.name = node.id
                return result
            return value
        if node.id in ("pd", "pandas"):
            return Value("module", name="pd")
        if node.id in ("np", "numpy"):
            return Value("module", name="np")
        if node.id in _BUILTIN_NAMES:
            return Value("builtin", name=node.id)
        return Value("unknown", name=node.id)

    def _sequence(self, node: ast.AST, elements: List[ast.AST]) -> Value:
        items = [self.eval(element) for element in elements]
        deps = Deps()
        for item in items:
            deps.add(item.deps)
        return Value("unknown", deps, items=items)

    def _eval_List(self, node: ast.List) -> Value:
        return self._sequence(node, node.elts)

    def _eval_Tuple(self, node: ast.Tuple) -> Value:
        return self._sequence(node, node.elts)

    def _eval_Set(self, node: ast.Set) -> Value:
        return self._sequence(node, node.elts)

    def _eval_Dict(self, node: ast.Dict) -> Value:
        return self._sequence(node, [item for item in [*node.keys, *node.values] if item is not None])

    def _eval_JoinedStr(self, node: ast.JoinedStr) -> Value:
        deps = Deps()
        for part in node.values:
            if isinstance(part, ast.FormattedValue):
                deps.add(self.eval(part.value).deps)
        return Value("series" if deps.data else "scalar", deps.lift("TRANSFORMATION").op("string"))

    def _eval_BinOp(self, node: ast.BinOp) -> Value:
        left, right = self.eval(node.left), self.eval(node.right)
        deps = Deps().add(left.deps).add(right.deps)
        if isinstance(node.op, (ast.BitAnd, ast.BitOr, ast.BitXor)) and (left.kind == "mask" or right.kind == "mask"):
            return Value("mask", deps.op("boolean"))
        kind = "series" if any(item.kind in ("series", "mask") for item in (left, right)) else "scalar"
        return Value(kind, deps.lift("TRANSFORMATION").op("arithmetic"))

    def _eval_UnaryOp(self, node: ast.UnaryOp) -> Value:
        operand = self.eval(node.operand)
        if isinstance(node.op, (ast.Not, ast.Invert)):
            return Value("mask" if operand.kind in ("mask", "series") else "scalar", operand.deps.copy().op("boolean"))
        return Value(operand.kind if operand.kind in ("series", "scalar") else "scalar", operand.deps.copy().lift("TRANSFORMATION").op("arithmetic"))

    def _eval_BoolOp(self, node: ast.BoolOp) -> Value:
        deps = Deps()
        kinds = []
        for item in node.values:
            value = self.eval(item)
            deps.add(value.deps)
            kinds.append(value.kind)
        return Value("mask" if "mask" in kinds or "series" in kinds else "scalar", deps.op("boolean"))

    def _eval_Compare(self, node: ast.Compare) -> Value:
        deps = Deps()
        kinds = []
        for item in [node.left, *node.comparators]:
            value = self.eval(item)
            deps.add(value.deps)
            kinds.append(value.kind)
        return Value("mask" if "series" in kinds or "mask" in kinds else "scalar", deps.lift("TRANSFORMATION").op("comparison"))

    def _eval_IfExp(self, node: ast.IfExp) -> Value:
        test = self.eval(node.test)
        if test.literal is not _MISSING:
            return self.eval(node.body if test.literal else node.orelse)
        body, orelse = self.eval(node.body), self.eval(node.orelse)
        deps = Deps().add(body.deps).add(orelse.deps).add(test.deps, as_control=True).op("conditional")
        result = Value("series" if "series" in (body.kind, orelse.kind) else "scalar", deps)
        first, second = self._options(body), self._options(orelse)
        if first is not None and second is not None:
            result.choices = tuple(dict.fromkeys([*first, *second]))
        return result

    def _eval_Lambda(self, node: ast.Lambda) -> Value:
        return Value("userfunc", func=node, name="lambda")

    def _comprehension(self, node: ast.AST, generators: List[ast.comprehension], elements: List[ast.AST]) -> Value:
        deps = Deps()
        frame = self._uses_frame_columns(node)
        for generator in generators:
            deps.add(self.eval(generator.iter).deps)
            self.scopes.append({})
            self.global_decls.append(set())
            self.quiet += 1 if frame is not None else 0
            try:
                for target in ast.walk(generator.target):
                    if isinstance(target, ast.Name):
                        self.scopes[-1][target.id] = Value("unknown", deps.copy())
                for condition in generator.ifs:
                    deps.add(self.eval(condition).deps, as_control=True)
                for element in elements:
                    deps.add(self.eval(element).deps)
            finally:
                self.quiet -= 1 if frame is not None else 0
                self.scopes.pop()
                self.global_decls.pop()
        if frame is not None and isinstance(node, (ast.ListComp, ast.GeneratorExp, ast.SetComp)):
            # A selection of the frame's columns: the analysis continues with all of them (a superset).
            return Value("literal", literal=list(frame.columns), approx=True)
        return Value("unknown", deps.lift("TRANSFORMATION"))

    def _eval_ListComp(self, node: ast.ListComp) -> Value:
        return self._comprehension(node, node.generators, [node.elt])

    def _eval_SetComp(self, node: ast.SetComp) -> Value:
        return self._comprehension(node, node.generators, [node.elt])

    def _eval_GeneratorExp(self, node: ast.GeneratorExp) -> Value:
        return self._comprehension(node, node.generators, [node.elt])

    def _eval_DictComp(self, node: ast.DictComp) -> Value:
        return self._comprehension(node, node.generators, [node.key, node.value])

    def _eval_Starred(self, node: ast.Starred) -> Value:
        return self.eval(node.value)

    def _eval_Attribute(self, node: ast.Attribute) -> Value:
        base = self.eval(node.value)
        attr = node.attr
        if base.kind == "frame":
            if attr in ("loc", "iloc", "at", "iat"):
                return Value("indexer", frame=base.frame, accessor=attr, name=base.name)
            if attr == "columns":
                return Value("literal", literal=_ColumnList(base.frame.columns), approx=base.approx)
            if attr in base.frame.columns and attr not in FRAME_ATTRIBUTES:
                return self._read_column(base.frame, attr, node)
            if attr in ("index", "shape", "size", "empty", "ndim", "axes", "dtypes", "values", "T"):
                return Value("scalar", Deps())
            return Value("method", base=base, name=attr)
        if base.kind == "row":
            if attr in base.frame.columns:
                return self._read_column(base.frame, attr, node)
            if attr in ("name", "Index"):
                return Value("scalar", Deps())
            return Value("method", base=base, name=attr)
        if base.kind == "module":
            return Value("function", name=f"{base.name}.{attr}")
        if base.kind == "function":
            return Value("function", name=f"{base.name}.{attr}")
        if base.kind in ("series", "mask", "scalar", "unknown") and attr in ("str", "dt", "cat"):
            return Value(base.kind, base.deps.copy(), accessor=attr, column=base.column, frame=base.frame)
        if base.kind in ("series", "mask", "scalar", "unknown") and attr in ("values", "array", "index", "name", "dtype", "shape", "size", "empty", "hasnans", "is_unique"):
            return Value(base.kind if attr in ("values", "array") else "scalar", base.deps.copy() if attr in ("values", "array") else Deps())
        if base.kind == "groupby" and attr in (base.frame.columns if base.frame else {}):
            selected = self._read_column(base.frame, attr, node)
            return Value("groupby", frame=base.frame, keys=base.keys, selected=selected)
        if base.kind in ("series", "mask", "scalar", "unknown"):
            # A property read (``.dt.year``, ``.str`` results, ``.T``): the value still derives from the receiver.
            deps = base.deps.copy().lift("TRANSFORMATION")
            if base.accessor == "dt":
                deps.op("date")
            elif base.accessor == "str":
                deps.op("string")
            return Value("series" if base.kind in ("series", "mask") else base.kind, deps, frame=base.frame)
        return Value("unknown", base.deps.copy() if base.deps else Deps())

    def _eval_Subscript(self, node: ast.Subscript) -> Value:
        base = self.eval(node.value)
        if base.kind == "frame":
            return self._frame_getitem(base, node.slice, node)
        if base.kind == "indexer":
            return self._indexer_getitem(base, node.slice, node)
        if base.kind == "row":
            key = self._literal_of(node.slice)
            if key is not _MISSING:
                return self._read_column(base.frame, key, node)
            self._unresolved(node, "unknown_column", self._source(node))
            return Value("scalar", Deps())
        if base.kind == "groupby":
            key = self._literal_of(node.slice)
            if isinstance(key, str):
                return Value("groupby", frame=base.frame, keys=base.keys, selected=self._read_column(base.frame, key, node))
            if isinstance(key, (list, tuple)):
                deps = Deps()
                for item in key:
                    deps.add(self._read_column(base.frame, item, node).deps)
                return Value("groupby", frame=base.frame, keys=base.keys, selected=Value("unknown", deps))
            return base
        key = self.eval(node.slice)
        if base.literal is not _MISSING:
            if key.literal is not _MISSING:
                try:
                    return Value("literal", literal=base.literal[key.literal])
                except Exception:
                    return Value("unknown", Deps())
            deps = Deps().add(key.deps).lift("TRANSFORMATION").op("lookup")
            if isinstance(base.literal, dict) and base.name:
                deps.lookups.add(base.name)
                deps.uses.add(base.name)
                self.lookup_uses.append({"name": base.name, "line": node.lineno, "column": key.column, "method": "subscript"})
            return Value("series" if key.kind in ("series", "mask") else "scalar", deps)
        deps = Deps().add(base.deps)
        if key.kind in ("mask", "series"):
            deps.add(key.deps, as_control=True)
        else:
            deps.add(key.deps)
        kind = base.kind if base.kind in ("series", "mask") else ("scalar" if base.kind in ("scalar", "unknown") else "unknown")
        if base.kind in ("series", "mask") and key.literal is not _MISSING and not isinstance(key.literal, slice):
            kind = "scalar"
        return Value(kind, deps, column=base.column if base.kind == "series" else None, frame=base.frame)

    def _frame_getitem(self, base: Value, slice_node: ast.AST, node: ast.AST) -> Value:
        frame = base.frame
        key = self.eval(slice_node)
        if key.literal is not _MISSING and not isinstance(key.literal, (list, tuple, slice, _ColumnList)):
            try:
                hash(key.literal)
            except TypeError:
                key = Value("unknown")
            else:
                return self._read_column(frame, key.literal, node)
        if isinstance(key.literal, (list, tuple, _ColumnList)):
            selected = Frame({}, [dict(op) for op in frame.row_ops])
            for column in key.literal:
                if column in frame.columns:
                    selected.columns[column] = frame.columns[column].clone()
                    if self.step is not None and column not in self.step["reads"]:
                        self.step["reads"].append(column)
                else:
                    self._unresolved(node, "missing_column", str(column))
            return Value("frame", frame=selected, approx=key.approx)
        if isinstance(slice_node, ast.Slice):
            return Value("frame", frame=frame.copy())
        if key.kind in ("mask", "series"):
            filtered = frame.copy()
            filtered.row_ops.append({"kind": "FILTER", "nodes": sorted(key.deps.nodes()), "line": node.lineno, "code": self._source(slice_node)})
            return Value("frame", frame=filtered)
        options = self._options(key)
        if options:
            # The column is chosen at runtime among known alternatives: each may be read; the choice is a condition.
            deps = Deps().add(key.deps, as_control=True)
            for option in options:
                if option in frame.columns:
                    deps.add(self._read_column(frame, option, node).deps)
                else:
                    self._unresolved(node, "missing_column", str(option))
            self.refs.pop(id(node), None)
            self.ref_nodes.pop(id(node), None)
            return Value("series", deps.op("conditional"))
        self._unresolved(node, "unknown_column", self._source(slice_node))
        return Value("unknown", Deps().add(key.deps, as_control=True))

    def _indexer_parts(self, slice_node: ast.AST) -> Tuple[Optional[ast.AST], Optional[ast.AST]]:
        if isinstance(slice_node, ast.Tuple) and len(slice_node.elts) == 2:
            return slice_node.elts[0], slice_node.elts[1]
        return slice_node, None

    @staticmethod
    def _is_full_slice(node: Optional[ast.AST]) -> bool:
        return isinstance(node, ast.Slice) and node.lower is None and node.upper is None and node.step is None

    def _rows_value(self, rows: Optional[ast.AST]) -> Tuple[Optional[Value], bool]:
        """(selector value, rowwise): None when all rows are selected; rowwise for the index of an iterrows loop."""
        if rows is None or self._is_full_slice(rows):
            return None, False
        value = self.eval(rows)
        if value.kind == "rowindex":
            return value, True
        return value, False

    def _columns_of(self, frame: Frame, indexer: str, cols: Optional[ast.AST], node: ast.AST) -> Optional[List[Any]]:
        if cols is None or self._is_full_slice(cols):
            return None
        value = self.eval(cols)
        literal = value.literal
        if literal is _MISSING:
            self._unresolved(node, "unknown_column", self._source(cols))
            return []
        names = list(frame.columns)
        if indexer in ("iloc", "iat"):
            positions = literal if isinstance(literal, (list, tuple)) else [literal]
            try:
                return [names[int(position)] for position in positions]
            except Exception:
                self._unresolved(node, "unknown_column", self._source(cols))
                return []
        return list(literal) if isinstance(literal, (list, tuple, _ColumnList)) else [literal]

    def _indexer_getitem(self, base: Value, slice_node: ast.AST, node: ast.AST) -> Value:
        frame = base.frame
        rows, cols = self._indexer_parts(slice_node)
        rows_value, rowwise = self._rows_value(rows)
        row_deps = rows_value.deps if rows_value is not None and rows_value.kind in ("mask", "series") else None
        columns = self._columns_of(frame, base.accessor, cols, node)
        if columns is None:
            selected = frame.copy()
            if row_deps is not None:
                selected.row_ops.append({"kind": "FILTER", "nodes": sorted(row_deps.nodes()), "line": node.lineno, "code": self._source(rows)})
            return Value("frame", frame=selected)
        if cols is not None and not isinstance(cols, (ast.List, ast.Tuple)) and len(columns) == 1 and not isinstance(self._literal_of(cols), (list, tuple)):
            value = self._read_column(frame, columns[0], node, row_deps)
            if rowwise or (rows_value is not None and rows_value.kind in ("literal", "scalar")) or base.accessor in ("at", "iat"):
                value.kind = "scalar"
            return value
        selected = Frame({}, [dict(op) for op in frame.row_ops])
        for column in columns:
            if column in frame.columns:
                col = frame.columns[column].clone()
                if row_deps is not None:
                    deps = col.as_deps().add(row_deps, as_control=True)
                    col = Col(deps=deps)
                selected.columns[column] = col
                if self.step is not None and column not in self.step["reads"]:
                    self.step["reads"].append(column)
        return Value("frame", frame=selected)

    def _eval_Call(self, node: ast.Call) -> Value:
        if isinstance(node.func, ast.Attribute):
            receiver = self.eval(node.func.value)
            if receiver.kind in ("module", "function"):
                func = Value("function", name=f"{receiver.name}.{node.func.attr}")
            elif receiver.kind == "frame" and node.func.attr in receiver.frame.columns and node.func.attr not in FRAME_ATTRIBUTES:
                func = Value("unknown", self._read_column(receiver.frame, node.func.attr, node.func).deps)
            else:
                func = Value("method", base=receiver, name=node.func.attr)
        else:
            func = self.eval(node.func)
        args = [self.eval(argument) for argument in node.args]
        kwargs: Dict[str, Value] = {}
        extra = Deps()
        for keyword in node.keywords:
            value = self.eval(keyword.value)
            if keyword.arg:
                kwargs[keyword.arg] = value
            else:
                extra.add(value.deps)
        if func.kind == "method":
            result = self._call_method(func.base, func.name, args, kwargs, node)
        elif func.kind == "function":
            result = self._call_module(func.name, args, kwargs, node)
        elif func.kind == "builtin":
            result = self._call_builtin(func.name, args, kwargs, node)
        elif func.kind == "userfunc":
            result = self._call_user(func, args, kwargs, node)
        else:
            deps = Deps()
            for item in [*args, *kwargs.values()]:
                deps.add(item.deps)
            result = Value("unknown", deps.lift("TRANSFORMATION"))
        if extra.nodes():
            result.deps = result.deps.copy().add(extra)
        return result

    @staticmethod
    def _arg(args: List[Value], kwargs: Dict[str, Value], index: int, *names: str) -> Optional[Value]:
        for name in names:
            if name in kwargs:
                return kwargs[name]
        return args[index] if len(args) > index else None

    def _union(self, values: Iterable[Optional[Value]]) -> Deps:
        deps = Deps()
        for value in values:
            if value is not None:
                deps.add(value.deps)
        return deps

    # ---------------------------------------------------------------- calls

    def _call_method(self, base: Value, name: str, args: List[Value], kwargs: Dict[str, Value], node: ast.Call) -> Value:
        if base.kind == "frame":
            return self._frame_method(base, name, args, kwargs, node)
        if base.kind == "groupby":
            return self._groupby_method(base, name, args, kwargs, node)
        if base.literal is not _MISSING and isinstance(base.literal, (list, dict, set)) and (name in _LIST_MUTATORS or name in _DICT_MUTATORS or name == "add"):
            values = [item.literal for item in args]
            if base.name and self.step is not None and len(self.scopes) == 1 and base.name not in self.step["defines"]:
                self.step["defines"].append(base.name)
            if all(value is not _MISSING for value in values) and not kwargs:
                try:
                    getattr(base.literal, name)(*values)  # the shared literal object: the variable sees the change
                    return Value("literal", literal=None)
                except Exception:
                    pass
            bound = self._lookup(base.name) if base.name else None
            for item in (base, bound):
                if item is not None:
                    item.literal = _MISSING
                    item.kind = "unknown"
            return Value("unknown", self._union(args))
        if base.kind in ("series", "mask", "scalar", "unknown", "row", "literal"):
            return self._series_method(base, name, args, kwargs, node)
        return Value("unknown", self._union([*args, *kwargs.values()]).lift("TRANSFORMATION"))

    def _series_method(self, base: Value, name: str, args: List[Value], kwargs: Dict[str, Value], node: ast.Call) -> Value:
        deps = base.deps.copy()
        if base.accessor == "str":
            deps.add(self._union([*args, *kwargs.values()]))
            if name in _STRING_MASKS:
                return Value("mask", deps.op("string", "comparison"))
            return Value("series", deps.lift("TRANSFORMATION").op("string"))
        if base.accessor == "dt":
            deps.add(self._union([*args, *kwargs.values()]))
            return Value("series", deps.lift("TRANSFORMATION").op("date"))
        if name in _NULL_CHECKS:
            return Value("mask", deps.op("null_check"))
        if name in _COMPARISONS:
            deps.add(self._union([*args, *kwargs.values()]))
            return Value("mask", deps.op("comparison"))
        if name in ("fillna", "combine_first"):
            fill = self._arg(args, kwargs, 0, "value", "other")
            if fill is not None:
                deps.add(fill.deps)
            method = kwargs.get("method")
            if method is not None and method.literal in ("ffill", "bfill", "pad", "backfill"):
                deps.op("window")
            return Value("series", deps.op("fillna"), column=None)
        if name in ("ffill", "bfill", "interpolate"):
            return Value("series", deps.op("fillna", "window"))
        if name in ("map", "replace"):
            mapping = self._arg(args, kwargs, 0, "arg", "to_replace")
            if mapping is not None and isinstance(mapping.literal, dict):
                if mapping.name:
                    deps.lookups.add(mapping.name)
                    deps.uses.add(mapping.name)
                    self.lookup_uses.append({"name": mapping.name, "line": node.lineno, "column": base.column, "method": name})
                if name == "map":
                    deps.lift("TRANSFORMATION")
                return Value("series", deps.op("lookup"))
            if mapping is not None and mapping.kind == "userfunc":
                result = self._call_user(mapping, [Value("scalar", base.deps.copy())], {}, node)
                return Value("series", result.deps.lift("TRANSFORMATION").op("function"))
            deps.add(self._union([*args, *kwargs.values()]))
            if mapping is not None and mapping.kind in ("series", "unknown"):
                deps.op("lookup")
            return Value("series", deps.lift("TRANSFORMATION").op("replace" if name == "replace" else "lookup"))
        if name in ("apply", "transform", "agg", "aggregate", "pipe"):
            func = self._arg(args, kwargs, 0, "func")
            if func is not None and func.kind == "userfunc":
                result = self._call_user(func, [Value("scalar", base.deps.copy())], {}, node)
                return Value("series", result.deps.lift("TRANSFORMATION").op("function"))
            if func is not None and func.kind == "function" and func.name.split(".")[-1] in ("to_numeric", "to_datetime"):
                return Value("series", deps.lift("TRANSFORMATION").op("cast"))
            literal = func.literal if func is not None else _MISSING
            if isinstance(literal, str) and literal in _AGGREGATIONS:
                return Value("series" if name == "transform" else "scalar", deps.lift("AGGREGATION").op("aggregation"))
            deps.add(self._union([*args, *kwargs.values()]))
            return Value("series", deps.lift("TRANSFORMATION").op("function"))
        if name in ("where", "mask"):
            condition = self._arg(args, kwargs, 0, "cond")
            other = self._arg(args, kwargs, 1, "other")
            if condition is not None:
                deps.add(condition.deps, as_control=True)
            if other is not None:
                deps.add(other.deps)
            return Value("series", deps.op("conditional"))
        if name in _AGGREGATIONS:
            deps.add(self._union([*args, *kwargs.values()]))
            return Value("scalar", deps.lift("AGGREGATION").op("aggregation"))
        if name in _CUMULATIVE:
            deps.add(self._union([*args, *kwargs.values()]))
            return Value("series", deps.lift("AGGREGATION").op("window"))
        if name in _SHIFTS:
            return Value("series", deps.lift("TRANSFORMATION").op("window"))
        if name in _CASTS:
            return Value("series", deps.lift("TRANSFORMATION").op("cast"))
        if name in _ROUNDING:
            deps.add(self._union([*args, *kwargs.values()]))
            return Value("series", deps.lift("TRANSFORMATION").op("rounding" if name in ("round", "floor", "ceil") else "arithmetic"))
        if name in _ARITHMETIC_METHODS:
            deps.add(self._union([*args, *kwargs.values()]))
            return Value("series", deps.lift("TRANSFORMATION").op("arithmetic"))
        if name in _PASSTHROUGH:
            return Value(base.kind if base.kind != "literal" else "unknown", deps, column=base.column if name == "copy" else None, frame=base.frame)
        if name == "groupby":
            keys = Deps()
            for item in [*args, *kwargs.values()]:
                keys.add(item.deps)
            return Value("groupby", frame=base.frame, keys=keys, selected=base)
        if name == "get" and base.kind == "row":
            key = self._arg(args, kwargs, 0, "key")
            if key is not None and key.literal is not _MISSING:
                return self._read_column(base.frame, key.literal, node)
        if base.kind == "literal" and base.literal is not _MISSING:
            return Value("unknown", self._union([*args, *kwargs.values()]).lift("TRANSFORMATION"))
        deps.add(self._union([*args, *kwargs.values()]))
        return Value("series" if base.kind in ("series", "mask") else "unknown", deps.lift("TRANSFORMATION").op(name))

    def _groupby_method(self, base: Value, name: str, args: List[Value], kwargs: Dict[str, Value], node: ast.Call) -> Value:
        selected = base.selected.deps.copy() if base.selected is not None else Deps()
        if base.selected is None and base.frame is not None:
            for column in base.frame.columns.values():
                selected.add(column.as_deps())
        keys = base.keys or Deps()
        func = self._arg(args, kwargs, 0, "func")
        if func is not None and func.kind == "userfunc":
            result = self._call_user(func, [Value("series", selected.copy())], {}, node)
            selected = result.deps
        selected.lift("AGGREGATION").op("aggregation")
        selected.group |= keys.nodes()
        selected.lookups |= keys.lookups
        if name in ("transform", "cumsum", "cumcount", "rank", "shift", "diff", "fillna", "ffill", "bfill"):
            return Value("series", selected)
        return Value("unknown", selected)

    def _frame_method(self, base: Value, name: str, args: List[Value], kwargs: Dict[str, Value], node: ast.Call) -> Value:
        frame = base.frame
        inplace = kwargs.get("inplace") is not None and kwargs["inplace"].literal is True
        result: Optional[Frame] = None
        value: Optional[Value] = None
        line = node.lineno
        if name == "copy":
            result = frame.copy()
        elif name == "assign":
            result = frame.copy()
            for column, item in kwargs.items():
                if item.kind == "userfunc":
                    item = self._call_user(item, [Value("frame", frame=result)], {}, node)
                deps = item.deps.copy()
                if item.kind == "frame" and item.frame is not None and len(item.frame.columns) == 1:
                    deps = next(iter(item.frame.columns.values())).as_deps()
                result.columns[column] = Col(deps=deps)
        elif name == "rename":
            mapping = kwargs.get("columns")
            if mapping is None and args and (kwargs.get("axis") is not None and kwargs["axis"].literal in (1, "columns")):
                mapping = args[0]
            result = frame.copy()
            if mapping is not None and isinstance(mapping.literal, dict):
                renamed = Frame({}, result.row_ops)
                for column, col in result.columns.items():
                    target = mapping.literal.get(column, column)
                    if target != column:
                        renamed.columns[target] = Col(deps=col.as_deps().op("rename"), renamed_from=column)
                    else:
                        renamed.columns[column] = col
                result = renamed
            elif mapping is not None:
                self._unresolved(node, "unsupported", "rename with a non-literal mapping")
        elif name == "drop":
            columns = kwargs.get("columns")
            if columns is None and args and kwargs.get("axis") is not None and kwargs["axis"].literal in (1, "columns"):
                columns = args[0]
            result = frame.copy()
            if columns is not None:
                names = columns.literal if isinstance(columns.literal, (list, tuple, _ColumnList)) else [columns.literal]
                if columns.literal is _MISSING:
                    self._unresolved(node, "unknown_column", "drop")
                else:
                    for column in names:
                        result.columns.pop(column, None)
            else:
                result.row_ops.append({"kind": "FILTER", "nodes": [], "line": line, "code": self._source(node)})
        elif name in ("fillna", "replace", "astype", "round", "abs", "clip", "infer_objects", "convert_dtypes", "where", "mask", "applymap", "map", "apply", "combine_first", "update", "ffill", "bfill", "interpolate"):
            result = self._frame_elementwise(frame, name, args, kwargs, node)
            if isinstance(result, Value):
                value, result = result, None
        elif name in ("merge", "join"):
            other = args[0] if args else kwargs.get("right") or kwargs.get("other")
            result = self._merge(frame, other, kwargs, node)
        elif name == "groupby":
            by = self._arg(args, kwargs, 0, "by")
            keys = Deps()
            if by is not None:
                names = by.literal if isinstance(by.literal, (list, tuple)) else [by.literal]
                if by.literal is not _MISSING:
                    for column in names:
                        if column in frame.columns:
                            keys.add(frame.columns[column].as_deps())
                else:
                    keys.add(by.deps)
            return Value("groupby", frame=frame, keys=keys)
        elif name in ("sort_values", "nlargest", "nsmallest"):
            by = self._arg(args, kwargs, 0 if name == "sort_values" else 1, "by", "columns")
            result = frame.copy()
            nodes: Set[int] = set()
            if by is not None and by.literal is not _MISSING:
                for column in (by.literal if isinstance(by.literal, (list, tuple)) else [by.literal]):
                    if column in frame.columns:
                        nodes |= frame.columns[column].as_deps().nodes()
            result.row_ops.append({"kind": "SORT" if name == "sort_values" else "FILTER", "nodes": sorted(nodes), "line": line, "code": self._source(node)})
        elif name in ("dropna", "drop_duplicates"):
            subset = kwargs.get("subset")
            result = frame.copy()
            nodes = set()
            names = subset.literal if subset is not None and isinstance(subset.literal, (list, tuple)) else ([subset.literal] if subset is not None and subset.literal is not _MISSING else list(frame.columns))
            for column in names:
                if column in frame.columns:
                    nodes |= frame.columns[column].as_deps().nodes()
            result.row_ops.append({"kind": "FILTER", "nodes": sorted(nodes), "line": line, "code": self._source(node)})
        elif name == "query":
            expression = self._arg(args, kwargs, 0, "expr")
            result = frame.copy()
            nodes = set()
            if expression is not None and isinstance(expression.literal, str):
                for column in self._names_in_expression(expression.literal, frame):
                    nodes |= frame.columns[column].as_deps().nodes()
                    if self.step is not None and column not in self.step["reads"]:
                        self.step["reads"].append(column)
            else:
                self._unresolved(node, "unsupported", "query with a non-literal expression")
            result.row_ops.append({"kind": "FILTER", "nodes": sorted(nodes), "line": line, "code": self._source(node)})
        elif name == "eval":
            expression = self._arg(args, kwargs, 0, "expr")
            deps = Deps()
            if expression is not None and isinstance(expression.literal, str):
                text = expression.literal
                if re.match(r"^\s*[A-Za-z_][\w ]*\s*=[^=]", text):
                    target, _, rhs = text.partition("=")
                    for column in self._names_in_expression(rhs, frame):
                        deps.add(frame.columns[column].as_deps())
                    result = frame.copy()
                    result.columns[target.strip()] = Col(deps=deps.lift("TRANSFORMATION").op("arithmetic"))
                else:
                    for column in self._names_in_expression(text, frame):
                        deps.add(frame.columns[column].as_deps())
                    return Value("series", deps.lift("TRANSFORMATION").op("arithmetic"))
            else:
                self._unresolved(node, "unsupported", "eval with a non-literal expression")
                return Value("unknown", Deps())
        elif name in ("head", "tail", "sample", "reset_index", "set_index", "reindex", "sort_index", "rename_axis", "set_axis", "pipe", "to_frame", "filter", "select_dtypes", "loc", "truncate"):
            result = frame.copy()
            if name in ("head", "tail", "sample", "truncate"):
                result.row_ops.append({"kind": "FILTER", "nodes": [], "line": line, "code": self._source(node)})
            if name == "set_index":
                keys = self._arg(args, kwargs, 0, "keys")
                drop = kwargs.get("drop")
                if keys is not None and keys.literal is not _MISSING and (drop is None or drop.literal is not False):
                    for column in (keys.literal if isinstance(keys.literal, (list, tuple)) else [keys.literal]):
                        result.columns.pop(column, None)
            if name == "filter":
                items = self._arg(args, kwargs, 0, "items")
                if items is not None and isinstance(items.literal, (list, tuple)):
                    result = Frame({column: col for column, col in result.columns.items() if column in items.literal}, result.row_ops)
                else:
                    return Value("frame", frame=result, approx=True)
            if name == "select_dtypes":
                return Value("frame", frame=result, approx=True)
        elif name == "insert":
            column = self._arg(args, kwargs, 1, "column")
            item = self._arg(args, kwargs, 2, "value")
            if column is not None and column.literal is not _MISSING and item is not None:
                self._write(base, column.literal, item, node.args[2] if len(node.args) > 2 else node, via="insert")
            else:
                self._unresolved(node, "unknown_column", "insert")
            return Value("literal", literal=None)
        elif name == "pop":
            column = self._arg(args, kwargs, 0, "item")
            if column is not None and column.literal in frame.columns:
                value = self._read_column(frame, column.literal, node)
                frame.columns.pop(column.literal, None)
                self._frame_op("DROP", [column.literal])
                return value
            return Value("unknown", Deps())
        elif name == "get":
            column = self._arg(args, kwargs, 0, "key")
            if column is not None and column.literal is not _MISSING:
                if column.literal in frame.columns:
                    return self._read_column(frame, column.literal, node)
                return self.eval(node.args[1]) if len(node.args) > 1 else Value("literal", literal=None)
            return Value("unknown", Deps())
        elif name in ("iterrows", "itertuples"):
            return Value(name, frame=frame)
        elif name in ("items", "iteritems"):
            return Value("items", frame=frame)
        elif name in _NULL_CHECKS or name in ("duplicated",):
            mask = frame.copy()
            for col in mask.columns.values():
                col.deps = col.as_deps().op("null_check")
                col.node = None
            return Value("frame", frame=mask)
        elif name in _AGGREGATIONS:
            axis = kwargs.get("axis")
            deps = Deps()
            for col in frame.columns.values():
                deps.add(col.as_deps())
            if axis is not None and axis.literal in (1, "columns"):
                return Value("series", deps.lift("TRANSFORMATION").op("arithmetic"))
            return Value("unknown", deps.lift("AGGREGATION").op("aggregation"))
        elif name in ("explode", "melt", "pivot", "pivot_table", "stack", "unstack", "transpose", "crosstab", "resample", "rolling"):
            self._unresolved(node, "reshape", name)
            deps = Deps()
            for col in frame.columns.values():
                deps.add(col.as_deps())
            return Value("unknown", deps.lift("AGGREGATION").op(name))
        elif name in ("to_numpy", "to_dict", "to_records", "equals", "corr", "cov", "describe", "info", "memory_usage", "count"):
            deps = Deps()
            for col in frame.columns.values():
                deps.add(col.as_deps())
            return Value("unknown", deps.lift("AGGREGATION"))
        else:
            self._unresolved(node, "unsupported", f"DataFrame.{name}")
            result = frame.copy()
            extra = self._union([*args, *kwargs.values()])
            for col in result.columns.values():
                col.deps = col.as_deps().add(extra).lift("TRANSFORMATION").op(name)
                col.node = None
        if value is not None:
            return value
        if result is None:
            return Value("unknown", Deps())
        if inplace:
            self._replace_frame(base, result, node)
            return Value("literal", literal=None)
        return Value("frame", frame=result)

    def _names_in_expression(self, text: str, frame: Frame) -> List[str]:
        names = []
        for match in re.finditer(r"`([^`]+)`|\b([A-Za-z_]\w*)\b", text):
            column = match.group(1) or match.group(2)
            if column in frame.columns and column not in names:
                names.append(column)
        return names

    def _frame_elementwise(self, frame: Frame, name: str, args: List[Value], kwargs: Dict[str, Value], node: ast.Call) -> Any:
        result = frame.copy()
        primary = self._arg(args, kwargs, 0, "value", "dtype", "func", "cond", "other", "to_replace", "arg")
        op = {
            "fillna": "fillna", "combine_first": "fillna", "replace": "lookup", "astype": "cast", "round": "rounding",
            "abs": "arithmetic", "clip": "arithmetic", "infer_objects": "cast", "convert_dtypes": "cast", "where": "conditional",
            "mask": "conditional", "applymap": "function", "map": "function", "apply": "function", "update": "fillna",
            "ffill": "fillna", "bfill": "fillna", "interpolate": "fillna",
        }[name]
        if name == "apply":
            axis = kwargs.get("axis")
            if axis is not None and axis.literal in (1, "columns"):
                func = self._arg(args, kwargs, 0, "func")
                if func is not None and func.kind == "userfunc":
                    returned = self._call_user(func, [Value("row", frame=frame)], {}, node)
                    return Value("series", returned.deps.lift("TRANSFORMATION").op("function"))
                deps = Deps()
                for col in frame.columns.values():
                    deps.add(col.as_deps())
                return Value("series", deps.lift("TRANSFORMATION").op("function"))
            func = self._arg(args, kwargs, 0, "func")
            if func is not None and func.kind == "function" and func.name.split(".")[-1] in ("to_numeric", "to_datetime"):
                op = "cast"
        per_column = isinstance(primary.literal, dict) if primary is not None else False
        for column, col in list(result.columns.items()):
            deps = col.as_deps()
            if per_column and name in ("fillna", "astype", "replace", "round"):
                if column not in primary.literal:
                    continue
            elif primary is not None and primary.kind == "frame" and primary.frame is not None:
                other = primary.frame.columns.get(column)
                if other is not None:
                    deps.add(other.as_deps())
                elif name in ("update", "combine_first"):
                    continue
            elif primary is not None and primary.kind == "userfunc":
                deps = self._call_user(primary, [Value("series", deps)], {}, node).deps
            elif primary is not None:
                deps.add(primary.deps, as_control=name in ("where", "mask") and primary is self._arg(args, kwargs, 0, "cond"))
            if name in ("where", "mask"):
                other = self._arg(args, kwargs, 1, "other")
                if other is not None:
                    deps.add(other.deps)
            if op not in ("fillna",):
                deps.lift("TRANSFORMATION")
            result.columns[column] = Col(deps=deps.op(op))
        return result

    def _merge(self, frame: Frame, other: Optional[Value], kwargs: Dict[str, Value], node: ast.Call) -> Frame:
        result = frame.copy()
        if other is None or other.kind != "frame" or other.frame is None:
            self._unresolved(node, "unsupported", "merge with an unknown table")
            return result
        how = kwargs.get("how").literal if kwargs.get("how") is not None else "inner"
        keys: Set[int] = set()
        left_keys: List[str] = []
        right_keys: List[str] = []
        for argument, target in (("on", None), ("left_on", "left"), ("right_on", "right")):
            item = kwargs.get(argument)
            if item is None or item.literal is _MISSING:
                continue
            names = list(item.literal) if isinstance(item.literal, (list, tuple)) else [item.literal]
            if target in (None, "left"):
                left_keys += names
            if target in (None, "right"):
                right_keys += names
        for column in left_keys:
            if column in frame.columns:
                keys |= frame.columns[column].as_deps().nodes()
        for column in right_keys:
            if column in other.frame.columns:
                keys |= other.frame.columns[column].as_deps().nodes()
        lookups: Set[str] = set(other.deps.lookups)
        if other.name and other.name in self.lookups:
            lookups.add(other.name)
            self.lookup_uses.append({"name": other.name, "line": node.lineno, "column": None, "method": "merge"})
        for column, col in other.frame.columns.items():
            if column in right_keys and column in result.columns:
                continue
            target = column if column not in result.columns else f"{column}_y"
            deps = col.as_deps()
            deps.join |= keys
            deps.lookups |= lookups
            result.columns[target] = Col(deps=deps.op("join"))
        if how != "left":
            result.row_ops.append({"kind": "JOIN", "nodes": sorted(keys), "line": node.lineno, "code": self._source(node)})
        return result

    def _call_module(self, name: str, args: List[Value], kwargs: Dict[str, Value], node: ast.Call) -> Value:
        short = name.split(".")[-1]
        if name.startswith("np.") and short == "where" and len(args) >= 3:
            deps = Deps().add(args[1].deps).add(args[2].deps).add(args[0].deps, as_control=True).op("conditional")
            return Value("series", deps)
        if name.startswith("np.") and short == "select":
            conditions = self._arg(args, kwargs, 0, "condlist")
            choices = self._arg(args, kwargs, 1, "choicelist")
            default = self._arg(args, kwargs, 2, "default")
            deps = Deps()
            if choices is not None:
                deps.add(choices.deps)
            if default is not None:
                deps.add(default.deps)
            if conditions is not None:
                deps.add(conditions.deps, as_control=True)
            return Value("series", deps.op("conditional"))
        if short in ("to_numeric", "to_datetime", "to_timedelta"):
            value = self._arg(args, kwargs, 0, "arg")
            deps = value.deps.copy() if value is not None else Deps()
            return Value("series", deps.lift("TRANSFORMATION").op("cast"))
        if short in ("isna", "isnull", "notna", "notnull", "isnan", "isfinite", "isinf"):
            return Value("mask", self._union(args).op("null_check"))
        if short in ("isin", "logical_and", "logical_or", "logical_not", "logical_xor"):
            return Value("mask", self._union([*args, *kwargs.values()]).op("boolean"))
        if short in ("cut", "qcut", "digitize"):
            return Value("series", self._union(args[:1]).lift("TRANSFORMATION").op("binning"))
        if name.startswith("pd.") and short == "DataFrame":
            data = self._arg(args, kwargs, 0, "data")
            frame = Frame()
            if data is not None and isinstance(data.literal, dict):
                for column in data.literal:
                    frame.columns[column] = Col(deps=Deps())
            elif data is not None and data.kind == "frame" and data.frame is not None:
                frame = data.frame.copy()
            else:
                self._unresolved(node, "unsupported", "DataFrame built from non-literal data")
            return Value("frame", frame=frame, literal=data.literal if data is not None and isinstance(data.literal, dict) else _MISSING)
        if name.startswith("pd.") and short == "Series":
            data = self._arg(args, kwargs, 0, "data")
            if data is not None and isinstance(data.literal, dict):
                return Value("literal", literal=dict(data.literal))
            return Value("series", self._union(args).lift("TRANSFORMATION"))
        if name.startswith("pd.") and short == "merge" and len(args) >= 2 and args[0].kind == "frame":
            return Value("frame", frame=self._merge(args[0].frame, args[1], kwargs, node))
        if name.startswith("pd.") and short == "concat":
            self._unresolved(node, "reshape", "pd.concat")
            frames = self._arg(args, kwargs, 0, "objs")
            merged = Frame()
            for item in (frames.items or []) if frames is not None else []:
                if item.kind == "frame" and item.frame is not None:
                    for column, col in item.frame.columns.items():
                        merged.columns.setdefault(column, Col(deps=Deps())).deps.add(col.as_deps())
            return Value("frame", frame=merged)
        if name.startswith("np.") and short in ("nan", "NaN", "inf", "NINF", "pi", "e"):
            return Value("literal", literal=float("nan"))
        if short in _NP_MATH or name.startswith("np."):
            return Value("series", self._union([*args, *kwargs.values()]).lift("TRANSFORMATION").op("arithmetic"))
        return Value("unknown", self._union([*args, *kwargs.values()]).lift("TRANSFORMATION").op(short))

    def _call_builtin(self, name: str, args: List[Value], kwargs: Dict[str, Value], node: ast.Call) -> Value:
        deps = self._union([*args, *kwargs.values()])
        if name == "getattr" and len(args) >= 2 and args[0].kind in ("frame", "row") and isinstance(args[1].literal, str):
            if args[1].literal in args[0].frame.columns:
                return self._read_column(args[0].frame, args[1].literal, node)
        if name == "getattr" and len(args) >= 2 and args[0].kind in ("frame", "row"):
            self._unresolved(node, "unknown_column", self._source(node))
        if name in ("len",):
            return Value("scalar", Deps())
        if name in ("float", "int", "str", "bool"):
            return Value(args[0].kind if args and args[0].kind in ("series", "scalar") else "scalar", deps.lift("TRANSFORMATION").op("cast"))
        if name in ("sum", "min", "max") and len(args) == 1:
            return Value("scalar", deps.lift("AGGREGATION").op("aggregation"))
        if name in ("round", "abs", "pow", "divmod", "min", "max", "sum"):
            return Value("scalar", deps.lift("TRANSFORMATION").op("arithmetic"))
        if name == "print":
            return Value("literal", literal=None)
        return Value("unknown", deps)

    def _call_user(self, func: Value, args: List[Value], kwargs: Dict[str, Value], node: ast.AST) -> Value:
        definition = func.func
        if self.call_depth >= MAX_CALL_DEPTH:
            self._unresolved(node, "unsupported", "recursion depth")
            return Value("unknown", self._union([*args, *kwargs.values()]).lift("TRANSFORMATION"))
        parameters = definition.args
        names = [item.arg for item in [*parameters.posonlyargs, *parameters.args]]
        defaults = parameters.defaults
        scope: Dict[str, Value] = {}
        for index, parameter in enumerate(names):
            if index < len(args):
                scope[parameter] = args[index]
            elif parameter in kwargs:
                scope[parameter] = kwargs[parameter]
            else:
                default_index = index - (len(names) - len(defaults))
                scope[parameter] = self.eval(defaults[default_index]) if default_index >= 0 else Value("unknown")
        if parameters.vararg is not None:
            scope[parameters.vararg.arg] = Value("unknown", self._union(args[len(names):]), items=args[len(names):])
        for keyword in parameters.kwonlyargs:
            scope[keyword.arg] = kwargs.get(keyword.arg, Value("unknown"))
        if parameters.kwarg is not None:
            scope[parameters.kwarg.arg] = Value("unknown", self._union(kwargs.values()))
        name = getattr(definition, "name", "lambda")
        self.call_depth += 1
        self.scopes.append(scope)
        self.global_decls.append(set())
        self.returns.append([])
        self.fn_conditions.append(Deps())
        try:
            if isinstance(definition, ast.Lambda):
                result = self.eval(definition.body)
                deps = result.deps.copy()
            else:
                for statement in definition.body:
                    self._exec(statement)
                deps = Deps()
                for returned in self.returns[-1]:
                    deps.add(returned.deps)
            deps.add(self.fn_conditions[-1], as_control=True)
        finally:
            self.fn_conditions.pop()
            self.returns.pop()
            self.global_decls.pop()
            self.scopes.pop()
            self.call_depth -= 1
        if func.name and func.name != "lambda":
            deps.uses.add(func.name)
        deps.op("function")
        return Value("series" if any(arg.kind in ("series", "row") for arg in args) else "scalar", deps)

    # ---------------------------------------------------------------- writes

    def _context_deps(self) -> Tuple[Deps, List[Dict[str, Any]]]:
        deps = Deps()
        conditions = []
        for context, condition in self.control:
            deps.add(context, as_control=True)
            conditions.append(condition)
        return deps, conditions

    def _expand(self, node: ast.AST) -> Optional[str]:
        """The defining expression of a variable used as a condition (``limit_mask`` → its definition)."""
        if isinstance(node, ast.Name):
            value = self._lookup(node.id)
            if value is not None and value.source is not None:
                return self._source(value.source)
        return None

    def _pretty(self, node: Optional[ast.AST]) -> str:
        """Expression with every column access replaced by ⟦column⟧ (masks and lookups keep their names)."""
        if node is None:
            return ""
        placeholders: Dict[str, str] = {}

        def clone(item: Any) -> Any:
            if isinstance(item, ast.AST):
                column = self.refs.get(id(item))
                if column is not None:
                    key = f"__lineage_col_{len(placeholders)}__"
                    placeholders[key] = column
                    return ast.Name(id=key, ctx=ast.Load())
                fields = {name: clone(value) for name, value in ast.iter_fields(item)}
                new = type(item)(**fields)
                return ast.copy_location(new, item) if hasattr(item, "lineno") else new
            if isinstance(item, list):
                return [clone(value) for value in item]
            return item

        try:
            text = ast.unparse(clone(node))
        except Exception:
            return self._source(node)
        for key, column in placeholders.items():
            text = text.replace(key, f"⟦{column}⟧")
        return text

    def _current_bindings(self, node: ast.AST) -> Dict[str, Any]:
        names = {sub.id for sub in ast.walk(node) if isinstance(sub, ast.Name)}
        bindings: Dict[str, Any] = {}
        for name, value in self.bindings:
            if name in names:
                bindings[name] = value if isinstance(value, (str, int, float, bool)) or value is None else str(value)
        return bindings

    def _write(
        self,
        frame_value: Value,
        column: Any,
        value: Value,
        value_node: Optional[ast.AST],
        rows: Optional[Value] = None,
        rows_node: Optional[ast.AST] = None,
        rowwise: bool = False,
        via: str = "assign",
        possible: bool = False,
        self_read_node: Optional[int] = None,
    ) -> Optional[int]:
        frame = frame_value.frame
        if frame is None:
            return None
        column = column if isinstance(column, str) else (str(column) if column is not None else None)
        if column is None:
            return None
        possible = possible or self.possible > 0
        previous = frame.columns.get(column)
        previous_node = previous.node if previous is not None else None
        deps = Deps().add(value.deps)
        if value.kind == "frame" and value.frame is not None:
            columns = list(value.frame.columns.values())
            deps = columns[0].as_deps() if len(columns) == 1 else Deps().add(self._union([Value("unknown", item.as_deps()) for item in columns]))
        conditions: List[Dict[str, Any]] = []
        partial = possible
        if rows is not None and not rowwise:
            deps.add(rows.deps, as_control=True)
            partial = True
            conditions.append({
                "kind": "rows", "line": rows_node.lineno if rows_node is not None else None, "code": self._source(rows_node),
                "expanded": self._expand(rows_node) if rows_node is not None else None,
                "pretty": self._pretty(rows.source if rows.source is not None else rows_node),
            })
        elif rows is not None and rowwise:
            deps.add(rows.deps, as_control=True)
        context, context_conditions = self._context_deps()
        if context_conditions:
            deps.add(context, as_control=True)
            partial = True
            conditions.extend(context_conditions)
        retained = False
        full_in_branch = bool(self.full_branch_writes) and column in self.full_branch_writes[-1] and rows is None and not possible
        if previous is not None and partial and not full_in_branch:
            deps.add(previous.as_deps())
            retained = True
        reads_self = previous_node is not None and previous_node in value.deps.data
        operation = self._operation(value, value_node, deps, previous_node, rows, conditions)
        statement = self.statement
        node_id = self._node(
            column, "write", deps,
            operation=operation,
            via=via,
            retained=retained,
            reads_self=reads_self,
            possible=possible,
            conditions=conditions,
            expression=self._source(value_node) if value_node is not None else "",
            pretty=self._pretty(value_node) if value_node is not None else "",
            statement=self._source(statement)[:1200] if statement is not None else "",
            bindings=self._current_bindings(statement) if statement is not None else {},
            previous=previous_node,
            renamed_from=None,
        )
        frame.columns[column] = Col(node=node_id)
        if self.step is not None:
            self.step["writes"].append(node_id)
        return node_id

    def _operation(self, value: Value, value_node: Optional[ast.AST], deps: Deps, previous: Optional[int], rows: Optional[Value], conditions: List[Dict[str, Any]]) -> str:
        ops = value.deps.ops
        column = self.nodes[previous]["column"] if previous is not None else None

        def own(nodes: Iterable[int]) -> bool:
            """Does a dependency set contain any version of the written column (its null check, its value)?"""
            return column is not None and any(self.nodes[item]["column"] == column for item in nodes)

        fill_call = (
            isinstance(value_node, ast.Call) and isinstance(value_node.func, ast.Attribute)
            and value_node.func.attr in ("fillna", "combine_first")
            and previous is not None and self.ref_nodes.get(id(value_node.func.value)) == previous
        )
        rows_fill = rows is not None and own(rows.deps.data) and "null_check" in rows.deps.ops
        where_fill = (
            isinstance(value_node, ast.Call) and "conditional" in ops and own(value.deps.data) and "null_check" in ops
        )
        if fill_call or rows_fill or where_fill:
            return "fill_missing"
        if rows is not None or conditions:
            return "conditional"
        if value_node is not None and id(value_node) in self.refs and not ops:
            return "copy"
        if value_node is None and len(value.deps.data) == 1 and not value.deps.control and not ops and next(iter(value.deps.data.values())) == "IDENTITY":
            return "copy"
        if not value.deps.data and not value.deps.control and not value.deps.group and not value.deps.join and not value.deps.lookups and value.kind in ("literal", "unknown", "scalar", "function"):
            return "constant"
        if "cast" in ops and set(value.deps.data) <= ({previous} if previous is not None else set()) and "arithmetic" not in ops:
            return "cast"
        if rows is not None or conditions or "conditional" in ops:
            return "conditional"
        if "join" in ops:
            return "lookup"
        for name in ("lookup", "aggregation", "window", "arithmetic", "function", "binning", "string", "date", "rounding", "cast"):
            if name in ops:
                return name
        if "fillna" in ops:
            # Another column's value with missing values replaced: a copy with a default.
            return "copy" if all(level == "IDENTITY" for level in value.deps.data.values()) else "transformation"
        return "transformation"

    def _frame_op(self, kind: str, columns: List[Any], **extra: Any) -> None:
        if self.step is not None:
            self.step["frame_ops"].append({"kind": kind, "columns": [str(column) for column in columns], "line": self.statement.lineno if self.statement else None, **extra})

    def _materialize(self, frame: Frame) -> None:
        for column, col in list(frame.columns.items()):
            if col.node is not None:
                continue
            deps = col.deps or Deps()
            own = [item for item in deps.data if self.nodes[item]["column"] == column]
            previous = max(own) if own else None
            if previous is not None and "fillna" in deps.ops and not deps.control:
                operation = "fill_missing"
            elif col.renamed_from:
                operation = "rename"
            else:
                operation = self._operation(Value("unknown", deps), None, deps, previous, None, [])
            node_id = self._node(
                column, "write", deps,
                operation=operation, via="frame", retained=False, reads_self=False, possible=False,
                conditions=[], expression="", pretty="",
                statement=self._source(self.statement)[:1200] if self.statement is not None else "",
                bindings={}, previous=None, renamed_from=col.renamed_from,
            )
            frame.columns[column] = Col(node=node_id)
            if self.step is not None:
                self.step["writes"].append(node_id)

    def _replace_frame(self, target: Value, new: Frame, node: ast.AST) -> None:
        """``df = <frame expression>`` or an in-place frame method: record what changed at frame level."""
        old = target.frame
        before = list(old.columns)
        self._materialize(new)
        after = list(new.columns)
        removed = [column for column in before if column not in new.columns]
        added = [column for column in after if column not in old.columns]
        renamed = [(col.renamed_from, column) for column, col in new.columns.items() if col.renamed_from]
        if renamed:
            self._frame_op("RENAME", [column for _, column in renamed], renamed={new_name: old_name for old_name, new_name in renamed})
        if removed and not renamed:
            self._frame_op("DROP", removed)
        common_before = [column for column in before if column in new.columns]
        common_after = [column for column in after if column in old.columns]
        if common_before != common_after:
            self._frame_op("REORDER", common_after)
        for op in new.row_ops[len(old.row_ops):]:
            self._frame_op(op["kind"], [self.nodes[node]["column"] for node in op["nodes"]], code=op.get("code"))
        old.columns.clear()
        old.columns.update(new.columns)
        old.row_ops[:] = new.row_ops
        if added and not renamed and self.step is not None:
            for column in added:
                if self.step is not None and new.columns[column].node not in self.step["writes"]:
                    self.step["writes"].append(new.columns[column].node)

    def _assign(self, target: ast.AST, value: Value, value_node: Optional[ast.AST], statement: ast.AST, via: str = "assign") -> None:
        if isinstance(target, ast.Name):
            existing = self._lookup(target.id)
            if value.kind == "frame" and value.frame is not None:
                if existing is not None and existing.kind == "frame" and existing.frame is not None and existing.frame is not value.frame:
                    self._replace_frame(existing, value.frame, statement)
                    existing.approx = value.approx
                    if isinstance(value.literal, dict):
                        existing.literal = value.literal
                        self._register_lookup(target.id, value.literal, statement, kind="table")
                    self._bind(target.id, existing, statement)
                    return
                bound = Value("frame", frame=value.frame, name=target.id, literal=value.literal, approx=value.approx)
                if isinstance(value.literal, dict):
                    # A hard-coded reference table: its columns stay lookup data (merges record it as a lookup).
                    self._register_lookup(target.id, value.literal, statement, kind="table")
                else:
                    self._materialize(value.frame)
                self._bind(target.id, bound, statement)
                return
            if target.id == "df":
                self._unresolved(statement, "unsupported", "df is reassigned to a value that is not a DataFrame")
            bound = copy.copy(value)
            bound.name = target.id
            if value.kind in ("mask", "series", "scalar", "unknown") and value_node is not None:
                bound.source = value_node
            if isinstance(value.literal, dict):
                self._register_lookup(target.id, value.literal, statement)
            if value.kind == "userfunc":
                bound.name = target.id
            self._bind(target.id, bound, statement)
            return
        if isinstance(target, (ast.Tuple, ast.List)):
            items = value.items if value.items is not None and len(value.items) == len(target.elts) else None
            literal_items = list(value.literal) if items is None and isinstance(value.literal, (list, tuple)) and len(value.literal) == len(target.elts) else None
            for index, element in enumerate(target.elts):
                if items is not None:
                    item = items[index]
                    item_node = value_node.elts[index] if isinstance(value_node, (ast.Tuple, ast.List)) and index < len(value_node.elts) else value_node
                elif literal_items is not None:
                    item, item_node = Value("literal", literal=literal_items[index]), value_node
                else:
                    item, item_node = Value(value.kind if value.kind != "frame" else "unknown", value.deps.copy()), value_node
                self._assign(element, item, item_node, statement, via)
            return
        if isinstance(target, ast.Starred):
            self._assign(target.value, value, value_node, statement, via)
            return
        if isinstance(target, ast.Subscript):
            base = self.eval(target.value)
            if base.kind == "frame":
                key = self.eval(target.slice)
                if key.literal is not _MISSING and isinstance(key.literal, (list, tuple, _ColumnList)):
                    columns = list(key.literal)
                    pairs = list(value.frame.columns.values()) if value.kind == "frame" and value.frame is not None and len(value.frame.columns) == len(columns) else None
                    for index, column in enumerate(columns):
                        item = Value("series", pairs[index].as_deps()) if pairs is not None else value
                        self._write(base, column, item, value_node, via=via, possible=key.approx)
                    return
                if key.literal is not _MISSING:
                    self._write(base, key.literal, value, value_node, via=via)
                    return
                options = self._options(key)
                if options:
                    for option in options:
                        self._write(base, option, Value(value.kind, Deps().add(value.deps).add(key.deps, as_control=True)), value_node, via=via, possible=True)
                    return
                if key.kind in ("mask", "series"):
                    for column in list(base.frame.columns):
                        self._write(base, column, value, value_node, rows=key, rows_node=target.slice, via="loc")
                    return
                if key.kind == "loopvar":
                    for column in list(base.frame.columns):
                        self._write(base, column, value, value_node, via=via, possible=True)
                    return
                self._unresolved(target, "unknown_column", self._source(target.slice))
                return
            if base.kind == "indexer":
                rows_node, cols_node = self._indexer_parts(target.slice)
                rows_value, rowwise = self._rows_value(rows_node)
                if rows_value is not None and rows_value.source is None and isinstance(rows_node, ast.Name):
                    rows_value.source = rows_node
                columns = self._columns_of(base.frame, base.accessor, cols_node, target)
                frame_value = Value("frame", frame=base.frame)
                if columns is None:
                    columns = list(base.frame.columns)
                pairs = list(value.frame.columns.values()) if value.kind == "frame" and value.frame is not None and len(value.frame.columns) == len(columns) else None
                partial_rows = rows_value if (rows_value is not None and not rowwise) else None
                for index, column in enumerate(columns):
                    item = Value("series", pairs[index].as_deps()) if pairs is not None else value
                    self._write(
                        frame_value, column, item, value_node, rows=partial_rows if partial_rows is not None else rows_value,
                        rows_node=rows_node, rowwise=rowwise, via=base.accessor,
                    )
                return
            if base.kind in ("series", "mask") and base.column and base.frame is not None:
                key = self.eval(target.slice)
                self._write(Value("frame", frame=base.frame), base.column, value, value_node, rows=key, rows_node=target.slice, via="chained")
                return
            if base.literal is not _MISSING and isinstance(base.literal, (dict, list)):
                key = self.eval(target.slice)
                if key.literal is not _MISSING and value.literal is not _MISSING:
                    try:
                        base.literal[key.literal] = value.literal
                        return
                    except Exception:
                        pass
                base.literal = _MISSING
                base.kind = "unknown"
                return
            return
        if isinstance(target, ast.Attribute):
            base = self.eval(target.value)
            if base.kind == "frame":
                if target.attr in base.frame.columns and target.attr not in FRAME_ATTRIBUTES:
                    self._write(base, target.attr, value, value_node, via=via)
                else:
                    self._unresolved(target, "unsupported", f"attribute assignment df.{target.attr} does not create a column")
            return

    def _register_lookup(self, name: str, literal: Dict[Any, Any], statement: ast.AST, kind: str = "mapping") -> None:
        entries = []
        if kind == "table":
            columns = list(literal.keys())
            entries = [[str(column), [_json_value(value) for value in (literal[column] if isinstance(literal[column], (list, tuple)) else [literal[column]])][:MAX_LOOKUP_ENTRIES]] for column in columns]
        else:
            for key, value in list(literal.items())[:MAX_LOOKUP_ENTRIES]:
                entries.append([_json_value(key), _json_value(value)])
        self.lookups[name] = {
            "name": name, "kind": kind, "line": statement.lineno, "end_line": statement.end_lineno or statement.lineno,
            "entries": entries, "size": len(literal),
        }

    # ---------------------------------------------------------------- statements

    def _exec(self, statement: ast.stmt) -> None:
        previous = self.statement
        self.statement = statement
        try:
            handler = getattr(self, f"_stmt_{type(statement).__name__}", None)
            if handler is None:
                self._unresolved(statement, "unsupported", type(statement).__name__)
                return
            handler(statement)
        finally:
            self.statement = previous

    def _stmt_Assign(self, statement: ast.Assign) -> None:
        value = self.eval(statement.value)
        for target in statement.targets:
            self._assign(target, value, statement.value, statement)

    def _stmt_AnnAssign(self, statement: ast.AnnAssign) -> None:
        if statement.value is not None:
            self._assign(statement.target, self.eval(statement.value), statement.value, statement)

    def _stmt_AugAssign(self, statement: ast.AugAssign) -> None:
        load = copy.deepcopy(statement.target)
        for sub in ast.walk(load):
            if hasattr(sub, "ctx"):
                sub.ctx = ast.Load()
        expression = ast.copy_location(ast.BinOp(left=load, op=statement.op, right=statement.value), statement)
        ast.fix_missing_locations(expression)
        value = self.eval(expression)
        self._assign(statement.target, value, statement.value, statement, via="augmented")

    def _stmt_Expr(self, statement: ast.Expr) -> None:
        if isinstance(statement.value, ast.Constant):
            return
        call = statement.value
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute):
            inplace = any(keyword.arg == "inplace" and isinstance(keyword.value, ast.Constant) and keyword.value.value is True for keyword in call.keywords)
            receiver = self.eval(call.func.value)
            if inplace and receiver.kind in ("series",) and receiver.column and receiver.frame is not None:
                result = self.eval(call)
                self._write(Value("frame", frame=receiver.frame), receiver.column, Value("series", result.deps if result.deps.nodes() else receiver.deps.copy().op(call.func.attr)), call, via="inplace")
                return
        self.eval(call)

    def _stmt_If(self, statement: ast.If) -> None:
        test = self.eval(statement.test)
        if test.literal is not _MISSING:
            for item in (statement.body if test.literal else statement.orelse):
                self._exec(item)
            return
        condition = {"kind": "branch", "line": statement.lineno, "code": self._source(statement.test), "expanded": self._expand(statement.test), "pretty": self._pretty(statement.test)}
        if self.fn_conditions:
            self.fn_conditions[-1].add(test.deps, as_control=True)
        scope = self.scopes[-1]
        before = dict(scope)
        frame_value = self._lookup("df")
        frame = frame_value.frame if frame_value is not None and frame_value.kind == "frame" else None
        # Columns both branches assign in full: after the if, the column holds one of the two branch values.
        both = self._branch_columns(statement.body) & self._branch_columns(statement.orelse) if frame is not None else set()
        original = {column: frame.columns[column].clone() if column in frame.columns else None for column in both} if frame is not None else {}
        body_nodes: Dict[str, Optional[int]] = {}
        self.control.append((test.deps, condition))
        self.full_branch_writes.append(both)
        try:
            for item in statement.body:
                self._exec(item)
            after_body = dict(scope)
            if frame is not None:
                for column in both:
                    body_nodes[column] = frame.columns[column].node if column in frame.columns else None
                    if original[column] is not None:
                        frame.columns[column] = original[column].clone()
                    else:
                        frame.columns.pop(column, None)
            for item in statement.orelse:
                self._exec(item)
        finally:
            self.full_branch_writes.pop()
            self.control.pop()
        if frame is not None:
            for column in both:
                else_node = frame.columns[column].node if column in frame.columns else None
                branches = [node for node in (body_nodes.get(column), else_node) if node is not None]
                if len(branches) == 2:
                    merged = Deps(data={node: "IDENTITY" for node in branches}).add(test.deps, as_control=True)
                    context, conditions = self._context_deps()
                    merged.add(context, as_control=True)
                    previous_statement = self.statement
                    self.statement = statement
                    node_id = self._node(
                        column, "write", merged, operation="conditional", via="branch", retained=False, reads_self=False,
                        possible=False, conditions=[*conditions, condition], expression="", pretty="",
                        statement=self._source(statement.test), bindings={}, previous=None, renamed_from=None,
                    )
                    self.statement = previous_statement
                    frame.columns[column] = Col(node=node_id)
                    if self.step is not None:
                        self.step["writes"].append(node_id)
        after = dict(scope)
        for name in set(after_body) | set(after):
            first, last = after_body.get(name), after.get(name)
            original = before.get(name)
            if last is original and first is original:
                continue
            if last is None or last.kind in ("frame", "userfunc", "module", "builtin"):
                continue
            merged = copy.copy(last)
            merged.deps = last.deps.copy().add(test.deps, as_control=True)
            other = first if first is not last else original
            if other is not None and other is not last:
                merged.deps.add(other.deps)
                first_options, last_options = self._options(other), self._options(last)
                if first_options is not None and last_options is not None:
                    merged.choices = tuple(dict.fromkeys([*first_options, *last_options]))
                merged.literal = _MISSING if other.literal != last.literal else last.literal
            elif original is None:
                merged.literal = _MISSING
            if merged.literal is _MISSING and merged.kind == "literal":
                merged.kind = "scalar"
            scope[name] = merged

    def _branch_columns(self, body: List[ast.stmt]) -> Set[str]:
        """Columns a branch assigns in full with ``df['X'] = ...`` directly in its body."""
        columns: Set[str] = set()
        for item in body:
            if isinstance(item, ast.Assign):
                for target in item.targets:
                    if isinstance(target, ast.Subscript) and isinstance(target.value, ast.Name) and target.value.id == "df":
                        key = self._try_literal(target.slice)
                        if isinstance(key, str):
                            columns.add(key)
        return columns

    def _loop_items(self, statement: ast.For) -> Tuple[str, Any, Optional[Frame]]:
        """('literal', items) | ('rows', frame) | ('columns', frame) for an approximate column list | ('unknown', deps)."""
        iterator = self.eval(statement.iter)
        if iterator.kind in ("iterrows", "itertuples"):
            return iterator.kind, None, iterator.frame
        if iterator.kind == "items":
            return "items", None, iterator.frame
        literal = iterator.literal
        if literal is not _MISSING:
            if isinstance(literal, dict):
                literal = list(literal.keys())
            try:
                items = list(literal)
            except TypeError:
                return "unknown", iterator, None
            if iterator.approx:
                return "columns", items, None
            if len(items) <= MAX_UNROLL:
                return "literal", items, None
        frame = self._uses_frame_columns(statement.iter)
        if frame is not None:
            return "columns", list(frame.columns), frame
        if isinstance(statement.iter, ast.Call) and isinstance(statement.iter.func, ast.Name) and statement.iter.func.id == "range":
            return "rows", None, None
        return "unknown", iterator, None

    def _bind_target(self, target: ast.AST, value: Any, statement: ast.AST) -> None:
        if isinstance(target, ast.Name):
            item = value if isinstance(value, Value) else Value("literal", literal=value)
            self.scopes[-1][target.id] = item
            if not isinstance(value, Value):
                self.bindings.append((target.id, value))
        elif isinstance(target, (ast.Tuple, ast.List)):
            if isinstance(value, Value):
                for element in target.elts:
                    self._bind_target(element, value, statement)
            else:
                values = list(value) if isinstance(value, (list, tuple)) else [value] * len(target.elts)
                for element, item in zip(target.elts, values):
                    self._bind_target(element, item, statement)

    def _stmt_For(self, statement: ast.For) -> None:
        mode, items, frame = self._loop_items(statement)
        depth = len(self.bindings)
        try:
            if mode == "literal":
                for item in items:
                    del self.bindings[depth:]
                    self._bind_target(statement.target, item, statement)
                    for child in statement.body:
                        self._exec(child)
            elif mode == "columns":
                # The loop runs over a selection of the frame's columns: every column may be affected.
                for item in items:
                    del self.bindings[depth:]
                    self._bind_target(statement.target, item, statement)
                    possible = Deps()
                    self.control.append((possible, {"kind": "loop", "line": statement.lineno, "code": self._source(statement.iter), "expanded": None, "pretty": ""}))
                    self.possible += 1
                    try:
                        for child in statement.body:
                            self._exec(child)
                    finally:
                        self.possible -= 1
                        self.control.pop()
            elif mode in ("iterrows", "itertuples"):
                index_value = Value("rowindex")
                row_value = Value("row", frame=frame)
                if mode == "iterrows" and isinstance(statement.target, (ast.Tuple, ast.List)) and len(statement.target.elts) == 2:
                    self._bind_target(statement.target.elts[0], index_value, statement)
                    self._bind_target(statement.target.elts[1], row_value, statement)
                else:
                    self._bind_target(statement.target, row_value, statement)
                for child in statement.body:
                    self._exec(child)
            elif mode == "items":
                self._unresolved(statement, "dynamic_loop", self._source(statement.iter))
                for child in statement.body:
                    self._exec(child)
            elif mode == "rows":
                self._bind_target(statement.target, Value("rowindex"), statement)
                for child in statement.body:
                    self._exec(child)
            else:
                iterator: Value = items
                self._bind_target(statement.target, Value("loopvar", iterator.deps.copy()), statement)
                self.control.append((iterator.deps, {"kind": "loop", "line": statement.lineno, "code": self._source(statement.iter), "expanded": None, "pretty": ""}))
                try:
                    for child in statement.body:
                        self._exec(child)
                finally:
                    self.control.pop()
            for child in statement.orelse:
                self._exec(child)
        finally:
            del self.bindings[depth:]

    def _stmt_While(self, statement: ast.While) -> None:
        test = self.eval(statement.test)
        condition = {"kind": "branch", "line": statement.lineno, "code": self._source(statement.test), "expanded": None, "pretty": self._pretty(statement.test)}
        self.control.append((test.deps, condition))
        try:
            for child in statement.body:
                self._exec(child)
        finally:
            self.control.pop()
        for child in statement.orelse:
            self._exec(child)

    def _stmt_With(self, statement: ast.With) -> None:
        for child in statement.body:
            self._exec(child)

    def _stmt_Try(self, statement: ast.Try) -> None:
        for block in (statement.body, *[handler.body for handler in statement.handlers], statement.orelse, statement.finalbody):
            for child in block:
                self._exec(child)

    _stmt_TryStar = _stmt_Try

    def _stmt_FunctionDef(self, statement: ast.FunctionDef) -> None:
        self._bind(statement.name, Value("userfunc", func=statement, name=statement.name), statement)

    _stmt_AsyncFunctionDef = _stmt_FunctionDef

    def _stmt_Return(self, statement: ast.Return) -> None:
        if self.returns and statement.value is not None:
            self.returns[-1].append(self.eval(statement.value))

    def _stmt_Delete(self, statement: ast.Delete) -> None:
        for target in statement.targets:
            if isinstance(target, ast.Subscript):
                base = self.eval(target.value)
                key = self._literal_of(target.slice)
                if base.kind == "frame" and key is not _MISSING:
                    for column in (key if isinstance(key, (list, tuple)) else [key]):
                        base.frame.columns.pop(column, None)
                    self._frame_op("DROP", key if isinstance(key, (list, tuple)) else [key])
            elif isinstance(target, ast.Name):
                for scope in reversed(self.scopes):
                    if target.id in scope:
                        del scope[target.id]
                        break

    def _stmt_Global(self, statement: ast.Global) -> None:
        self.global_decls[-1].update(statement.names)

    def _stmt_Nonlocal(self, statement: ast.Nonlocal) -> None:
        pass

    def _stmt_Import(self, statement: ast.Import) -> None:
        names = ", ".join(alias.name for alias in statement.names)
        self._unresolved(statement, "import", names)

    def _stmt_ImportFrom(self, statement: ast.ImportFrom) -> None:
        self._unresolved(statement, "import", statement.module or "")

    def _stmt_Pass(self, statement: ast.Pass) -> None:
        pass

    _stmt_Break = _stmt_Pass
    _stmt_Continue = _stmt_Pass

    def _stmt_Assert(self, statement: ast.Assert) -> None:
        self.eval(statement.test)

    def _stmt_Raise(self, statement: ast.Raise) -> None:
        pass

    # ---------------------------------------------------------------- driver

    def run(self, tree: ast.Module) -> None:
        for statement in tree.body:
            self.step = {
                "id": len(self.steps), "line": statement.lineno, "end_line": statement.end_lineno or statement.lineno,
                "code": self._source(statement), "kind": "other", "writes": [], "reads": [], "defines": [], "frame_ops": [],
                "unresolved": False,
            }
            self.steps.append(self.step)
            self.statement = statement
            try:
                self._exec(statement)
            except _Cancelled:
                raise
            except Exception as exc:  # never lose the whole analysis to one construct
                self._unresolved(statement, "analysis_error", f"{type(exc).__name__}: {exc}")
            step = self.step
            if step["writes"]:
                step["kind"] = "write"
            elif step["frame_ops"]:
                step["kind"] = "frame"
            elif isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
                step["kind"] = "function"
            elif any(name in self.lookups and self.lookups[name]["line"] == statement.lineno for name in step["defines"]):
                step["kind"] = "lookup"
            elif step["defines"]:
                step["kind"] = "variable"
            elif isinstance(statement, (ast.Import, ast.ImportFrom)):
                step["kind"] = "import"
        self.step = None
        self.statement = None


# --------------------------------------------------------------------------------------------------
# Lineage graph
# --------------------------------------------------------------------------------------------------

def _closure(nodes: List[Dict[str, Any]], start: Iterable[int], data_only: bool = False) -> Set[int]:
    seen: Set[int] = set()
    stack = list(start)
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        node = nodes[current]
        stack.extend(int(item) for item in node["data"])
        if not data_only:
            stack.extend(node["control"])
            stack.extend(node["group"])
            stack.extend(node["join"])
    return seen


def analyse(code: str, input_columns: List[str]) -> Dict[str, Any]:
    """Static column-level lineage of a script (see module docstring)."""
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise LineageError(f"Syntax error in line {exc.lineno}: {exc.msg}") from exc
    analyzer = _Analyzer(code, list(input_columns))
    analyzer.run(tree)
    final = analyzer._lookup("df")
    if final is None or final.kind != "frame" or final.frame is None:
        raise LineageError("The script does not leave a DataFrame in 'df'.")
    frame = final.frame
    analyzer._materialize(frame)
    nodes = analyzer.nodes
    outputs = list(frame.columns)
    final_nodes = {column: frame.columns[column].node for column in outputs}
    inputs = list(input_columns)
    reachable = _closure(nodes, final_nodes.values())
    for op in frame.row_ops:
        reachable |= _closure(nodes, op["nodes"])

    # Depth of each version node: a dependency on another column adds a layer, a column's own history does not.
    depth: Dict[int, int] = {}
    for node in nodes:
        if node["kind"] == "source":
            depth[node["id"]] = 0
            continue
        best = 0
        for dependency in [*map(int, node["data"]), *node["control"], *node["group"], *node["join"]]:
            other = nodes[dependency]
            best = max(best, depth.get(dependency, 0) + (0 if other["column"] == node["column"] else 1))
        depth[node["id"]] = best

    dataset_ops = [
        {"kind": op["kind"], "line": op["line"], "code": op.get("code"), "columns": sorted({nodes[item]["column"] for item in op["nodes"]})}
        for op in frame.row_ops
    ]

    columns: List[Dict[str, Any]] = []
    edges: Dict[Tuple[str, str], Dict[str, Any]] = {}
    lookup_consumers: Dict[str, Set[str]] = {}
    for column in outputs:
        final_node = final_nodes[column]
        chain: List[int] = []
        upstream: Dict[str, Dict[str, Any]] = {}
        lookups: Set[str] = set()
        uses: Set[str] = set()
        input_used = False
        stack = [final_node]
        seen: Set[int] = set()
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            node = nodes[current]
            if node["kind"] == "source":
                if node["column"] == column:
                    input_used = True
                continue
            chain.append(current)
            lookups |= set(node["lookups"])
            uses |= set(node["uses"])
            dependencies = [(int(item), "DIRECT", level) for item, level in node["data"].items()]
            dependencies += [(item, "INDIRECT", "CONDITIONAL") for item in node["control"]]
            dependencies += [(item, "INDIRECT", "GROUP_BY") for item in node["group"]]
            dependencies += [(item, "INDIRECT", "JOIN") for item in node["join"]]
            for dependency, kind, subtype in dependencies:
                other = nodes[dependency]
                if other["column"] == column:
                    stack.append(dependency)
                    continue
                entry = upstream.setdefault(other["column"], {"column": other["column"], "transformations": set(), "lines": set(), "versions": set()})
                entry["transformations"].add((kind, subtype))
                if node["line"]:
                    entry["lines"].add(node["line"])
                entry["versions"].add(dependency)
        for op in frame.row_ops:
            for dependency in op["nodes"]:
                other = nodes[dependency]
                entry = upstream.setdefault(other["column"], {"column": other["column"], "transformations": set(), "lines": set(), "versions": set(), "dataset": True})
                entry["transformations"].add(("INDIRECT", op["kind"]))
                if op["line"]:
                    entry["lines"].add(op["line"])
                entry["versions"].add(dependency)
        chain.sort()
        all_reach = _closure(nodes, [final_node, *[item for op in frame.row_ops for item in op["nodes"]]])
        data_reach = _closure(nodes, [final_node], data_only=True)
        sources = []
        for node_id in sorted(all_reach):
            node = nodes[node_id]
            if node["kind"] != "source":
                continue
            sources.append({"column": node["column"], "mode": "direct" if node_id in data_reach else "indirect"})
        lookups_all = set(lookups)
        for node_id in all_reach:
            lookups_all |= set(nodes[node_id]["lookups"])
        operations = [nodes[node_id]["operation"] for node_id in chain]
        in_input = column in inputs
        if final_node is not None and nodes[final_node]["kind"] == "source":
            role = "passthrough"
        elif not in_input and any(nodes[node_id].get("renamed_from") for node_id in chain) and all(nodes[node_id]["operation"] in ("rename", "copy") for node_id in chain):
            role = "renamed"
        elif not in_input:
            role = "created"
        elif not input_used:
            role = "overwritten"
        elif operations and all(operation == "cast" for operation in operations):
            role = "cast"
        else:
            role = "enriched"
        upstream_list = []
        for entry in sorted(upstream.values(), key=lambda item: item["column"]):
            # The column was used in an earlier state than the one it has at the end of the script.
            historical = entry["column"] in final_nodes and final_nodes[entry["column"]] not in entry["versions"]
            item = {
                "column": entry["column"],
                "transformations": [{"type": kind, "subtype": subtype} for kind, subtype in sorted(entry["transformations"])],
                "lines": sorted(entry["lines"]),
                "historical": bool(historical),
                "dataset": bool(entry.get("dataset")),
            }
            upstream_list.append(item)
            key = (entry["column"], column)
            edge = edges.setdefault(key, {"from": entry["column"], "to": column, "transformations": set(), "lines": set(), "historical": False, "dataset": False})
            edge["transformations"] |= entry["transformations"]
            edge["lines"] |= entry["lines"]
            edge["historical"] = edge["historical"] or bool(historical)
            edge["dataset"] = edge["dataset"] or bool(entry.get("dataset")) and all(kind == "INDIRECT" and subtype in ("FILTER", "SORT", "JOIN") for kind, subtype in entry["transformations"])
        for name in lookups:
            lookup_consumers.setdefault(name, set()).add(column)
        columns.append({
            "name": column,
            "in_input": in_input,
            "in_output": True,
            "role": role,
            "final_node": final_node,
            "chain": chain,
            "input_used": input_used,
            "upstream": upstream_list,
            "sources": sources,
            "lookups": sorted(lookups),
            "lookups_all": sorted(lookups_all),
            "uses": sorted(uses),
            "operations": list(dict.fromkeys(operations)),
            "possible": any(nodes[node_id].get("possible") for node_id in chain),
            "depth": depth.get(final_node, 0) if final_node is not None else 0,
        })
    output_set = set(outputs)
    downstream: Dict[str, Set[str]] = {}
    for (source, target) in edges:
        downstream.setdefault(source, set()).add(target)
    for item in columns:
        item["downstream"] = sorted(downstream.get(item["name"], set()))
    # Input columns the script removes: shown when another column was derived from them.
    for column in inputs:
        if column in output_set:
            continue
        columns.append({
            "name": column, "in_input": True, "in_output": False, "role": "dropped", "final_node": None, "chain": [],
            "input_used": False, "upstream": [], "sources": [], "lookups": [], "lookups_all": [], "uses": [], "operations": [], "depth": 0,
            "downstream": sorted(downstream.get(column, set())),
        })
    # Intermediate columns that no longer exist at the end (created, used, dropped).
    known = {item["name"] for item in columns}
    for source, _target in edges:
        if source not in known:
            known.add(source)
            columns.append({
                "name": source, "in_input": False, "in_output": False, "role": "intermediate", "final_node": None, "chain": [],
                "input_used": False, "upstream": [], "sources": [], "lookups": [], "lookups_all": [], "uses": [], "operations": [], "depth": 0,
                "downstream": sorted(downstream.get(source, set())),
            })
    by_name = {item["name"]: item for item in columns}
    for item in columns:
        if item["role"] in ("dropped", "intermediate"):
            item["depth"] = 0
    # Layout depth on the column graph (longest path over non-historical edges).
    for _ in range(len(columns) + 1):
        changed = False
        for (source, target), edge in edges.items():
            if edge["historical"] or source == target:
                continue
            wanted = by_name[source]["depth"] + 1
            if by_name[target]["depth"] < wanted and wanted <= len(columns):
                by_name[target]["depth"] = wanted
                changed = True
        if not changed:
            break

    dead_writes = [
        {"node": node["id"], "column": node["column"], "line": node["line"], "statement": node.get("statement", "")}
        for node in nodes if node["kind"] == "write" and node["id"] not in reachable
    ]
    lookups = []
    for name, lookup in analyzer.lookups.items():
        consumers = sorted(lookup_consumers.get(name, set()))
        uses_lines = sorted({use["line"] for use in analyzer.lookup_uses if use["name"] == name})
        mapped = sorted({use["column"] for use in analyzer.lookup_uses if use["name"] == name and use.get("column")})
        if not consumers and not uses_lines:
            continue
        uses = []
        for use in analyzer.lookup_uses:
            item = {"line": use["line"], "column": use.get("column"), "method": use.get("method")}
            if use["name"] == name and item not in uses:
                uses.append(item)
        lookups.append({**lookup, "used_by": consumers, "used_in_lines": uses_lines, "keys_from": mapped, "uses": uses})
    lookup_names = {item["name"] for item in lookups}
    for item in columns:
        item["lookups"] = [name for name in item["lookups"] if name in lookup_names]
        item["lookups_all"] = [name for name in item["lookups_all"] if name in lookup_names]
    edge_list = []
    for edge in edges.values():
        edge_list.append({
            "from": edge["from"], "to": edge["to"], "kind": "column",
            "transformations": [{"type": kind, "subtype": subtype} for kind, subtype in sorted(edge["transformations"])],
            "lines": sorted(edge["lines"]), "historical": edge["historical"], "dataset": edge["dataset"],
        })
    for lookup in lookups:
        for consumer in lookup["used_by"]:
            if consumer not in output_set:
                continue
            column = by_name[consumer]
            if lookup["name"] not in column["lookups"]:
                continue
            lines = sorted(line for line in lookup["used_in_lines"])
            edge_list.append({
                "from": f"lookup:{lookup['name']}", "to": consumer, "kind": "lookup",
                "transformations": [{"type": "DIRECT", "subtype": "TRANSFORMATION"}], "lines": lines, "historical": False, "dataset": False,
            })
    edge_list.sort(key=lambda edge: (edge["to"], edge["from"]))
    for node in nodes:
        node["data"] = [{"node": int(item), "level": level} for item, level in sorted(node["data"].items())]
    variables = {
        name: {"line": lines[0], "end_line": lines[1]} for name, lines in analyzer.var_lines.items()
    }
    return {
        "inputs": inputs,
        "outputs": outputs,
        "nodes": nodes,
        "steps": analyzer.steps,
        "columns": columns,
        "edges": edge_list,
        "lookups": lookups,
        "dataset_ops": dataset_ops,
        "dead_writes": dead_writes,
        "unresolved": analyzer.unresolved,
        "variables": variables,
    }


# --------------------------------------------------------------------------------------------------
# Runtime: replay, cell provenance and dependency probes
# --------------------------------------------------------------------------------------------------

def _is_null(value: Any) -> bool:
    if value is None:
        return True
    try:
        result = pd.isna(value)
    except Exception:
        return False
    return bool(result) if isinstance(result, (bool, np.bool_)) else False


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float, np.integer, np.floating)) and not isinstance(value, (bool, np.bool_))


def same_value(left: Any, right: Any) -> bool:
    left_null, right_null = _is_null(left), _is_null(right)
    if left_null or right_null:
        return left_null and right_null
    if isinstance(left, (bool, np.bool_)) or isinstance(right, (bool, np.bool_)):
        return isinstance(left, (bool, np.bool_)) and isinstance(right, (bool, np.bool_)) and bool(left) == bool(right)
    if _is_number(left) and _is_number(right):
        a, b = float(left), float(right)
        if math.isinf(a) or math.isinf(b):
            return a == b
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
    if _is_number(left) != _is_number(right):
        return False
    if isinstance(left, (pd.Timestamp, datetime, date)) or isinstance(right, (pd.Timestamp, datetime, date)):
        try:
            return pd.Timestamp(left) == pd.Timestamp(right)
        except Exception:
            return str(left) == str(right)
    try:
        result = left == right
        return bool(result) if isinstance(result, (bool, np.bool_)) else str(left) == str(right)
    except Exception:
        return str(left) == str(right)


def _json_value(value: Any) -> Any:
    if _is_null(value):
        return None
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        number = float(value)
        return number if math.isfinite(number) else str(number)
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, np.datetime64):
        return pd.Timestamp(value).isoformat()
    if isinstance(value, str):
        return value[:300]
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in list(value)[:20]]
    return str(value)[:300]


json_value = _json_value


def _changed_rows(before: pd.Series, after: pd.Series) -> List[Any]:
    """Index labels whose value differs (both series share the index)."""
    try:
        if before.equals(after):
            return []
    except Exception:
        pass
    left = before.to_numpy(dtype=object)
    right = after.to_numpy(dtype=object)
    labels = list(after.index)
    return [labels[position] for position in range(len(labels)) if not same_value(left[position], right[position])]


def compare_frames(before: pd.DataFrame, after: pd.DataFrame) -> Dict[str, Any]:
    """Cell-level differences between two states of ``df``, aligned on the row index."""
    added = [column for column in after.columns if column not in before.columns]
    removed = [column for column in before.columns if column not in after.columns]
    common_before = [column for column in before.columns if column in after.columns]
    common_after = [column for column in after.columns if column in before.columns]
    same_index = before.index.equals(after.index)
    if same_index:
        left, right = before, after
        rows_removed, rows_added = 0, 0
    else:
        shared = after.index.intersection(before.index)
        rows_removed = int(len(before.index.difference(after.index)))
        rows_added = int(len(after.index.difference(before.index)))
        left, right = before.loc[shared], after.loc[shared]
    changes: Dict[str, List[Any]] = {}
    for column in after.columns:
        if column in added:
            values = right[column] if not same_index else after[column]
            changes[column] = [label for label, value in values.items() if not _is_null(value)]
            continue
        try:
            changes[column] = _changed_rows(left[column], right[column])
        except Exception:
            changes[column] = list(right.index)
    return {
        "added": [str(column) for column in added],
        "removed": [str(column) for column in removed],
        "reordered": common_before != common_after,
        "rows_removed": rows_removed,
        "rows_added": rows_added,
        "order_changed": not same_index and rows_removed == 0 and rows_added == 0,
        "changes": changes,
    }


def run_script(prepared_code: str, frame: pd.DataFrame, make_globals: Callable[[pd.DataFrame], Dict[str, Any]]) -> pd.DataFrame:
    namespace = make_globals(frame.copy(deep=True))
    exec(compile(prepared_code, "<script>", "exec"), namespace)
    result = namespace.get("df")
    if not isinstance(result, pd.DataFrame):
        raise LineageError("The script does not leave a DataFrame in 'df'.")
    return result


def trace(
    prepared_code: str,
    frame: pd.DataFrame,
    make_globals: Callable[[pd.DataFrame], Dict[str, Any]],
    reads: Dict[int, Dict[str, List[str]]],
    lookup_checks: List[Dict[str, Any]],
    trace_rows: int,
    cancelled: Callable[[], bool] = lambda: False,
) -> Dict[str, Any]:
    """Replay the script statement by statement and record what every statement changes.

    ``reads[line][column]`` lists the columns the statement starting at ``line`` reads to write ``column``; their values
    before the statement are stored with each traced cell change. ``lookup_checks`` ({line, column, keys, name}) report
    values of the mapped column that the lookup table does not cover, measured right before the mapping statement.
    """
    tree = ast.parse(prepared_code)
    namespace = make_globals(frame.copy(deep=True))
    previous = namespace["df"].copy(deep=True)
    traced = set(list(frame.index)[:trace_rows])
    statements: List[Dict[str, Any]] = []
    cells: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    last_line: Dict[str, Dict[str, int]] = {}
    unmapped: List[Dict[str, Any]] = []
    error: Optional[Dict[str, Any]] = None
    checks_by_line: Dict[int, List[Dict[str, Any]]] = {}
    for check in lookup_checks:
        checks_by_line.setdefault(check["statement_line"], []).append(check)
    for statement in tree.body:
        if cancelled():
            raise _Cancelled()
        for check in checks_by_line.get(statement.lineno, []):
            current = namespace.get("df")
            if isinstance(current, pd.DataFrame) and check["column"] in current.columns:
                keys = check["keys"]
                counts: Dict[str, int] = {}
                for value in current[check["column"]].tolist():
                    if _is_null(value):
                        continue
                    if not any(same_value(value, key) for key in keys):
                        label = str(_json_value(value))
                        counts[label] = counts.get(label, 0) + 1
                unmapped.append({**{key: check[key] for key in ("name", "line", "column")}, "values": [{"value": value, "rows": count} for value, count in sorted(counts.items(), key=lambda item: -item[1])][:20]})
        started = time.perf_counter()
        try:
            exec(compile(ast.Module(body=[statement], type_ignores=[]), "<script>", "exec"), namespace)
        except Exception as exc:
            error = {"line": statement.lineno, "message": f"{type(exc).__name__}: {exc}"[:400]}
            statements.append({"line": statement.lineno, "end_line": statement.end_lineno or statement.lineno, "ms": round((time.perf_counter() - started) * 1000, 2), "error": error["message"], "changed": {}})
            break
        elapsed = round((time.perf_counter() - started) * 1000, 2)
        current = namespace.get("df")
        if not isinstance(current, pd.DataFrame):
            error = {"line": statement.lineno, "message": "df is no longer a DataFrame after this statement"}
            statements.append({"line": statement.lineno, "end_line": statement.end_lineno or statement.lineno, "ms": elapsed, "error": error["message"], "changed": {}})
            break
        diff = compare_frames(previous, current)
        changed = {str(column): len(labels) for column, labels in diff["changes"].items() if labels}
        record = {
            "line": statement.lineno, "end_line": statement.end_lineno or statement.lineno, "ms": elapsed, "error": None,
            "changed": changed, "added": diff["added"], "removed": diff["removed"], "reordered": diff["reordered"],
            "rows_removed": diff["rows_removed"], "rows_added": diff["rows_added"], "order_changed": diff["order_changed"],
        }
        statements.append(record)
        line_reads = reads.get(statement.lineno, {})
        nulled: Dict[str, Dict[str, Any]] = {}
        for column, labels in diff["changes"].items():
            for label in labels:
                last_line.setdefault(str(column), {})[str(label)] = statement.lineno
                if column in previous.columns and label in previous.index:
                    before_value = previous.at[label, column]
                    if not _is_null(before_value) and _is_null(current.at[label, column]):
                        entry = nulled.setdefault(str(column), {"count": 0, "examples": []})
                        entry["count"] += 1
                        example = _json_value(before_value)
                        if example not in entry["examples"] and len(entry["examples"]) < 5:
                            entry["examples"].append(example)
                if label not in traced:
                    continue
                before_value = previous.at[label, column] if column in previous.columns and label in previous.index else None
                after_value = current.at[label, column]
                inputs = {}
                for source in line_reads.get(str(column), []):
                    if source in previous.columns and label in previous.index:
                        inputs[source] = _json_value(previous.at[label, source])
                cells.setdefault(str(column), {}).setdefault(str(label), []).append({
                    "line": statement.lineno, "before": _json_value(before_value), "after": _json_value(after_value), "inputs": inputs,
                })
        record["nulled"] = nulled
        previous = current.copy(deep=True)
    final = namespace.get("df") if isinstance(namespace.get("df"), pd.DataFrame) else previous
    return {"statements": statements, "cells": cells, "last_line": last_line, "unmapped": unmapped, "error": error, "final": final}


def compare_with_execution(final: pd.DataFrame, stored_rows: List[Dict[str, Any]], stored_columns: List[str]) -> Dict[str, Any]:
    """Does the replay reproduce the stored execution result (row order, columns, every value)?"""
    examples: List[Dict[str, Any]] = []
    total_mismatches = 0
    columns_match = [str(column) for column in final.columns] == [str(column) for column in stored_columns]
    compared = 0
    rows = min(len(final), len(stored_rows))
    values = final.reset_index(drop=True)
    for position in range(rows):
        stored = stored_rows[position]
        for column in final.columns:
            name = str(column)
            if name not in stored:
                continue
            compared += 1
            raw = values.at[position, column]
            replayed = None if _is_number(raw) and not math.isfinite(float(raw)) else _json_value(raw)
            if not same_value(replayed, stored.get(name)):
                total_mismatches += 1
                if len(examples) < 50:
                    examples.append({"row": position, "column": name, "stored": stored.get(name), "replayed": replayed})
    final_columns = [str(column) for column in final.columns]
    return {
        "extra_columns": [column for column in final_columns if column not in stored_columns],
        "missing_columns": [str(column) for column in stored_columns if str(column) not in final_columns],
        "cells_compared": compared,
        "mismatches": total_mismatches,
        "examples": examples,
        "rows_match": len(final) == len(stored_rows),
        "columns_match": columns_match,
        "replayed_rows": len(final),
        "stored_rows": len(stored_rows),
        "ok": columns_match and len(final) == len(stored_rows) and total_mismatches == 0,
    }


def _number_from_text(value: str) -> Optional[float]:
    text = value.strip().replace(" ", "")
    if not re.fullmatch(r"[-+]?\d+(?:[.,]\d+)?", text):
        return None
    try:
        return float(text.replace(",", "."))
    except ValueError:
        return None


def _perturb(value: Any) -> Any:
    if _is_null(value):
        return value
    if isinstance(value, (bool, np.bool_)):
        return not bool(value)
    if isinstance(value, (int, np.integer)):
        return int(value) * 3 + 7
    if isinstance(value, (float, np.floating)):
        return float(value) * 1.37 + 7.31 if math.isfinite(float(value)) else value
    if isinstance(value, (pd.Timestamp, datetime)):
        return value + pd.Timedelta(days=17)
    if isinstance(value, date):
        return value.replace(year=value.year + 1) if not (value.month == 2 and value.day == 29) else value.replace(day=28, year=value.year + 1)
    if isinstance(value, str):
        number = _number_from_text(value)
        if number is not None:
            return f"{number * 3 + 7:g}"
        return f"{value}~probe"
    return value


def probe_frame(frame: pd.DataFrame, column: str, mode: str, fill_value: Any = None) -> Optional[pd.DataFrame]:
    """A copy of the input with one column perturbed ('perturb'), emptied ('null') or its gaps filled ('fill')."""
    series = frame[column]
    modified = frame.copy(deep=True)
    non_null = [value for value in series.tolist() if not _is_null(value)]
    numeric = pd.api.types.is_numeric_dtype(series.dtype) and not pd.api.types.is_bool_dtype(series.dtype)
    if mode == "perturb":
        if not non_null:
            return None
        values = [_perturb(value) for value in series.tolist()]
        modified[column] = _typed_series(values, series)
        return modified
    if mode == "null":
        if not non_null:
            return None
        if pd.api.types.is_datetime64_any_dtype(series.dtype):
            modified[column] = pd.Series([pd.NaT] * len(series), index=series.index, dtype=series.dtype)
        else:
            modified[column] = pd.Series([np.nan if numeric else None] * len(series), index=series.index, dtype="float64" if numeric else object)
        return modified
    if mode == "fill":
        if len(non_null) == len(series):
            return None
        values = [fill_value if _is_null(value) else value for value in series.tolist()]
        if numeric and _is_number(fill_value):
            modified[column] = pd.Series(values, index=series.index, dtype="float64")
        else:
            modified[column] = _typed_series(values, series)
        return modified
    return None


def _typed_series(values: List[Any], like: pd.Series) -> pd.Series:
    """Values in the dtype of the original column when it can hold them (datetimes stay datetimes)."""
    if like.dtype != object:
        try:
            return pd.Series(values, index=like.index, dtype=like.dtype)
        except (TypeError, ValueError, OverflowError):
            pass
        try:
            return pd.Series(values, index=like.index)
        except (TypeError, ValueError):
            pass
    return pd.Series(values, index=like.index, dtype=object)


def fill_value_for(series: pd.Series) -> Any:
    non_null = [value for value in series.tolist() if not _is_null(value)]
    if pd.api.types.is_datetime64_any_dtype(series.dtype):
        return pd.Timestamp(non_null[0]) + pd.Timedelta(days=17) if non_null else pd.Timestamp("2000-01-01")
    if non_null:
        numbers = [float(value) for value in non_null if _is_number(value)]
        if numbers and len(numbers) == len(non_null):
            return float(np.median(numbers)) * 1.5 + 11
        counts: Dict[str, int] = {}
        for value in non_null:
            counts[str(value)] = counts.get(str(value), 0) + 1
        return max(counts, key=counts.get)
    return 1000.0


def changed_columns(baseline: pd.DataFrame, result: pd.DataFrame) -> Dict[str, int]:
    changed: Dict[str, int] = {}
    if not baseline.index.equals(result.index):
        shared = baseline.index.intersection(result.index)
        extra = len(baseline.index.symmetric_difference(result.index))
    else:
        shared = baseline.index
        extra = 0
    for column in baseline.columns:
        if column not in result.columns:
            changed[str(column)] = len(baseline)
            continue
        count = len(_changed_rows(baseline.loc[shared, column], result.loc[shared, column])) + extra
        if count:
            changed[str(column)] = count
    for column in result.columns:
        if column not in baseline.columns:
            changed[str(column)] = len(result)
    return changed
