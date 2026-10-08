"""Content Lineage AI Agent: the business ("content") lineage of reported figures.

Technical lineage answers how the code moves data from column to column. Content lineage answers what a reported
figure means and what it is made of:

- the business terms along the way (reported figures, derived business concepts, source data elements);
- the business rules that derive every concept, split into the cases the code distinguishes (a condition, a lookup
  key), with the records each case applies to and the amounts it contributes;
- the content of every reported value: delivered by the source or derived, and through which chain of cases
  (content paths), broken down by business segment and traceable record by record;
- the regulatory provisions that define each concept or prescribe its rule, quoted verbatim from the indexed
  regulations, with an assessment of whether the implemented rule is consistent with them.

Every run analyses one execution (the code of a cluster applied to its dataset) in a fixed pipeline:

1. trace     - static data-flow analysis of the code (shared with the technical lineage agent) and a statement-by-
               statement replay of the execution; every value of every column is attributed to the case that wrote it;
2. compose   - deterministic content model: cases, populations, delivered / derived shares, content paths of every
               reported figure and its breakdown by business segment;
3. describe  - the LLM names and defines the business terms and states every rule and case in business language
               (closed sets of terms and case ids, numbers checked against the constants of the code, one correction);
4. regulate  - per business rule, candidate provisions are retrieved from the indexed regulations (keyword, semantic
               and concept search); the LLM picks the provisions that define it, quotes them verbatim (verified against
               the regulation text, one correction round) and assesses the implemented rule against them;
5. review    - a second LLM pass checks every assessment against the quotes and the rule's facts (four eyes);
6. translate - every AI text is available in English and German.

Runs execute in a background thread and are polled by the browser; finished runs are stored as JSON and can be
exported as an Excel workbook.
"""
from __future__ import annotations

import ast
import copy
import json
import math
import os
import re
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

import agent_runtime as runtime
import database as db
import lineage_agent as tla
import lineage_analysis as la
import regulation_matcher as rm
import regulation_text as rt

router = APIRouter(prefix="/api/content-lineage-agent", tags=["content-lineage-agent"])

RUNS_DIR = runtime.RESULTS_DIR / "content_lineage_agent"
REPLAY_ROW_LIMIT = 20000
RECORD_ROWS = 400  # records whose complete derivation (values before and after every case) is kept
MAX_FIGURES = 6
MAX_PATHS = 30
MAX_DIMENSIONS = 8
MAX_DIMENSION_VALUES = 40
RULE_BATCH = 8
WORKERS = 3
MAX_ACTIVE_RUNS = 2
MAX_LINKS = 3
CANDIDATE_TEXT = 1800
TRANSLATE_BATCH = 40
DEFAULT_OPENAI_MODEL = "gpt-4.1"  # CONTENT_LINEAGE_AGENT_MODEL overrides it
LANGUAGE_NAMES = {"en": "English", "de": "German"}
TEXT_LANGUAGES = ("en", "de")
VERDICTS = ("consistent", "simplified", "deviation", "not_covered")
FINDING_VERDICTS = ("consistent", "simplified", "deviation")
RELATIONS = ("defines", "prescribes", "related")
_ID = re.compile(r"^[0-9a-f-]{8,64}$")
_MISSING = object()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _configured_model() -> str:
    return os.environ.get("CONTENT_LINEAGE_AGENT_MODEL", "").strip() or (
        DEFAULT_OPENAI_MODEL if os.environ.get("OPENAI_API_KEY") else os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "")
    )


def _plain(text: Any) -> str:
    """A formula of the static analysis with ⟦column⟧ markers written as [column] (for the language model)."""
    return re.sub(r"⟦([^⟦⟧]+)⟧", r"[\1]", str(text or ""))


def _number(value: Any) -> Optional[float]:
    if la._is_null(value) or isinstance(value, bool):
        return None
    if la._is_number(value):
        number = float(value)
        return number if math.isfinite(number) else None
    return None


def _key_text(value: Any) -> str:
    item = la.json_value(value)
    if item is None:
        return "∅"
    if isinstance(item, float) and item.is_integer():
        return str(int(item))
    return str(item)


def _round(value: Optional[float]) -> Optional[float]:
    return None if value is None else round(value, 6)


# --------------------------------------------------------------------------------------------------
# Job state
# --------------------------------------------------------------------------------------------------

class _Cancelled(Exception):
    pass


class _Job:
    """Run state shared with the polling browser; the interface matches what the technical agent's LLM wrapper uses."""

    def __init__(self, state: Dict[str, Any]):
        self.state = state
        self.lock = threading.Lock()
        self.cancel = threading.Event()
        self.started = time.monotonic()
        self.last_save = 0.0

    def log(self, level: str, code: str, message: str, **params: Any) -> None:
        with self.lock:
            self.state["log"].append({
                "t": round(time.monotonic() - self.started, 2), "level": level, "code": code, "params": params, "message": message,
            })

    def stage(self, stage: str) -> None:
        with self.lock:
            self.state["stage"] = stage

    def progress(self, **changes: Any) -> None:
        with self.lock:
            self.state["progress"].update(changes)

    def increment(self, key: str, by: int = 1) -> None:
        with self.lock:
            self.state["progress"][key] = self.state["progress"].get(key, 0) + by

    def count_call(self, prompt: int, completion: int, tools: int = 0) -> None:
        with self.lock:
            usage = self.state["usage"]
            usage["llm_calls"] += 1
            usage["prompt_tokens"] += prompt
            usage["completion_tokens"] += completion
            usage["tool_calls"] += tools

    def set_model(self, model: str) -> None:
        with self.lock:
            self.state["model"] = model

    def check(self) -> None:
        if self.cancel.is_set():
            raise _Cancelled()

    def snapshot(self, lite: bool = False) -> Dict[str, Any]:
        with self.lock:
            if lite:
                return copy.deepcopy({key: value for key, value in self.state.items() if key != "result"})
            return copy.deepcopy(self.state)

    def save(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self.last_save < 2.0:
            return
        self.last_save = now
        _write_run(self.snapshot())


_JOBS: Dict[str, _Job] = {}
_JOBS_LOCK = threading.Lock()


def _run_path(run_id: str) -> Path:
    if not _ID.match(run_id or ""):
        raise HTTPException(404, "Run not found")
    return RUNS_DIR / f"{run_id}.json"


def _write_run(state: Dict[str, Any]) -> None:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    path = _run_path(state["id"])
    temporary = path.with_name(f"{path.stem}.{uuid.uuid4().hex[:8]}.tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False, default=str), encoding="utf-8")
    for attempt in range(20):
        try:
            os.replace(temporary, path)
            return
        except PermissionError:
            if attempt == 19:
                temporary.unlink(missing_ok=True)
                raise
            time.sleep(0.05)


def _read_run(run_id: str) -> Dict[str, Any]:
    path = _run_path(run_id)
    if not path.exists():
        raise HTTPException(404, "Run not found")
    for attempt in range(10):
        try:
            state = json.loads(path.read_text(encoding="utf-8"))
            break
        except PermissionError:
            if attempt == 9:
                raise
            time.sleep(0.05)
    if state.get("status") == "running" and run_id not in _JOBS:
        state["status"] = "interrupted"  # the server restarted while it ran
    return state


class _LLM(tla._LLM):
    """The technical agent's JSON-schema client (retries, model fallback, usage counts) with this agent's model."""

    def __init__(self, job: _Job):
        super().__init__(job)  # type: ignore[arg-type]
        override = os.environ.get("CONTENT_LINEAGE_AGENT_MODEL", "").strip()
        if override:
            _, configured = runtime._llm_client()
            self.model = override
            self.fallback = configured if configured and configured != override else None
        self.seed = 20261008


def _strings() -> Dict[str, Any]:
    return {"type": "array", "items": {"type": "string"}}


def _enum(values: List[str]) -> Dict[str, Any]:
    return {"type": "string", "enum": values} if values else {"type": "string"}


# --------------------------------------------------------------------------------------------------
# Context
# --------------------------------------------------------------------------------------------------

class _Context:
    """Everything the run knows about the execution and its content."""

    def __init__(self) -> None:
        self.language = "en"
        self.stored: Dict[str, Any] = {}
        self.code = ""
        self.lines: List[str] = []
        self.prepared = ""
        self.frame: Any = None
        self.make_globals: Any = None
        self.analysis: Dict[str, Any] = {}
        self.nodes: List[Dict[str, Any]] = []
        self.columns: Dict[str, Dict[str, Any]] = {}
        self.steps_by_line: Dict[int, Dict[str, Any]] = {}
        self.lookups: Dict[str, Dict[str, Any]] = {}
        self.final: Any = None
        self.statements: List[Dict[str, Any]] = []
        # column -> row label -> statement lines that changed the cell, in order
        self.history: Dict[str, Dict[Any, List[int]]] = {}
        # (statement line, column) -> row label -> lookup key the statement mapped
        self.keys: Dict[Tuple[int, str], Dict[Any, Any]] = {}
        # (statement line, column) -> lookup key -> rows the table did not cover and that stayed empty
        self.unmapped: Dict[Tuple[int, str], Dict[str, int]] = {}
        # column -> row label -> [{line, before, after, inputs}] for the first RECORD_ROWS records
        self.details: Dict[str, Dict[Any, List[Dict[str, Any]]]] = {}
        self.record_labels: List[Any] = []
        self.figures: List[str] = []
        self.scope: List[str] = []
        self.derived: Set[str] = set()
        self.rules: List[Dict[str, Any]] = []
        self.rule_by_column: Dict[str, Dict[str, Any]] = {}
        self.cases: Dict[str, Dict[str, Any]] = {}
        self.case_by_write: Dict[Tuple[int, str], Dict[str, Any]] = {}
        self.identifier: Optional[str] = None
        self.dimensions: List[str] = []
        self.filters: List[Dict[str, Any]] = []
        self.replay: Dict[str, Any] = {}

    def code_span(self, line: int, end: int) -> str:
        return "\n".join(self.lines[line - 1:end])


# --------------------------------------------------------------------------------------------------
# 1. Trace: static analysis and replay with per-cell attribution
# --------------------------------------------------------------------------------------------------

def _load(job: _Job, context: _Context) -> None:
    job.stage("load")
    stored = tla._stored_execution(job.state["source"]["execution_id"])
    context.stored = stored
    context.code = tla._code_text(stored["code_id"])
    context.lines = context.code.split("\n")
    if context.lines and context.lines[-1] == "":
        context.lines.pop()
    context.prepared = runtime._platform("prepare_user_code")(context.code)
    frame, _metadata, _table = runtime._platform("load_execution_input")(stored["dataset_id"], stored.get("table_id"))
    context.frame = frame
    context.make_globals = runtime._platform("execution_globals")
    job.log("info", "code_loaded", f"Loaded {job.state['source']['code_filename']} ({len(context.lines)} lines)", file=job.state["source"]["code_filename"], lines=len(context.lines))
    job.log("info", "data_loaded", f"Loaded the input table: {len(frame)} records × {len(frame.columns)} columns", rows=len(frame), columns=len(frame.columns))


def _analyse(job: _Job, context: _Context) -> None:
    job.stage("trace")
    try:
        analysis = la.analyse(context.prepared, [str(column) for column in context.frame.columns])
    except la.LineageError as exc:
        raise HTTPException(400, str(exc)) from exc
    context.analysis = analysis
    context.nodes = analysis["nodes"]
    context.columns = {item["name"]: item for item in analysis["columns"]}
    context.steps_by_line = {step["line"]: step for step in analysis["steps"]}
    context.lookups = {item["name"]: item for item in analysis["lookups"]}
    writes = sum(1 for node in analysis["nodes"] if node["kind"] == "write")
    job.log(
        "success", "static_done",
        f"Static data-flow analysis: {len(analysis['steps'])} statements, {writes} column writes, {len(analysis['lookups'])} parameter table(s)",
        statements=len(analysis["steps"]), writes=writes, lookups=len(analysis["lookups"]),
    )


def _writes_of(context: _Context, line: int, column: str) -> List[Dict[str, Any]]:
    step = context.steps_by_line.get(line)
    if step is None:
        return []
    return [context.nodes[node] for node in step["writes"] if context.nodes[node]["column"] == column]


def _is_case(nodes: List[Dict[str, Any]]) -> bool:
    """A statement is a case of a column's rule unless it only converts the column's type."""
    return any(node.get("operation") != "cast" for node in nodes)


def _lookup_use(context: _Context, line: int, column: str) -> Optional[Dict[str, Any]]:
    """The mapping table a statement applies to write a column, with the column holding its keys."""
    step = context.steps_by_line.get(line)
    if step is None:
        return None
    for node in _writes_of(context, line, column):
        if node.get("operation") == "cast":
            continue
        for name in node.get("lookups", []):
            lookup = context.lookups.get(name)
            if not lookup or lookup["kind"] != "mapping":
                continue
            use = next(
                (item for item in lookup.get("uses", []) if item.get("method") == "map" and item.get("column") and step["line"] <= item["line"] <= step["end_line"]),
                None,
            )
            if use:
                return {"name": name, "key_column": use["column"], "entries": lookup["entries"], "line": lookup["line"], "end_line": lookup["end_line"]}
    return None


def _reads(context: _Context) -> Dict[Tuple[int, str], List[str]]:
    """Per (statement, written column): the columns the statement reads to write it."""
    reads: Dict[Tuple[int, str], List[str]] = {}
    analysis = context.analysis
    for node in context.nodes:
        if node["kind"] != "write" or node.get("step") is None:
            continue
        line = analysis["steps"][node["step"]]["line"]
        used = reads.setdefault((line, node["column"]), [])
        for dependency in [*[item["node"] for item in node["data"]], *node["control"], *node["group"], *node.get("join", [])]:
            name = context.nodes[dependency]["column"]
            if name not in used:
                used.append(name)
    return reads


def _trace(job: _Job, context: _Context) -> None:
    """Replay the code statement by statement; record which statement wrote every cell, the lookup keys it mapped and,
    for the first records, the values before and after every write together with the values it read."""
    frame = context.frame
    partial = len(frame) > REPLAY_ROW_LIMIT
    if partial:
        frame = frame.iloc[:REPLAY_ROW_LIMIT]
    reads = _reads(context)
    lookups: Dict[Tuple[int, str], Dict[str, Any]] = {}
    for step in context.analysis["steps"]:
        for node_id in step["writes"]:
            column = context.nodes[node_id]["column"]
            use = _lookup_use(context, step["line"], column)
            if use:
                lookups[(step["line"], column)] = use
    started = time.perf_counter()
    tree = ast.parse(context.prepared)
    namespace = context.make_globals(frame.copy(deep=True))
    previous = namespace["df"].copy(deep=True)
    context.record_labels = list(frame.index)[:RECORD_ROWS]
    recorded = set(context.record_labels)
    error: Optional[Dict[str, Any]] = None
    for statement in tree.body:
        job.check()
        line = statement.lineno
        step_started = time.perf_counter()
        try:
            exec(compile(ast.Module(body=[statement], type_ignores=[]), "<script>", "exec"), namespace)
        except Exception as exc:
            error = {"line": line, "message": f"{type(exc).__name__}: {exc}"[:400]}
            context.statements.append({"line": line, "end_line": statement.end_lineno or line, "error": error["message"], "changed": {}, "rows_removed": 0, "nulled": {}})
            break
        current = namespace.get("df")
        if not isinstance(current, pd.DataFrame):
            error = {"line": line, "message": "df is no longer a DataFrame after this statement"}
            context.statements.append({"line": line, "end_line": statement.end_lineno or line, "error": error["message"], "changed": {}, "rows_removed": 0, "nulled": {}})
            break
        diff = la.compare_frames(previous, current)
        record = {
            "line": line, "end_line": statement.end_lineno or line, "error": None,
            "changed": {str(column): len(labels) for column, labels in diff["changes"].items() if labels},
            "rows_removed": diff["rows_removed"], "rows_added": diff["rows_added"], "nulled": {},
            "ms": round((time.perf_counter() - step_started) * 1000, 2),
        }
        for column, labels in diff["changes"].items():
            name = str(column)
            if not labels:
                continue
            use = lookups.get((line, name))
            key_column = use["key_column"] if use else None
            history = context.history.setdefault(name, {})
            reading = reads.get((line, name), [])
            for label in labels:
                history.setdefault(label, []).append(line)
                before = previous.at[label, column] if column in previous.columns and label in previous.index else None
                after = current.at[label, column]
                if not la._is_null(before) and la._is_null(after):
                    entry = record["nulled"].setdefault(name, {"count": 0, "examples": []})
                    entry["count"] += 1
                    example = la.json_value(before)
                    if example not in entry["examples"] and len(entry["examples"]) < 5:
                        entry["examples"].append(example)
                if key_column and key_column in previous.columns and label in previous.index:
                    context.keys.setdefault((line, name), {})[label] = previous.at[label, key_column]
                if label in recorded:
                    inputs = {}
                    for source in reading:
                        if source != name and source in previous.columns and label in previous.index:
                            inputs[source] = la.json_value(previous.at[label, source])
                    context.details.setdefault(name, {}).setdefault(label, []).append({
                        "line": line, "before": la.json_value(before), "after": la.json_value(after), "inputs": inputs,
                    })
        # Categories the parameter table does not cover: the mapping yields nothing and the value stays empty.
        for (lookup_line, name), use in lookups.items():
            if lookup_line != line or name not in current.columns or use["key_column"] not in previous.columns:
                continue
            keys = [key for key, _ in use["entries"]]
            for label in current.index:
                if label not in previous.index or not la._is_null(current.at[label, name]):
                    continue
                value = previous.at[label, use["key_column"]]
                if not la._is_null(value) and any(la.same_value(value, key) for key in keys):
                    continue
                missing = context.unmapped.setdefault((line, name), {})
                missing[_key_text(value)] = missing.get(_key_text(value), 0) + 1
        context.statements.append(record)
        previous = current.copy(deep=True)
    final = namespace.get("df") if isinstance(namespace.get("df"), pd.DataFrame) else previous
    context.final = final
    elapsed = round((time.perf_counter() - started) * 1000)
    stored_rows = context.stored.get("data") or []
    stored_columns = (context.stored.get("summary") or {}).get("columns") or []
    if partial:
        comparison = la.compare_with_execution(final, stored_rows[:REPLAY_ROW_LIMIT], stored_columns)
        comparison["rows_match"] = True
        comparison["ok"] = comparison["columns_match"] and comparison["mismatches"] == 0
    else:
        comparison = la.compare_with_execution(final, stored_rows, stored_columns)
    comparison.update({"ms": elapsed, "partial": partial, "rows": len(frame), "error": error})
    comparison["examples"] = comparison.get("examples", [])[:10]
    context.replay = comparison
    for statement in context.statements:
        if statement.get("rows_removed"):
            step = context.steps_by_line.get(statement["line"])
            context.filters.append({
                "id": f"F{len(context.filters) + 1}", "line": statement["line"], "end_line": statement["end_line"],
                "code": (step or {}).get("code") or context.code_span(statement["line"], statement["end_line"]), "rows_removed": statement["rows_removed"],
            })
    if error:
        job.log("error", "replay_error", f"Replay stopped at line {error['line']}: {error['message']}", line=error["line"], message=error["message"])
        raise HTTPException(400, f"The code fails at line {error['line']} when it is replayed: {error['message']}")
    cells = sum(sum(item["changed"].values()) for item in context.statements)
    if comparison["ok"]:
        job.log("success", "replay_done", f"Replay reproduces the stored execution: {comparison['cells_compared']} values identical; {cells} value changes attributed to statements ({elapsed} ms)", cells=comparison["cells_compared"], changes=cells, ms=elapsed)
    elif not comparison["columns_match"]:
        job.log("warn", "replay_columns", "The code now produces other columns than the stored execution; the content is traced on the replayed result.", extra=comparison["extra_columns"], missing=comparison["missing_columns"])
    else:
        job.log("warn", "replay_mismatch", f"Replay differs from the stored execution in {comparison['mismatches']} of {comparison['cells_compared']} values (the input data may have changed since)", mismatches=comparison["mismatches"], cells=comparison["cells_compared"])


# --------------------------------------------------------------------------------------------------
# 2. Compose: scope, rules and cases, content of every value
# --------------------------------------------------------------------------------------------------

def _derived_columns(context: _Context) -> List[str]:
    """Output columns with at least one write that is more than a type conversion."""
    derived = []
    for item in context.analysis["columns"]:
        if not item["in_output"] or item["role"] in ("passthrough", "cast", "dropped"):
            continue
        if any(context.nodes[node].get("operation") != "cast" for node in item["chain"] if context.nodes[node]["kind"] == "write"):
            derived.append(item["name"])
    return derived


def default_figures(analysis: Dict[str, Any], numeric: Set[str]) -> Tuple[List[str], List[str]]:
    """(derived output columns, the default reported figures): derived columns no other derived column builds on,
    numeric ones first."""
    nodes = analysis["nodes"]
    columns = {item["name"]: item for item in analysis["columns"]}
    derived = [
        item["name"] for item in analysis["columns"]
        if item["in_output"] and item["role"] not in ("passthrough", "cast", "dropped")
        and any(nodes[node].get("operation") != "cast" for node in item["chain"] if nodes[node]["kind"] == "write")
    ]
    sinks = [name for name in derived if not any(other in derived and other != name for other in columns[name]["downstream"])]
    sinks.sort(key=lambda name: (name not in numeric, -columns[name]["depth"]))
    figures = [name for name in sinks if name in numeric] or sinks
    return derived, figures[:MAX_FIGURES]


def _numeric_columns(frame: Any) -> Set[str]:
    numeric = set()
    if frame is None:
        return numeric
    for column in frame.columns:
        series = frame[column]
        if pd.api.types.is_bool_dtype(series):
            continue
        if pd.api.types.is_numeric_dtype(series):
            numeric.add(str(column))
            continue
        values = [value for value in series.tolist() if not la._is_null(value)]
        if values and all(_number(value) is not None for value in values):
            numeric.add(str(column))
    return numeric


def _factor_columns(frame: Any, numeric: Set[str]) -> Set[str]:
    """Numeric columns that hold factors or rates (every value between 0 and 12.5, some not whole): their sum means
    nothing, so no amounts are added up for them."""
    factors = set()
    for name in numeric:
        if name not in frame.columns:
            continue
        values = [_number(value) for value in frame[name].tolist()]
        values = [value for value in values if value is not None]
        if values and all(0 <= value <= 12.5 for value in values) and any(not float(value).is_integer() for value in values):
            factors.add(name)
    return factors


def _value_type(series: Any, numeric: bool) -> str:
    if numeric:
        return "number"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date"
    values = [value for value in series.tolist() if not la._is_null(value)]
    if not values:
        return "empty"
    if all(isinstance(value, (bool,)) for value in values):
        return "boolean"
    if all(isinstance(value, (pd.Timestamp, datetime)) for value in values):
        return "date"
    return "text"


_IDENTIFIER_NAME = re.compile(r"(?:^|[\s_\-])(id|position|pos|key|nr|no|number|account|contract|deal|loan|darlehen|konto|vertrag|gesch[aä]ft)(?:$|[\s_\-])|id$", re.IGNORECASE)


def _identifier(frame: Any, exclude: Set[str]) -> Optional[str]:
    candidates = []
    for column in frame.columns:
        name = str(column)
        if name in exclude:
            continue
        series = frame[column]
        if len(series) == 0 or series.isna().any():
            continue
        if pd.api.types.is_numeric_dtype(series) and not _IDENTIFIER_NAME.search(name):
            continue
        if series.astype(str).nunique() != len(series):
            continue
        candidates.append(name)
    preferred = [name for name in candidates if _IDENTIFIER_NAME.search(name)]
    return (preferred or candidates or [None])[0]


def _constants(text: str) -> Set[float]:
    """Numbers written in code or a table (as a parameter may be cited)."""
    values: Set[float] = set()
    try:
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
                values.add(float(node.value))
            elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                values |= set(_numbers_in(node.value, single=True))
    except SyntaxError:
        values |= set(_numbers_in(text, single=True))
    return values


_NUMBER = re.compile(r"(?<![\w])(\d+(?:[.,]\d+)*)(?![\w])")


def _numbers_in(text: str, single: bool = False) -> List[Any]:
    """Every number written in a text: one value, or (single=False) the set of its possible readings
    ('1.000' is 1.0 in English notation and 1000 in German notation)."""
    found: List[Any] = []
    for match in _NUMBER.finditer(text or ""):
        raw = match.group(1)
        readings: Set[float] = set()
        if re.fullmatch(r"\d+", raw):
            readings.add(float(raw))
        else:
            if re.fullmatch(r"\d+[.,]\d+", raw):
                readings.add(float(raw.replace(",", ".")))
            if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", raw):
                readings.add(float(re.sub(r"[.,]", "", raw)))
            if not readings:
                parts = re.split(r"[.,]", raw)
                readings.add(float(parts[0]))
        if single:
            found.extend(readings)
        else:
            found.append(readings)
    return found


def _compose(job: _Job, context: _Context, requested: List[str]) -> None:
    job.stage("compose")
    final = context.final
    numeric = _numeric_columns(final)
    derived = _derived_columns(context)
    _, defaults = default_figures(context.analysis, numeric)
    figures = [name for name in requested if name in derived][:MAX_FIGURES] or defaults
    if not figures:
        raise HTTPException(400, "The code derives no output column, so there is no content to trace.")
    ignored = [name for name in requested if name not in figures]
    if ignored:
        job.log("warn", "figures_ignored", f"Not derived by this code and therefore not traced: {', '.join(ignored)}", columns=ignored)
    context.figures = figures

    # Scope: every column a reported figure is built from (data and case selection), figures first.
    scope: List[str] = []
    queue = list(figures)
    while queue:
        name = queue.pop(0)
        if name in scope or name not in context.columns:
            continue
        scope.append(name)
        for entry in context.columns[name]["upstream"]:
            if entry["column"] not in scope:
                queue.append(entry["column"])
    context.scope = scope
    context.derived = {name for name in scope if name in derived}

    # Rules and cases: one rule per derived column, one case per statement that writes it.
    # Rule ids follow the calculation: by depth, then by the first statement that is more than a type conversion.
    def first_case_line(name: str) -> int:
        lines = [context.nodes[n]["line"] or 0 for n in context.columns[name]["chain"] if context.nodes[n]["kind"] == "write" and context.nodes[n].get("operation") != "cast"]
        return min(lines) if lines else 0

    order = sorted(context.derived, key=lambda name: (context.columns[name]["depth"], first_case_line(name), name))
    for rule_index, column in enumerate(order, start=1):
        lines = sorted({
            context.analysis["steps"][node["step"]]["line"]
            for node in (context.nodes[n] for n in context.columns[column]["chain"])
            if node["kind"] == "write" and node.get("step") is not None
        })
        rule = {"id": f"R{rule_index}", "column": column, "cases": [], "inputs": [], "selectors": [], "lines": []}
        for line in lines:
            nodes = _writes_of(context, line, column)
            if not _is_case(nodes):
                continue
            step = context.steps_by_line[line]
            use = _lookup_use(context, line, column)
            inputs: List[str] = []
            selectors: List[str] = []
            for node in nodes:
                for dependency in node["data"]:
                    name = context.nodes[dependency["node"]]["column"]
                    if name != column and name not in inputs:
                        inputs.append(name)
                for dependency in [*node["control"], *node["group"], *node.get("join", [])]:
                    name = context.nodes[dependency]["column"]
                    if name != column and name not in selectors:
                        selectors.append(name)
            if use and use["key_column"] != column:
                if use["key_column"] in inputs:
                    inputs.remove(use["key_column"])
                if use["key_column"] not in selectors:
                    selectors.insert(0, use["key_column"])
            selectors = [name for name in selectors if name not in inputs]
            operations = [node.get("operation") for node in nodes if node.get("operation") != "cast"]
            conditions = [condition.get("pretty") or condition.get("code") for node in nodes for condition in node.get("conditions", []) if condition.get("pretty") or condition.get("code")]
            formulas = [node.get("pretty") or node.get("expression") or "" for node in nodes if node.get("operation") != "cast"]
            code = step.get("code") or context.code_span(step["line"], step["end_line"])
            constants = _constants(code)
            if use:
                for key, value in use["entries"]:
                    for item in (key, value):
                        number = _number(item)
                        if number is not None:
                            constants.add(number)
                        elif isinstance(item, str):
                            constants |= set(_numbers_in(item, single=True))
            for node in nodes:
                for variable in node.get("uses", []):
                    span = context.analysis.get("variables", {}).get(variable)
                    if span:
                        constants |= _constants(context.code_span(span["line"], span["end_line"]))
            case = {
                "id": f"{rule['id']}.{len(rule['cases']) + 1}",
                "rule": rule["id"],
                "column": column,
                "line": step["line"],
                "end_line": step["end_line"],
                "code": code,
                "operation": operations[0] if operations else "transformation",
                "fills_missing": all(operation == "fill_missing" for operation in operations) if operations else False,
                "condition": " & ".join(dict.fromkeys(conditions)) or None,
                "formula": " ; ".join(dict.fromkeys(item for item in formulas if item)) or None,
                "inputs": inputs,
                "selectors": selectors,
                "lookup": {key: use[key] for key in ("name", "key_column", "entries", "line", "end_line")} if use else None,
                "constants": sorted(constants),
                "records": 0,
                "amount": None,
                "keys": [],
            }
            rule["cases"].append(case)
            context.cases[case["id"]] = case
            context.case_by_write[(line, column)] = case
            for name in inputs:
                if name not in rule["inputs"]:
                    rule["inputs"].append(name)
            for name in selectors:
                if name not in rule["selectors"]:
                    rule["selectors"].append(name)
            rule["lines"].append(line)
        rule["selectors"] = [name for name in rule["selectors"] if name not in rule["inputs"]]
        if rule["cases"]:
            context.rules.append(rule)
            context.rule_by_column[column] = rule
    context.derived = {rule["column"] for rule in context.rules}

    context.identifier = _identifier(final, set(figures)) if final is not None else None
    # Business segments: categorical columns of the result; the ones that select cases come first.
    selectors = [name for rule in context.rules for name in rule["selectors"]]
    candidates = list(dict.fromkeys([*selectors, *[str(column) for column in final.columns]]))
    dimensions = []
    for name in candidates:
        if name not in final.columns or name in figures or name == context.identifier or name in numeric:
            continue
        series = final[name]
        non_null = series.dropna()
        if len(non_null) < max(1, len(series) // 2):
            continue
        distinct = non_null.astype(str).nunique()
        if 2 <= distinct <= MAX_DIMENSION_VALUES:
            dimensions.append(name)
        if len(dimensions) >= MAX_DIMENSIONS:
            break
    context.dimensions = dimensions
    cases = sum(len(rule["cases"]) for rule in context.rules)
    job.log(
        "success", "scope",
        f"Reported figure(s) {', '.join(figures)}: {len(scope)} business terms, {len(context.rules)} business rules with {cases} cases",
        figures=figures, terms=len(scope), rules=len(context.rules), cases=cases,
    )


def _origin(context: _Context, column: str, label: Any, before: Optional[int] = None) -> Tuple[Optional[Dict[str, Any]], Optional[int]]:
    """The case that last wrote a cell before a statement (None: the final value), and its statement line."""
    for line in reversed(context.history.get(column, {}).get(label, [])):
        if before is not None and line >= before:
            continue
        case = context.case_by_write.get((line, column))
        if case is not None:
            return case, line
    return None, None


def _token(context: _Context, case: Dict[str, Any], line: int, column: str, label: Any) -> str:
    key = context.keys.get((line, column), {}).get(label, _MISSING)
    return case["id"] if key is _MISSING else f"{case['id']}|{_key_text(key)}"


def _path(context: _Context, column: str, label: Any, before: Optional[int] = None) -> List[str]:
    """The chain of cases that produced a value: its own case, then the cases of every derived value it used."""
    case, line = _origin(context, column, label, before)
    if case is None:
        return [f"{column}|delivered"] if column in context.derived else []
    tokens = [_token(context, case, line, column, label)]
    for other in [*case["inputs"], *case["selectors"]]:
        if other != column and other in context.derived:
            for token in _path(context, other, label, line):
                if token not in tokens:
                    tokens.append(token)
    return tokens


def _content(job: _Job, context: _Context) -> Dict[str, Any]:
    """Composition of every derived value, content paths and segments of every figure, and the record view."""
    final = context.final
    numeric = _numeric_columns(final)
    factors = _factor_columns(final, numeric)
    summable = numeric - factors
    labels = list(final.index)
    compositions: Dict[str, Dict[str, Any]] = {}
    for rule in context.rules:
        column = rule["column"]
        if column not in final.columns:
            continue
        delivered = {"records": 0, "amount": 0.0}
        missing = 0
        by_case: Dict[str, Dict[str, Any]] = {}
        for label in labels:
            value = final.at[label, column]
            amount = _number(value)
            if la._is_null(value):
                missing += 1
                continue
            case, line = _origin(context, column, label)
            if case is None:
                delivered["records"] += 1
                delivered["amount"] += amount or 0.0
                continue
            entry = by_case.setdefault(case["id"], {"records": 0, "amount": 0.0, "keys": {}})
            entry["records"] += 1
            entry["amount"] += amount or 0.0
            key = context.keys.get((line, column), {}).get(label, _MISSING)
            if key is not _MISSING:
                text = _key_text(key)
                slot = entry["keys"].setdefault(text, {"records": 0, "amount": 0.0, "raw": key, "labels": []})
                slot["records"] += 1
                slot["amount"] += amount or 0.0
                if len(slot["labels"]) < 5000:
                    slot["labels"].append(label)
        is_numeric = column in summable
        # Classifications the column is built from (e.g. the product type behind a balance-sheet type).
        upstream = {item["column"] for item in context.columns[column]["sources"]}
        classifiers = [name for name in context.scope if name in upstream and name != column and name in final.columns and name not in numeric and any(name in other["selectors"] for other in context.rules)]

        def categories(labels_of_key: List[Any], key_column: str) -> Dict[str, List[str]]:
            found: Dict[str, List[str]] = {}
            for name in classifiers:
                if name == key_column:
                    continue
                values = list(dict.fromkeys(_key_text(final.at[label, name]) for label in labels_of_key))
                if values:
                    found[name] = values[:12]
            return found

        for case in rule["cases"]:
            entry = by_case.get(case["id"], {"records": 0, "amount": 0.0, "keys": {}})
            case["records"] = entry["records"]
            case["amount"] = _round(entry["amount"]) if is_numeric else None
            if case["lookup"]:
                keys = []
                key_column = case["lookup"]["key_column"]
                for key, value in case["lookup"]["entries"]:
                    slot = entry["keys"].get(_key_text(key), {"records": 0, "amount": 0.0, "labels": []})
                    keys.append({"key": _key_text(key), "value": la.json_value(value), "records": slot["records"], "amount": _round(slot["amount"]) if is_numeric else None, "mapped": True, "categories": categories(slot["labels"], key_column)})
                for text, slot in entry["keys"].items():
                    if not any(item["key"] == text for item in keys):
                        keys.append({"key": text, "value": None, "records": slot["records"], "amount": _round(slot["amount"]) if is_numeric else None, "mapped": False, "categories": categories(slot["labels"], key_column)})
                unmapped = context.unmapped.get((case["line"], column), {})
                for text, count in unmapped.items():
                    keys.append({"key": text, "value": None, "records": 0, "amount": None, "mapped": False, "unmapped_rows": count})
                case["keys"] = keys
        compositions[column] = {
            "total_records": len(labels),
            "numeric": is_numeric,
            "factor": column in factors,
            "delivered": {"records": delivered["records"], "amount": _round(delivered["amount"]) if is_numeric else None},
            "missing": missing,
            "derived": sum(entry["records"] for entry in by_case.values()),
        }

    figures: Dict[str, Any] = {}
    for figure in context.figures:
        if figure not in final.columns:
            continue
        is_numeric = figure in summable
        values = {label: final.at[label, figure] for label in labels}
        present = [label for label in labels if not la._is_null(values[label])]
        total = sum(_number(values[label]) or 0.0 for label in present) if is_numeric else None
        paths: Dict[Tuple[str, ...], Dict[str, Any]] = {}
        for label in present:
            tokens = tuple(_path(context, figure, label))
            entry = paths.setdefault(tokens, {"records": 0, "amount": 0.0, "examples": []})
            entry["records"] += 1
            entry["amount"] += _number(values[label]) or 0.0
            if len(entry["examples"]) < 3:
                entry["examples"].append(str(label))
        ranked = sorted(paths.items(), key=lambda item: (-abs(item[1]["amount"]) if is_numeric else 0, -item[1]["records"]))
        kept = ranked[:MAX_PATHS]
        rest = ranked[MAX_PATHS:]
        segments: Dict[str, List[Dict[str, Any]]] = {}
        for dimension in context.dimensions:
            groups: Dict[str, Dict[str, Any]] = {}
            for label in labels:
                group = groups.setdefault(_key_text(final.at[label, dimension]), {"records": 0, "amount": 0.0, "missing": 0})
                group["records"] += 1
                if la._is_null(values[label]):
                    group["missing"] += 1
                else:
                    group["amount"] += _number(values[label]) or 0.0
            segments[dimension] = sorted(
                ({"value": value, "records": group["records"], "missing": group["missing"], "amount": _round(group["amount"]) if is_numeric else None} for value, group in groups.items()),
                key=lambda item: (-(abs(item["amount"] or 0.0)), -item["records"]),
            )
        origins = []
        composition = compositions.get(figure)
        if composition:
            if composition["delivered"]["records"]:
                origins.append({"origin": "delivered", "records": composition["delivered"]["records"], "amount": composition["delivered"]["amount"]})
            for case in context.rule_by_column[figure]["cases"]:
                if case["records"]:
                    origins.append({"origin": case["id"], "records": case["records"], "amount": case["amount"]})
        figures[figure] = {
            "numeric": is_numeric,
            "total": _round(total),
            "records": len(labels),
            "present": len(present),
            "missing": len(labels) - len(present),
            "origins": origins,
            "paths": [{"tokens": list(tokens), "records": entry["records"], "amount": _round(entry["amount"]) if is_numeric else None, "examples": entry["examples"]} for tokens, entry in kept],
            "other_paths": {"count": len(rest), "records": sum(entry["records"] for _, entry in rest), "amount": _round(sum(entry["amount"] for _, entry in rest)) if is_numeric else None} if rest else None,
            "segments": segments,
        }

    # Records: identifiers, values and the derivation of every derived value of the first records.
    record_columns = [name for name in context.scope if name in final.columns]
    items = []
    final_labels = set(labels)
    for label in context.record_labels:
        if label not in final_labels:
            continue
        steps: Dict[str, List[Dict[str, Any]]] = {}
        for column in context.derived:
            for entry in context.details.get(column, {}).get(label, []):
                case = context.case_by_write.get((entry["line"], column))
                if case is None:
                    continue
                key = context.keys.get((entry["line"], column), {}).get(label, _MISSING)
                steps.setdefault(column, []).append({**entry, "case": case["id"], "key": None if key is _MISSING else _key_text(key)})
        items.append({
            "label": str(label),
            "id": _key_text(final.at[label, context.identifier]) if context.identifier else None,
            "values": {column: la.json_value(final.at[label, column]) for column in record_columns},
            "steps": steps,
        })
    records = {"columns": record_columns, "items": items, "total": len(labels), "identifier": context.identifier}
    nulled: Dict[str, Dict[str, Any]] = {}
    for statement in context.statements:
        for column, entry in (statement.get("nulled") or {}).items():
            if column not in context.scope:
                continue
            nodes = _writes_of(context, statement["line"], column)
            if nodes and all(node.get("operation") == "cast" for node in nodes):
                slot = nulled.setdefault(column, {"count": 0, "examples": [], "line": statement["line"]})
                slot["count"] += entry["count"]
                slot["examples"] = list(dict.fromkeys([*slot["examples"], *entry["examples"]]))[:5]
    paths = sum(len(item["paths"]) for item in figures.values())
    job.log(
        "success", "composed",
        f"Content composed: {len(labels)} records, {paths} content path(s), {len(context.dimensions)} business segment(s)",
        records=len(labels), paths=paths, dimensions=len(context.dimensions),
    )
    for (line, column), missing in context.unmapped.items():
        if column in context.derived:
            job.log("warn", "unmapped", f"[{column}] line {line}: categories without a parameter: {', '.join(f'{key} ({count})' for key, count in missing.items())}", column=column, line=line, values=[f"{key} ({count})" for key, count in missing.items()])
    return {"compositions": compositions, "figures": figures, "records": records, "nulled": nulled, "numeric": sorted(numeric), "factors": sorted(factors)}


def _terms(context: _Context, content: Dict[str, Any]) -> List[Dict[str, Any]]:
    final = context.final
    numeric = set(content["numeric"])
    factors = set(content["factors"])
    selectors = {name for rule in context.rules for name in rule["selectors"]}
    used_by: Dict[str, List[str]] = {}
    for rule in context.rules:
        for name in [*rule["inputs"], *rule["selectors"]]:
            used_by.setdefault(name, [])
            if rule["column"] not in used_by[name]:
                used_by[name].append(rule["column"])
    terms = []
    for name in context.scope:
        rule = context.rule_by_column.get(name)
        kind = "figure" if name in context.figures else "concept" if rule else "source"
        series = final[name] if final is not None and name in final.columns else context.frame[name] if name in context.frame.columns else None
        profile = None
        if series is not None:
            values = [value for value in series.tolist() if not la._is_null(value)]
            distinct = list(dict.fromkeys(_key_text(value) for value in values))
            profile = {
                "non_null": len(values), "total": len(series),
                "distinct": len(distinct), "values": distinct[:15] if name not in numeric else [],
                "sum": _round(sum(_number(value) or 0.0 for value in values)) if name in numeric and name not in factors else None,
                "min": _round(min(_number(value) for value in values)) if name in numeric and values else None,
                "max": _round(max(_number(value) for value in values)) if name in numeric and values else None,
                "samples": [la.json_value(value) for value in values[:4]],
            }
        terms.append({
            "column": name,
            "kind": kind,
            "classifier": name in selectors and name not in numeric,
            "in_source": name in context.frame.columns,
            "numeric": name in numeric,
            "factor": name in factors,
            "type": _value_type(series, name in numeric) if series is not None else "empty",
            "rule": rule["id"] if rule else None,
            "inputs": [*rule["inputs"], *rule["selectors"]] if rule else [],
            "used_by": used_by.get(name, []),
            "profile": profile,
            "composition": content["compositions"].get(name),
            "nulled": content["nulled"].get(name),
        })
    return terms


# --------------------------------------------------------------------------------------------------
# 3. Describe: business terms, rules and cases in business language
# --------------------------------------------------------------------------------------------------

def _language_rule(language: str) -> str:
    return f"Write every text in {LANGUAGE_NAMES.get(language, 'English')}."


def _case_facts(case: Dict[str, Any]) -> Dict[str, Any]:
    facts: Dict[str, Any] = {
        "case": case["id"],
        "statement_line": case["line"],
        "code": case["code"][:900],
        "applies_when": _plain(case["condition"]) or None,
        "computes": _plain(case["formula"]) or None,
        "only_fills_missing_values": case["fills_missing"],
        "value_columns": case["inputs"],
        "case_selector_columns": case["selectors"],
        "records_whose_final_value_comes_from_this_case": case["records"],
    }
    if case["lookup"]:
        facts["parameter_table"] = {
            "name": case["lookup"]["name"], "key_column": case["lookup"]["key_column"],
            "entries": [[la.json_value(key), la.json_value(value)] for key, value in case["lookup"]["entries"][:40]],
            "categories_without_parameter": [item["key"] for item in case["keys"] if not item["mapped"]],
            "source_categories_per_key": {item["key"]: item["categories"] for item in case["keys"] if item.get("categories")},
        }
    return facts


def _term_facts(term: Dict[str, Any]) -> Dict[str, Any]:
    profile = term["profile"] or {}
    facts: Dict[str, Any] = {
        "column": term["column"],
        "kind": {"figure": "reported figure", "concept": "derived business concept", "source": "source data element"}[term["kind"]],
        "type": term["type"],
        "selects_cases": term["classifier"],
        "in_source_data": term["in_source"],
        "filled": f"{profile.get('non_null', 0)} of {profile.get('total', 0)} records",
    }
    if profile.get("values"):
        facts["values"] = profile["values"]
    elif profile.get("samples"):
        facts["samples"] = profile["samples"]
    return facts


def _describe_schema(columns: List[str], rules: List[Dict[str, Any]]) -> Dict[str, Any]:
    case_ids = [case["id"] for rule in rules for case in rule["cases"]]
    return {
        "type": "object", "additionalProperties": False, "required": ["summary", "domain", "framework", "terms", "rules"],
        "properties": {
            "summary": {"type": "string"},
            "domain": {"type": "string"},
            "framework": _enum(list(FRAMEWORKS)),
            "terms": {"type": "array", "items": {
                "type": "object", "additionalProperties": False, "required": ["column", "name", "definition"],
                "properties": {"column": _enum(columns), "name": {"type": "string"}, "definition": {"type": "string"}},
            }},
            "rules": {"type": "array", "items": {
                "type": "object", "additionalProperties": False, "required": ["rule", "name", "statement", "queries", "cases"],
                "properties": {
                    "rule": _enum([rule["id"] for rule in rules]),
                    "name": {"type": "string"},
                    "statement": {"type": "string"},
                    "queries": _strings(),
                    "cases": {"type": "array", "items": {
                        "type": "object", "additionalProperties": False, "required": ["case", "label", "description"],
                        "properties": {"case": _enum(case_ids), "label": {"type": "string"}, "description": {"type": "string"}},
                    }},
                },
            }},
        },
    }


_DESCRIBE_SYSTEM = (
    "You are a regulatory reporting expert at a German bank documenting the CONTENT LINEAGE (business lineage) of reported "
    "figures. Content lineage explains what a reported figure means and what it is made of, in the language of the business, "
    "not of the code: the business terms, the business rules that derive them and the cases those rules distinguish.\n"
    "You receive the deterministic facts of a calculation: its columns, and per derived column one rule whose cases are the "
    "statements of the code that write it (with condition, formula, parameter tables and how many records each case produced).\n"
    "Return:\n"
    "- summary: 2–3 sentences on what the reported figures are and how they are built, in business terms (only when asked);\n"
    "- domain: the business domain in a few words (for example 'Credit risk – standardised approach') (only when asked);\n"
    "- framework: the regulatory framework the calculation implements (credit_risk_standardised when risk weights are assigned per "
    "exposure class and off-balance-sheet items are converted with fixed factors; credit_risk_irb when PD/LGD models are used; "
    "'other' for accounting, statistical or internal figures that no prudential framework prescribes);\n"
    "- terms: for every column listed, the business term a banking expert would use (name; include a common abbreviation in "
    "parentheses where one exists, e.g. 'Exposure value (EAD)') and a definition of 1–2 sentences of what the term MEANS, not how "
    "the code computes it;\n"
    "- rules: for every rule, a short business name, a statement of the rule in one or two sentences that a business analyst can "
    "verify, every case (label of at most six words; description of when the case applies and what it yields), and 2–4 short "
    "English search queries that would find the regulatory provisions defining this concept or prescribing this rule, phrased like "
    "the wording of a regulation ('exposure value of off-balance-sheet items', 'risk weight exposures to corporates'); when a "
    "parameter table distinguishes categories that different provisions govern, write one query per category.\n"
    "Rules for writing:\n"
    "- Refer to business terms by their business names, never by column names in brackets or code.\n"
    "- A case that only fills missing values means: the value delivered by the source is kept; the case supplies it only when "
    "it is missing. Say so.\n"
    "- A case of a parameter table: describe the parameter per category exactly as in the table (factors may be written as "
    "percentages, 0.2 = 20 %).\n"
    "- Use only numbers that appear in the facts of that rule (no record counts, no amounts, no article numbers).\n"
    "- Do not cite regulations or articles; they are retrieved and verified in a later step.\n"
    "- Return every listed column, rule and case exactly once, with the exact ids."
)


def _allowed_numbers(rule: Dict[str, Any]) -> Set[float]:
    allowed = {0.0, 1.0, 100.0}
    for case in rule["cases"]:
        for value in case["constants"]:
            allowed.add(round(value, 9))
            allowed.add(round(value * 100, 9))
            allowed.add(round(value / 100, 9))
        allowed.add(float(case["line"]))
    return allowed


def _ungrounded_numbers(text: str, allowed: Set[float]) -> List[str]:
    bad = []
    for readings in _numbers_in(text):
        if not any(round(value, 9) in allowed for value in readings):
            bad.append("/".join(_key_text(value) for value in sorted(readings)))
    return bad


def _describe_batch(job: _Job, llm: _LLM, context: _Context, terms: List[Dict[str, Any]], rules: List[Dict[str, Any]], first: bool) -> Tuple[Dict[str, Any], List[Dict[str, Any]], bool]:
    """(answer, remaining grounding issues, corrected) for one batch of terms and rules."""
    columns = [term["column"] for term in terms]
    rule_ids = [rule["id"] for rule in rules]
    facts = {
        "write_summary_and_domain": first,
        "reported_figures": context.figures,
        "columns": [_term_facts(term) for term in terms],
        "rules": [
            {
                "rule": rule["id"],
                "derives_column": rule["column"],
                "column_also_delivered_by_source": rule["column"] in context.frame.columns,
                "cases": [_case_facts(case) for case in rule["cases"]],
            }
            for rule in rules
        ],
    }
    messages = [
        {"role": "system", "content": _DESCRIBE_SYSTEM + "\n" + _language_rule(context.language)},
        {"role": "user", "content": json.dumps(facts, ensure_ascii=False, default=str)},
    ]
    schema = _describe_schema(columns, rules)

    def issues_of(answer: Dict[str, Any]) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        named = {item.get("column") for item in answer.get("terms", []) if str(item.get("name") or "").strip()}
        for column in columns:
            if column not in named:
                issues.append({"code": "term_missing", "params": {"column": column}, "text": f"Column '{column}' has no business name."})
        by_rule = {item.get("rule"): item for item in answer.get("rules", [])}
        for rule in rules:
            item = by_rule.get(rule["id"])
            if not item or not str(item.get("statement") or "").strip():
                issues.append({"code": "rule_missing", "params": {"rule": rule["id"]}, "text": f"Rule {rule['id']} has no statement."})
                continue
            described = {case.get("case") for case in item.get("cases", []) if str(case.get("description") or "").strip()}
            for case in rule["cases"]:
                if case["id"] not in described:
                    issues.append({"code": "case_missing", "params": {"case": case["id"]}, "text": f"Case {case['id']} is not described."})
            for case in item.get("cases", []):
                if case.get("case") not in {entry["id"] for entry in rule["cases"]}:
                    issues.append({"code": "case_unknown", "params": {"case": case.get("case")}, "text": f"Case {case.get('case')} does not belong to rule {rule['id']}."})
            allowed = _allowed_numbers(rule)
            texts = [("statement", item.get("statement", ""))] + [
                (f"case {case.get('case')}", f"{case.get('label', '')} {case.get('description', '')}") for case in item.get("cases", [])
            ]
            for where, text in texts:
                bad = _ungrounded_numbers(str(text), allowed)
                if bad:
                    issues.append({
                        "code": "number_ungrounded", "params": {"rule": rule["id"], "where": where, "numbers": bad[:5]},
                        "text": f"Rule {rule['id']} ({where}) states number(s) {', '.join(bad[:5])} that are not parameters of this rule.",
                    })
        return issues

    answer = llm.json(messages, "content_model", schema)
    issues = issues_of(answer)
    corrected = False
    if issues:
        retry = messages + [
            {"role": "assistant", "content": json.dumps(answer, ensure_ascii=False)},
            {"role": "user", "content": "Correct these problems and return the complete answer again:\n- " + "\n- ".join(item["text"] for item in issues[:25])},
        ]
        second = llm.json(retry, "content_model", schema)
        second_issues = issues_of(second)
        if len(second_issues) <= len(issues):
            answer, issues, corrected = second, second_issues, True
    return answer, issues, corrected


def _describe(job: _Job, llm: _LLM, context: _Context, terms: List[Dict[str, Any]]) -> Dict[str, Any]:
    job.stage("describe")
    rules = context.rules
    batches = [rules[index:index + RULE_BATCH] for index in range(0, len(rules), RULE_BATCH)] or [[]]
    assigned: Set[str] = set()
    plan: List[Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]] = []
    by_column = {term["column"]: term for term in terms}
    for batch in batches:
        names: List[str] = []
        for rule in batch:
            for name in [rule["column"], *rule["inputs"], *rule["selectors"]]:
                if name in by_column and name not in assigned and name not in names:
                    names.append(name)
        assigned |= set(names)
        plan.append(([by_column[name] for name in names], batch))
    leftover = [term for term in terms if term["column"] not in assigned]
    if leftover:
        plan[-1] = (plan[-1][0] + leftover, plan[-1][1])
    job.progress(rules_total=len(rules), rules_described=0)
    job.log("info", "describing", f"Describing {len(terms)} business terms and {len(rules)} business rules in {len(plan)} batch(es)", terms=len(terms), rules=len(rules), batches=len(plan))
    texts: Dict[str, Any] = {"summary": "", "domain": "", "terms": {}, "rules": {}}
    queries: Dict[str, List[str]] = {}
    all_issues: List[Dict[str, Any]] = []
    corrected_any = False
    framework = {"value": "other"}
    lock = threading.Lock()

    def run(index: int, batch_terms: List[Dict[str, Any]], batch_rules: List[Dict[str, Any]]) -> None:
        nonlocal corrected_any
        try:
            answer, issues, corrected = _describe_batch(job, llm, context, batch_terms, batch_rules, index == 0)
        except _Cancelled:
            raise
        except Exception as exc:
            job.log("warn", "llm_error", f"Describing batch {index + 1} failed: {str(exc)[:200]}", step="describe", message=str(exc)[:200])
            with lock:
                all_issues.extend({"code": "rule_missing", "params": {"rule": rule["id"]}, "text": f"Rule {rule['id']} could not be described."} for rule in batch_rules)
            return
        with lock:
            corrected_any = corrected_any or corrected
            if index == 0:
                texts["summary"] = str(answer.get("summary") or "").strip()
                texts["domain"] = str(answer.get("domain") or "").strip()
                framework["value"] = answer.get("framework") if answer.get("framework") in FRAMEWORKS else "other"
            allowed_columns = {term["column"] for term in batch_terms}
            for item in answer.get("terms", []):
                if item.get("column") in allowed_columns and str(item.get("name") or "").strip():
                    texts["terms"][item["column"]] = {"name": str(item["name"]).strip(), "definition": str(item.get("definition") or "").strip()}
            for rule in batch_rules:
                item = next((entry for entry in answer.get("rules", []) if entry.get("rule") == rule["id"]), None)
                if not item:
                    continue
                cases = {}
                for case in item.get("cases", []):
                    if case.get("case") in {entry["id"] for entry in rule["cases"]}:
                        cases[case["case"]] = {"label": str(case.get("label") or "").strip(), "description": str(case.get("description") or "").strip()}
                texts["rules"][rule["id"]] = {"name": str(item.get("name") or "").strip(), "statement": str(item.get("statement") or "").strip(), "cases": cases}
                queries[rule["id"]] = [str(query).strip()[:200] for query in item.get("queries", []) if str(query).strip()][:4]
            all_issues.extend(issues)
        job.increment("rules_described", len(batch_rules))
        job.log("success", "described", f"Batch {index + 1}: {len(batch_terms)} terms and {len(batch_rules)} rules described" + (" after a correction round" if corrected else ""), batch=index + 1, terms=len(batch_terms), rules=len(batch_rules), corrected=corrected)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for future in [pool.submit(run, index, batch_terms, batch_rules) for index, (batch_terms, batch_rules) in enumerate(plan)]:
            future.result()
    for issue in all_issues:
        job.log("warn", "grounding_issue", issue["text"], code=issue["code"], **{key: value for key, value in issue["params"].items() if key != "code"})
    job.log("info", "framework", f"Regulatory framework of the calculation: {framework['value']}", framework=framework["value"])
    return {"texts": texts, "queries": queries, "framework": framework["value"], "grounding": {"issues": all_issues, "corrected": corrected_any, "status": "verified" if not all_issues else "partial"}}


# --------------------------------------------------------------------------------------------------
# 4. Regulate: provisions that define each concept, verified quotes, assessment of the implemented rule
# --------------------------------------------------------------------------------------------------

# The regulatory framework a calculation implements decides which parts of a regulation can be its basis: a standardised-
# approach calculation is not governed by the IRB, securitisation or trading-book provisions that share its words.
_DEFINITIONS = r"SUBJECT MATTER, SCOPE AND DEFINITIONS|GEGENSTAND, ANWENDUNGSBEREICH UND BEGRIFFSBESTIMMUNGEN"
_OWN_FUNDS_LEVEL = r"(?:Required level of own funds|Erforderliche Eigenmittel)[^\n]*› (?:Own funds requirements|Eigenmittelanforderungen)$"


def _credit_risk(chapters: str) -> str:
    return rf"(?:CREDIT RISK|KREDITRISIKO)[^›]*›\s*(?:CHAPTER|KAPITEL)\s+\w+\s+[—–-]\s+(?:{chapters})[^›]*›"


FRAMEWORKS: Dict[str, Optional[List[str]]] = {
    "credit_risk_standardised": [_DEFINITIONS, _OWN_FUNDS_LEVEL, _credit_risk("General principles|Allgemeine Grundsätze|Standardised approach|Standardansatz|Credit risk mitigation|Kreditrisikominderung")],
    "credit_risk_irb": [_DEFINITIONS, _OWN_FUNDS_LEVEL, _credit_risk("General principles|Allgemeine Grundsätze|Internal Ratings Based|IRB|Credit risk mitigation|Kreditrisikominderung")],
    "securitisation": [_DEFINITIONS, _OWN_FUNDS_LEVEL, r"Securitisation|Verbriefung"],
    "counterparty_credit_risk": [_DEFINITIONS, _OWN_FUNDS_LEVEL, r"Counterparty credit risk|Gegenparteiausfallrisiko"],
    "market_risk": [_DEFINITIONS, _OWN_FUNDS_LEVEL, r"MARKET RISK|MARKTRISIKO|Trading book|Handelsbuch"],
    "operational_risk": [_DEFINITIONS, _OWN_FUNDS_LEVEL, r"OPERATIONAL RISK|OPERATIONELLE"],
    "own_funds": [_DEFINITIONS, r"OWN FUNDS AND ELIGIBLE LIABILITIES|EIGENMITTEL UND BERÜCKSICHTIGUNGSFÄHIGE"],
    "large_exposures": [_DEFINITIONS, r"LARGE EXPOSURES|GROSSKREDITE"],
    "liquidity": [_DEFINITIONS, r"LIQUIDITY|LIQUIDITÄT"],
    "leverage": [_DEFINITIONS, r"LEVERAGE|VERSCHULDUNG"],
    "other": None,
}
_ALLOWED_CACHE: Dict[Tuple[str, str], Optional[Set[int]]] = {}


def _allowed_units(source: Dict[str, Any], framework: str) -> Optional[Set[int]]:
    """Units of a regulation that belong to the framework (annexes always do), or None when the framework does not
    restrict the search or the regulation has none of its headings (another regulation: nothing is filtered)."""
    patterns = FRAMEWORKS.get(framework)
    if not patterns:
        return None
    key = (source["id"], framework)
    if key not in _ALLOWED_CACHE:
        compiled = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
        allowed: Set[int] = set()
        specific = False
        for position, unit in enumerate(source["index"]["units"]):
            if unit["kind"] == "annex":
                allowed.add(position)
                continue
            path = " › ".join([*(unit.get("path") or []), unit.get("title") or ""])
            matches = [pattern.search(path) for pattern in compiled]
            if any(matches):
                allowed.add(position)
                specific = specific or bool(matches[-1])
        _ALLOWED_CACHE[key] = allowed if specific else None
    return _ALLOWED_CACHE[key]


def _retrieve(note: Dict[str, Any], interpretation: Dict[str, Any], sources: List[Dict[str, Any]], framework: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """The regulation matcher's retrieval (keyword, semantic, concept and cross-reference signals), restricted to the
    framework of the calculation and topped up with a deeper search inside that framework."""
    found, stats = rm._retrieve(note, interpretation, sources)
    allowed = {source["id"]: _allowed_units(source, framework) for source in sources}

    def inside(candidate: Dict[str, Any]) -> bool:
        units = allowed.get(candidate["regulation_id"])
        return units is None or candidate["unit"] in units

    kept = [candidate for candidate in found if inside(candidate)]
    stats["framework"] = framework
    stats["outside_framework"] = len(found) - len(kept)
    if all(units is None for units in allowed.values()):
        return found, stats
    queries = stats.get("queries") or interpretation.get("queries") or []
    vectors = rm._embed_queries(queries) if any(source["embeddings"] is not None for source in sources) else {}
    seen = {candidate["key"] for candidate in kept}
    scores: Dict[Tuple[Any, ...], float] = {}
    extra: Dict[Tuple[Any, ...], Dict[str, Any]] = {}
    for query in queries:
        groups = []
        for source in sources:
            passages, _ = rt.search_candidates(source["index"], source["search"], query, source["embeddings"], vectors.get(query), depth=400)
            units = allowed[source["id"]]
            if units is not None:
                passages = {position: signal for position, signal in passages.items() if source["index"]["passages"][position]["unit"] in units}
            groups.append((source, passages))
        rank = 0
        for source, position, _, signal in rt.fuse_candidates(groups)[:60]:
            candidate = rm._candidate_for(source, position)
            if candidate is None or candidate["key"] in seen or not inside(candidate):
                continue
            rank += 1
            extra.setdefault(candidate["key"], {**candidate, "retrieval": {"rank": rank, "keyword_rank": signal.get("keyword_rank"), "similarity": signal.get("semantic_similarity"), "queries": 0, "scoped": True}})
            extra[candidate["key"]]["retrieval"]["queries"] += 1
            scores[candidate["key"]] = scores.get(candidate["key"], 0.0) + 1.0 / (6 + rank)
            if rank >= 12:
                break
    ranked = sorted(extra, key=lambda key: -scores[key])
    per_unit: Dict[Tuple[str, int], int] = {}
    chosen: List[Dict[str, Any]] = []

    def take(candidate: Dict[str, Any]) -> None:
        unit = (candidate["regulation_id"], candidate["unit"])
        if per_unit.get(unit, 0) >= rm.CANDIDATES_PER_UNIT or any(item["key"] == candidate["key"] for item in chosen):
            return
        per_unit[unit] = per_unit.get(unit, 0) + 1
        chosen.append(dict(candidate))

    # Half of the slots for the matcher's ranking inside the framework, the rest for the scoped search.
    for candidate in kept[: rm.CANDIDATE_LIMIT // 2]:
        take(candidate)
    for key in ranked:
        if len(chosen) >= rm.CANDIDATE_LIMIT:
            break
        take(extra[key])
    for candidate in kept[rm.CANDIDATE_LIMIT // 2:]:
        if len(chosen) >= rm.CANDIDATE_LIMIT:
            break
        take(candidate)
    for index, candidate in enumerate(chosen, start=1):
        candidate["id"] = f"C{index}"
    stats["scoped"] = len(extra)
    return chosen, stats


def _decision_schema(candidates: List[str], cases: List[str]) -> Dict[str, Any]:
    return {
        "type": "object", "additionalProperties": False, "required": ["links", "verdict", "explanation", "findings"],
        "properties": {
            "links": {"type": "array", "items": {
                "type": "object", "additionalProperties": False, "required": ["candidate", "relation", "quote", "explanation"],
                "properties": {"candidate": _enum(candidates), "relation": _enum(list(RELATIONS)), "quote": {"type": "string"}, "explanation": {"type": "string"}},
            }},
            "verdict": _enum(list(VERDICTS)),
            "explanation": {"type": "string"},
            "findings": {"type": "array", "items": {
                "type": "object", "additionalProperties": False, "required": ["case", "key", "verdict", "candidate", "explanation"],
                "properties": {
                    "case": _enum(["", *cases]), "key": {"type": "string"}, "verdict": _enum(list(FINDING_VERDICTS)),
                    "candidate": _enum(candidates), "explanation": {"type": "string"},
                },
            }},
        },
    }


_DECISION_SYSTEM = (
    "You are a regulatory reporting expert at a German bank. You link one business rule of a calculation (content lineage) to "
    "the regulatory provisions behind it and assess whether the implemented rule complies.\n"
    "You receive the business term the rule derives, the rule with its cases (conditions, formulas, parameter tables) and "
    "candidate provisions retrieved from the bank's indexed regulations (id, reference, title, headings, text).\n"
    "You also receive the calculation as a whole (summary, domain, regulatory framework, all its rules), so you know where this "
    "rule sits.\n"
    "1. links: select at most three candidates that DEFINE this business concept or PRESCRIBE how it is determined (formula, "
    "parameters, treatment of a case) WITHIN THE FRAMEWORK OF THE CALCULATION. relation: 'defines' (definition of the term), "
    "'prescribes' (calculation, parameter or treatment), 'related' (a provision the rule directly relies on). A provision about "
    "another concept or another framework that merely shares words (e.g. 'market value' in the trading book, 'exposure value' of "
    "securitisation positions, IRB formulas for a standardised-approach calculation) is NOT a basis — leave it out. Data "
    "conventions of the bank's systems — taking a value as delivered by the source and using zero or a default when it is missing — "
    "have no regulatory basis unless a candidate prescribes how exactly that value is determined: then return no links and the "
    "verdict 'not_covered'.\n"
    "   quote: copy ONE passage of at most 300 characters verbatim from that candidate's text that supports the link — same "
    "words, same order, no paraphrase; use '…' only to skip words inside the passage.\n"
    "   explanation: one or two sentences on why the provision governs this rule.\n"
    "2. verdict on the implemented rule against the linked provisions: 'consistent' (cases and parameters match), 'simplified' "
    "(a coarser treatment than the regulation, e.g. one parameter where the regulation distinguishes more categories, or a "
    "fallback the regulation does not foresee but which does not contradict it), 'deviation' (a case or parameter contradicts the "
    "regulation, e.g. a factor the regulation does not allow for that category), 'not_covered' (no linked provision; then links "
    "and findings stay empty). Missing support is never a deviation: a case or category that no linked provision addresses gets "
    "no finding; 'deviation' needs a quoted provision that prescribes a different treatment for exactly that case or category.\n"
    "   Parameter tables show, per category, the source categories behind it (e.g. which product types end up 'off balance'); "
    "judge the parameter for each of them — the regulation names items by their regulatory terms (e.g. 'undrawn credit "
    "facilities', 'guarantees having the character of credit substitutes'), the bank by its product names.\n"
    "   explanation: 2–3 sentences justifying the verdict with the quoted provisions.\n"
    "3. findings: one entry per case or parameter-table category you assess explicitly (always for every 'simplified' or "
    "'deviation'); case = the case id, key = the category of the parameter table or ''; candidate = the linked provision that "
    "decides it; explanation: what the code does and what the provision requires.\n"
    "Base every statement only on the quoted provision texts and the facts given. Never invent articles, numbers or treatments."
)


def _calculation(context: _Context, texts: Dict[str, Any], framework: str) -> Dict[str, Any]:
    return {
        "summary": texts.get("summary", ""),
        "domain": texts.get("domain", ""),
        "framework": framework,
        "reported_figures": [texts["terms"].get(name, {}).get("name") or name for name in context.figures],
        "rules": [
            {"id": rule["id"], "derives": texts["terms"].get(rule["column"], {}).get("name") or rule["column"], "name": texts["rules"].get(rule["id"], {}).get("name", "")}
            for rule in context.rules
        ],
    }


def _rule_brief(context: _Context, rule: Dict[str, Any], texts: Dict[str, Any]) -> Dict[str, Any]:
    term = texts["terms"].get(rule["column"], {})
    rule_text = texts["rules"].get(rule["id"], {})
    return {
        "derives": {"column": rule["column"], "business_term": term.get("name") or rule["column"], "definition": term.get("definition", "")},
        "is_reported_figure": rule["column"] in context.figures,
        "rule": {"id": rule["id"], "name": rule_text.get("name", ""), "statement": rule_text.get("statement", "")},
        "inputs": [
            {"column": name, "business_term": texts["terms"].get(name, {}).get("name") or name}
            for name in [*rule["inputs"], *rule["selectors"]]
        ],
        "cases": [
            {
                **_case_facts(case),
                "label": rule_text.get("cases", {}).get(case["id"], {}).get("label", ""),
                "description": rule_text.get("cases", {}).get(case["id"], {}).get("description", ""),
            }
            for case in rule["cases"]
        ],
    }


def _verify_links(answer: Dict[str, Any], candidates: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Links whose quote is verbatim in the regulation (repaired or retargeted where unambiguous) and the problems."""
    by_id = {candidate["id"]: candidate for candidate in candidates}
    links: List[Dict[str, Any]] = []
    problems: List[str] = []
    seen: Set[str] = set()
    for raw in (answer.get("links") or [])[:MAX_LINKS + 1]:
        candidate = by_id.get(str(raw.get("candidate") or ""))
        if candidate is None or candidate["id"] in seen:
            continue
        quote = str(raw.get("quote") or "")
        status, exact, similarity = rm._check_quote(quote, candidate["text"])
        target = candidate
        if status == "failed":
            # The quote may come from another candidate (the model mixed up two provisions).
            for other in candidates:
                if other["id"] == candidate["id"] or other["id"] in seen:
                    continue
                other_status, other_exact, other_similarity = rm._check_quote(quote, other["text"])
                if other_status != "failed":
                    status, exact, similarity, target = other_status, other_exact, other_similarity, other
                    break
        if status == "failed":
            closest = rt.closest_original(quote, candidate["text"])[1]
            problems.append(f"{candidate['id']} ({candidate['reference']}): the quote is not verbatim in the provision text. Closest wording: \"{closest[:240]}\"")
            continue
        seen.add(target["id"])
        reference = target["reference"]
        point = rm._point_of(target, exact)
        if point and target["kind"] == "article" and not reference.endswith(f"({point})"):
            reference = re.sub(r"\(\w+\)–\(\w+\)$", "", reference)
            reference = reference if reference.endswith(f"({point})") else f"{reference}({point})"
        relation = raw.get("relation") if raw.get("relation") in RELATIONS else "related"
        links.append({
            "candidate": target["id"],
            "regulation_id": target["regulation_id"],
            "regulation": target["regulation"],
            "regulation_file": target["regulation_file"],
            "unit": target["unit"],
            "label": target["label"],
            "reference": reference,
            "title": target["title"],
            "path": target["path"],
            "page": target["page"],
            "page_label": target["page_label"],
            "relation": relation,
            "quote": exact,
            "quote_status": "verified" if status == "verified" else "corrected",
            "similarity": round(similarity, 3),
            "highlights": rm._exact_spans(exact, target["text"]),
            "text": target["text"][:6000],
            "explanation": str(raw.get("explanation") or "").strip(),
            "retargeted_from": candidate["reference"] if target is not candidate else None,
        })
        if len(links) >= MAX_LINKS:
            break
    return links, problems


def _findings_of(answer: Dict[str, Any], links: List[Dict[str, Any]], rule: Dict[str, Any]) -> List[Dict[str, Any]]:
    by_candidate = {link["candidate"]: index for index, link in enumerate(links)}
    case_ids = {case["id"] for case in rule["cases"]}
    findings = []
    for raw in answer.get("findings") or []:
        if raw.get("verdict") not in FINDING_VERDICTS:
            continue
        link = by_candidate.get(str(raw.get("candidate") or ""))
        case = str(raw.get("case") or "")
        if link is None or (case and case not in case_ids):
            continue
        findings.append({"case": case or None, "key": str(raw.get("key") or "").strip() or None, "verdict": raw["verdict"], "link": link, "explanation": str(raw.get("explanation") or "").strip()})
    return findings


def _verdict_of(answer: Dict[str, Any], links: List[Dict[str, Any]], findings: List[Dict[str, Any]]) -> str:
    if not links:
        return "not_covered" if answer.get("verdict") == "not_covered" or not answer.get("links") else "unverified"
    verdict = answer.get("verdict") if answer.get("verdict") in FINDING_VERDICTS else "consistent"
    worst = max([FINDING_VERDICTS.index(verdict), *[FINDING_VERDICTS.index(item["verdict"]) for item in findings]])
    return FINDING_VERDICTS[worst]


def _regulate_rule(job: _Job, llm: _LLM, context: _Context, rule: Dict[str, Any], texts: Dict[str, Any], queries: List[str], sources: List[Dict[str, Any]], framework: str) -> Dict[str, Any]:
    job.check()
    term = texts["terms"].get(rule["column"], {})
    rule_text = texts["rules"].get(rule["id"], {})
    name = term.get("name") or rule["column"]
    body = " ".join(filter(None, [
        f"{name}: {term.get('definition', '')}", rule_text.get("statement", ""),
        *[f"{item.get('label', '')}: {item.get('description', '')}" for item in rule_text.get("cases", {}).values()],
    ]))
    note = {"text": body[:1500], "full_text": body}
    interpretation = {
        "queries": queries or [name],
        "summary_en": rule_text.get("statement", "") if context.language == "en" else "",
        "concepts": [{"term": name}],
    }
    candidates, stats = _retrieve(note, interpretation, sources, framework)
    job.check()
    if not candidates:
        job.log("info", "no_candidates", f"{rule['id']} {name}: no candidate provisions found", rule=rule["id"], name=name)
        return {"verdict": "not_covered", "links": [], "findings": [], "explanation": "", "dropped": [], "corrected": False, "retrieval": {"candidates": 0, "queries": stats.get("queries", []), "framework": framework}, "review": None}
    brief = _rule_brief(context, rule, texts)
    payload = {
        "calculation": _calculation(context, texts, framework),
        "business_rule": brief,
        "candidates": [
            {
                "id": candidate["id"], "regulation": candidate["regulation"], "reference": candidate["reference"], "title": candidate["title"],
                "headings": candidate["path"][-3:], "text": candidate["text"][:CANDIDATE_TEXT],
            }
            for candidate in candidates
        ],
    }
    messages = [
        {"role": "system", "content": _DECISION_SYSTEM + "\n" + _language_rule(context.language) + " Quotes stay in the language of the regulation."},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False, default=str)},
    ]
    schema = _decision_schema([candidate["id"] for candidate in candidates], [case["id"] for case in rule["cases"]])
    answer = llm.json(messages, "regulatory_basis", schema)
    links, problems = _verify_links(answer, candidates)
    corrected = False
    if problems:
        job.log("warn", "quote_failed", f"{rule['id']}: {len(problems)} quote(s) not verbatim; asking for a correction", rule=rule["id"], count=len(problems))
        retry = messages + [
            {"role": "assistant", "content": json.dumps(answer, ensure_ascii=False)},
            {"role": "user", "content": "These quotes are not verbatim in the candidate texts. Copy the exact wording from the candidate (or drop the link) and return the complete answer again:\n- " + "\n- ".join(problems)},
        ]
        second = llm.json(retry, "regulatory_basis", schema)
        second_links, second_problems = _verify_links(second, candidates)
        if len(second_links) >= len(links):
            answer, links, problems, corrected = second, second_links, second_problems, True
    if answer.get("verdict") == "not_covered":
        # The model found no provision that governs the rule: links it still listed are context, not a basis.
        links = []
    findings = _findings_of(answer, links, rule)
    verdict = _verdict_of(answer, links, findings)
    job.increment("rules_regulated")
    job.increment("provisions_linked", len(links))
    job.log(
        "success" if links else "info", "linked",
        f"{rule['id']} {name}: {len(links)} provision(s) linked ({', '.join(link['reference'] for link in links) or '–'}); verdict {verdict}",
        rule=rule["id"], name=name, count=len(links), references=[link["reference"] for link in links], verdict=verdict,
    )
    return {
        "verdict": verdict,
        "explanation": str(answer.get("explanation") or "").strip(),
        "links": links,
        "findings": findings,
        "dropped": problems,
        "corrected": corrected,
        "retrieval": {
            "candidates": len(candidates), "queries": stats.get("queries", []), "semantic": stats.get("semantic", False), "concepts": stats.get("concepts", []),
            "framework": framework, "outside_framework": stats.get("outside_framework", 0), "scoped": stats.get("scoped", 0),
        },
        "review": None,
    }


def _review_schema(cases: List[str], links: int) -> Dict[str, Any]:
    return {
        "type": "object", "additionalProperties": False, "required": ["decision", "issues", "irrelevant_links", "verdict", "explanation", "findings"],
        "properties": {
            "decision": _enum(["confirmed", "corrected"]),
            "issues": _strings(),
            "irrelevant_links": {"type": "array", "items": {"type": "integer", "enum": list(range(max(1, links)))}},
            "verdict": _enum(list(FINDING_VERDICTS)),
            "explanation": {"type": "string"},
            "findings": {"type": "array", "items": {
                "type": "object", "additionalProperties": False, "required": ["case", "key", "verdict", "link", "explanation"],
                "properties": {
                    "case": _enum(["", *cases]), "key": {"type": "string"}, "verdict": _enum(list(FINDING_VERDICTS)),
                    "link": {"type": "integer", "enum": list(range(max(1, links)))}, "explanation": {"type": "string"},
                },
            }},
        },
    }


_REVIEW_SYSTEM = (
    "You are the second reviewer (four-eyes principle) of a regulatory assessment in a bank's content lineage. You receive a "
    "business rule with its cases and parameters, the provisions linked to it (verified verbatim quotes and the provision texts) "
    "and the first assessment (verdict, explanation, findings).\n"
    "First check every linked provision: does it govern THIS concept within the framework of the calculation? List the position "
    "of every link that does not (another concept, another framework, a provision that merely shares words) in irrelevant_links; "
    "they are removed. A provision that defines or prescribes the treatment of the same regulatory item governs the concept even "
    "when it uses the regulation's terms instead of the bank's product names — keep it. Missing support is never a deviation: a "
    "case no remaining provision addresses gets no finding. Then check that the verdict follows from the remaining provision texts and the rule's facts: a 'deviation' needs a provision that "
    "requires something else for that case; a 'simplified' needs a provision that distinguishes more finely; 'consistent' must not "
    "hide a case the provisions treat differently. Check that every finding names the right case or category and is supported by "
    "its provision. Decide 'confirmed' when the assessment holds; otherwise 'corrected' and return the corrected verdict, "
    "explanation and findings (link = position of the linked provision, starting at 0). List the problems you found in issues "
    "(empty when confirmed). Base everything only on the texts given."
)


def _review_rule(job: _Job, llm: _LLM, context: _Context, rule: Dict[str, Any], texts: Dict[str, Any], assessment: Dict[str, Any], framework: str) -> None:
    job.check()
    links = assessment["links"]
    payload = {
        "calculation": _calculation(context, texts, framework),
        "business_rule": _rule_brief(context, rule, texts),
        "linked_provisions": [
            {"link": index, "reference": link["reference"], "title": link["title"], "relation": link["relation"], "quote": link["quote"], "provision_text": link["text"][:2500]}
            for index, link in enumerate(links)
        ],
        "assessment": {
            "verdict": assessment["verdict"], "explanation": assessment["explanation"],
            "findings": [{"case": item["case"] or "", "key": item["key"] or "", "verdict": item["verdict"], "link": item["link"], "explanation": item["explanation"]} for item in assessment["findings"]],
        },
    }
    messages = [
        {"role": "system", "content": _REVIEW_SYSTEM + "\n" + _language_rule(context.language)},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False, default=str)},
    ]
    answer = llm.json(messages, "review", _review_schema([case["id"] for case in rule["cases"]], len(links)))
    issues = [str(item).strip() for item in answer.get("issues", []) if str(item).strip()][:8]
    review: Dict[str, Any] = {"decision": "confirmed", "issues": issues, "applied": False, "removed": []}
    irrelevant = sorted({index for index in answer.get("irrelevant_links", []) if isinstance(index, int) and 0 <= index < len(links)})
    mapping = {index: index for index in range(len(links))}
    if irrelevant:
        review["decision"] = "corrected"
        review["applied"] = True
        review["original"] = {"verdict": assessment["verdict"], "explanation": assessment["explanation"], "findings": assessment["findings"]}
        review["removed"] = [{"reference": links[index]["reference"], "title": links[index]["title"]} for index in irrelevant]
        mapping = {old: new for new, old in enumerate(index for index in range(len(links)) if index not in irrelevant)}
        assessment["links"] = [link for index, link in enumerate(links) if index not in irrelevant]
        assessment["findings"] = [{**item, "link": mapping[item["link"]]} for item in assessment["findings"] if item["link"] in mapping]
        if not assessment["links"]:
            assessment["verdict"] = "not_covered"
            assessment["findings"] = []
        links = assessment["links"]
    if answer.get("decision") == "corrected" and links:
        case_ids = {case["id"] for case in rule["cases"]}
        findings = []
        valid = True
        for raw in answer.get("findings", []):
            link = raw.get("link")
            case = str(raw.get("case") or "")
            if isinstance(link, int) and link not in mapping:
                continue  # the finding rests on a link the reviewer removed
            link = mapping.get(link, link) if isinstance(link, int) else link
            if not isinstance(link, int) or not 0 <= link < len(links) or (case and case not in case_ids) or raw.get("verdict") not in FINDING_VERDICTS:
                valid = False
                break
            findings.append({"case": case or None, "key": str(raw.get("key") or "").strip() or None, "verdict": raw["verdict"], "link": link, "explanation": str(raw.get("explanation") or "").strip()})
        review["decision"] = "corrected"
        if valid and answer.get("verdict") in FINDING_VERDICTS:
            review.setdefault("original", {"verdict": assessment["verdict"], "explanation": assessment["explanation"], "findings": assessment["findings"]})
            review["applied"] = True
            assessment["findings"] = findings
            worst = max([FINDING_VERDICTS.index(answer["verdict"]), *[FINDING_VERDICTS.index(item["verdict"]) for item in findings]])
            assessment["verdict"] = FINDING_VERDICTS[worst]
            assessment["explanation"] = str(answer.get("explanation") or "").strip() or assessment["explanation"]
    assessment["review"] = review
    job.increment("rules_reviewed")
    term = texts["terms"].get(rule["column"], {}).get("name") or rule["column"]
    if review["decision"] == "corrected":
        removed = ", ".join(item["reference"] for item in review["removed"])
        detail = "; ".join(filter(None, [f"removed {removed}" if removed else "", *issues[:2]]))
        job.log("warn", "review_corrected", f"{rule['id']} {term}: the reviewer corrected the assessment" + (f" ({detail})" if detail else ""), rule=rule["id"], name=term, verdict=assessment["verdict"], applied=review["applied"], removed=[item["reference"] for item in review["removed"]])
    else:
        job.log("success", "reviewed", f"{rule['id']} {term}: assessment confirmed by the second reviewer ({assessment['verdict']})", rule=rule["id"], name=term, verdict=assessment["verdict"])


# --------------------------------------------------------------------------------------------------
# 5. Translate
# --------------------------------------------------------------------------------------------------

def _text_items(texts: Dict[str, Any], regulation: Dict[str, Any]) -> List[Tuple[str, str]]:
    items: List[Tuple[str, str]] = [("summary", texts["summary"]), ("domain", texts["domain"])]
    for column, term in texts["terms"].items():
        items += [(f"term␟{column}␟name", term["name"]), (f"term␟{column}␟definition", term["definition"])]
    for rule_id, rule in texts["rules"].items():
        items += [(f"rule␟{rule_id}␟name", rule["name"]), (f"rule␟{rule_id}␟statement", rule["statement"])]
        for case_id, case in rule["cases"].items():
            items += [(f"case␟{rule_id}␟{case_id}␟label", case["label"]), (f"case␟{rule_id}␟{case_id}␟description", case["description"])]
    for rule_id, assessment in regulation.items():
        items.append((f"reg␟{rule_id}␟explanation", assessment.get("explanation", "")))
        for index, link in enumerate(assessment.get("links", [])):
            items.append((f"reg␟{rule_id}␟link␟{index}", link.get("explanation", "")))
        for index, finding in enumerate(assessment.get("findings", [])):
            items.append((f"reg␟{rule_id}␟finding␟{index}", finding.get("explanation", "")))
        for index, issue in enumerate((assessment.get("review") or {}).get("issues", [])):
            items.append((f"reg␟{rule_id}␟issue␟{index}", issue))
    return [(key, text) for key, text in items if str(text or "").strip()]


def _texts_from(items: Dict[str, str], original: Dict[str, Any], regulation: Dict[str, Any]) -> Dict[str, Any]:
    """The structured texts of one language, built from translated items (missing items keep the original)."""
    texts = copy.deepcopy(original)
    texts["regulation"] = {
        rule_id: {
            "explanation": assessment.get("explanation", ""),
            "links": [link.get("explanation", "") for link in assessment.get("links", [])],
            "findings": [finding.get("explanation", "") for finding in assessment.get("findings", [])],
            "issues": list((assessment.get("review") or {}).get("issues", [])),
        }
        for rule_id, assessment in regulation.items()
    }
    for key, text in items.items():
        parts = key.split("␟")
        if parts[0] in ("summary", "domain"):
            texts[parts[0]] = text
        elif parts[0] == "term" and parts[1] in texts["terms"]:
            texts["terms"][parts[1]][parts[2]] = text
        elif parts[0] == "rule" and parts[1] in texts["rules"]:
            texts["rules"][parts[1]][parts[2]] = text
        elif parts[0] == "case" and parts[2] in texts["rules"].get(parts[1], {}).get("cases", {}):
            texts["rules"][parts[1]]["cases"][parts[2]][parts[3]] = text
        elif parts[0] == "reg" and parts[1] in texts["regulation"]:
            entry = texts["regulation"][parts[1]]
            if parts[2] == "explanation":
                entry["explanation"] = text
            else:
                bucket = {"link": "links", "finding": "findings", "issue": "issues"}[parts[2]]
                index = int(parts[3])
                if index < len(entry[bucket]):
                    entry[bucket][index] = text
    return texts


def _digits(text: str) -> List[str]:
    return sorted(re.sub(r"[^\d]", "", token) for token in re.findall(r"\d[\d.,' ]*\d|\d", text or ""))


def _translate(job: _Job, llm: _LLM, items: List[Tuple[str, str]], source: str, target: str, names: List[str]) -> Tuple[Dict[str, str], int]:
    """Translated texts by key and the number of texts that kept their original wording.

    A translation must keep the numbers of its source text and the technical column names it contains (checked
    deterministically); a batch with rejected texts goes back once with the reasons."""
    protected = sorted({name for name in names if len(name) > 2}, key=len, reverse=True)

    def problems(original: str, translated: Any) -> Optional[str]:
        if not isinstance(translated, str) or bool(original.strip()) != bool(translated.strip()):
            return "empty or missing"
        if _digits(original) != _digits(translated):
            return "numbers changed"
        for name in protected:
            if f"[{name}]" in original and f"[{name}]" not in translated:
                return f"[{name}] dropped"
        return None

    batches = [items[index:index + TRANSLATE_BATCH] for index in range(0, len(items), TRANSLATE_BATCH)]
    result: Dict[str, str] = {}
    kept = 0
    lock = threading.Lock()

    def run(batch: List[Tuple[str, str]]) -> None:
        nonlocal kept
        job.check()
        keys = [key for key, _ in batch]
        original = dict(batch)
        schema = {
            "type": "object", "additionalProperties": False, "required": ["items"],
            "properties": {"items": {"type": "array", "items": {
                "type": "object", "additionalProperties": False, "required": ["key", "text"],
                "properties": {"key": _enum(keys), "text": {"type": "string"}},
            }}},
        }
        messages = [
            {"role": "system", "content": (
                f"You translate the content-lineage documentation of a bank from {LANGUAGE_NAMES[source]} into {LANGUAGE_NAMES[target]}: "
                "business terms, definitions, business rules and regulatory assessments. Translate every text faithfully in the "
                "professional register of German regulatory reporting (use the established terms, e.g. 'Risikopositionswert' for "
                "'exposure value', 'Kreditumrechnungsfaktor' for 'credit conversion factor', 'risikogewichteter Positionsbetrag' for "
                "'risk-weighted exposure amount', and their English equivalents in the other direction). Keep abbreviations (EAD, RWA, "
                "CCF, CRR), every number exactly as written, regulation references (Article 111(1), Annex I), values in quotes and "
                "anything in [brackets] unchanged. Return every key exactly once."
            )},
            {"role": "user", "content": json.dumps({"items": [{"key": key, "text": text} for key, text in batch]}, ensure_ascii=False)},
        ]
        try:
            answer = llm.json(messages, "translation", schema)
            texts = {item.get("key"): item.get("text") for item in answer.get("items", [])}
            rejected = {key: reason for key in keys if (reason := problems(original[key], texts.get(key)))}
            if rejected:
                retry = messages + [
                    {"role": "assistant", "content": json.dumps(answer, ensure_ascii=False)},
                    {"role": "user", "content": "Return the complete answer again and fix these items (keep numbers and [names] exactly): " + "; ".join(f"{key}: {reason}" for key, reason in list(rejected.items())[:30])},
                ]
                second = llm.json(retry, "translation", schema)
                second_texts = {item.get("key"): item.get("text") for item in second.get("items", [])}
                for key in list(rejected):
                    if not problems(original[key], second_texts.get(key)):
                        texts[key] = second_texts[key]
                        rejected.pop(key)
        except _Cancelled:
            raise
        except Exception as exc:
            job.log("warn", "llm_error", f"Translation into {LANGUAGE_NAMES[target]} failed: {str(exc)[:200]}", step="translate", message=str(exc)[:200])
            with lock:
                kept += len(batch)
            return
        with lock:
            for key in keys:
                if key in rejected:
                    kept += 1
                else:
                    result[key] = str(texts[key]).strip()

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for future in [pool.submit(run, batch) for batch in batches]:
            future.result()
    return result, kept


# --------------------------------------------------------------------------------------------------
# Checks, findings, summary
# --------------------------------------------------------------------------------------------------

def _checks(context: _Context, content: Dict[str, Any], described: Dict[str, Any], regulation: Dict[str, Any], regulation_enabled: bool, translation: Dict[str, Any]) -> List[Dict[str, Any]]:
    checks: List[Dict[str, Any]] = []
    replay = context.replay

    def add(check_id: str, status: str, **params: Any) -> None:
        checks.append({"id": check_id, "status": status, "params": params})

    if replay.get("ok"):
        add("replay", "pass", cells=replay.get("cells_compared", 0))
    else:
        add("replay", "warn", mismatches=replay.get("mismatches", 0), cells=replay.get("cells_compared", 0), columns_match=replay.get("columns_match", True))
    values = sum(item["present"] for item in content["figures"].values())
    attributed = 0
    for figure, item in content["figures"].items():
        attributed += sum(origin["records"] for origin in item["origins"]) if item["origins"] else item["present"]
    add("attribution", "pass" if attributed == values else "warn", values=values, attributed=attributed)
    differences = []
    for figure, item in content["figures"].items():
        if not item["numeric"] or item["total"] is None:
            continue
        total = item["total"]
        sums = {
            "origins": sum(origin["amount"] or 0.0 for origin in item["origins"]) if item["origins"] else total,
            "paths": sum(path["amount"] or 0.0 for path in item["paths"]) + ((item["other_paths"] or {}).get("amount") or 0.0),
            **{f"segment:{dimension}": sum(group["amount"] or 0.0 for group in groups) for dimension, groups in item["segments"].items()},
        }
        for name, value in sums.items():
            if not math.isclose(value, total, rel_tol=1e-9, abs_tol=1e-6):
                differences.append({"figure": figure, "view": name, "value": value, "total": total})
    add("reconciliation", "pass" if not differences else "fail", figures=len(content["figures"]), differences=differences[:5])
    texts = described["texts"]
    unnamed = [column for column in context.scope if column not in texts["terms"]]
    add("terms", "pass" if not unnamed else "warn", total=len(context.scope), named=len(context.scope) - len(unnamed), missing=unnamed[:10])
    cases = [case["id"] for rule in context.rules for case in rule["cases"]]
    undescribed = [case_id for case_id in cases if not texts["rules"].get(context.cases[case_id]["rule"], {}).get("cases", {}).get(case_id, {}).get("description")]
    add("cases", "pass" if not undescribed else "warn", total=len(cases), described=len(cases) - len(undescribed), missing=undescribed[:10])
    numbers = [issue for issue in described["grounding"]["issues"] if issue["code"] == "number_ungrounded"]
    add("numbers", "pass" if not numbers else "warn", issues=len(numbers), corrected=described["grounding"]["corrected"])
    if regulation_enabled:
        links = [link for item in regulation.values() for link in item["links"]]
        dropped = sum(len(item.get("dropped", [])) for item in regulation.values())
        add("quotes", "pass" if not dropped else "warn", links=len(links), verified=sum(1 for link in links if link["quote_status"] == "verified"), corrected=sum(1 for link in links if link["quote_status"] == "corrected"), dropped=dropped)
        reviewed = [item for item in regulation.values() if item.get("review")]
        corrected = [item for item in reviewed if item["review"]["decision"] == "corrected"]
        to_review = [item for item in regulation.values() if item["links"]]
        add("review", "pass" if len(reviewed) == len(to_review) else "warn", assessed=len(to_review), reviewed=len(reviewed), corrected=len(corrected))
    else:
        add("quotes", "skipped")
        add("review", "skipped")
    unmapped = sum(count for (line, column), values in context.unmapped.items() if column in context.derived for count in values.values())
    add("unmapped", "pass" if not unmapped else "warn", records=unmapped)
    missing = {figure: item["missing"] for figure, item in content["figures"].items() if item["missing"]}
    add("complete", "pass" if not missing else "warn", missing=missing)
    if translation.get("languages"):
        add("translation", "pass" if not translation.get("kept") else "warn", languages=translation["languages"], kept=translation.get("kept", 0))
    return checks


def _findings(context: _Context, content: Dict[str, Any], regulation: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []

    def add(code: str, severity: str, **params: Any) -> None:
        findings.append({"id": "", "code": code, "severity": severity, "params": params})

    for rule in context.rules:
        assessment = regulation.get(rule["id"])
        if assessment and assessment["verdict"] in ("deviation", "simplified"):
            add("regulatory_" + assessment["verdict"], "critical" if assessment["verdict"] == "deviation" else "warning", rule=rule["id"], column=rule["column"], references=[link["reference"] for link in assessment["links"]])
    for figure, item in content["figures"].items():
        if item["missing"]:
            add("figure_missing", "critical", column=figure, count=item["missing"], total=item["records"])
    for (line, column), values in context.unmapped.items():
        if column in context.derived:
            rule = context.rule_by_column[column]
            case = context.case_by_write.get((line, column))
            add("unmapped_category", "warning", rule=rule["id"], column=column, case=case["id"] if case else None, key_column=((case or {}).get("lookup") or {}).get("key_column"), values=[{"value": key, "rows": count} for key, count in values.items()])
    for column, entry in content["nulled"].items():
        add("source_not_numeric", "warning", column=column, count=entry["count"], examples=entry["examples"], line=entry["line"])
    for rule in context.rules:
        composition = content["compositions"].get(rule["column"])
        if composition and composition["delivered"]["records"] and composition["derived"]:
            add("mixed_provenance", "info", rule=rule["id"], column=rule["column"], delivered=composition["delivered"]["records"], derived=composition["derived"])
    for item in context.filters:
        add("filter", "info", line=item["line"], rows=item["rows_removed"], code=item["code"][:200])
    for rule in context.rules:
        assessment = regulation.get(rule["id"])
        if assessment is not None and assessment["verdict"] in ("not_covered", "unverified"):
            add("no_regulatory_basis", "info", rule=rule["id"], column=rule["column"], verdict=assessment["verdict"])
    order = {"critical": 0, "warning": 1, "info": 2}
    findings.sort(key=lambda item: order[item["severity"]])
    for index, item in enumerate(findings, start=1):
        item["id"] = f"F{index:02d}"
    return findings


def _summary(context: _Context, content: Dict[str, Any], regulation: Dict[str, Any], findings: List[Dict[str, Any]], checks: List[Dict[str, Any]]) -> Dict[str, Any]:
    verdicts = {verdict: 0 for verdict in (*VERDICTS, "unverified")}
    for item in regulation.values():
        verdicts[item["verdict"]] = verdicts.get(item["verdict"], 0) + 1
    present = sum(item["present"] for item in content["figures"].values())
    delivered = 0
    for figure, item in content["figures"].items():
        delivered += next((origin["records"] for origin in item["origins"] if origin["origin"] == "delivered"), 0)
    return {
        "figures": len(context.figures),
        "figure_names": context.figures,
        "terms": len(context.scope),
        "sources": sum(1 for name in context.scope if name not in context.derived),
        "concepts": sum(1 for name in context.derived if name not in context.figures),
        "rules": len(context.rules),
        "cases": sum(len(rule["cases"]) for rule in context.rules),
        "records": len(context.final) if context.final is not None else 0,
        "paths": sum(len(item["paths"]) + ((item["other_paths"] or {}).get("count") or 0) for item in content["figures"].values()),
        "derived_pct": round(100 * (present - delivered) / present) if present else None,
        "provisions": len({(link["regulation_id"], link["unit"], link["reference"]) for item in regulation.values() for link in item["links"]}),
        "verdicts": verdicts,
        "findings": {severity: sum(1 for item in findings if item["severity"] == severity) for severity in ("critical", "warning", "info")},
        "checks": {status: sum(1 for item in checks if item["status"] == status) for status in ("pass", "warn", "fail", "skipped")},
        "replay_ok": bool(context.replay.get("ok")),
    }


# --------------------------------------------------------------------------------------------------
# Pipeline
# --------------------------------------------------------------------------------------------------

def _without_texts(assessment: Dict[str, Any]) -> Dict[str, Any]:
    stripped = {key: value for key, value in assessment.items() if key != "explanation"}
    stripped["links"] = [{key: value for key, value in link.items() if key != "explanation"} for link in assessment["links"]]
    stripped["findings"] = [{key: value for key, value in finding.items() if key != "explanation"} for finding in assessment["findings"]]
    return stripped


def _run_job(job: _Job) -> None:
    time.sleep(0.2)  # let the start request's response go out first
    context = _Context()
    context.language = job.state["language"]
    try:
        _load(job, context)
        job.check()
        _analyse(job, context)
        _trace(job, context)
        job.save(force=True)
        job.check()
        _compose(job, context, job.state["settings"]["figures"])
        content = _content(job, context)
        terms = _terms(context, content)
        with job.lock:
            job.state["settings"]["figures_traced"] = context.figures
        job.save(force=True)
        job.check()

        llm = _LLM(job)
        job.set_model(llm.model)
        job.log("info", "model", f"Model: {llm.model} · temperature 0 · JSON-schema output", model=llm.model)
        described = _describe(job, llm, context, terms)
        job.save(force=True)
        job.check()

        regulation: Dict[str, Any] = {}
        regulation_ids = job.state["settings"]["regulation_ids"]
        documents: List[Dict[str, Any]] = []
        regulation_enabled = False
        skipped_reason: Optional[str] = None
        if regulation_ids:
            job.stage("regulate")
            try:
                sources = rm._regulation_sources(regulation_ids)
            except HTTPException as exc:
                sources = []
                skipped_reason = str(exc.detail)
                job.log("warn", "regulation_skipped", f"Regulatory step skipped: {exc.detail}", reason="unavailable", message=str(exc.detail))
            if sources:
                regulation_enabled = True
                documents = [{"id": source["id"], "short": source["short"], "title": source["document"].get("document_title"), "filename": source["document"].get("filename")} for source in sources]
                job.progress(rules_regulated=0, provisions_linked=0)
                job.log("info", "regulating", f"Looking for the regulatory basis of {len(context.rules)} business rules in {', '.join(source['short'] for source in sources)}", rules=len(context.rules), regulations=[source["short"] for source in sources])

                def regulate(rule: Dict[str, Any]) -> Tuple[str, Optional[Dict[str, Any]]]:
                    try:
                        return rule["id"], _regulate_rule(job, llm, context, rule, described["texts"], described["queries"].get(rule["id"], []), sources, described["framework"])
                    except _Cancelled:
                        raise
                    except Exception as exc:
                        traceback.print_exc()
                        job.log("warn", "llm_error", f"{rule['id']}: regulatory step failed: {str(exc)[:200]}", step="regulate", rule=rule["id"], message=str(exc)[:200])
                        return rule["id"], None

                with ThreadPoolExecutor(max_workers=WORKERS) as pool:
                    for rule_id, assessment in [future.result() for future in [pool.submit(regulate, rule) for rule in context.rules]]:
                        if assessment is not None:
                            regulation[rule_id] = assessment
                job.save(force=True)
                job.check()
                to_review = [rule for rule in context.rules if regulation.get(rule["id"], {}).get("links")]
                if to_review:
                    job.stage("review")
                    job.progress(rules_reviewed=0, rules_to_review=len(to_review))
                    job.log("info", "reviewing", f"Second reviewer checks {len(to_review)} regulatory assessment(s)", count=len(to_review))

                    def review(rule: Dict[str, Any]) -> None:
                        try:
                            _review_rule(job, llm, context, rule, described["texts"], regulation[rule["id"]], described["framework"])
                        except _Cancelled:
                            raise
                        except Exception as exc:
                            job.log("warn", "llm_error", f"{rule['id']}: review failed: {str(exc)[:200]}", step="review", rule=rule["id"], message=str(exc)[:200])

                    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
                        for future in [pool.submit(review, rule) for rule in to_review]:
                            future.result()
        else:
            skipped_reason = "none_selected"
            job.log("info", "regulation_skipped", "Regulatory step skipped: no indexed regulation selected.", reason="none_selected")
        job.check()

        # Every AI text in English and German.
        job.stage("translate")
        original = dict(described["texts"])
        items = _text_items(original, regulation)
        texts_by_language = {context.language: _texts_from({}, original, regulation)}
        translation = {"languages": [], "kept": 0}
        for target in [code for code in TEXT_LANGUAGES if code != context.language]:
            job.log("info", "translating", f"Translating {len(items)} AI texts into {LANGUAGE_NAMES[target]}", language=target.upper(), count=len(items))
            translated, kept = _translate(job, llm, items, context.language, target, list(context.scope))
            texts_by_language[target] = _texts_from(translated, original, regulation)
            translation["languages"].append(target)
            translation["kept"] += kept
            job.log("success", "translated", f"AI texts available in {LANGUAGE_NAMES[target]} ({len(translated)} texts; {kept} kept in the original wording)", language=target.upper(), count=len(translated), kept=kept)
        job.check()

        job.stage("assemble")
        checks = _checks(context, content, described, regulation, regulation_enabled, translation)
        findings = _findings(context, content, regulation)
        summary = _summary(context, content, regulation, findings, checks)
        result = {
            "code": {"filename": job.state["source"]["code_filename"], "lines": context.lines, "line_count": len(context.lines)},
            "scope": {"figures": context.figures, "identifier": context.identifier, "dimensions": context.dimensions, "records": summary["records"]},
            "terms": terms,
            "rules": context.rules,
            "filters": context.filters,
            "figures": content["figures"],
            "records": content["records"],
            "replay": context.replay,
            "regulation": {
                "enabled": regulation_enabled,
                "skipped": None if regulation_enabled else skipped_reason,
                "documents": documents,
                # The explanations are AI texts: they live in ai.texts, in every language.
                "rules": {rule_id: _without_texts(assessment) for rule_id, assessment in regulation.items()},
            },
            "ai": {
                "language": context.language,
                "texts": texts_by_language,
                "grounding": described["grounding"],
                "translation": translation,
            },
            "checks": checks,
            "findings": findings,
        }
        with job.lock:
            job.state["result"] = result
            job.state["summary"] = summary
            job.state["status"] = "completed"
        job.log(
            "success", "completed",
            f"Content lineage complete: {summary['figures']} reported figure(s), {summary['terms']} business terms, {summary['rules']} rules, {summary['provisions']} provision(s) linked",
            figures=summary["figures"], terms=summary["terms"], rules=summary["rules"], provisions=summary["provisions"],
        )
    except _Cancelled:
        with job.lock:
            job.state["status"] = "cancelled"
        job.log("warn", "cancelled", "Run cancelled.")
    except HTTPException as exc:
        with job.lock:
            job.state.update(status="failed", error=str(exc.detail))
        job.log("error", "failed", str(exc.detail), message=str(exc.detail))
    except Exception as exc:
        traceback.print_exc()
        with job.lock:
            job.state.update(status="failed", error=str(exc)[:500])
        job.log("error", "failed", f"Run failed: {str(exc)[:300]}", message=str(exc)[:300])
    finally:
        with job.lock:
            job.state["finished_at"] = _now()
            job.state["duration_ms"] = int((time.monotonic() - job.started) * 1000)
            job.state["stage"] = "finished"
        job.save(force=True)
        with _JOBS_LOCK:
            _JOBS.pop(job.state["id"], None)


# --------------------------------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------------------------------

class RunRequest(BaseModel):
    execution_id: str
    figures: List[str] = []
    regulation_ids: List[str] = []
    language: str = "en"


def _regulation_documents() -> List[Dict[str, Any]]:
    documents = []
    for document in runtime._platform("list_regulation_documents")():
        documents.append({
            "id": str(document.get("id")),
            "filename": document.get("filename"),
            "short": rm._short_name(document),
            "title": document.get("document_title"),
            "status": document.get("index_status"),
            "ready": document.get("index_status") == "ready" and document.get("index_version") == rt.INDEX_VERSION,
            "articles": document.get("article_count"),
            "pages": document.get("page_count"),
            "semantic": bool(document.get("semantic")),
            "language": document.get("language"),
        })
    return documents


@router.get("/sources")
def list_sources():
    executions = tla.list_sources()
    return {
        "clusters": executions["clusters"],
        "regulations": _regulation_documents(),
        "model": _configured_model(),
        "llm_configured": tla._llm_configured(),
    }


@router.get("/preview")
def preview(execution_id: str):
    """What the agent would trace for an execution: the derived output columns and the default reported figures."""
    stored = tla._stored_execution(execution_id)
    code = tla._code_text(stored["code_id"])
    prepared = runtime._platform("prepare_user_code")(code)
    frame, _metadata, _table = runtime._platform("load_execution_input")(stored["dataset_id"], stored.get("table_id"))
    try:
        analysis = la.analyse(prepared, [str(column) for column in frame.columns])
    except la.LineageError as exc:
        raise HTTPException(400, str(exc)) from exc
    stored_rows = stored.get("data") or []
    result_frame = pd.DataFrame(stored_rows) if stored_rows else frame
    numeric = _numeric_columns(result_frame)
    derived, figures = default_figures(analysis, numeric)
    columns = {item["name"]: item for item in analysis["columns"]}
    code_meta = tla._code_meta(stored["code_id"])
    lines = code.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return {
        "execution_id": execution_id,
        "code": {"filename": code_meta.get("filename"), "line_count": len(lines)},
        "rows": len(stored_rows) if stored_rows else len(frame),
        "inputs": [str(column) for column in frame.columns],
        "derived": [
            {
                "column": name,
                "numeric": name in numeric,
                "depth": columns[name]["depth"],
                "upstream": len(columns[name]["sources"]),
                "used_by": [other for other in columns[name]["downstream"] if other in derived],
                "default": name in figures,
            }
            for name in derived
        ],
        "figures": figures,
    }


@router.post("/runs")
def start_run(request: RunRequest):
    execution_id = (request.execution_id or "").strip()
    stored = tla._stored_execution(execution_id)
    if not tla._llm_configured():
        raise HTTPException(503, "OpenAI is not configured. Set OPENAI_API_KEY, or AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.")
    regulation_ids = list(dict.fromkeys(str(item) for item in request.regulation_ids if str(item).strip()))
    if regulation_ids:
        rm._ready_regulations(regulation_ids)
    with _JOBS_LOCK:
        if len(_JOBS) >= MAX_ACTIVE_RUNS:
            raise HTTPException(409, "Two content lineage runs are already in progress. Wait for one to finish or cancel it.")
        if any(job.state["source"]["execution_id"] == execution_id for job in _JOBS.values()):
            raise HTTPException(409, "This execution is already being analysed.")
    code = tla._code_text(stored["code_id"])
    code_meta = tla._code_meta(stored["code_id"])
    meta = tla._dataset_meta(stored["dataset_id"])
    cluster = None
    executed_date = None
    for candidate in db.get_all_clusters():
        for execution in db.get_cluster_executions(candidate["id"]):
            if execution.get("execution_id") == execution_id:
                cluster, executed_date = candidate, execution.get("executed_date")
                break
        if cluster:
            break
    language = request.language if request.language in LANGUAGE_NAMES else "en"
    summary = stored.get("summary") or {}
    figures = list(dict.fromkeys(str(item) for item in request.figures if str(item).strip()))[:MAX_FIGURES]
    run_id = str(uuid.uuid4())
    state = {
        "id": run_id,
        "status": "running",
        "stage": "queued",
        "created_at": _now(),
        "finished_at": None,
        "duration_ms": None,
        "language": language,
        "model": None,
        "usage": {"llm_calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "tool_calls": 0},
        "source": {
            "execution_id": execution_id,
            "executed_date": executed_date,
            "cluster_id": (cluster or {}).get("id"),
            "cluster_name": (cluster or {}).get("name"),
            "reporting_date": (cluster or {}).get("reporting_date"),
            "dataset_id": stored["dataset_id"],
            "dataset_name": meta.get("user_name") or (cluster or {}).get("dataset_name") or meta.get("filename"),
            "dataset_file": meta.get("filename"),
            "table_id": stored.get("table_id"),
            "code_id": stored["code_id"],
            "code_filename": code_meta.get("filename") or (cluster or {}).get("code_filename") or "script.py",
            "code_lines": len(code.rstrip("\n").split("\n")),
            "rows": summary.get("rows_processed"),
        },
        "settings": {"figures": figures, "figures_traced": [], "regulation_ids": regulation_ids, "record_rows": RECORD_ROWS},
        "progress": {"rules_total": 0, "rules_described": 0, "rules_regulated": 0, "provisions_linked": 0, "rules_reviewed": 0, "rules_to_review": 0},
        "summary": None,
        "result": None,
        "log": [],
        "error": None,
    }
    job = _Job(state)
    job.log("info", "run_started", f"Run started for execution {execution_id[:8]} of {state['source']['cluster_name'] or 'unknown cluster'}", execution=execution_id[:8], cluster=state["source"]["cluster_name"] or "")
    with _JOBS_LOCK:
        _JOBS[run_id] = job
    job.save(force=True)
    threading.Thread(target=_run_job, args=(job,), name=f"content-lineage-{run_id[:8]}", daemon=True).start()
    return job.snapshot(lite=True)


@router.get("/runs")
def list_runs():
    runs = []
    if RUNS_DIR.exists():
        for path in sorted(RUNS_DIR.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True)[:40]:
            try:
                state = _read_run(path.stem)
            except (HTTPException, OSError, json.JSONDecodeError):
                continue
            runs.append({key: state.get(key) for key in ("id", "status", "created_at", "finished_at", "duration_ms", "model", "language", "source", "settings", "summary")})
    runs.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return {"runs": runs}


@router.get("/runs/{run_id}")
def get_run(run_id: str, lite: bool = False):
    job = _JOBS.get(run_id)
    if job is not None:
        return job.snapshot(lite=lite)
    state = _read_run(run_id)
    if lite:
        state.pop("result", None)
    return state


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: str):
    job = _JOBS.get(run_id)
    if job is None:
        raise HTTPException(404, "This run is not in progress.")
    job.cancel.set()
    job.log("warn", "cancel_requested", "Cancellation requested.")
    return {"id": run_id, "status": "cancelling"}


@router.delete("/runs/{run_id}")
def delete_run(run_id: str):
    if run_id in _JOBS:
        raise HTTPException(409, "Cancel the run before deleting it.")
    path = _run_path(run_id)
    if not path.exists():
        raise HTTPException(404, "Run not found")
    path.unlink()
    return {"id": run_id, "deleted": True}


# --------------------------------------------------------------------------------------------------
# Excel export
# --------------------------------------------------------------------------------------------------

_EXPORT: Dict[str, Dict[str, Any]] = {
    "en": {
        "sheets": ("Summary", "Business glossary", "Rules and cases", "Content paths", "Segments", "Regulatory basis", "Records", "Checks"),
        "title": "Content lineage",
        "summary": {
            "cluster": "Cluster", "execution": "Execution", "code": "Code", "dataset": "Dataset", "created": "Started (UTC)",
            "model": "Model", "language": "Language of the texts", "figures": "Reported figures", "domain": "Domain",
            "summary": "Summary", "terms": "Business terms", "rules": "Business rules", "cases": "Cases", "records": "Records",
            "provisions": "Provisions linked", "verdicts": "Regulatory assessment",
        },
        "glossary": ("Business term", "Column", "Kind", "Definition", "Rule", "Filled", "Delivered by source", "Derived", "Missing"),
        "rules": ("Rule", "Business rule", "Derives", "Statement", "Case", "Case label", "Description", "Condition (code)", "Formula (code)", "Line", "Parameter", "Records", "Amount", "Regulatory verdict"),
        "paths": ("Reported figure", "Content path", "Records", "Amount", "Share (%)", "Example records"),
        "segments": ("Reported figure", "Segment", "Value", "Records", "Missing", "Amount", "Share (%)"),
        "regulation": ("Rule", "Business rule", "Verdict", "Assessment", "Regulation", "Provision", "Title", "Page", "Relation", "Quote (verified)", "Why it applies", "Review"),
        "findings": ("Rule", "Case", "Category", "Verdict", "Provision", "Explanation"),
        "records": ("Record",),
        "checks": ("Check", "Status", "Details"),
        "kinds": {"figure": "Reported figure", "concept": "Business concept", "source": "Source data element"},
        "delivered": "Delivered by source",
        "verdicts": {"consistent": "Consistent", "simplified": "Simplified", "deviation": "Deviation", "not_covered": "No regulatory basis", "unverified": "Not verified"},
        "relations": {"defines": "Defines the term", "prescribes": "Prescribes the rule", "related": "Related"},
        "review": {"confirmed": "Confirmed by second reviewer", "corrected": "Corrected by second reviewer"},
        "status": {"pass": "Pass", "warn": "Warning", "fail": "Fail", "skipped": "Skipped"},
        "checks_names": {
            "replay": "Replay reproduces the stored execution", "attribution": "Every reported value attributed", "reconciliation": "Breakdowns reconcile to the totals",
            "terms": "Every term named and defined", "cases": "Every case described", "numbers": "Numbers in rule texts are parameters of the code",
            "quotes": "Regulatory quotes verbatim", "review": "Assessments reviewed (four eyes)", "unmapped": "Every category has a parameter",
            "complete": "Reported figures complete", "translation": "Texts translated",
        },
        "yes": "yes", "no": "no",
    },
    "de": {
        "sheets": ("Zusammenfassung", "Fachliches Glossar", "Regeln und Fälle", "Inhaltspfade", "Segmente", "Regulatorische Grundlage", "Datensätze", "Prüfungen"),
        "title": "Inhalts-Herkunft",
        "summary": {
            "cluster": "Cluster", "execution": "Ausführung", "code": "Code", "dataset": "Datensatz", "created": "Gestartet (UTC)",
            "model": "Modell", "language": "Sprache der Texte", "figures": "Meldegrößen", "domain": "Fachgebiet",
            "summary": "Zusammenfassung", "terms": "Fachbegriffe", "rules": "Fachliche Regeln", "cases": "Fälle", "records": "Datensätze",
            "provisions": "Verknüpfte Vorschriften", "verdicts": "Regulatorische Bewertung",
        },
        "glossary": ("Fachbegriff", "Spalte", "Art", "Definition", "Regel", "Befüllt", "Von der Quelle geliefert", "Abgeleitet", "Fehlend"),
        "rules": ("Regel", "Fachliche Regel", "Leitet ab", "Aussage", "Fall", "Fallbezeichnung", "Beschreibung", "Bedingung (Code)", "Formel (Code)", "Zeile", "Parameter", "Datensätze", "Betrag", "Regulatorische Bewertung"),
        "paths": ("Meldegröße", "Inhaltspfad", "Datensätze", "Betrag", "Anteil (%)", "Beispieldatensätze"),
        "segments": ("Meldegröße", "Segment", "Wert", "Datensätze", "Fehlend", "Betrag", "Anteil (%)"),
        "regulation": ("Regel", "Fachliche Regel", "Bewertung", "Begründung", "Regulierung", "Vorschrift", "Titel", "Seite", "Bezug", "Zitat (verifiziert)", "Warum sie gilt", "Prüfung"),
        "findings": ("Regel", "Fall", "Kategorie", "Bewertung", "Vorschrift", "Erläuterung"),
        "records": ("Datensatz",),
        "checks": ("Prüfung", "Status", "Details"),
        "kinds": {"figure": "Meldegröße", "concept": "Fachlicher Begriff", "source": "Quelldatenelement"},
        "delivered": "Von der Quelle geliefert",
        "verdicts": {"consistent": "Konform", "simplified": "Vereinfacht", "deviation": "Abweichung", "not_covered": "Keine regulatorische Grundlage", "unverified": "Nicht verifiziert"},
        "relations": {"defines": "Definiert den Begriff", "prescribes": "Schreibt die Regel vor", "related": "Bezug"},
        "review": {"confirmed": "Vom Zweitprüfer bestätigt", "corrected": "Vom Zweitprüfer korrigiert"},
        "status": {"pass": "Bestanden", "warn": "Warnung", "fail": "Nicht bestanden", "skipped": "Übersprungen"},
        "checks_names": {
            "replay": "Wiederholung reproduziert die gespeicherte Ausführung", "attribution": "Jeder gemeldete Wert zugeordnet", "reconciliation": "Aufschlüsselungen stimmen mit den Summen überein",
            "terms": "Jeder Begriff benannt und definiert", "cases": "Jeder Fall beschrieben", "numbers": "Zahlen in Regeltexten sind Parameter des Codes",
            "quotes": "Regulatorische Zitate wörtlich", "review": "Bewertungen geprüft (Vier-Augen)", "unmapped": "Jede Kategorie hat einen Parameter",
            "complete": "Meldegrößen vollständig", "translation": "Texte übersetzt",
        },
        "yes": "ja", "no": "nein",
    },
}


def _labels(state: Dict[str, Any], language: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    result = state.get("result") or {}
    ai = result.get("ai") or {}
    texts = (ai.get("texts") or {}).get(language) or (ai.get("texts") or {}).get(ai.get("language") or "en") or {}
    return _EXPORT[language], texts


def _token_label(token: str, result: Dict[str, Any], texts: Dict[str, Any], words: Dict[str, Any]) -> str:
    if token.endswith("|delivered"):
        column = token[: -len("|delivered")]
        name = (texts.get("terms", {}).get(column) or {}).get("name") or column
        return f"{name}: {words['delivered']}"
    case_id, _, key = token.partition("|")
    rule_id = case_id.split(".")[0]
    rule = next((item for item in result.get("rules", []) if item["id"] == rule_id), None)
    column = rule["column"] if rule else rule_id
    name = (texts.get("terms", {}).get(column) or {}).get("name") or column
    label = ((texts.get("rules", {}).get(rule_id) or {}).get("cases", {}).get(case_id) or {}).get("label") or case_id
    return f"{name}: {label}" + (f" [{key}]" if key else "")


@router.get("/runs/{run_id}/export")
def export_run(run_id: str, language: str = "en"):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    language = language if language in _EXPORT else "en"
    state = _read_run(run_id)
    result = state.get("result")
    if state.get("status") != "completed" or not result:
        raise HTTPException(409, "Only completed runs can be exported.")
    words, texts = _labels(state, language)
    terms_text = texts.get("terms", {})
    rules_text = texts.get("rules", {})
    regulation_text = texts.get("regulation", {})
    workbook = Workbook()
    header_fill = PatternFill("solid", fgColor="1F2937")
    header_font = Font(bold=True, color="F5C400")
    wrap = Alignment(vertical="top", wrap_text=True)

    def sheet(title: str, headers: Iterable[str], widths: List[int], first: bool = False) -> Any:
        target = workbook.active if first else workbook.create_sheet()
        target.title = title[:31]
        target.append(list(headers))
        for index, cell in enumerate(target[1], start=1):
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = wrap
            target.column_dimensions[cell.column_letter].width = widths[index - 1] if index - 1 < len(widths) else 18
        target.freeze_panes = "A2"
        return target

    def finish(target: Any) -> None:
        for row in target.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = wrap

    def term_name(column: str) -> str:
        return (terms_text.get(column) or {}).get("name") or column

    summary = state.get("summary") or {}
    source = state.get("source") or {}
    overview = sheet(words["sheets"][0], [words["title"], ""], [32, 110], first=True)
    regulation_rules = (result.get("regulation") or {}).get("rules") or {}
    verdict_counts = ", ".join(f"{words['verdicts'][verdict]}: {count}" for verdict, count in (summary.get("verdicts") or {}).items() if count)
    for key, value in (
        ("cluster", source.get("cluster_name")), ("execution", source.get("execution_id")), ("code", source.get("code_filename")),
        ("dataset", source.get("dataset_name")), ("created", state.get("created_at")), ("model", state.get("model")),
        ("language", language.upper()), ("figures", ", ".join(term_name(name) for name in result["scope"]["figures"])),
        ("domain", texts.get("domain")), ("summary", texts.get("summary")), ("terms", summary.get("terms")), ("rules", summary.get("rules")),
        ("cases", summary.get("cases")), ("records", summary.get("records")), ("provisions", summary.get("provisions")), ("verdicts", verdict_counts or "–"),
    ):
        overview.append([words["summary"][key], value])
    finish(overview)

    glossary = sheet(words["sheets"][1], words["glossary"], [30, 22, 20, 70, 10, 12, 18, 12, 10])
    for term in result["terms"]:
        composition = term.get("composition") or {}
        profile = term.get("profile") or {}
        glossary.append([
            term_name(term["column"]), term["column"], words["kinds"][term["kind"]], (terms_text.get(term["column"]) or {}).get("definition", ""),
            term.get("rule") or "", f"{profile.get('non_null', 0)}/{profile.get('total', 0)}",
            (composition.get("delivered") or {}).get("records", "" if not composition else 0), composition.get("derived", ""), composition.get("missing", ""),
        ])
    finish(glossary)

    rules_sheet = sheet(words["sheets"][2], words["rules"], [8, 30, 26, 60, 8, 26, 60, 40, 40, 8, 30, 10, 16, 20])
    for rule in result["rules"]:
        rule_text = rules_text.get(rule["id"]) or {}
        verdict = (regulation_rules.get(rule["id"]) or {}).get("verdict")
        for case in rule["cases"]:
            case_text = (rule_text.get("cases") or {}).get(case["id"]) or {}
            parameter = "; ".join(f"{item['key']} → {_key_text(item['value']) if item['value'] is not None else '∅'}" for item in case.get("keys") or [] if item.get("mapped"))
            rules_sheet.append([
                rule["id"], rule_text.get("name", ""), term_name(rule["column"]), rule_text.get("statement", ""), case["id"],
                case_text.get("label", ""), case_text.get("description", ""), _plain(case.get("condition")), _plain(case.get("formula")),
                case["line"], parameter, case.get("records"), case.get("amount"), words["verdicts"].get(verdict, "") if verdict else "",
            ])
    finish(rules_sheet)

    paths_sheet = sheet(words["sheets"][3], words["paths"], [26, 100, 10, 16, 10, 24])
    record_ids = {item["label"]: item.get("id") or item["label"] for item in (result.get("records") or {}).get("items") or []}
    segments_sheet = sheet(words["sheets"][4], words["segments"], [26, 24, 28, 10, 10, 16, 10])
    for figure, item in result["figures"].items():
        total = item.get("total") or 0.0
        for path in item["paths"]:
            share = round(100 * (path["amount"] or 0.0) / total, 2) if item["numeric"] and total else round(100 * path["records"] / max(1, item["present"]), 2)
            paths_sheet.append([term_name(figure), " → ".join(_token_label(token, result, texts, words) for token in path["tokens"]), path["records"], path["amount"], share, ", ".join(str(record_ids.get(label, label)) for label in path.get("examples") or [])])
        for dimension, groups in item["segments"].items():
            for group in groups:
                share = round(100 * (group["amount"] or 0.0) / total, 2) if item["numeric"] and total else round(100 * group["records"] / max(1, item["records"]), 2)
                segments_sheet.append([term_name(figure), term_name(dimension), group["value"], group["records"], group["missing"], group["amount"], share])
    finish(paths_sheet)
    finish(segments_sheet)

    regulation_sheet = sheet(words["sheets"][5], words["regulation"], [8, 30, 18, 60, 10, 20, 34, 8, 20, 70, 50, 26])
    for rule in result["rules"]:
        assessment = regulation_rules.get(rule["id"])
        if not assessment:
            continue
        reg_text = regulation_text.get(rule["id"]) or {}
        review = assessment.get("review") or {}
        review_label = words["review"].get(review.get("decision"), "") if review else ""
        links = assessment.get("links") or []
        base = [rule["id"], (rules_text.get(rule["id"]) or {}).get("name", ""), words["verdicts"].get(assessment["verdict"], assessment["verdict"]), reg_text.get("explanation", "")]
        if not links:
            regulation_sheet.append([*base, "", "", "", "", "", "", "", review_label])
        link_texts = reg_text.get("links") or []
        for index, link in enumerate(links):
            explanation = link_texts[index] if index < len(link_texts) else ""
            regulation_sheet.append([*base, link["regulation"], link["reference"], link["title"], link["page_label"], words["relations"].get(link["relation"], link["relation"]), link["quote"], explanation, review_label])
    if any((assessment.get("findings") for assessment in regulation_rules.values())):
        regulation_sheet.append([])
        regulation_sheet.append(list(words["findings"]))
        for cell in regulation_sheet[regulation_sheet.max_row]:
            cell.fill = header_fill
            cell.font = header_font
        for rule in result["rules"]:
            assessment = regulation_rules.get(rule["id"])
            if not assessment:
                continue
            explanations = (regulation_text.get(rule["id"]) or {}).get("findings") or []
            for index, finding in enumerate(assessment.get("findings") or []):
                link = (assessment.get("links") or [])[finding["link"]] if finding["link"] < len(assessment.get("links") or []) else {}
                case_label = ((rules_text.get(rule["id"]) or {}).get("cases", {}).get(finding.get("case") or "", {}) or {}).get("label", finding.get("case") or "")
                regulation_sheet.append([rule["id"], case_label, finding.get("key") or "", words["verdicts"].get(finding["verdict"], finding["verdict"]), link.get("reference", ""), explanations[index] if index < len(explanations) else ""])
    finish(regulation_sheet)

    records = result.get("records") or {}
    columns = records.get("columns") or []
    record_sheet = sheet(words["sheets"][6], [records.get("identifier") or words["records"][0], *[term_name(column) for column in columns]], [20, *[18] * len(columns)])
    for item in records.get("items") or []:
        record_sheet.append([item.get("id") or item["label"], *[item["values"].get(column) for column in columns]])
    finish(record_sheet)

    checks_sheet = sheet(words["sheets"][7], words["checks"], [52, 14, 90])
    for check in result.get("checks") or []:
        checks_sheet.append([words["checks_names"].get(check["id"], check["id"]), words["status"].get(check["status"], check["status"]), json.dumps(check.get("params") or {}, ensure_ascii=False, default=str)])
    finish(checks_sheet)

    buffer = BytesIO()
    workbook.save(buffer)
    stem = re.sub(r"[^\w.-]+", "_", Path(str(source.get("code_filename") or "content")).stem)[:40]
    filename = f"content-lineage-{stem}-{language}.xlsx"
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
