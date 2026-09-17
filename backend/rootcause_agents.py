"""LangGraph-backed RootCause AI agents pipeline.

This module intentionally stays separate from ``main.py`` and powers only
``/api/rootcause/agents/analyze``. The normal RootCause endpoint continues to
use its own implementation.
"""
from __future__ import annotations

import ast
import json
import math
import os
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, TypedDict

import openpyxl
from langgraph.graph import END, START, StateGraph

import database as db


RESULTS_DIR = Path(os.environ.get("RESULTS_DIR", str(Path(__file__).parent / "results")))
CODE_DIR = Path(os.environ.get("CODE_DIR", str(Path(__file__).parent / "uploads" / "code")))
RELEASE_NOTES_DIR = Path(
    os.environ.get("RELEASE_NOTES_DIR", str(Path(__file__).parent / "uploads" / "release_notes"))
)


class AgentState(TypedDict, total=False):
    execution_a: Dict[str, Any]
    execution_b: Dict[str, Any]
    output_column: str
    position: Optional[str]
    comparison: Dict[str, Any]
    lineage: Dict[str, Any]
    input_changes: List[Dict[str, Any]]
    release_notes: List[Dict[str, Any]]
    verification: List[Dict[str, Any]]
    warnings: List[str]
    position_release_notes: Dict[str, List[Dict[str, Any]]]
    hypotheses: List[Dict[str, Any]]
    scored_hypotheses: List[Dict[str, Any]]
    counterfactuals: List[Dict[str, Any]]
    rejected_release_notes: List[Dict[str, Any]]
    final_decision: Dict[str, Any]
    merged_evidence: Dict[str, Any]
    llm_report: Dict[str, Any]
    stages: List[Dict[str, Any]]


def _load_execution(execution_id: str) -> Dict[str, Any]:
    path = RESULTS_DIR / f"{execution_id}.json"
    if not path.exists():
        raise ValueError(f"Execution {execution_id} not found")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Execution {execution_id} is invalid") from exc


def _safe_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(key): _safe_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_safe_value(item) for item in value]
    try:
        return value.item()
    except AttributeError:
        return str(value)


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, set):
        return sorted(_json_safe(item) for item in value)
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return _safe_value(value)


def _value_text(value: Any) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "not available"
    return str(value)


def _values_equal(left: Any, right: Any) -> bool:
    if left is None and right is None:
        return True
    try:
        return math.isclose(float(left), float(right), rel_tol=1e-12, abs_tol=1e-12)
    except (TypeError, ValueError):
        return str(left).strip().casefold() == str(right).strip().casefold()


def _numeric_difference(left: Any, right: Any) -> Optional[float]:
    try:
        return float(right) - float(left)
    except (TypeError, ValueError):
        return None


def _as_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        number = float(str(value).replace(",", "."))
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _position_map(rows: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    rows = list(rows)
    position_key = next(
        (key for key in (rows[0].keys() if rows else []) if str(key).strip().casefold() == "position"),
        None,
    )
    if position_key:
        return {str(row.get(position_key)): row for row in rows if row.get(position_key) is not None}
    return {str(index): row for index, row in enumerate(rows)}


def _common_columns(result_a: Dict[str, Any], result_b: Dict[str, Any]) -> List[str]:
    columns_a = result_a.get("summary", {}).get("columns", [])
    columns_b = result_b.get("summary", {}).get("columns", [])
    return [column for column in columns_a if column in columns_b]


def _key_column(columns: List[str]) -> Optional[str]:
    candidates = ["ID", "Id", "id", "KEY", "Key", "key", "INDEX", "Index", "index", "Position", "position", "POSITION"]
    return next((candidate for candidate in candidates if candidate in columns), columns[0] if columns else None)


def _comparison_sort_key(value: str) -> tuple[bool, Any]:
    text = str(value)
    numeric = text.replace(".", "", 1).replace("-", "", 1).isdigit()
    return numeric, float(text) if numeric else text


def _append_stage(state: AgentState, agent: str, status: str, findings: Dict[str, Any]) -> None:
    stages = list(state.get("stages", []))
    stages.append({"agent": agent, "status": status, "findings": _json_safe(findings)})
    state["stages"] = stages


def _input_rows(dataset_id: Optional[str]) -> List[Dict[str, Any]]:
    if not dataset_id:
        return []
    metadata = db.get_dataset_metadata(dataset_id) or {}
    tables = metadata.get("tables") or []
    if not tables:
        return []
    frame = db.get_table_data(metadata.get("user_name", ""), tables[0].get("id"), "input_data")
    return frame.to_dict(orient="records") if frame is not None and not frame.empty else []


def _code_for_execution(execution: Dict[str, Any]) -> str:
    code_id = execution.get("code_id")
    path = CODE_DIR / f"{code_id}.py"
    return path.read_text(encoding="utf-8") if code_id and path.exists() else ""


def _lineage_from_code(code: str, output_column: str) -> Dict[str, Set[str]]:
    graph: Dict[str, Set[str]] = {}
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return graph

    def column(node: ast.AST) -> Optional[str]:
        if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name) and node.value.id == "df":
            slice_node = node.slice
            if isinstance(slice_node, ast.Constant) and isinstance(slice_node.value, str):
                return slice_node.value
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id == "df":
            return node.attr
        return None

    class Visitor(ast.NodeVisitor):
        def visit_Assign(self, node: ast.Assign) -> None:
            outputs = [column(target) for target in node.targets]
            outputs = [item for item in outputs if item]
            for output in outputs:
                inputs: Set[str] = set()
                for child in ast.walk(node.value):
                    name = column(child)
                    if name and name != output:
                        inputs.add(name)
                if inputs:
                    graph.setdefault(output, set()).update(inputs)
            self.generic_visit(node)

    Visitor().visit(tree)
    if output_column not in graph:
        graph.setdefault(output_column, set())
    return graph


def _ordered_lineage(graph: Dict[str, Set[str]], output: str) -> List[str]:
    ordered: List[str] = []
    visited: Set[str] = set()

    def visit(node: str) -> None:
        if node in visited:
            return
        visited.add(node)
        for parent in sorted(graph.get(node, set())):
            visit(parent)
        ordered.append(node)

    visit(output)
    return ordered


def _group_fields(items: Iterable[Dict[str, Any]]) -> Dict[str, List[str]]:
    grouped: Dict[str, List[str]] = {}
    for item in items:
        grouped.setdefault(str(item.get("position", "")), []).append(str(item.get("field", "")))
    return grouped


def _normalize_text(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def _extract_jira_id(text: str) -> str:
    match = re.search(r"\b[A-Z][A-Z0-9]+-\d+\b|\b\d{5,}\b", text)
    return match.group(0) if match else ""


def _extract_solution_description(record: Dict[str, Any]) -> str:
    preferred_keys = (
        "solution description",
        "solution_description",
        "solutiondescription",
        "solution",
    )
    for key, value in record.items():
        normalized_key = str(key).strip().lower().replace(" ", "").replace("-", "_")
        if normalized_key in preferred_keys or normalized_key.endswith("solutiondescription"):
            if value is not None and str(value).strip():
                return str(value).strip()
    return ""


def _release_note_label(note: Dict[str, Any]) -> str:
    return str(note.get("jira_id") or note.get("workbook") or note.get("sheet") or "").strip()


def _join_release_note_labels(notes: List[Dict[str, Any]], limit: int = 3) -> str:
    labels: List[str] = []
    seen = set()
    for note in notes:
        label = _release_note_label(note)
        if not label:
            continue
        key = label.casefold()
        if key in seen:
            continue
        seen.add(key)
        labels.append(label)
        if len(labels) >= limit:
            break
    return ", ".join(labels)


def _field_list_text(values: Iterable[Any], limit: int = 8) -> str:
    items = [str(value) for value in values if value not in (None, "")]
    if not items:
        return "none"
    suffix = f"; +{len(items) - limit} more" if len(items) > limit else ""
    return ", ".join(items[:limit]) + suffix


def _position_field_summary(grouped_fields: Dict[str, List[str]], limit: int = 4) -> str:
    if not grouped_fields:
        return "no changed fields mapped to positions"
    entries = [
        f"{position}: {_field_list_text(fields, limit=6)}"
        for position, fields in list(grouped_fields.items())[:limit]
    ]
    if len(grouped_fields) > limit:
        entries.append(f"+{len(grouped_fields) - limit} more positions")
    return "; ".join(entries)


def _position_terms(position_key: str) -> Set[str]:
    terms: Set[str] = set()
    for token in _normalize_text(position_key).split():
        if token.isdigit() or len(token) <= 2:
            continue
        terms.add(token)
        if token.endswith("y"):
            terms.add(f"{token[:-1]}ies")
        elif token.endswith("s"):
            terms.add(token[:-1])
        else:
            terms.add(f"{token}s")
    return terms


def _position_release_notes(
    release_notes: List[Dict[str, Any]],
    position_key: str,
    changed_fields: List[str],
    preferred_source_fields: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    position_terms = _position_terms(position_key)
    changed_terms = {_normalize_text(field) for field in changed_fields if field}
    preferred_terms = {_normalize_text(field) for field in (preferred_source_fields or []) if field}
    candidates: List[Dict[str, Any]] = []
    for note_index, note in enumerate(release_notes):
        note_text = _normalize_text(json.dumps(note.get("record", {}), default=str))
        position_matches = sorted(term for term in position_terms if term in note_text)
        field_matches = sorted(field for field in changed_terms if field and field in note_text)
        if not position_matches or not field_matches:
            continue

        source_field_matches = sorted(field for field in preferred_terms if field and field in note_text)
        problem_description_text = ""
        record = note.get("record", {})
        if isinstance(record, dict):
            for key, value in record.items():
                normalized_key = str(key).strip().lower().replace(" ", "").replace("-", "")
                if "problemdescription" in normalized_key or normalized_key == "problemdescription":
                    problem_description_text = _normalize_text(value)
                    break
        problem_source_matches = sorted(field for field in preferred_terms if field and field in problem_description_text)
        candidates.append({
            **note,
            "position_matches": position_matches,
            "changed_field_matches": field_matches,
            "source_field_matches": source_field_matches,
            "problem_source_matches": problem_source_matches,
            "relevance_score": len(position_matches) * 4 + len(field_matches) * 3,
            "tie_break_source_field_hits": len(source_field_matches),
            "tie_break_problem_source_hits": len(problem_source_matches),
            "tie_break_original_order": note_index,
        })
    return sorted(
        candidates,
        key=lambda note: (
            note["relevance_score"],
            note["tie_break_source_field_hits"],
            note["tie_break_problem_source_hits"],
            -note["tie_break_original_order"],
        ),
        reverse=True,
    )


def _confidence(state: AgentState) -> int:
    score = 35
    if len(state.get("lineage", {}).get("ordered", [])) > 1:
        score += 20
    if state.get("input_changes"):
        score += 20
    if state.get("verification") and all(item.get("candidate_fields") for item in state["verification"]):
        score += 15
    if state.get("release_notes"):
        score += 10
    if state.get("warnings"):
        score -= min(25, len(state["warnings"]) * 5)
    return max(0, min(100, score))


def _coerce_confidence(value: Any, fallback: float) -> float:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return max(0, min(100, float(value)))
    text = str(value or "").strip().casefold()
    qualitative_scores = {
        "hoch": 85,
        "high": 85,
        "mittel": 60,
        "medium": 60,
        "moderat": 60,
        "moderate": 60,
        "niedrig": 35,
        "low": 35,
    }
    if text in qualitative_scores:
        return float(qualitative_scores[text])
    match = re.search(r"-?\d+(?:\.\d+)?", text.replace(",", "."))
    if match:
        return max(0, min(100, float(match.group(0))))
    return max(0, min(100, float(fallback)))


def _coerce_text_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    items: List[str] = []
    for item in value:
        if item is None:
            continue
        if isinstance(item, str):
            text = item.strip()
        else:
            text = json.dumps(_json_safe(item), ensure_ascii=False)
        if text:
            items.append(text)
    return items


def _fallback_evidence_items(state: AgentState) -> List[str]:
    output = state["output_column"]
    changed_fields = sorted({str(item.get("field")) for item in state.get("input_changes", []) if item.get("field")})
    items = [
        f"Verglichen wurden {len(state.get('comparison', {}).get('comparison_data', []))} betroffene Positionen fuer {output} zwischen den beiden Ausfuehrungen.",
        f"Der von LangGraph rekonstruierte Berechnungspfad lautet: {' -> '.join(state.get('lineage', {}).get('ordered', [])) or 'nicht verfuegbar'}.",
    ]
    if changed_fields:
        items.append("Geaenderte Lineage-/Source-Felder: " + ", ".join(changed_fields) + ".")
    matched_jira = sorted({
        _release_note_label(note)
        for notes in state.get("position_release_notes", {}).values()
        for note in notes
        if _release_note_label(note)
    })
    if matched_jira:
        items.append("Positionsbezogene Release-Notes wurden gefunden: " + ", ".join(matched_jira[:3]) + ".")
    return items


def _fallback_next_checks(state: AgentState) -> List[str]:
    checks = list(state.get("warnings", []))
    if state.get("input_changes"):
        checks.append("Pruefen Sie die geaenderten Lineage-/Source-Felder gegen die Originaldaten und die ausgefuehrte Code-Version.")
    if state.get("position_release_notes"):
        checks.append("Validieren Sie die positionsspezifischen Release-Notes gegen Position, Problem Description, Solution Description und geaenderte Felder.")
    checks.append("Reproduzieren Sie die Abweichung fuer die betroffenen Positionen mit denselben Eingaben, um die B-minus-A-Bewegung zu bestaetigen.")
    return checks[:4]


def _output_diff_by_position(state: AgentState) -> Dict[str, float]:
    output_rows_a = _position_map(state["execution_a"].get("data", []))
    output_rows_b = _position_map(state["execution_b"].get("data", []))
    return {
        str(row.get("key")): float(diff)
        for row in state.get("comparison", {}).get("comparison_data", [])
        if (diff := _numeric_difference(
            output_rows_a.get(str(row.get("key")), {}).get(state["output_column"]),
            output_rows_b.get(str(row.get("key")), {}).get(state["output_column"]),
        )) is not None
    }


def _numeric_change_size(change: Dict[str, Any]) -> Optional[float]:
    diff = _numeric_difference(change.get("value_a"), change.get("value_b"))
    return abs(diff) if diff is not None else None


def _release_notes_for_field(state: AgentState, position: str, field: str) -> List[Dict[str, Any]]:
    normalized_field = _normalize_text(field)
    return [
        note for note in state.get("position_release_notes", {}).get(position, [])
        if normalized_field in {_normalize_text(value) for value in note.get("matched_fields", [])}
        or normalized_field in _normalize_text(json.dumps(note.get("record", {}), default=str))
    ]


def comparison_analyst_node(state: AgentState) -> AgentState:
    columns = _common_columns(state["execution_a"], state["execution_b"])
    key_column = _key_column(columns)
    rows_a = state["execution_a"].get("data", [])
    rows_b = state["execution_b"].get("data", [])
    map_a = {str(row.get(key_column)): row for row in rows_a if key_column and row.get(key_column) is not None}
    map_b = {str(row.get(key_column)): row for row in rows_b if key_column and row.get(key_column) is not None}
    keys = sorted(set(map_a) | set(map_b), key=_comparison_sort_key)
    comparison_rows: List[Dict[str, Any]] = []
    for key in keys:
        row_a = map_a.get(key, {})
        row_b = map_b.get(key, {})
        status = "matched" if row_a and row_b else "only_in_a" if row_a else "only_in_b"
        comparison_rows.append({
            "key": key,
            "match_status": status,
            "columns": [
                {
                    "column_name": column,
                    "value_a": _safe_value(row_a.get(column)),
                    "value_b": _safe_value(row_b.get(column)),
                    "difference": _safe_value(_numeric_difference(row_a.get(column), row_b.get(column))),
                }
                for column in columns
            ],
        })
    if state.get("position"):
        comparison_rows = [row for row in comparison_rows if str(row.get("key")) == str(state["position"])]
    output_column = state.get("output_column")
    if output_column:
        comparison_rows = [
            {**row, "columns": [column for column in row.get("columns", []) if column.get("column_name") == output_column]}
            for row in comparison_rows
        ]
        comparison_rows = [row for row in comparison_rows if row.get("columns")]
    deviations = [
        row for row in comparison_rows
        if any(column.get("difference") not in (None, 0) or not _values_equal(column.get("value_a"), column.get("value_b")) for column in row["columns"])
    ]
    state["comparison"] = {
        "key_column": key_column,
        "common_columns": columns,
        "comparison_data": deviations,
        "comparison_direction": "B - A (execution_b minus execution_a)",
    }
    _append_stage(state, "Comparison Analyst Agent", "completed", {
        "process_steps": [
            f"Loaded {len(rows_a)} rows from execution A and {len(rows_b)} rows from execution B.",
            f"Intersected execution schemas and found {len(columns)} common columns.",
            f"Selected {key_column or 'no'} as the row identity key using the same priority as the normal comparison flow.",
            f"Built lookup maps by key and evaluated {len(comparison_rows)} aligned positions.",
            f"Filtered the comparison to output field {state.get('output_column')} and kept {len(deviations)} positions with a changed value.",
        ],
        "positions_reviewed": len(comparison_rows),
        "deviations_found": len(deviations),
        "key_column": key_column,
    })
    return state


def formula_lineage_analyst_node(state: AgentState) -> AgentState:
    graph_a = _lineage_from_code(_code_for_execution(state["execution_a"]), state["output_column"])
    graph_b = _lineage_from_code(_code_for_execution(state["execution_b"]), state["output_column"])
    graph: Dict[str, Set[str]] = {}
    for source in (graph_a, graph_b):
        for output, parents in source.items():
            graph.setdefault(output, set()).update(parents)
    ordered = _ordered_lineage(graph, state["output_column"])
    state["lineage"] = {"graph": graph, "ordered": ordered}
    lineage_edges = [
        f"{parent} -> {child}"
        for child, parents in graph.items()
        for parent in sorted(parents)
    ]
    _append_stage(state, "Formula/Lineage Analyst Agent", "completed" if len(ordered) > 1 else "limited", {
        "process_steps": [
            "Read the Python code attached to execution A and execution B.",
            "Parsed dataframe assignment statements with Python AST and extracted df column reads from right-hand-side formulas.",
            f"Built {len(lineage_edges)} directed dependency links from source fields into derived fields.",
            f"Walked dependencies recursively from {state['output_column']} back to source fields.",
            f"Ordered the final source-to-output path as: {' -> '.join(ordered) or 'not available'}.",
        ],
        "lineage_edges": lineage_edges[:16],
        "calculation_path": " -> ".join(ordered),
        "dependencies": ordered[:-1],
        "lineage_available": len(ordered) > 1,
    })
    return state


def input_change_agent_node(state: AgentState) -> AgentState:
    source_fields = [field for field in state.get("lineage", {}).get("ordered", []) if field != state["output_column"]]
    input_a = _position_map(_input_rows(state["execution_a"].get("dataset_id")))
    input_b = _position_map(_input_rows(state["execution_b"].get("dataset_id")))
    output_a = _position_map(state["execution_a"].get("data", []))
    output_b = _position_map(state["execution_b"].get("data", []))
    positions = [row["key"] for row in state.get("comparison", {}).get("comparison_data", [])]
    changes: List[Dict[str, Any]] = []
    graph = state.get("lineage", {}).get("graph", {})
    for position in positions:
        for field_name in source_fields:
            derived = field_name in graph
            left_row = output_a.get(str(position), {}) if derived else input_a.get(str(position), {})
            right_row = output_b.get(str(position), {}) if derived else input_b.get(str(position), {})
            left = left_row.get(field_name)
            right = right_row.get(field_name)
            if not _values_equal(left, right):
                changes.append({
                    "position": str(position),
                    "field": field_name,
                    "value_a": _safe_value(left),
                    "value_b": _safe_value(right),
                    "classification": "changed",
                })
    state["input_changes"] = changes
    grouped_changes = _group_fields(changes)
    _append_stage(state, "Input-Change Agent", "completed", {
        "process_steps": [
            f"Loaded input rows for dataset A and dataset B, then mapped them by Position when available.",
            f"Loaded result rows for execution A and execution B to compare derived lineage fields.",
            f"Checked {len(source_fields)} lineage fields across {len(positions)} affected positions.",
            "For each lineage field, compared derived fields from result rows and source fields from input rows.",
            f"Recorded {len(changes)} changed field observations: {_position_field_summary(grouped_changes)}.",
        ],
        "changed_source_fields": len(changes),
        "changed_fields_by_position": grouped_changes,
    })
    return state


def release_note_agent_node(state: AgentState) -> AgentState:
    dependencies = set(state.get("lineage", {}).get("ordered", [])) | {state.get("output_column", "")}
    notes: List[Dict[str, Any]] = []
    for metadata_path in RELEASE_NOTES_DIR.glob("*.json"):
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            workbook_path = RELEASE_NOTES_DIR / str(metadata.get("stored_filename", ""))
            if not workbook_path.exists():
                continue
            workbook = openpyxl.load_workbook(
                workbook_path,
                read_only=True,
                data_only=True,
                keep_vba=workbook_path.suffix.lower() == ".xlsm",
            )
            for worksheet in workbook.worksheets:
                worksheet_rows = list(worksheet.iter_rows(values_only=True))
                headers = [str(value or "").strip() for value in worksheet_rows[0]] if worksheet_rows else []
                data_rows = worksheet_rows[1:] if len(worksheet_rows) > 1 else worksheet_rows
                for row in data_rows:
                    text = " ".join(str(value) for value in row if value is not None)
                    normalized = _normalize_text(text)
                    matched = sorted(field for field in dependencies if _normalize_text(field) and _normalize_text(field) in normalized)
                    if not matched:
                        continue
                    record = {
                        headers[index] if index < len(headers) and headers[index] else f"Column {index + 1}": _safe_value(value)
                        for index, value in enumerate(row)
                        if value is not None
                    }
                    notes.append({
                        "workbook": metadata.get("filename"),
                        "sheet": worksheet.title,
                        "matched_fields": matched,
                        "jira_id": _extract_jira_id(text),
                        "solution_description": _extract_solution_description(record),
                        "record_text": text[:2000],
                        "record": record,
                    })
            workbook.close()
        except Exception as exc:
            state.setdefault("warnings", []).append(f"Release note read failed for {metadata_path.name}: {exc}")

    changed_fields_by_position = _group_fields(state.get("input_changes", []))
    source_fields_by_position = {
        position: [field for field in fields if field not in state.get("lineage", {}).get("graph", {})]
        for position, fields in changed_fields_by_position.items()
    }
    position_keys = [str(row.get("key")) for row in state.get("comparison", {}).get("comparison_data", [])]
    position_release_notes = {
        position: _position_release_notes(
            notes,
            position,
            changed_fields_by_position.get(position, []),
            source_fields_by_position.get(position, []),
        )
        for position in position_keys
    }
    ranked_notes: List[Dict[str, Any]] = []
    seen_notes = set()
    for position in position_keys:
        for note in position_release_notes.get(position, []):
            note_key = (
                note.get("workbook"),
                note.get("sheet"),
                note.get("jira_id"),
                json.dumps(note.get("record", {}), default=str, sort_keys=True),
            )
            if note_key in seen_notes:
                continue
            seen_notes.add(note_key)
            ranked_notes.append(note)
    if not ranked_notes:
        ranked_notes = notes
    state["release_notes"] = ranked_notes[:60]
    state["position_release_notes"] = {position: items[:10] for position, items in position_release_notes.items()}
    linked_release_notes = [
        {
            "position": position,
            "candidate_count": len(items),
            "top_match": _release_note_label(items[0]) if items else "",
            "matched_fields": items[0].get("matched_fields", []) if items else [],
            "relevance_score": items[0].get("relevance_score") if items else None,
        }
        for position, items in position_release_notes.items()
    ]
    _append_stage(state, "Release-Note Agent", "completed" if notes else "no evidence", {
        "process_steps": [
            f"Scanned release-note metadata files under {RELEASE_NOTES_DIR.name} and opened matching Excel workbooks.",
            f"Searched workbook rows for lineage dependencies and output field terms: {_field_list_text(sorted(dependencies), limit=10)}.",
            f"Collected {len(notes)} broad candidate release-note rows before position scoring.",
            "For each affected position, required both position-context terms and changed-field terms before accepting a candidate.",
            "Ranked candidates by position matches, changed-field matches, source-field hits, and problem-description hits.",
            f"Linked position-specific candidates as: {_position_field_summary({item['position']: [item['top_match']] for item in linked_release_notes if item.get('top_match')})}.",
        ],
        "linked_release_notes": linked_release_notes,
        "release_notes_found": len(notes),
        "position_specific_release_notes": {position: len(items) for position, items in position_release_notes.items()},
        "matched_fields": sorted({field for note in notes for field in note.get("matched_fields", [])}),
    })
    return state


def causal_verification_agent_node(state: AgentState) -> AgentState:
    output_rows_a = _position_map(state["execution_a"].get("data", []))
    output_rows_b = _position_map(state["execution_b"].get("data", []))
    verification: List[Dict[str, Any]] = []
    for row in state.get("comparison", {}).get("comparison_data", []):
        position = str(row.get("key"))
        left = output_rows_a.get(position, {}).get(state["output_column"])
        right = output_rows_b.get(position, {}).get(state["output_column"])
        changed = [item for item in state.get("input_changes", []) if str(item.get("position")) == position]
        verification.append({
            "position": position,
            "output_a": _safe_value(left),
            "output_b": _safe_value(right),
            "difference": _safe_value(_numeric_difference(left, right)),
            "candidate_fields": [item.get("field") for item in changed],
            "classification": "partially supported" if changed else "unable to verify",
        })
    state["verification"] = verification
    _append_stage(state, "Causal Verification Agent", "completed", {
        "process_steps": [
            f"Loaded final output values for {state['output_column']} from both executions.",
            f"Checked {len(verification)} affected positions against the changed fields found by the Input-Change Agent.",
            "Classified a position as partially supported when changed candidate fields exist for that same position.",
            f"Found {sum(1 for item in verification if item.get('candidate_fields'))} positions with candidate fields supporting the output movement.",
        ],
        "positions_verified": len(verification),
        "supported_positions": sum(1 for item in verification if item.get("candidate_fields")),
    })
    return state


def hypothesis_generation_agent_node(state: AgentState) -> AgentState:
    output_diffs = _output_diff_by_position(state)
    hypotheses: List[Dict[str, Any]] = []
    for change in state.get("input_changes", []):
        position = str(change.get("position") or "")
        field = str(change.get("field") or "")
        if not position or not field:
            continue
        field_diff = _numeric_difference(change.get("value_a"), change.get("value_b"))
        output_diff = output_diffs.get(position)
        notes = _release_notes_for_field(state, position, field)
        direction_alignment = "unknown"
        if field_diff is not None and output_diff is not None:
            direction_alignment = "same direction" if field_diff * output_diff > 0 else "opposite direction" if field_diff * output_diff < 0 else "neutral"
        hypotheses.append({
            "id": f"H{len(hypotheses) + 1}",
            "position": position,
            "field": field,
            "hypothesis": f"{field} is a candidate driver for the {state['output_column']} movement in {position}.",
            "value_a": change.get("value_a"),
            "value_b": change.get("value_b"),
            "field_difference": _safe_value(field_diff),
            "output_difference": _safe_value(output_diff),
            "direction_alignment": direction_alignment,
            "release_note_candidates": [_release_note_label(note) for note in notes if _release_note_label(note)],
            "lineage_role": "direct parent" if field in state.get("lineage", {}).get("graph", {}).get(state["output_column"], set()) else "upstream dependency",
        })
    hypotheses, generation_source = _llm_generate_hypotheses(state, hypotheses)
    state["hypotheses"] = hypotheses
    _append_stage(state, "Hypothesis Generation Agent", "completed" if hypotheses else "limited", {
        "process_steps": [
            "Built deterministic hypothesis seed data from changed fields, affected positions, output movements, lineage roles, and release-note candidates.",
            "Sent that seed data to the configured LLM to generate analyst-style causal hypotheses constrained to the supplied evidence.",
            "Normalized the LLM hypotheses back into structured fields for deterministic scoring and final decision agents.",
            f"Generated {len(hypotheses)} candidate hypotheses for downstream scoring using source: {generation_source}.",
        ],
        "generation_source": generation_source,
        "hypotheses_generated": len(hypotheses),
        "hypotheses": hypotheses[:12],
    })
    return state


def hypothesis_scoring_agent_node(state: AgentState) -> AgentState:
    lineage_order = state.get("lineage", {}).get("ordered", [])
    direct_parents = set(state.get("lineage", {}).get("graph", {}).get(state["output_column"], set()))
    scored: List[Dict[str, Any]] = []
    for hypothesis in state.get("hypotheses", []):
        field = str(hypothesis.get("field") or "")
        position = str(hypothesis.get("position") or "")
        score = 20.0
        score += 25.0 if field in direct_parents else 12.0
        if hypothesis.get("release_note_candidates"):
            score += 15.0
        if hypothesis.get("direction_alignment") == "same direction":
            score += 10.0
        elif hypothesis.get("direction_alignment") == "opposite direction":
            score += 4.0
        field_change_size = _numeric_change_size({"value_a": hypothesis.get("value_a"), "value_b": hypothesis.get("value_b")})
        output_size = abs(_as_float(hypothesis.get("output_difference")) or 0)
        if field_change_size is not None and output_size > 0:
            score += min(25.0, (field_change_size / output_size) * 25.0)
        if field in lineage_order:
            score += max(0.0, 10.0 - lineage_order.index(field))
        scored.append({
            **hypothesis,
            "score": round(max(0.0, min(100.0, score)), 1),
            "score_reason": (
                f"Scored from lineage role ({hypothesis.get('lineage_role')}), release-note support "
                f"({len(hypothesis.get('release_note_candidates') or [])} candidate(s)), direction alignment "
                f"({hypothesis.get('direction_alignment')}), and relative movement size."
            ),
            "decision": "primary candidate" if score >= 70 else "secondary candidate" if score >= 50 else "weak candidate",
        })
    scored.sort(key=lambda item: item.get("score", 0), reverse=True)
    for index, item in enumerate(scored):
        item["rank"] = index + 1
    state["scored_hypotheses"] = scored
    generation_sources = sorted({str(item.get("generation_source") or "deterministic") for item in scored})
    _append_stage(state, "Hypothesis Scoring Agent", "completed" if scored else "limited", {
        "process_steps": [
            "Scored every hypothesis using lineage proximity, release-note support, direction alignment, and relative movement size.",
            "Ranked hypotheses so the final decision can separate primary, secondary, and weak causes.",
            f"Top hypothesis: {scored[0]['field']} for {scored[0]['position']} with score {scored[0]['score']}" if scored else "No hypotheses were available to score.",
        ],
        "generation_sources": generation_sources,
        "scored_hypotheses": scored[:12],
    })
    return state


def counterfactual_agent_node(state: AgentState) -> AgentState:
    output_diffs = _output_diff_by_position(state)
    by_position: Dict[str, List[Dict[str, Any]]] = {}
    for item in state.get("scored_hypotheses", []):
        by_position.setdefault(str(item.get("position")), []).append(item)
    counterfactuals: List[Dict[str, Any]] = []
    for position, items in by_position.items():
        output_diff = output_diffs.get(position)
        numeric_items = [item for item in items if _as_float(item.get("field_difference")) is not None]
        total_field_movement = sum(abs(_as_float(item.get("field_difference")) or 0) for item in numeric_items) or 0.0
        for item in items:
            field_diff = _as_float(item.get("field_difference"))
            if output_diff is None or field_diff is None or total_field_movement == 0:
                explained_share = None
                estimated_output_effect = None
            else:
                explained_share = abs(field_diff) / total_field_movement
                estimated_output_effect = output_diff * explained_share
            counterfactuals.append({
                "hypothesis_id": item.get("id"),
                "position": position,
                "field": item.get("field"),
                "output_difference": _safe_value(output_diff),
                "field_difference": _safe_value(field_diff),
                "estimated_output_effect_if_only_this_changed": _safe_value(estimated_output_effect),
                "estimated_explained_share": round(explained_share * 100, 1) if explained_share is not None else None,
                "interpretation": (
                    f"If only {item.get('field')} changed, it would explain about {round(explained_share * 100, 1)}% of the local changed-field movement basis."
                    if explained_share is not None else
                    "Counterfactual estimate is limited because numeric field movement or output movement is unavailable."
                ),
            })
    counterfactuals, generation_source = _llm_generate_counterfactuals(state, counterfactuals)
    state["counterfactuals"] = counterfactuals
    _append_stage(state, "Counterfactual What-If Agent", "completed" if counterfactuals else "limited", {
        "process_steps": [
            "Built deterministic counterfactual seed data from scored hypotheses, output movement, field movement, and estimated explained share.",
            "Sent that seed data to the configured LLM to generate what-if interpretations constrained to the supplied numbers.",
            "Normalized the LLM what-if analysis back into structured counterfactual records for the report UI.",
            f"Generated {len(counterfactuals)} counterfactual records using source: {generation_source}.",
        ],
        "generation_source": generation_source,
        "counterfactuals": counterfactuals[:16],
    })
    return state


def release_note_rejection_agent_node(state: AgentState) -> AgentState:
    changed_by_position = _group_fields(state.get("input_changes", []))
    rejected: List[Dict[str, Any]] = []
    accepted_keys = {
        (position, _release_note_label(note))
        for position, notes in state.get("position_release_notes", {}).items()
        for note in notes
        if _release_note_label(note)
    }
    for position in [str(row.get("key")) for row in state.get("comparison", {}).get("comparison_data", [])]:
        changed_fields = changed_by_position.get(position, [])
        for note in state.get("release_notes", []):
            label = _release_note_label(note)
            if not label or (position, label) in accepted_keys:
                continue
            note_text = _normalize_text(json.dumps(note.get("record", {}), default=str))
            field_hits = [field for field in changed_fields if _normalize_text(field) in note_text]
            position_hits = sorted(term for term in _position_terms(position) if term in note_text)
            reason = "Rejected because it did not match the affected position and changed fields together."
            if field_hits and not position_hits:
                reason = "Rejected because it matched changed fields but not the affected position context."
            elif position_hits and not field_hits:
                reason = "Rejected because it matched the position context but not the changed fields."
            rejected.append({
                "position": position,
                "release_note": label,
                "jira_id": note.get("jira_id"),
                "workbook": note.get("workbook"),
                "matched_changed_fields": field_hits,
                "position_terms_found": position_hits,
                "reason": reason,
            })
    state["rejected_release_notes"] = rejected[:24]
    _append_stage(state, "Release-Note Rejection Agent", "completed", {
        "process_steps": [
            "Compared broad release-note matches against position-specific accepted candidates.",
            "Rejected notes that matched only generic field text, only position text, or neither requirement together.",
            f"Recorded {len(state['rejected_release_notes'])} rejected or weak release-note links for audit review.",
        ],
        "rejected_release_notes": state["rejected_release_notes"],
    })
    return state


def final_decision_agent_node(state: AgentState) -> AgentState:
    scored = state.get("scored_hypotheses", [])
    top = scored[0] if scored else {}
    secondary = [item for item in scored[1:5] if item.get("score", 0) >= 45]
    rejected = [item for item in scored if item.get("score", 0) < 45]
    decision = {
        "primary_cause": top.get("field") or "Unresolved",
        "primary_position": top.get("position"),
        "primary_score": top.get("score"),
        "secondary_causes": secondary,
        "rejected_causes": rejected[:8],
        "decision_rationale": top.get("score_reason") if top else "No scored hypothesis was available for a final decision.",
        "evidence_strength": "strong" if top.get("score", 0) >= 75 else "moderate" if top.get("score", 0) >= 55 else "limited",
    }
    state["final_decision"] = decision
    _append_stage(state, "Final Decision Agent", "completed" if top else "limited", {
        "process_steps": [
            "Reviewed scored hypotheses, counterfactual estimates, release-note support, and rejected note evidence.",
            "Selected the highest-scoring hypothesis as the primary cause candidate.",
            "Separated secondary causes from weak/rejected causes based on score thresholds.",
            f"Final decision: {decision['primary_cause']} with {decision['evidence_strength']} evidence strength.",
        ],
        **decision,
    })
    return state


def critic_consistency_agent_node(state: AgentState) -> AgentState:
    warnings = list(state.get("warnings", []))
    for row in state.get("comparison", {}).get("comparison_data", []):
        for column in row.get("columns", []):
            left = column.get("value_a")
            right = column.get("value_b")
            difference = column.get("difference")
            if difference is not None and not _values_equal(_numeric_difference(left, right), difference):
                warnings.append(f"{row.get('key')}:{column.get('column_name')}")
    state["warnings"] = warnings
    _append_stage(state, "Critic/Consistency Agent", "warning" if warnings else "completed", {
        "process_steps": [
            "Recomputed every available numeric difference as value_b minus value_a.",
            f"Checked {sum(len(row.get('columns', [])) for row in state.get('comparison', {}).get('comparison_data', []))} compared output cells for B - A consistency.",
            f"Recorded {len(warnings)} warning items after consistency review.",
        ],
        "direction": "B - A",
        "inconsistencies": warnings,
        "evidence_warnings": len(warnings),
    })
    return state


def evidence_merger_agent_node(state: AgentState) -> AgentState:
    stage_warnings = [stage["agent"] for stage in state.get("stages", []) if stage.get("status") in {"warning", "limited", "no evidence"}]
    classification = "Confirmed Cause" if not stage_warnings and state.get("input_changes") else "Likely Cause" if state.get("input_changes") else "Unresolved Issue"
    merged = {
        "confirmed_facts": {
            "comparison_positions": len(state.get("comparison", {}).get("comparison_data", [])),
            "changed_inputs": len(state.get("input_changes", [])),
            "calculation_path": " -> ".join(state.get("lineage", {}).get("ordered", [])),
        },
        "verified_causes": state.get("verification", []),
        "supporting_documentation": state.get("release_notes", []),
        "scored_hypotheses": state.get("scored_hypotheses", [])[:12],
        "counterfactuals": state.get("counterfactuals", [])[:16],
        "rejected_release_notes": state.get("rejected_release_notes", [])[:12],
        "final_decision": state.get("final_decision", {}),
        "warnings": stage_warnings + state.get("warnings", []),
        "classification": classification,
    }
    state["merged_evidence"] = merged
    _append_stage(state, "Evidence Merger Agent", "completed", {
        "process_steps": [
            "Collected the final outputs from comparison, lineage, input-change detection, release-note ranking, verification, and critic review.",
            f"Counted {len(state.get('comparison', {}).get('comparison_data', []))} affected positions and {len(state.get('input_changes', []))} changed field observations.",
            f"Included {sum(len(items) for items in state.get('position_release_notes', {}).values())} position-specific release-note candidate links.",
            f"Applied classification rule and assigned: {classification}.",
        ],
        **merged,
    })
    return state


def _parse_json_object(content: str) -> Dict[str, Any]:
    text = (content or "{}").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for index, char in enumerate(text):
            if char != "{":
                continue
            try:
                value, _ = decoder.raw_decode(text[index:])
                return value if isinstance(value, dict) else {}
            except json.JSONDecodeError:
                continue
    return {}


def _llm_client_response(messages: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    api_key = os.environ.get("OPENAI_API_KEY")
    azure_key = os.environ.get("AZURE_OPENAI_API_KEY")
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    try:
        if api_key:
            from openai import OpenAI

            client = OpenAI(api_key=api_key, timeout=60.0, max_retries=1)
            response = client.chat.completions.create(
                model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
                messages=messages,
                temperature=0.1,
                max_tokens=2200,
                response_format={"type": "json_object"},
            )
        elif azure_key and endpoint:
            from openai import AzureOpenAI

            client = AzureOpenAI(
                api_key=azure_key,
                api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21"),
                azure_endpoint=endpoint.rstrip("/"),
            )
            response = client.chat.completions.create(
                model=os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o"),
                messages=messages,
                temperature=0.1,
                max_tokens=2200,
                response_format={"type": "json_object"},
            )
        else:
            return None
        return _parse_json_object(response.choices[0].message.content or "{}")
    except Exception as exc:
        return {"llm_error": str(exc)}


def _llm_generate_hypotheses(state: AgentState, seed_hypotheses: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], str]:
    if not seed_hypotheses:
        return [], "deterministic_empty_seed"
    messages = [
        {
            "role": "system",
            "content": (
                "You are an LLM Hypothesis Generation Agent for financial root-cause analysis. "
                "Use only the provided deterministic seed evidence. Do not invent positions, fields, values, Jira IDs, or formulas. "
                "Return valid JSON only with key hypotheses, an array. Each hypothesis must preserve id, position, field, "
                "value_a, value_b, field_difference, output_difference, direction_alignment, release_note_candidates, and lineage_role. "
                "Add or improve these fields: hypothesis, causal_mechanism, evidence_to_check, rejection_risk, confidence_basis. "
                "Use exactly the same number and order of hypotheses as seed_hypotheses. "
                "Do not wrap the list under another key. Write explanatory text in German. Keep it concise and evidence-grounded."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(_json_safe({
                "output_column": state.get("output_column"),
                "lineage": state.get("lineage", {}),
                "verification": state.get("verification", []),
                "seed_hypotheses": seed_hypotheses,
            }), ensure_ascii=True),
        },
    ]
    result = _llm_client_response(messages)
    if not result or result.get("llm_error"):
        return seed_hypotheses, "deterministic_fallback_no_llm"
    llm_items = result.get("hypotheses")
    if not isinstance(llm_items, list):
        return seed_hypotheses, "deterministic_fallback_bad_llm_schema"
    seed_by_id = {str(item.get("id")): item for item in seed_hypotheses}
    seed_by_position_field = {
        (str(item.get("position")), str(item.get("field"))): item
        for item in seed_hypotheses
    }

    def _first_text(source: Dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = source.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

    normalized: List[Dict[str, Any]] = []
    for index, item in enumerate(llm_items):
        if not isinstance(item, dict):
            continue
        seed = (
            seed_by_id.get(str(item.get("id")))
            or seed_by_position_field.get((str(item.get("position")), str(item.get("field"))))
            or seed_by_position_field.get((str(item.get("Position")), str(item.get("Field"))))
            or (seed_hypotheses[index] if index < len(seed_hypotheses) else {})
        )
        if not seed:
            continue
        normalized.append({
            **seed,
            "hypothesis": _first_text(item, "hypothesis", "Hypothesis", "hypothese", "claim") or str(seed.get("hypothesis") or "").strip(),
            "causal_mechanism": _first_text(item, "causal_mechanism", "causalMechanism", "mechanism", "mechanismus", "begruendung"),
            "evidence_to_check": _first_text(item, "evidence_to_check", "evidenceToCheck", "evidence", "check", "validierung"),
            "rejection_risk": _first_text(item, "rejection_risk", "rejectionRisk", "risk", "risiko", "limitation"),
            "confidence_basis": _first_text(item, "confidence_basis", "confidenceBasis", "confidence", "basis", "evidenzbasis"),
            "generation_source": "llm",
        })
    return (normalized or seed_hypotheses), "llm" if normalized else "deterministic_fallback_empty_llm_items"


def _llm_generate_counterfactuals(state: AgentState, seed_counterfactuals: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], str]:
    if not seed_counterfactuals:
        return [], "deterministic_empty_seed"
    messages = [
        {
            "role": "system",
            "content": (
                "You are an LLM Counterfactual What-If Agent for financial root-cause analysis. "
                "Use only the provided deterministic numeric seed estimates. Do not recalculate unsupported numbers or invent data. "
                "Return valid JSON only with key counterfactuals, an array. Each item must preserve hypothesis_id, position, field, "
                "output_difference, field_difference, estimated_output_effect_if_only_this_changed, and estimated_explained_share. "
                "Add or improve interpretation, caveat, and validation_test. Write explanatory text in German. "
                "If the estimate is limited, explicitly say why."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(_json_safe({
                "output_column": state.get("output_column"),
                "scored_hypotheses": state.get("scored_hypotheses", [])[:16],
                "seed_counterfactuals": seed_counterfactuals,
            }), ensure_ascii=True),
        },
    ]
    result = _llm_client_response(messages)
    if not result or result.get("llm_error"):
        return seed_counterfactuals, "deterministic_fallback_no_llm"
    llm_items = result.get("counterfactuals")
    if not isinstance(llm_items, list):
        return seed_counterfactuals, "deterministic_fallback_bad_llm_schema"
    seed_by_id = {str(item.get("hypothesis_id")): item for item in seed_counterfactuals}
    normalized: List[Dict[str, Any]] = []
    for index, item in enumerate(llm_items):
        if not isinstance(item, dict):
            continue
        seed = seed_by_id.get(str(item.get("hypothesis_id"))) or (seed_counterfactuals[index] if index < len(seed_counterfactuals) else {})
        if not seed:
            continue
        normalized.append({
            **seed,
            "interpretation": str(item.get("interpretation") or seed.get("interpretation") or "").strip(),
            "caveat": str(item.get("caveat") or "").strip(),
            "validation_test": str(item.get("validation_test") or "").strip(),
            "generation_source": "llm",
        })
    return (normalized or seed_counterfactuals), "llm" if normalized else "deterministic_fallback_empty_llm_items"


def llm_rootcause_report_node(state: AgentState) -> AgentState:
    evidence_payload = {
        "output_column": state["output_column"],
        "comparison_direction": "B - A (execution_b minus execution_a)",
        "comparison": state.get("comparison", {}),
        "lineage": _json_safe(state.get("lineage", {})),
        "input_changes": state.get("input_changes", []),
        "release_notes": state.get("release_notes", [])[:12],
        "position_release_notes": state.get("position_release_notes", {}),
        "verification": state.get("verification", []),
        "scored_hypotheses": state.get("scored_hypotheses", [])[:12],
        "counterfactuals": state.get("counterfactuals", [])[:16],
        "rejected_release_notes": state.get("rejected_release_notes", [])[:12],
        "final_decision": state.get("final_decision", {}),
        "merged_evidence": state.get("merged_evidence", {}),
    }
    messages = [
        {
            "role": "system",
            "content": (
                "You are the final LangGraph RootCause report agent. Use only the supplied evidence. "
                "All differences are B - A. Return valid JSON only with keys: root_cause, explanation, "
                "confidence, evidence, next_checks, row_explanations, primary_cause, uncertainty_summary. "
                "Write user-facing natural language in German. "
                "row_explanations must be an object keyed by position. For each position, state exact A and B "
                "values, the B - A movement, changed lineage/source fields, and whether the matched release notes "
                "support, partially support, or do not support the observed change. Use position_release_notes as the "
                "authoritative release-note candidate list for each position. Do not copy a Jira ID or solution from "
                "another position. Do not infer causation from a field-name match alone. Do not invent facts."
            ),
        },
        {"role": "user", "content": json.dumps(_json_safe(evidence_payload), ensure_ascii=True)},
    ]
    report = _llm_client_response(messages)
    if not report or report.get("llm_error"):
        report = _fallback_llm_report(state, report.get("llm_error") if report else None)
        status = "fallback"
    else:
        report["confidence"] = _coerce_confidence(report.get("confidence"), _confidence(state))
        status = "completed"
    report["evidence"] = _coerce_text_list(report.get("evidence")) or _fallback_evidence_items(state)
    report["next_checks"] = _coerce_text_list(report.get("next_checks")) or _fallback_next_checks(state)
    state["llm_report"] = report
    _append_stage(state, "Final Rootcause Report", status, {
        "process_steps": [
            "Prepared a compact evidence payload containing comparison data, lineage, changed fields, ranked release notes, verification results, and merged evidence.",
            "Asked the configured LLM to write German JSON output using only supplied evidence and position-specific release-note candidates.",
            "Parsed the LLM JSON response and normalized confidence, evidence, and next-check fields for UI rendering.",
            f"Final report status: {status}.",
        ],
        "classification": state.get("merged_evidence", {}).get("classification", "Unresolved Issue"),
        "confidence": report.get("confidence", _confidence(state)),
        "llm_model": os.environ.get("OPENAI_MODEL") or os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME") or "not configured",
        "llm_error": report.get("llm_error"),
    })
    return state


def _fallback_llm_report(state: AgentState, error: Optional[str]) -> Dict[str, Any]:
    output = state["output_column"]
    changed_fields = sorted({str(item.get("field")) for item in state.get("input_changes", []) if item.get("field")})
    root_cause = state.get("merged_evidence", {}).get("classification", "Unresolved Issue")
    explanation = (
        f"Die LangGraph-Agenten haben {output} anhand von Vergleich, Lineage, Input-Aenderungen und Release Notes bewertet. "
        f"Geaenderte Felder: {', '.join(changed_fields) if changed_fields else 'keine eindeutig verifizierten Felder'}."
    )
    evidence = [
        f"Der von LangGraph rekonstruierte Berechnungspfad lautet: {' -> '.join(state.get('lineage', {}).get('ordered', [])) or 'nicht verfuegbar'}.",
        f"Geaenderte Felder: {', '.join(changed_fields) if changed_fields else 'keine eindeutig verifizierten Felder'}.",
        f"Verifizierte Positionen: {len(state.get('verification', []))}.",
    ]
    next_checks = _fallback_next_checks(state)
    report = {
        "root_cause": root_cause,
        "explanation": explanation,
        "confidence": _confidence(state),
        "evidence": evidence,
        "next_checks": next_checks,
        "row_explanations": {},
    }
    if error:
        report["llm_error"] = error
    return report


def _build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("comparison_analyst", comparison_analyst_node)
    graph.add_node("formula_lineage_analyst", formula_lineage_analyst_node)
    graph.add_node("input_change_agent", input_change_agent_node)
    graph.add_node("release_note_agent", release_note_agent_node)
    graph.add_node("causal_verification_agent", causal_verification_agent_node)
    graph.add_node("hypothesis_generation_agent", hypothesis_generation_agent_node)
    graph.add_node("hypothesis_scoring_agent", hypothesis_scoring_agent_node)
    graph.add_node("counterfactual_agent", counterfactual_agent_node)
    graph.add_node("release_note_rejection_agent", release_note_rejection_agent_node)
    graph.add_node("final_decision_agent", final_decision_agent_node)
    graph.add_node("critic_consistency_agent", critic_consistency_agent_node)
    graph.add_node("evidence_merger_agent", evidence_merger_agent_node)
    graph.add_node("llm_rootcause_report", llm_rootcause_report_node)
    graph.add_edge(START, "comparison_analyst")
    graph.add_edge("comparison_analyst", "formula_lineage_analyst")
    graph.add_edge("formula_lineage_analyst", "input_change_agent")
    graph.add_edge("input_change_agent", "release_note_agent")
    graph.add_edge("release_note_agent", "causal_verification_agent")
    graph.add_edge("causal_verification_agent", "hypothesis_generation_agent")
    graph.add_edge("hypothesis_generation_agent", "hypothesis_scoring_agent")
    graph.add_edge("hypothesis_scoring_agent", "counterfactual_agent")
    graph.add_edge("counterfactual_agent", "release_note_rejection_agent")
    graph.add_edge("release_note_rejection_agent", "critic_consistency_agent")
    graph.add_edge("critic_consistency_agent", "final_decision_agent")
    graph.add_edge("final_decision_agent", "evidence_merger_agent")
    graph.add_edge("evidence_merger_agent", "llm_rootcause_report")
    graph.add_edge("llm_rootcause_report", END)
    return graph.compile()


ROOTCAUSE_GRAPH = _build_graph()


def _build_rows(state: AgentState) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    output_a = _position_map(state["execution_a"].get("data", []))
    output_b = _position_map(state["execution_b"].get("data", []))
    rows: List[Dict[str, Any]] = []
    details: List[Dict[str, Any]] = []
    output = state["output_column"]
    lineage_path = " -> ".join(state.get("lineage", {}).get("ordered", []))
    row_explanations = state.get("llm_report", {}).get("row_explanations", {})
    if not isinstance(row_explanations, dict):
        row_explanations = {}
    for verification in state.get("verification", []):
        position = str(verification["position"])
        left = output_a.get(position, {}).get(output)
        right = output_b.get(position, {}).get(output)
        changed_fields = [item for item in state.get("input_changes", []) if str(item.get("position")) == position]
        position_notes = state.get("position_release_notes", {}).get(position, [])
        note_labels = [_release_note_label(note) for note in position_notes if _release_note_label(note)]
        explanation = row_explanations.get(position)
        if not isinstance(explanation, str) or not explanation.strip():
            explanation = f"Fuer {position} hat sich {output} von {_value_text(left)} auf {_value_text(right)} geaendert (B - A = {_value_text(_numeric_difference(left, right))})."
            if changed_fields:
                explanation += " Geaenderte Lineage-/Source-Felder: " + ", ".join(str(item.get("field")) for item in changed_fields) + "."
            else:
                explanation += " Kein geaendertes Source-Feld wurde fuer diesen Output eindeutig verifiziert."
            if position_notes:
                primary_note = position_notes[0]
                explanation += f" Primaere Release-Note-Evidenz: {_release_note_label(primary_note)}."
                if primary_note.get("solution_description"):
                    explanation += f" Die dokumentierte Loesung lautet: {primary_note.get('solution_description')}."
            else:
                explanation += " Fuer diese Position wurde keine positionsspezifische Release Note identifiziert."
        rows.append({
            "position": position,
            "output": output,
            "value_a": _safe_value(left),
            "value_b": _safe_value(right),
            "difference": _safe_value(_numeric_difference(left, right)),
            "lineage": lineage_path,
            "input": ", ".join(str(item.get("field")) for item in changed_fields),
            "release_note": ", ".join(note_labels[:3]),
            "explanation": explanation,
            "confidence": state.get("llm_report", {}).get("confidence", _confidence(state)),
        })
        for field_name in state.get("lineage", {}).get("ordered", []):
            field_left = output_a.get(position, {}).get(field_name)
            field_right = output_b.get(position, {}).get(field_name)
            field_parents = sorted(state.get("lineage", {}).get("graph", {}).get(field_name, set()))
            normalized_field = _normalize_text(field_name)
            field_notes = [
                note for note in position_notes
                if normalized_field in {_normalize_text(value) for value in note.get("matched_fields", [])}
                or normalized_field in _normalize_text(json.dumps(note.get("record", {}), default=str))
            ]
            field_changed = not _values_equal(field_left, field_right)
            detail_explanation = f"Fuer {position} gilt: {field_name} "
            if field_changed:
                detail_explanation += f"hat sich von {_value_text(field_left)} auf {_value_text(field_right)} geaendert."
            else:
                detail_explanation += "hat sich zwischen den beiden Ausfuehrungen nicht geaendert."
            if field_parents:
                detail_explanation += " Parent-Felder: " + ", ".join(field_parents) + "."
            if field_name != output:
                detail_explanation += f" Dieses Feld ist Teil der Lineage, die {output} speist."
            if field_notes:
                detail_explanation += f" Release-Note-Kontext: {_join_release_note_labels(field_notes)}."
            else:
                detail_explanation += " Keine Release Note dokumentiert diese Feld-Aenderung direkt."
            details.append({
                "position": position,
                "output": field_name,
                "value_a": _safe_value(field_left),
                "value_b": _safe_value(field_right),
                "difference": _safe_value(_numeric_difference(field_left, field_right)),
                "lineage": lineage_path,
                "input": ", ".join(field_parents),
                "release_note": _join_release_note_labels(field_notes),
                "explanation": detail_explanation,
                "confidence": state.get("llm_report", {}).get("confidence", _confidence(state)),
            })
    return rows, details


def _build_ranked_drivers(state: AgentState, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    output_diffs_by_position = {
        str(row.get("position")): abs(_as_float(row.get("difference")) or 0)
        for row in rows
        if row.get("difference") is not None
    }
    drivers: Dict[str, Dict[str, Any]] = {}
    for change in state.get("input_changes", []):
        field = str(change.get("field") or "")
        position = str(change.get("position") or "")
        if not field or not position:
            continue
        driver = drivers.setdefault(field, {
            "field": field,
            "positions": [],
            "occurrences": 0,
            "total_abs_output_impact": 0.0,
            "release_note_support": [],
            "why_it_matters": "",
        })
        driver["occurrences"] += 1
        if position not in driver["positions"]:
            driver["positions"].append(position)
        driver["total_abs_output_impact"] += output_diffs_by_position.get(position, 0.0)
        for note in state.get("position_release_notes", {}).get(position, []):
            normalized_matches = {_normalize_text(value) for value in note.get("matched_fields", [])}
            if _normalize_text(field) in normalized_matches or _normalize_text(field) in _normalize_text(json.dumps(note.get("record", {}), default=str)):
                label = _release_note_label(note)
                if label and label not in driver["release_note_support"]:
                    driver["release_note_support"].append(label)
    ranked = sorted(
        drivers.values(),
        key=lambda item: (item["occurrences"], item["total_abs_output_impact"], len(item["release_note_support"])),
        reverse=True,
    )
    for index, driver in enumerate(ranked):
        driver["rank"] = index + 1
        support_text = "with release-note support" if driver["release_note_support"] else "without direct release-note support"
        driver["why_it_matters"] = (
            f"{driver['field']} changed in {len(driver['positions'])} affected position(s), "
            f"covering total absolute output movement {driver['total_abs_output_impact']:.2f}, {support_text}."
        )
    return ranked


def _build_release_note_assessments(state: AgentState) -> List[Dict[str, Any]]:
    assessments: List[Dict[str, Any]] = []
    changed_by_position = _group_fields(state.get("input_changes", []))
    for position, notes in state.get("position_release_notes", {}).items():
        changed_fields = changed_by_position.get(position, [])
        if not notes:
            assessments.append({
                "position": position,
                "status": "not supported",
                "note": "No position-specific release note matched both position context and changed fields.",
                "changed_fields": changed_fields,
            })
            continue
        for note in notes[:3]:
            matched_changed_fields = [
                field for field in changed_fields
                if _normalize_text(field) in {_normalize_text(value) for value in note.get("matched_fields", [])}
                or _normalize_text(field) in _normalize_text(json.dumps(note.get("record", {}), default=str))
            ]
            has_solution = bool(note.get("solution_description"))
            status = "supports" if matched_changed_fields and has_solution else "partially supports" if matched_changed_fields else "weak match"
            assessments.append({
                "position": position,
                "jira_id": note.get("jira_id"),
                "workbook": note.get("workbook"),
                "sheet": note.get("sheet"),
                "status": status,
                "matched_changed_fields": matched_changed_fields,
                "relevance_score": note.get("relevance_score"),
                "solution_description": note.get("solution_description"),
                "reason": (
                    f"Matched position {position} and changed field(s) {_field_list_text(matched_changed_fields)}."
                    if matched_changed_fields else
                    f"Matched release-note text, but not a changed field for {position}."
                ),
            })
    return assessments


def _build_contradictions(state: AgentState, release_note_assessments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    contradictions: List[Dict[str, Any]] = []
    for warning in state.get("warnings", []):
        contradictions.append({"severity": "high", "source": "Critic/Consistency Agent", "issue": str(warning)})
    for assessment in release_note_assessments:
        if assessment.get("status") in {"weak match", "not supported"}:
            contradictions.append({
                "severity": "medium",
                "source": "Release-Note Agent",
                "position": assessment.get("position"),
                "issue": assessment.get("reason") or assessment.get("note"),
            })
        elif assessment.get("status") == "partially supports" and not assessment.get("solution_description"):
            contradictions.append({
                "severity": "low",
                "source": "Release-Note Agent",
                "position": assessment.get("position"),
                "issue": "Release note matched changed fields but did not provide a solution description to validate the causal story.",
            })
    return contradictions


def _build_uncertainty_notes(state: AgentState, ranked_drivers: List[Dict[str, Any]], contradictions: List[Dict[str, Any]]) -> List[str]:
    notes: List[str] = []
    if not ranked_drivers:
        notes.append("No changed lineage/source driver was strong enough to rank.")
    if not state.get("release_notes"):
        notes.append("No release-note evidence was available, so documentation support is missing.")
    if contradictions:
        notes.append(f"{len(contradictions)} contradiction or evidence-limit item(s) require review before sign-off.")
    if len(state.get("lineage", {}).get("ordered", [])) <= 1:
        notes.append("The calculation lineage could not be fully reconstructed from the uploaded code.")
    return notes or ["No major uncertainty was flagged by the agent workflow."]


def _build_validation_plan(state: AgentState, ranked_drivers: List[Dict[str, Any]]) -> List[str]:
    plan = [
        "Re-run the affected positions with the same execution pair and confirm every displayed B - A movement.",
        "Open the uploaded code version and validate that the reconstructed lineage path matches the implemented formula chain.",
    ]
    if ranked_drivers:
        plan.append("Validate the top-ranked driver fields in the source input data: " + _field_list_text([driver["field"] for driver in ranked_drivers[:4]]) + ".")
    if state.get("position_release_notes"):
        plan.append("Review the linked Jira/release-note solution descriptions and confirm they apply to the same position and changed fields.")
    plan.append("Use the lineage breakdown table to confirm that intermediate fields move consistently with the final output.")
    return plan


def run_agent_rootcause(execution_id_a: str, execution_id_b: str, output_column: str, position: Optional[str] = None) -> Dict[str, Any]:
    final_state: AgentState = ROOTCAUSE_GRAPH.invoke({
        "execution_a": _load_execution(execution_id_a),
        "execution_b": _load_execution(execution_id_b),
        "output_column": output_column.strip(),
        "position": position,
        "comparison": {},
        "lineage": {},
        "input_changes": [],
        "release_notes": [],
        "verification": [],
        "warnings": [],
        "position_release_notes": {},
        "hypotheses": [],
        "scored_hypotheses": [],
        "counterfactuals": [],
        "rejected_release_notes": [],
        "final_decision": {},
        "merged_evidence": {},
        "llm_report": {},
        "stages": [],
    })
    rows, details = _build_rows(final_state)
    report = final_state.get("llm_report", {})
    ranked_drivers = _build_ranked_drivers(final_state, rows)
    release_note_assessments = _build_release_note_assessments(final_state)
    contradictions = _build_contradictions(final_state, release_note_assessments)
    uncertainty_notes = _build_uncertainty_notes(final_state, ranked_drivers, contradictions)
    validation_plan = _build_validation_plan(final_state, ranked_drivers)
    architecture_agents = [
        "Comparison Analyst Agent",
        "Formula/Lineage Analyst Agent",
        "Input-Change Agent",
        "Release-Note Agent",
        "Causal Verification Agent",
        "Hypothesis Generation Agent",
        "Hypothesis Scoring Agent",
        "Counterfactual What-If Agent",
        "Release-Note Rejection Agent",
        "Critic/Consistency Agent",
        "Final Decision Agent",
    ]
    return _json_safe({
        "status": "success",
        "comparison_direction": "B - A (execution_b minus execution_a)",
        "stages": {
            "comparison_direction": "B - A (execution_b minus execution_a)",
            "dependencies": final_state.get("lineage", {}).get("ordered", [])[:-1],
            "changed_source_fields": final_state.get("input_changes", []),
            "release_notes": final_state.get("release_notes", []),
            "deviations": final_state.get("comparison", {}).get("comparison_data", []),
        },
        "analysis": {
            "root_cause": report.get("root_cause", final_state.get("merged_evidence", {}).get("classification", "Unresolved Issue")),
            "explanation": report.get("explanation", "LangGraph RootCause analysis completed."),
            "confidence": report.get("confidence", _confidence(final_state)),
            "primary_cause": report.get("primary_cause") or final_state.get("final_decision", {}).get("primary_cause") or (ranked_drivers[0]["field"] if ranked_drivers else "Unresolved"),
            "evidence": report.get("evidence", []),
            "changed_fields": sorted({str(item.get("field")) for item in final_state.get("input_changes", []) if item.get("field")}),
            "release_note_links": [str(note.get("workbook")) for note in final_state.get("release_notes", []) if note.get("workbook")],
            "next_checks": report.get("next_checks", []),
            "ranked_drivers": ranked_drivers,
            "hypotheses": final_state.get("hypotheses", []),
            "scored_hypotheses": final_state.get("scored_hypotheses", []),
            "counterfactuals": final_state.get("counterfactuals", []),
            "rejected_release_notes": final_state.get("rejected_release_notes", []),
            "final_decision": final_state.get("final_decision", {}),
            "release_note_assessments": release_note_assessments,
            "contradictions": contradictions,
            "uncertainty_notes": uncertainty_notes,
            "uncertainty_summary": report.get("uncertainty_summary") or " ".join(uncertainty_notes),
            "validation_plan": validation_plan,
            "rows": rows,
            "detail_rows": details,
        },
        "agent_stages": final_state.get("stages", []),
        "agent_architecture": {
            "orchestrator": "LangGraph StateGraph",
            "graph_nodes": [
                "comparison_analyst",
                "formula_lineage_analyst",
                "input_change_agent",
                "release_note_agent",
                "causal_verification_agent",
                "hypothesis_generation_agent",
                "hypothesis_scoring_agent",
                "counterfactual_agent",
                "release_note_rejection_agent",
                "final_decision_agent",
                "critic_consistency_agent",
                "evidence_merger_agent",
                "llm_rootcause_report",
            ],
            "agents": architecture_agents,
            "evidence_merger": "Evidence Merger Agent",
            "final_report": "Final Rootcause Report",
            "llm_provider": "openai" if os.environ.get("OPENAI_API_KEY") else "azure_openai" if os.environ.get("AZURE_OPENAI_API_KEY") and os.environ.get("AZURE_OPENAI_ENDPOINT") else "not_configured",
        },
    })
