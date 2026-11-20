"""Deterministic core of the normal RootCause tab (``/api/rootcause/analyze``).

For every position whose result field differs between execution A (base) and execution B (compare):

1. Lineage of the compare run, per position. B's code is replayed on B's input statement by statement and every cell
   is attributed to the statement that last wrote it (``lineage_analysis``). Following those writes back from the
   result field gives the position's own lineage, i.e. the rules of its product type (a limit's Assessment Base comes
   from Nominal, a security's from Market Value) - not the union of all rules and not the base run's rules.
2. What changed. The lineage fields are compared between the stored results of A and B. Walking back from the result
   field through changed fields ends at the origins of the deviation: a changed calculation rule (code) or changed
   input data.
3. Which release note covers which origin: the note names the field (or, for a changed rule, its new source) and its
   scope fits the position (it does not name only other product types, counterparties, ...).
4. Explanation status, score, the input field (the first field of the shown lineage that exists in both runs and
   changed), the lineage to show (only the changes a release note covers; all changes when none is covered) and a
   German explanation.

Running B's code on A's input splits a mixed deviation into the effect of the new calculation and the effect of the
changed input data.
"""
from __future__ import annotations

import ast
import math
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Set, Tuple

import numpy as np
import pandas as pd

import lineage_analysis as la

REPLAY_ROW_LIMIT = 20000
MAX_PATHS = 4
MAX_DETAILED_POSITIONS = 1000
MAX_NOTES_PER_ROW = 3
MAX_SCOPE_VALUES = 50
_PLACEHOLDER = re.compile(r"^[\s€$£¥%,.\-–—_/]*$")
_DATE_LIKE = re.compile(r"^\d{4}-\d{2}-\d{2}")
_UMLAUTS = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "Ä": "ae", "Ö": "oe", "Ü": "ue"})


@dataclass
class Platform:
    """Functions of the platform the analysis needs (injected, so the module has no import cycle with main)."""
    stored_execution: Callable[[str], Dict[str, Any]]
    code_text: Callable[[str], str]
    code_meta: Callable[[str], Dict[str, Any]]
    dataset_meta: Callable[[str], Dict[str, Any]]
    load_input: Callable[..., Tuple[pd.DataFrame, Dict[str, Any], Dict[str, Any]]]
    prepare: Callable[[str], str]
    make_globals: Callable[[pd.DataFrame], Dict[str, Any]]


# --------------------------------------------------------------------------------------------------
# Values and texts
# --------------------------------------------------------------------------------------------------

def _clean(value: Any) -> Any:
    """A value as it compares: empty and placeholder texts ("-   €") are missing, numeric texts are numbers."""
    if value is None:
        return None
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if isinstance(value, (int, float, np.integer, np.floating)):
        number = float(value)
        return None if math.isnan(number) else number
    if la._is_null(value):
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text or _PLACEHOLDER.match(text):
            return None
        number = la._number_from_text(text)
        return number if number is not None else text
    return value


def same_value(left: Any, right: Any) -> bool:
    left, right = _clean(left), _clean(right)
    if left is None or right is None:
        return left is None and right is None
    if isinstance(left, float) and isinstance(right, float):
        if math.isinf(left) or math.isinf(right):
            return left == right
        return math.isclose(left, right, rel_tol=1e-9, abs_tol=1e-9)
    return str(left).strip().casefold() == str(right).strip().casefold()


def _number(value: Any) -> Optional[float]:
    value = _clean(value)
    return value if isinstance(value, float) and math.isfinite(value) else None


def de_number(value: float, signed: bool = False) -> str:
    """A number the German way: 16.000, 0,5, -7.050,25."""
    if not math.isfinite(value):
        return str(value)
    rounded = round(value, 4)
    if abs(rounded - round(rounded)) < 1e-9:
        text = f"{int(round(rounded)):,}"
    else:
        text = f"{rounded:,.4f}".rstrip("0").rstrip(".")
    text = text.replace(",", "§").replace(".", ",").replace("§", ".")
    if signed and value > 0:
        text = "+" + text
    return text


def de_value(value: Any) -> str:
    """A field value in a German sentence: numbers German, texts in quotes, missing values as "leer"."""
    cleaned = _clean(value)
    if cleaned is None:
        return "leer"
    if isinstance(cleaned, float):
        return de_number(cleaned)
    if isinstance(cleaned, bool):
        return "wahr" if cleaned else "falsch"
    return f"„{str(value).strip()}“"


def de_list(items: Sequence[str]) -> str:
    items = [item for item in items if item]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " und " + items[-1]


def _json(value: Any) -> Any:
    if value is None or la._is_null(value):
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        number = float(value)
        return number if math.isfinite(number) else None
    return la.json_value(value)


def _key(value: Any) -> Optional[str]:
    """Position keys compare as text; 5 and 5.0 are the same key."""
    if value is None or la._is_null(value):
        return None
    if isinstance(value, (bool, np.bool_)):
        return str(bool(value))
    if isinstance(value, (int, np.integer)):
        return str(int(value))
    if isinstance(value, (float, np.floating)):
        number = float(value)
        return str(int(number)) if number.is_integer() else str(number)
    return str(value).strip()


# --------------------------------------------------------------------------------------------------
# Release-note matching: normalised, stemmed words; a phrase matches as a whole-word sequence
# --------------------------------------------------------------------------------------------------

def normalise(text: Any) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", str(text).translate(_UMLAUTS).lower()).split())


def _split_camel(name: str) -> str:
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name)


def _stem(word: str) -> str:
    """A crude stem for English and German word forms: Limits/Limit, Securities/Security, Guaranties/Guarantee,
    anteiligen/anteilige, Zinsen/Zins, EWBs/EWB, Loans/Loan. Endings are removed until none is left, so a word and its
    plural end on the same stem (loans -> loan -> loa, loan -> loa), and so do the spellings guaranty and guarantee
    (guaranties -> guaranty -> guarant, guarantee -> guarante -> guarant). Words of three letters or less (EAD, RWA,
    PWB) stay as they are."""
    if word.isdigit():
        return word
    for _round in range(4):
        if len(word) <= 3 or word.endswith("ss"):
            return word
        if word.endswith("ies") and len(word) > 5:
            word = word[:-3] + "y"
            continue
        for suffix in ("en", "er", "es", "e", "n", "s", "y"):
            if word.endswith(suffix) and len(word) - len(suffix) >= 3:
                word = word[: -len(suffix)]
                break
        else:
            return word
    return word


def stems(text: Any) -> str:
    return " ".join(_stem(word) for word in normalise(text).split())


def variants(name: str) -> Set[str]:
    """A field name or data value as stemmed phrases: as written and with its camel case split (BalanceSheetType)."""
    return {phrase for phrase in {stems(name), stems(_split_camel(name))} if len(phrase.replace(" ", "")) >= 2}


def mentions(text: str, phrases: Iterable[str]) -> bool:
    """Does the stemmed text contain one of the stemmed phrases as whole words ("ead" is not part of "already")?"""
    padded = f" {text} "
    return any(f" {phrase} " in padded for phrase in phrases)


@dataclass
class Note:
    """One release-note record."""
    label: str
    workbook: str
    sheet: str
    solution: str
    problem: str
    record: Dict[str, Any]
    text: str = ""
    solution_text: str = ""

    def __post_init__(self) -> None:
        self.text = stems(" ".join(str(value) for value in self.record.values() if value is not None))
        self.solution_text = stems(self.solution)

    def reference(self) -> Dict[str, Any]:
        return {"id": self.label, "workbook": self.workbook, "sheet": self.sheet, "solution": self.solution, "problem": self.problem}


# --------------------------------------------------------------------------------------------------
# Runs: stored result, replay with per-cell attribution, static fallback
# --------------------------------------------------------------------------------------------------

@dataclass
class Rule:
    """How a position's value of a field was computed in a run."""
    parents: List[str]
    conditions: List[str]
    lines: List[int]
    code: List[str]
    basis: str  # "replay" (this position) or "static" (any position)


@dataclass
class Run:
    execution_id: str
    stored: Dict[str, Any]
    code_filename: str = ""
    dataset_name: str = ""
    columns: List[str] = field(default_factory=list)
    rows: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    input_rows: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    input_columns: List[str] = field(default_factory=list)
    prepared: str = ""
    frame: Optional[pd.DataFrame] = None
    analysis: Optional[Dict[str, Any]] = None
    writers: Dict[Tuple[int, str], List[Dict[str, Any]]] = field(default_factory=dict)
    step_code: Dict[int, str] = field(default_factory=dict)
    static: Dict[str, Rule] = field(default_factory=dict)
    history: Dict[str, Dict[Any, List[Tuple[int, Any]]]] = field(default_factory=dict)
    labels: Dict[str, Any] = field(default_factory=dict)
    replayed: bool = False
    verified: bool = False
    partial: bool = False
    problem: str = ""

    def value(self, key: str, column: str) -> Any:
        return (self.rows.get(key) or {}).get(column)

    def has(self, column: str) -> bool:
        return column in self.columns

    def rule(self, column: str, key: str) -> Optional[Rule]:
        """The rule of a field for one position: from the replay when the position was replayed, else static."""
        label = self.labels.get(key)
        if self.replayed and label is not None:
            return _row_rule(self, column, label)
        return self.static.get(column)


def _replay(prepared: str, frame: pd.DataFrame, make_globals: Callable[[pd.DataFrame], Dict[str, Any]]) -> Tuple[Dict[str, Dict[Any, List[Tuple[int, Any]]]], pd.DataFrame]:
    """Run the code statement by statement; per column and row label the statements that changed the cell, in order,
    with the value the cell had before."""
    tree = ast.parse(prepared)
    namespace = make_globals(frame.copy(deep=True))
    previous = namespace["df"].copy(deep=True)
    history: Dict[str, Dict[Any, List[Tuple[int, Any]]]] = {}
    for statement in tree.body:
        try:
            exec(compile(ast.Module(body=[statement], type_ignores=[]), "<script>", "exec"), namespace)
        except Exception as exc:
            raise ValueError(f"line {statement.lineno}: {type(exc).__name__}: {exc}"[:300]) from exc
        current = namespace.get("df")
        if not isinstance(current, pd.DataFrame):
            raise ValueError(f"line {statement.lineno}: df is no longer a DataFrame")
        diff = la.compare_frames(previous, current)
        for column, labels in diff["changes"].items():
            name = str(column)
            if name in diff["added"]:
                labels = list(current.index)  # a new column is written in every row
            for label in labels:
                try:
                    before = previous.at[label, column] if column in previous.columns and label in previous.index else None
                except Exception:
                    before = None
                history.setdefault(name, {}).setdefault(label, []).append((statement.lineno, before))
        previous = current.copy(deep=True)
    return history, previous


def _row_rule(run: Run, column: str, label: Any) -> Optional[Rule]:
    """The statements that produced the position's final value of a field and what they read. A statement that reads
    the field itself (``x * 2``, not ``fillna`` of an empty cell, not a masked write) passes the earlier value on, so the
    earlier writes count too. None: the value comes unchanged from the input."""
    writes = run.history.get(column, {}).get(label, [])
    if not writes:
        return None
    nodes_all = run.analysis["nodes"] if run.analysis else []
    parents: List[str] = []
    conditions: List[str] = []
    lines: List[int] = []
    for line, before in reversed(writes):
        nodes = run.writers.get((line, column), [])
        lines.append(line)
        if not nodes:
            break  # a write the static analysis cannot attribute
        follow = False
        for node in nodes:
            for dependency in node.get("data", []):
                name = nodes_all[int(dependency["node"])]["column"]
                if name != column and name not in parents:
                    parents.append(name)
            for dependency in [*node.get("control", []), *node.get("group", []), *node.get("join", [])]:
                name = nodes_all[int(dependency)]["column"]
                if name != column and name not in conditions:
                    conditions.append(name)
            if node.get("reads_self") and not node.get("retained"):
                follow = True
        if follow and not la._is_null(before):
            continue
        break
    conditions = [name for name in conditions if name not in parents]
    if not parents and conditions:  # constants chosen by a condition (np.where(EAD > 60, 'high', 'low')): the condition is the source
        parents, conditions = conditions, []
    lines.sort()
    code = [run.step_code.get(line, "") for line in lines]
    return Rule(_in_code_order(parents, code), conditions, lines, code, "replay")


def _in_code_order(names: List[str], code: List[str]) -> List[str]:
    """Fields in the order the statement names them (Accrued Interests before Book Value in ``ai + bv``)."""
    text = "\n".join(code)

    def position(name: str) -> int:
        found = [index for index in (text.find(f"'{name}'"), text.find(f'"{name}"'), text.find(f".{name}")) if index >= 0]
        return min(found) if found else len(text) + 1

    return sorted(names, key=position)


def load_run(platform: Platform, execution_id: str, key_column: str, keys: Set[str]) -> Run:
    stored = platform.stored_execution(execution_id)
    run = Run(execution_id=execution_id, stored=stored)
    code_id = stored.get("code_id") or ""
    dataset_id = stored.get("dataset_id") or ""
    run.code_filename = str(platform.code_meta(code_id).get("filename") or "")
    meta = platform.dataset_meta(dataset_id)
    run.dataset_name = str(meta.get("user_name") or meta.get("filename") or "")
    data = stored.get("data") or []
    run.columns = [str(column) for column in ((stored.get("summary") or {}).get("columns") or (list(data[0].keys()) if data else []))]
    compare_keys: Dict[str, str] = {}
    for row in data:
        value = row.get(key_column)
        if value is None:
            continue
        compare_key = str(value)
        compare_keys.setdefault(_key(value) or compare_key, compare_key)
        run.rows.setdefault(compare_key, row)
    try:
        code = platform.code_text(code_id)
        run.prepared = platform.prepare(code)
        frame, _metadata, _table = platform.load_input(dataset_id, stored.get("table_id"))
    except Exception as exc:
        run.problem = f"Code oder Eingangsdaten nicht verfügbar: {getattr(exc, 'detail', None) or exc}"
        return run
    run.frame = frame
    run.input_columns = [str(column) for column in frame.columns]
    if key_column in frame.columns:
        for label, value in frame[key_column].items():
            compare_key = compare_keys.get(_key(value) or "")
            if compare_key is not None and compare_key not in run.input_rows:
                run.input_rows[compare_key] = {str(column): frame.at[label, column] for column in frame.columns}
    try:
        analysis = la.analyse(run.prepared, run.input_columns)
    except Exception as exc:
        run.problem = f"Code nicht analysierbar: {exc}"
        return run
    run.analysis = analysis
    nodes = analysis["nodes"]
    dead = {item["node"] for item in analysis.get("dead_writes", [])}
    for step in analysis["steps"]:
        run.step_code[step["line"]] = step.get("code") or ""
        for node_id in step["writes"]:
            node = nodes[node_id]
            run.writers.setdefault((step["line"], node["column"]), []).append(node)
            if node_id in dead:
                continue
            static = run.static.setdefault(node["column"], Rule([], [], [], [], "static"))
            for dependency in node.get("data", []):
                name = nodes[int(dependency["node"])]["column"]
                if name != node["column"] and name not in static.parents:
                    static.parents.append(name)
            for dependency in node.get("control", []):
                name = nodes[int(dependency)]["column"]
                if name != node["column"] and name not in static.conditions:
                    static.conditions.append(name)
            static.lines.append(step["line"])
            static.code.append(step.get("code") or "")
    for static in run.static.values():
        static.parents = _in_code_order(static.parents, static.code)
        static.conditions = [name for name in static.conditions if name not in static.parents]
        if not static.parents and static.conditions:
            static.parents, static.conditions = _in_code_order(static.conditions, static.code), []
    replay_frame = frame
    if len(frame) > REPLAY_ROW_LIMIT:
        run.partial = True
        if key_column in frame.columns:
            wanted = frame[key_column].map(lambda value: compare_keys.get(_key(value) or "") in keys)
            replay_frame = frame[wanted] if bool(wanted.any()) else frame.iloc[:REPLAY_ROW_LIMIT]
        else:
            replay_frame = frame.iloc[:REPLAY_ROW_LIMIT]
    try:
        history, final = _replay(run.prepared, replay_frame, platform.make_globals)
    except Exception as exc:
        run.problem = f"Nachrechnung fehlgeschlagen ({exc})"
        return run
    run.history = history
    run.replayed = True
    if key_column in final.columns:
        for label, value in final[key_column].items():
            compare_key = compare_keys.get(_key(value) or "")
            if compare_key is not None and compare_key not in run.labels:
                run.labels[compare_key] = label
    if not run.partial:
        try:
            run.verified = bool(la.compare_with_execution(final, data, run.columns)["ok"])
        except Exception:
            run.verified = False
    return run


def counterfactual(platform: Platform, run_b: Run, run_a: Run, key_column: str, output: str) -> Dict[str, float]:
    """B's calculation on A's input data: the output per position if only the calculation had changed."""
    if run_a.frame is None or not run_b.prepared or len(run_a.frame) > REPLAY_ROW_LIMIT:
        return {}
    try:
        result = la.run_script(run_b.prepared, run_a.frame, platform.make_globals)
    except Exception:
        return {}
    if key_column not in result.columns or output not in result.columns:
        return {}
    keys = {(_key(row.get(key_column)) or ""): str(row.get(key_column)) for row in (run_a.stored.get("data") or []) if row.get(key_column) is not None}
    values: Dict[str, float] = {}
    for _label, row in result[[key_column, output]].iterrows():
        compare_key = keys.get(_key(row[key_column]) or "")
        number = _number(row[output])
        if compare_key is not None and number is not None and compare_key not in values:
            values[compare_key] = number
    return values


# --------------------------------------------------------------------------------------------------
# Scope of a position: the product types, counterparties, ... it belongs to
# --------------------------------------------------------------------------------------------------

@dataclass
class Scope:
    """Dimensions a release note can be scoped by: the position-key word (Limit_5 -> limit) and the text columns of the
    data (ProductType, counterparty type, ...). A note that names values of a dimension but not the position's value
    is about other positions."""
    dimensions: Dict[str, Dict[str, Set[str]]]  # dimension -> value -> phrases

    @staticmethod
    def build(run_a: Run, run_b: Run, key_column: str, keys: Sequence[str]) -> "Scope":
        dimensions: Dict[str, Dict[str, Set[str]]] = {}
        words: Dict[str, Set[str]] = {}
        for key in keys:
            for token in normalise(key).split():
                if len(token) >= 3 and not any(character.isdigit() for character in token):
                    words.setdefault(token, variants(token))
        if 0 < len(words) <= MAX_SCOPE_VALUES:
            dimensions["__key__"] = words
        for run in (run_a, run_b):
            for row in run.rows.values():
                for column, value in row.items():
                    if column == key_column or not isinstance(value, str):
                        continue
                    text = value.strip()
                    if len(text) < 3 or _DATE_LIKE.match(text) or _PLACEHOLDER.match(text) or la._number_from_text(text) is not None:
                        continue
                    values = dimensions.setdefault(column, {})
                    if len(values) <= MAX_SCOPE_VALUES:
                        values.setdefault(normalise(text), variants(text))
        # Product types, counterparty types, ... have a few values; names and identifiers are no scope.
        return Scope({name: values for name, values in dimensions.items() if name == "__key__" or 2 <= len(values) <= MAX_SCOPE_VALUES})

    def of(self, key: str, rows: Sequence[Dict[str, Any]]) -> Dict[str, Set[str]]:
        own: Dict[str, Set[str]] = {}
        if "__key__" in self.dimensions:
            own["__key__"] = {token for token in normalise(key).split() if token in self.dimensions["__key__"]}
        for row in rows:
            for column, value in (row or {}).items():
                if column in self.dimensions and isinstance(value, str) and normalise(value) in self.dimensions[column]:
                    own.setdefault(column, set()).add(normalise(value))
        return own

    def fit(self, note: Note, own: Dict[str, Set[str]]) -> Tuple[bool, bool]:
        """(allowed, names the position's own scope)."""
        named_own = False
        for dimension, values in self.dimensions.items():
            named = {value for value, phrases in values.items() if mentions(note.text, phrases)}
            if not named:
                continue
            mine = own.get(dimension, set())
            if named & mine:
                named_own = True
            else:
                return False, False
        return True, named_own


# --------------------------------------------------------------------------------------------------
# Per position: lineage, origins, coverage, texts
# --------------------------------------------------------------------------------------------------

@dataclass
class Context:
    run_a: Run
    run_b: Run
    output: str
    key_column: str
    notes: List[Note]
    scope: Scope
    expected: Dict[str, float]


def _changed(context: Context, key: str, column: str) -> Optional[bool]:
    """True/False when both runs have the field; True when only the compare run has it (new); None when unknown."""
    in_a, in_b = context.run_a.has(column), context.run_b.has(column)
    if in_a and in_b:
        return not same_value(context.run_a.value(key, column), context.run_b.value(key, column))
    if in_b:
        return True
    return None


def _inputs_differ(context: Context, key: str, column: str) -> bool:
    row_a = context.run_a.input_rows.get(key) or {}
    row_b = context.run_b.input_rows.get(key) or {}
    if column not in row_a and column not in row_b:
        return False
    return not same_value(row_a.get(column), row_b.get(column))


def _condition_text(context: Context, key: str, rule: Optional[Rule]) -> str:
    """The text fields that select the rule for this position, with the position's values (ProductType „Limit“)."""
    if not rule:
        return ""
    parts = []
    row = context.run_b.rows.get(key) or {}
    for name in rule.conditions:
        value = row.get(name)
        if isinstance(value, str) and value.strip() and _clean(value) is not None and not isinstance(_clean(value), float):
            parts.append(f"{name} „{value.strip()}“")
    return ", ".join(parts)


def _rule_ref(rule: Optional[Rule]) -> Optional[Dict[str, Any]]:
    """How the compare run computes a field for the position, for the lineage graph's field details: the fields it reads,
    the fields that choose the rule, and its last statement. None: the value comes from the input data."""
    if not rule:
        return None
    return {
        "parents": list(rule.parents),
        "conditions": list(rule.conditions),
        "line": max(rule.lines) if rule.lines else None,
        "code": rule.code[-1] if rule.code else "",
    }


def _cover(context: Context, origin: str, kind: str, new_sources: List[str], own: Dict[str, Set[str]]) -> List[Tuple[int, Note]]:
    """Release notes that describe an origin, best first, with their score (0-100)."""
    field_phrases = variants(origin)
    source_phrases = [variants(name) for name in new_sources]
    found: List[Tuple[int, int, Note]] = []
    for index, note in enumerate(context.notes):
        names_field = mentions(note.text, field_phrases)
        names_source = kind == "rule" and any(mentions(note.text, phrases) for phrases in source_phrases)
        if not names_field and not names_source:
            continue
        allowed, names_scope = context.scope.fit(note, own)
        if not allowed:
            continue
        score = 50 if names_field else 40
        if mentions(note.solution_text, field_phrases) or (kind == "rule" and any(mentions(note.solution_text, phrases) for phrases in source_phrases)):
            score += 15
        if names_scope:
            score += 20
        if names_field and names_source:
            score += 5
        if context.run_b.verified:
            score += 10
        found.append((min(score, 100), -index, note))
    found.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [(score, note) for score, _order, note in found]


def _paths(origin: str, output: str, children: Dict[str, List[str]]) -> List[List[str]]:
    paths: List[List[str]] = []

    def walk(node: str, path: List[str]) -> None:
        if len(paths) >= MAX_PATHS:
            return
        if node == output:
            paths.append(path)
            return
        for child in children.get(node, []):
            if child not in path:
                walk(child, [*path, child])

    walk(origin, [origin])
    return paths or [[origin] if origin == output else [origin, output]]


def analyse_position(context: Context, key: str) -> Dict[str, Any]:
    run_a, run_b, output = context.run_a, context.run_b, context.output
    graph: Dict[str, Optional[Rule]] = {}
    order: List[str] = []
    stack = [output]
    while stack:
        name = stack.pop()
        if name in graph:
            continue
        rule = run_b.rule(name, key)
        graph[name] = rule
        order.append(name)
        for parent in (rule.parents if rule else []):
            if parent not in graph:
                stack.append(parent)

    memo: Dict[str, bool] = {}

    def changed(name: str, seen: Tuple[str, ...] = ()) -> bool:
        if name in memo:
            return memo[name]
        state = _changed(context, key, name)
        if state is None:  # an intermediate field neither result keeps: changed when what it reads changed
            rule = graph.get(name)
            state = bool(rule) and any(changed(parent, (*seen, name)) for parent in rule.parents if parent not in seen)
        memo[name] = bool(state)
        return memo[name]

    reach: List[str] = []

    def collect(name: str) -> None:
        if name in reach or not changed(name):
            return
        reach.append(name)
        for parent in (graph.get(name).parents if graph.get(name) else []):
            collect(parent)

    collect(output)
    line_of = {name: (max(graph[name].lines) if graph.get(name) and graph[name].lines else 0) for name in graph}
    children: Dict[str, List[str]] = {}
    for name in reach:
        for parent in (graph.get(name).parents if graph.get(name) else []):
            if parent in reach:
                children.setdefault(parent, []).append(name)
    for name in children:
        children[name].sort(key=lambda child: (line_of.get(child, 0), child))

    own = context.scope.of(key, [run_a.rows.get(key) or {}, run_b.rows.get(key) or {}])
    origins: List[Dict[str, Any]] = []
    for name in reach:
        rule_b = graph.get(name)
        parents_b = rule_b.parents if rule_b else []
        changed_parents = [parent for parent in parents_b if changed(parent)]
        rule_a = run_a.rule(name, key)
        parents_a = rule_a.parents if rule_a else []
        rule_differs = rule_a is not None and run_a.replayed and set(parents_a) != set(parents_b)
        if changed_parents and not rule_differs:
            continue
        if parents_b:
            kind = "rule"
        else:
            kind = "data" if _inputs_differ(context, key, name) else "rule"
        new_sources = [parent for parent in parents_b if parent not in parents_a] if kind == "rule" else []
        heads = (new_sources or parents_b) if kind == "rule" else []
        # A note may name the field or, for a changed formula, the field it now reads (Anteilige Zinsen added).
        notes = _cover(context, name, kind, new_sources, own)
        origins.append({
            "field": name, "kind": kind, "heads": heads, "notes": notes,
            "rule_b": rule_b, "rule_a": rule_a, "parents_a": parents_a, "parents_b": parents_b,
        })
    # Covered changes first, a changed calculation before changed input data, then in the order of the calculation.
    origins.sort(key=lambda item: (0 if item["notes"] else 1, 0 if item["kind"] == "rule" else 1, line_of.get(item["field"], 0), item["field"]))

    covered = [origin for origin in origins if origin["notes"]]
    shown = covered or origins
    chains: List[Dict[str, Any]] = []
    other_chains: List[Dict[str, Any]] = []
    for origin in origins:
        for path in _paths(origin["field"], output, children):
            fields = [*origin["heads"], *path]
            first = next((name for name in fields if run_a.has(name) and run_b.has(name) and changed(name)), path[0])
            note = origin["notes"][0][1] if origin["notes"] else None
            chain = {
                "origin": origin["field"],
                "kind": origin["kind"],
                "heads": origin["heads"],
                "fields": fields,
                "input": first,
                "covered": bool(origin["notes"]),
                "note": note.label if note else None,
                "condition": _condition_text(context, key, origin["rule_b"]) if origin["kind"] == "rule" else "",
                "rule": {
                    "base": origin["parents_a"],
                    "compare": origin["parents_b"],
                    "base_code": (origin["rule_a"].code[-1] if origin["rule_a"] and origin["rule_a"].code else ""),
                    "compare_code": (origin["rule_b"].code[-1] if origin["rule_b"] and origin["rule_b"].code else ""),
                } if origin["kind"] == "rule" else None,
            }
            (chains if origin in shown else other_chains).append(chain)

    status = "unexplained"
    if not origins:
        status = "unexplained"
    elif len(covered) == len(origins):
        status = "explained"
    elif covered:
        status = "partial"
    score = round(sum(origin["notes"][0][0] if origin["notes"] else 0 for origin in origins) / len(origins)) if origins else 0

    notes_used: List[Note] = []  # the note that explains each covered change
    for origin in covered:
        note = origin["notes"][0][1]
        if note not in notes_used and len(notes_used) < MAX_NOTES_PER_ROW:
            notes_used.append(note)

    shown_fields: List[str] = []
    for chain in [*chains, *other_chains]:
        for name in chain["fields"]:
            if name not in shown_fields:
                shown_fields.append(name)
    values = {
        name: {
            "a": _json(run_a.value(key, name)) if run_a.has(name) else None,
            "b": _json(run_b.value(key, name)) if run_b.has(name) else None,
            "in_a": run_a.has(name),
            "in_b": run_b.has(name),
            "changed": changed(name),
            "rule": _rule_ref(graph[name] if name in graph else run_b.rule(name, key)),
        }
        for name in shown_fields
    }

    effects = None
    value_a, value_b = _number(run_a.value(key, output)), _number(run_b.value(key, output))
    kinds = {origin["kind"] for origin in origins}
    expected = context.expected.get(key)
    if kinds == {"rule", "data"} and expected is not None and value_a is not None and value_b is not None:
        effects = {"expected": expected, "calculation": expected - value_a, "data": value_b - expected}

    inputs: List[str] = []
    for chain in chains:
        if chain["input"] not in inputs:
            inputs.append(chain["input"])
    return {
        "origins": origins,
        "covered": covered,
        "chains": chains,
        "other_chains": other_chains,
        "status": status,
        "score": score,
        "notes": notes_used,
        "values": values,
        "effects": effects,
        "inputs": inputs,
        "lineage_fields": order,
    }


# --------------------------------------------------------------------------------------------------
# German texts
# --------------------------------------------------------------------------------------------------

def _movement(output: str, key: str, value_a: Any, value_b: Any, difference: Optional[float]) -> str:
    number_a, number_b = _number(value_a), _number(value_b)
    if number_a is not None and number_b is not None:
        if math.isclose(number_a, number_b, rel_tol=1e-9, abs_tol=1e-9):
            return f"{output} ist für {key} unverändert ({de_number(number_a)})."
        verb = "gestiegen" if number_b > number_a else "gesunken"
        delta = difference if difference is not None else number_b - number_a
        return f"{output} ist für {key} von {de_number(number_a)} auf {de_number(number_b)} {verb} (B - A = {de_number(delta, signed=True)})."
    if same_value(value_a, value_b):
        return f"{output} ist für {key} unverändert ({de_value(value_a)})."
    return f"{output} hat sich für {key} von {de_value(value_a)} auf {de_value(value_b)} geändert."


def _effects_text(chain_fields: List[str], values: Dict[str, Any], output: str) -> str:
    steps = []
    for name in chain_fields:
        if name == output:
            continue
        entry = values.get(name) or {}
        if entry.get("changed") and entry.get("in_a") and entry.get("in_b"):
            steps.append(f"{name} {de_value(entry.get('a'))} → {de_value(entry.get('b'))}")
    return f" Dadurch: {', '.join(steps)}." if steps else ""


def _quote(note: Note) -> str:
    text = (note.solution or note.problem or "").strip()
    if not text:
        return ""
    text = text if text.endswith((".", "!", "?")) else text + "."
    return f" „{text}“"


def explanation(context: Context, key: str, position: Dict[str, Any], value_a: Any, value_b: Any, difference: Optional[float]) -> str:
    output = context.output
    run_a, run_b = context.run_a, context.run_b
    sentences = [_movement(output, key, value_a, value_b, difference)]
    if not position["origins"]:
        sentences.append("Die Lineage des Compare-Laufs zeigt für diese Position keine geänderte Ursache; bitte die Eingangsdaten und den Code prüfen.")
        return "\n".join(sentences)
    values = position["values"]
    described: Set[str] = set()
    for chain in [*position["chains"], *position["other_chains"]]:
        origin = chain["origin"]
        if origin in described:
            continue
        described.add(origin)
        note = next((note for note in position["notes"] if note.label == chain["note"]), None)
        prefix = "" if chain["covered"] else "Nicht durch eine Release Note erklärt: "
        if chain["kind"] == "rule":
            rule = chain["rule"] or {}
            scope = f" für {chain['condition']}" if chain["condition"] else ""
            compare = f"aus {de_list(rule.get('compare') or [])}" if rule.get("compare") else "ohne Eingangsfeld"
            base = rule.get("base") or []
            if base and set(base) != set(rule.get("compare") or []):
                text = f"Im Compare-Lauf wird {origin}{scope} {compare} berechnet, im Base-Lauf aus {de_list(base)}."
            elif base:
                text = f"Die Berechnung von {origin}{scope} hat sich geändert ({compare})."
            else:
                text = f"Im Compare-Lauf wird {origin}{scope} {compare} berechnet; im Base-Lauf kam der Wert aus den Eingangsdaten."
            if note:
                text = f"Release Note {note.label} beschreibt die neue Berechnung von {origin}:{_quote(note)} {text}"
            else:
                text = prefix + text
        else:
            row_a = run_a.input_rows.get(key) or {}
            row_b = run_b.input_rows.get(key) or {}
            dataset = f" (Datensatz „{run_b.dataset_name}“)" if run_b.dataset_name else ""
            entry = values.get(origin, {})

            def side(row: Dict[str, Any], result: Any) -> str:
                """The input value, and the value in the result when the code changed it (an empty input filled with 0)."""
                given = row.get(origin, result)
                text = de_value(given)
                if result is not None and not same_value(given, result):
                    text += f" (im Ergebnis {de_value(result)})"
                return text

            text = f"{origin} kommt aus den Eingangsdaten und ist im Base-Lauf {side(row_a, entry.get('a'))}, im Compare-Lauf {side(row_b, entry.get('b'))}{dataset}."
            if note:
                text = f"Release Note {note.label} beschreibt die geänderte Lieferung von {origin}:{_quote(note)} {text}"
            else:
                text = prefix + text
        # A changed calculation: its own new value and what follows; changed input data: its values are named above.
        start = chain["fields"].index(origin) + (0 if chain["kind"] == "rule" else 1) if origin in chain["fields"] else 0
        text += _effects_text(chain["fields"][start:], values, output)
        sentences.append(text)
    effects = position.get("effects")
    if effects:
        data_fields = [origin["field"] for origin in position["origins"] if origin["kind"] == "data"]
        sentences.append(
            f"Mit den Base-Daten ergäbe die neue Berechnung {output} = {de_number(effects['expected'])} ({de_number(effects['calculation'], signed=True)}); "
            f"die übrigen {de_number(effects['data'], signed=True)} kommen aus den geänderten Eingangsdaten ({de_list(data_fields)})."
        )
    return "\n".join(sentences)


STATUS_DE = {"explained": "erklärt", "partial": "teilweise erklärt", "unexplained": "nicht erklärt"}


def summary(context: Context, positions: List[Dict[str, Any]], total: int) -> str:
    run_a, run_b, output = context.run_a, context.run_b, context.output
    deviating = [item for item in positions if item["changed"]]
    lines = [
        f"Verglichen wurde {output} zwischen Base ({run_a.code_filename or run_a.execution_id} auf {run_a.dataset_name or 'Eingangsdaten A'}) "
        f"und Compare ({run_b.code_filename or run_b.execution_id} auf {run_b.dataset_name or 'Eingangsdaten B'}): "
        + (f"{len(deviating)} von {total} Positionen weichen ab." if deviating else f"keine der {total} Positionen weicht ab.")
    ]
    counts = {status: sum(1 for item in deviating if item["status"] == status) for status in ("explained", "partial", "unexplained")}
    parts = [
        f"{counts[status]} {label}"
        for status, label in (("explained", "durch Release Notes erklärt"), ("partial", "teilweise erklärt"), ("unexplained", "nicht erklärt"))
        if counts[status]
    ]
    if parts:
        lines.append(f"Davon: {', '.join(parts)}.")
    for item in sorted(deviating, key=lambda entry: -abs(entry["difference"] or 0))[:12]:
        position = item["analysis"]
        delta = f" ({de_number(item['difference'], signed=True)})" if item["difference"] is not None else ""
        covered_parts = []
        for origin in position["covered"]:
            note = origin["notes"][0][1]
            covered_parts.append(f"{note.label} ({origin['field']})")
        uncovered = [origin for origin in position["origins"] if not origin["notes"]]
        uncovered_parts = []
        for origin in uncovered:
            if origin["kind"] == "data":
                row_a = run_a.input_rows.get(item["position"]) or {}
                row_b = run_b.input_rows.get(item["position"]) or {}
                uncovered_parts.append(f"{origin['field']} in den Eingangsdaten {de_value(row_a.get(origin['field']))} → {de_value(row_b.get(origin['field']))}")
            else:
                uncovered_parts.append(f"neue Berechnung von {origin['field']}")
        if item["status"] == "explained":
            text = f"erklärt durch {de_list(covered_parts)}"
        elif item["status"] == "partial":
            text = f"teilweise erklärt durch {de_list(covered_parts)}; ohne Release Note: {de_list(uncovered_parts)}"
        elif uncovered_parts:
            text = f"nicht erklärt – {de_list(uncovered_parts)}, keine passende Release Note"
        else:
            text = "nicht erklärt – keine Ursache in der Lineage gefunden"
        lines.append(f"{item['position']}{delta}: {text}.")
    if len(deviating) > 12:
        lines.append(f"… und {len(deviating) - 12} weitere Positionen (siehe Tabelle).")
    return "\n".join(lines)


def next_checks(context: Context, positions: List[Dict[str, Any]], notes_available: bool) -> List[str]:
    run_a, run_b = context.run_a, context.run_b
    grouped: Dict[Tuple[str, str], List[str]] = {}
    examples: Dict[Tuple[str, str], str] = {}
    for item in positions:
        if not item["changed"]:
            continue
        for origin in item["analysis"]["origins"]:
            if origin["notes"]:
                continue
            group = (origin["kind"], origin["field"])
            grouped.setdefault(group, []).append(item["position"])
            if group not in examples and origin["kind"] == "data":
                row_a = run_a.input_rows.get(item["position"]) or {}
                row_b = run_b.input_rows.get(item["position"]) or {}
                examples[group] = f"Base {de_value(row_a.get(origin['field']))}, Compare {de_value(row_b.get(origin['field']))}"
    checks: List[str] = []
    for (kind, name), keys in grouped.items():
        listed = ", ".join(keys[:4]) + (f" und {len(keys) - 4} weitere" if len(keys) > 4 else "")
        if kind == "data":
            dataset = f" im Datensatz „{run_b.dataset_name}“" if run_b.dataset_name else ""
            checks.append(f"{name}{dataset} prüfen ({listed}: {examples.get((kind, name), '')}) – keine Release Note beschreibt diese Änderung.")
        else:
            code = f" in „{run_b.code_filename}“" if run_b.code_filename else ""
            checks.append(f"Neue Berechnung von {name}{code} ohne Release Note ({listed}) – Release Note ergänzen oder Code prüfen.")
    if not notes_available:
        checks.append("Es sind keine Release Notes hochgeladen; ohne sie bleibt jede Abweichung unerklärt.")
    if run_b.problem:
        checks.append(f"Compare-Lauf: {run_b.problem}. Die Lineage stammt deshalb aus der statischen Code-Analyse.")
    elif run_b.replayed and not run_b.partial and not run_b.verified:
        checks.append("Die Nachrechnung des Compare-Laufs weicht von der gespeicherten Ausführung ab (Daten oder Code wurden seither geändert) – Cluster neu ausführen.")
    return checks[:8]


def evidence(context: Context, notes_count: int, workbooks: List[str]) -> List[str]:
    run_b = context.run_b
    items = []
    if run_b.replayed:
        state = "identisch mit der gespeicherten Ausführung" if run_b.verified else ("nur für die betroffenen Positionen" if run_b.partial else "weicht von der gespeicherten Ausführung ab")
        items.append(f"Lineage je Position aus dem Compare-Lauf: {run_b.code_filename} auf {run_b.dataset_name} nachgerechnet ({state}).")
    else:
        items.append(f"Lineage aus der statischen Analyse von {run_b.code_filename or 'Code B'} ({run_b.problem or 'keine Nachrechnung'}).")
    if notes_count:
        items.append(f"{notes_count} Release-Note-Einträge geprüft ({', '.join(workbooks[:3])}).")
    return items


# --------------------------------------------------------------------------------------------------
# Rows of the result
# --------------------------------------------------------------------------------------------------

def empty_position() -> Dict[str, Any]:
    return {
        "origins": [], "covered": [], "chains": [], "other_chains": [], "status": "unexplained", "score": 0, "notes": [],
        "values": {}, "effects": None, "inputs": [], "lineage_fields": [],
    }


def chain_text(chain: Dict[str, Any]) -> str:
    """Nominal -> Assessment Base -> EAD -> RWA; several sources of a rule side by side: Saldo + Anteilige Zinsen -> ..."""
    heads = chain["heads"]
    path = chain["fields"][len(heads):]
    return (" + ".join(heads) + " -> " if heads else "") + " -> ".join(path)


def result_row(context: Context, key: str, position: Dict[str, Any], status: str, score: Optional[int], text: str,
               value_a: Any, value_b: Any, difference: Any, changed: bool) -> Dict[str, Any]:
    return {
        "position": key,
        "output": context.output,
        "value_a": _json(value_a),
        "value_b": _json(value_b),
        "difference": _number(difference),
        "changed": changed,
        "status": status,
        "lineage": "; ".join(chain_text(chain) for chain in position["chains"]),
        "input": ", ".join(position["inputs"]),
        "release_note": ", ".join(note.label for note in position["notes"]),
        "explanation": text,
        "confidence": score if score is not None else 0,
        "score": score,
        "chains": position["chains"],
        "other_chains": position["other_chains"],
        "values": position["values"],
        "effects": position["effects"],
        "notes": [note.reference() for note in position["notes"]],
    }


def detail_rows(context: Context, key: str, position: Dict[str, Any]) -> List[Dict[str, Any]]:
    """One row per field of the shown lineage: its values, what the compare run computes it from."""
    rows: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for chain in [*position["chains"], *position["other_chains"]]:
        for name in chain["fields"]:
            if name in seen:
                continue
            seen.add(name)
            entry = position["values"].get(name) or {}
            value_a, value_b = entry.get("a"), entry.get("b")
            number_a, number_b = _number(value_a), _number(value_b)
            difference = number_b - number_a if number_a is not None and number_b is not None else None
            rule = context.run_b.rule(name, key)
            parents = rule.parents if rule else []
            if entry.get("changed"):
                change = f"{de_value(value_a)} → {de_value(value_b)}"
                if difference:
                    change += f" ({de_number(difference, signed=True)})"
            else:
                change = f"unverändert {de_value(value_b)}"
            source = f"; im Compare-Lauf aus {de_list(parents)}" if parents else "; Wert aus den Eingangsdaten"
            rows.append({
                "position": key,
                "output": name,
                "value_a": value_a,
                "value_b": value_b,
                "difference": difference,
                "lineage": ", ".join(parents),
                "input": ", ".join(parents),
                "release_note": chain["note"] or "",
                "explanation": f"{name}: {change}{source}.",
                "confidence": position["score"],
            })
    return rows


def overall_score(positions: List[Dict[str, Any]]) -> Optional[int]:
    """Score of the whole comparison: the position scores weighted by the size of their deviation."""
    weighted = [
        (abs(item["difference"]) if item.get("difference") else 1.0, item["score"])
        for item in positions
        if item["changed"] and item.get("score") is not None
    ]
    total = sum(weight for weight, _score in weighted)
    if not weighted or not total:
        return None
    return round(sum(weight * score for weight, score in weighted) / total)
