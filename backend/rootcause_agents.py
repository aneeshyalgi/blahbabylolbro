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
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, TypedDict

import openpyxl
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

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
    human_review: Dict[str, Any]
    warnings: List[str]
    position_release_notes: Dict[str, List[Dict[str, Any]]]
    merged_evidence: Dict[str, Any]
    llm_report: Dict[str, Any]
    human_overrides: Dict[str, Any]
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


def _review_candidate_id(position: str, note: Dict[str, Any], index: int) -> str:
    parts = [
        position,
        str(note.get("jira_id") or ""),
        str(note.get("workbook") or ""),
        str(note.get("sheet") or ""),
        str(index),
    ]
    return "|".join(parts)


def _release_note_review_candidates(position_release_notes: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    for position, notes in position_release_notes.items():
        for index, note in enumerate(notes):
            candidates.append({
                "candidate_id": _review_candidate_id(str(position), note, index),
                "position": str(position),
                "jira_id": note.get("jira_id"),
                "workbook": note.get("workbook"),
                "sheet": note.get("sheet"),
                "matched_fields": note.get("matched_fields", []),
                "matched_changed_fields": note.get("matched_changed_fields", []),
                "relevance_score": note.get("relevance_score"),
                "solution_description": note.get("solution_description"),
                "problem_description": note.get("problem_description"),
                "record_text": note.get("record_text"),
                "label": _release_note_label(note),
            })
    return candidates


def _apply_human_release_note_review(
    position_release_notes: Dict[str, List[Dict[str, Any]]],
    human_review: Dict[str, Any],
) -> Dict[str, List[Dict[str, Any]]]:
    raw_decisions = human_review.get("decisions", []) if isinstance(human_review, dict) else []
    decisions = {
        str(item.get("candidate_id")): item
        for item in raw_decisions
        if isinstance(item, dict) and item.get("candidate_id") is not None
    }
    filtered: Dict[str, List[Dict[str, Any]]] = {}
    for position, notes in position_release_notes.items():
        kept: List[Dict[str, Any]] = []
        for index, note in enumerate(notes):
            candidate_id = _review_candidate_id(str(position), note, index)
            decision = decisions.get(candidate_id, {})
            status = str(decision.get("decision") or "accept").strip().casefold()
            if status == "reject":
                continue
            reviewed_note = dict(note)
            reviewed_note["human_review"] = {
                "candidate_id": candidate_id,
                "decision": status if status in {"accept", "partial"} else "accept",
                "comment": decision.get("comment") or human_review.get("comment") or "",
                "reviewed": True,
            }
            kept.append(reviewed_note)
        filtered[str(position)] = kept
    return filtered


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


def _coerce_dict_list(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [_json_safe(item) for item in value if isinstance(item, dict)]


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
    for position, position_notes in position_release_notes.items():
        for index, note in enumerate(position_notes):
            note["candidate_id"] = _review_candidate_id(str(position), note, index)
    review_candidates = _release_note_review_candidates(position_release_notes)
    human_review: Dict[str, Any] = {}
    if review_candidates:
        human_review = interrupt({
            "review_type": "release_notes",
            "message": "Review the release-note links proposed by the Release-Note Agent before the graph continues.",
            "candidates": review_candidates,
            "positions": position_keys,
        }) or {}
        if isinstance(human_review, dict):
            position_release_notes = _apply_human_release_note_review(position_release_notes, human_review)
            state["human_review"] = human_review
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
    if not ranked_notes and not human_review:
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
        "human_review": {
            "required": bool(review_candidates),
            "reviewed": bool(human_review),
            "decisions": human_review.get("decisions", []) if isinstance(human_review, dict) else [],
        },
        "matched_fields": sorted({field for note in notes for field in note.get("matched_fields", [])}),
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
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    if not api_key:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key, timeout=60.0, max_retries=1)
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.1,
            max_tokens=4200,
            response_format={"type": "json_object"},
        )
        return _parse_json_object(response.choices[0].message.content or "{}")
    except Exception as exc:
        status_code = getattr(exc, "status_code", None)
        body = getattr(exc, "body", None)
        message = f"OpenAI request failed for OPENAI_MODEL={model}: {exc}"
        if status_code == 404:
            message = f"OpenAI model not found or unavailable for OPENAI_MODEL={model}. Check that this exact model name is enabled for the API key. Original error: {exc}"
        return {"llm_error": message, "llm_status_code": status_code, "llm_body": body}


def _normalize_report_fields(report: Dict[str, Any]) -> Dict[str, Any]:
    report["confidence"] = _coerce_confidence(report.get("confidence"), 0)
    report["evidence"] = _coerce_text_list(report.get("evidence"))
    report["next_checks"] = _coerce_text_list(report.get("next_checks"))
    report["key_evidence"] = _coerce_text_list(report.get("key_evidence"))
    report["driver_summaries"] = _coerce_dict_list(report.get("driver_summaries"))
    report["release_note_assessments"] = _coerce_dict_list(report.get("release_note_assessments"))
    report["uncertainty_notes"] = _coerce_text_list(report.get("uncertainty_notes"))
    report["validation_plan"] = _coerce_text_list(report.get("validation_plan"))
    report["row_explanations"] = _normalize_row_explanations(report)
    return report


def _release_note_reference_ok(text: str) -> bool:
    lower = text.lower()
    release_terms = ("release", "jira", "solution description", "lösungsbeschreibung", "loesungsbeschreibung", "dokumentiert", "unterstützt", "unterstuetzt", "bestätigt", "bestaetigt")
    if not any(term in lower for term in release_terms):
        return True
    has_note_id = bool(re.search(r"\b(?:jira\s*)?\d{5,}\b", lower))
    has_solution = "solution description" in lower or "lösungsbeschreibung" in lower or "loesungsbeschreibung" in lower
    return has_note_id and has_solution


def _report_quality_violations(report: Dict[str, Any], position_facts: List[Dict[str, Any]]) -> List[str]:
    violations: List[str] = []
    generic_terms = ("ist relevant", "beeinflusst", "kann zusammenhängen", "kann zusammenhaengen", "weitere analyse erforderlich")
    text_fields = [
        str(report.get("root_cause") or ""),
        str(report.get("explanation") or ""),
        str(report.get("primary_cause") or ""),
        str(report.get("uncertainty_summary") or ""),
        *[str(item) for item in report.get("key_evidence", []) if isinstance(item, str)],
        *[str(item) for item in report.get("uncertainty_notes", []) if isinstance(item, str)],
        *[str(item) for item in report.get("validation_plan", []) if isinstance(item, str)],
    ]
    for item in report.get("driver_summaries", []):
        if isinstance(item, dict):
            text_fields.append(str(item.get("summary") or ""))
    for item in report.get("release_note_assessments", []):
        if isinstance(item, dict):
            text_fields.append(str(item.get("assessment") or ""))
    row_explanations = report.get("row_explanations", {}) if isinstance(report.get("row_explanations"), dict) else {}
    text_fields.extend(str(value) for value in row_explanations.values() if isinstance(value, str))

    if len(str(report.get("root_cause") or "")) < 350:
        violations.append("root_cause ist zu kurz; schreibe 2 bis 4 substanzielle deutsche Absaetze.")
    if len(str(report.get("explanation") or "")) < 250:
        violations.append("explanation ist zu kurz; erklaere die technische Lineage-Propagation detaillierter.")
    if len(report.get("key_evidence", [])) < 4:
        violations.append("key_evidence muss mindestens 4 konkrete deutsche Evidenzsaetze enthalten.")
    for fact in position_facts:
        position = str(fact.get("position"))
        explanation = str(row_explanations.get(position) or "")
        if len(explanation) < 300:
            violations.append(f"row_explanations[{position}] ist zu kurz; schreibe 3 bis 5 konkrete Saetze.")
        if str(fact.get("value_a_baseline")) not in explanation or str(fact.get("value_b_compare")) not in explanation:
            violations.append(f"row_explanations[{position}] muss value_a_baseline und value_b_compare exakt enthalten.")
        if str(fact.get("difference_b_minus_a")) not in explanation:
            violations.append(f"row_explanations[{position}] muss difference_b_minus_a exakt enthalten.")
    for text in text_fields:
        lower = text.lower()
        if any(term in lower for term in generic_terms):
            violations.append("Generische Formulierung gefunden; ersetze sie durch konkrete Lineage-, Werte- und Release-Note-Begruendung.")
        if not _release_note_reference_ok(text):
            violations.append("Release-Note-Aussage ohne Jira/Release-Note-Nummer und Solution Description gefunden.")
    return sorted(set(violations))[:12]


def llm_rootcause_report_node(state: AgentState) -> AgentState:
    stage_warnings = [stage["agent"] for stage in state.get("stages", []) if stage.get("status") in {"warning", "limited", "no evidence"}]
    classification = "Confirmed Cause" if not stage_warnings and state.get("input_changes") else "Likely Cause" if state.get("input_changes") else "Unresolved Issue"
    merged_evidence = {
        "confirmed_facts": {
            "comparison_positions": len(state.get("comparison", {}).get("comparison_data", [])),
            "changed_inputs": len(state.get("input_changes", [])),
            "calculation_path": " -> ".join(state.get("lineage", {}).get("ordered", [])),
        },
        "supporting_documentation": state.get("release_notes", []),
        "warnings": stage_warnings + state.get("warnings", []),
        "classification": classification,
        "human_review": state.get("human_review", {}),
        "human_overrides": state.get("human_overrides", {}),
    }
    state["merged_evidence"] = merged_evidence
    output_rows_a = _position_map(state["execution_a"].get("data", []))
    output_rows_b = _position_map(state["execution_b"].get("data", []))
    position_facts = []
    for row in state.get("comparison", {}).get("comparison_data", []):
        position = str(row.get("key"))
        value_a = output_rows_a.get(position, {}).get(state["output_column"])
        value_b = output_rows_b.get(position, {}).get(state["output_column"])
        difference = _numeric_difference(value_a, value_b)
        position_facts.append({
            "position": position,
            "output_column": state["output_column"],
            "value_a_baseline": _safe_value(value_a),
            "value_b_compare": _safe_value(value_b),
            "difference_b_minus_a": _safe_value(difference),
            "movement_de": "gestiegen" if difference is not None and difference > 0 else "gesunken" if difference is not None and difference < 0 else "unveraendert",
            "required_sentence_pattern": "von value_a_baseline auf value_b_compare, B - A = difference_b_minus_a",
        })
    evidence_payload = {
        "output_column": state["output_column"],
        "comparison_direction": "B - A (execution_b minus execution_a)",
        "comparison": state.get("comparison", {}),
        "positions": [str(row.get("key")) for row in state.get("comparison", {}).get("comparison_data", [])],
        "position_facts_must_copy": position_facts,
        "lineage": _json_safe(state.get("lineage", {})),
        "input_changes": state.get("input_changes", []),
        "release_notes": state.get("release_notes", [])[:12],
        "position_release_notes": state.get("position_release_notes", {}),
        "merged_evidence": merged_evidence,
        "human_review": state.get("human_review", {}),
        "human_overrides": state.get("human_overrides", {}),
    }
    messages = [
        {
            "role": "system",
            "content": (
                "Du bist der finale LangGraph RootCause Report Agent fuer eine finanzielle Datenanalyse. "
                "Du schreibst ausschliesslich auf Deutsch. Keine englischen Saetze, keine englischen Labels in Freitextfeldern. "
                "Nutze ausschliesslich die gelieferten Evidenzdaten. Erfinde keine Felder, Positionen, Werte, Formeln, Jira-IDs oder Release-Notes. "
                "Alle Abweichungen sind strikt B - A, also execution_b minus execution_a. value_a ist Baseline, value_b ist Vergleich. "
                "Wenn difference positiv ist, ist der Output gestiegen. Wenn difference negativ ist, ist der Output gesunken. "
                "Diese Richtung muss in jeder Positions-Erklaerung mathematisch korrekt sein. Pruefe sie vor dem Antworten. "
                "Nutze position_facts_must_copy als verbindliche Wahrheit fuer jede Position. Schreibe immer von value_a_baseline auf value_b_compare, niemals umgekehrt. "
                "Beispielregel: Wenn value_a_baseline=20000, value_b_compare=19200 und difference_b_minus_a=-800, dann muss der Text sagen: 'von 20000 auf 19200 gesunken (B - A = -800)'. "
                "Ein Text wie 'von 19200 auf 20000 gestiegen' waere in diesem Beispiel falsch und verboten. "
                "Antworte mit validem JSON und exakt diesen Top-Level-Schluesseln: root_cause, explanation, confidence, evidence, next_checks, "
                "row_explanations, rows, primary_cause, uncertainty_summary, key_evidence, driver_summaries, release_note_assessments, "
                "uncertainty_notes, validation_plan. Keine Markdown-Ausgabe ausserhalb des JSON. "
                "Qualitaetsregeln: Jede Freitextantwort muss konkret, evidenzbasiert und nicht generisch sein. Verbotene Formulierungen sind: "
                "'ist relevant', 'beeinflusst', 'kann zusammenhaengen', 'weitere Analyse erforderlich' ohne konkrete Begruendung. "
                "Nenne immer konkrete Werte, Felder, Positionen und die beobachtete B-minus-A-Bewegung. "
                "root_cause muss 2 bis 4 dichte Absaetze enthalten: erst die Hauptursache, dann die wichtigsten Treiber, dann Release-Note-Unterstuetzung, dann Unsicherheit. "
                "explanation muss technisch sein und die Kette von geaenderten Feldern ueber die Lineage bis zum Output erklaeren. "
                "primary_cause muss ein kurzer deutscher Ursachen-Satz sein, nicht nur ein Feldname. "
                "Wenn human_overrides.primary_cause_override vorhanden ist, uebernimm diese menschliche Formulierung als primaere Ursache und richte root_cause, explanation und die Positions-Erklaerungen daran aus. "
                "Wenn human_overrides.release_note_decisions vorhanden ist, beruecksichtige nur akzeptierte oder teilweise akzeptierte Release-Note-Kandidaten; abgelehnte Kandidaten duerfen nicht als Unterstuetzung erscheinen. "
                "Die human_review-Entscheidungen und Kommentare sind verbindliche menschliche Korrekturen. Ignoriere keine Entscheidung: akzeptierte und teilweise akzeptierte Kandidaten duerfen verwendet werden, abgelehnte Kandidaten muessen vollstaendig ausgeschlossen werden. "
                "key_evidence muss 4 bis 7 deutsche Evidenzsaetze enthalten. Jeder Satz muss eine konkrete Beobachtung enthalten. Keine JSON-Strings als Text. "
                "driver_summaries muss ein Array von Objekten sein. Jedes Objekt hat field, summary, positions, support. "
                "summary muss erklaeren, warum genau dieses Feld ein Treiber ist, welche Positionen betroffen sind und wie es in der Lineage wirkt. "
                "support muss kurz sagen: 'stark unterstuetzt', 'teilweise unterstuetzt' oder 'nicht dokumentiert'. "
                "release_note_assessments muss ein Array von Objekten sein. Jedes Objekt hat position, status, jira_id, assessment. "
                "assessment muss erklaeren, warum die Release Note diese Position stuetzt, nur teilweise stuetzt oder nicht beweist. "
                "Release-Note-Zitationsregel ohne Ausnahme: Immer wenn du in root_cause, explanation, key_evidence, driver_summaries[].summary, "
                "release_note_assessments[].assessment, row_explanations oder rows[].explanation behauptest, dass eine Release Note etwas stuetzt, teilweise stuetzt, dokumentiert, bestaetigt oder erklaert, "
                "musst du in demselben Satz oder direkt im Folgesatz die konkrete Jira-ID bzw. Release-Note-Nummer und die Solution Description nennen. "
                "Form: 'Jira <jira_id> mit der Solution Description "
                "\"<solution_description>\" ...'. Wenn jira_id fehlt, nutze den besten verfuegbaren Release-Note-Bezeichner aus workbook/sheet. "
                "Wenn solution_description leer oder nicht vorhanden ist, schreibe explizit: 'eine Solution Description ist in den Evidenzdaten nicht verfuegbar'. "
                "Ein Satz wie 'Die Release Notes unterstuetzen dies' ist verboten, wenn er nicht Jira-ID/Release-Note-Nummer und Solution Description enthaelt. "
                "Ein Satz wie 'in den Release-Notizen dokumentiert' ist verboten, wenn er nicht dieselben Details enthaelt. "
                "Verwende position_release_notes als einzige massgebliche Kandidatenliste je Position. Kopiere niemals Jira-ID oder Loesungsbeschreibung von einer anderen Position. "
                "Behaupte niemals Kausalitaet nur wegen eines Feldnamens. Eine Release Note ist nur Unterstuetzung, wenn Position, geaendertes Feld, Problem-/Solution-Beschreibung und Lineage zusammenpassen. "
                "row_explanations muss ein Objekt sein, dessen Keys exakt die Positionen aus positions sind. Fuer jede Position 3 bis 5 deutsche Saetze: "
                "Satz 1 muss exakt die Werte aus position_facts_must_copy benutzen und die Bewegung von value_a_baseline auf value_b_compare mit B - A nennen. Satz 2 nennt die geaenderten Treiberfelder. "
                "Satz 3 erklaert die Propagation ueber die Lineage bis zum Output. Satz 4 bewertet Release-Note-Unterstuetzung und muss dabei Jira-ID/Release-Note-Nummer sowie Solution Description nennen. "
                "Satz 5 nennt Unsicherheit, falls die Evidenz nicht voll beweisend ist. "
                "rows muss zusaetzlich ein Array mit einem Objekt pro Position sein, jedes mit position und explanation; die explanation muss inhaltlich identisch oder mindestens gleichwertig zu row_explanations[position] sein. "
                "uncertainty_notes muss konkrete Unsicherheiten nennen, nicht generisch. validation_plan muss konkrete Pruefschritte nennen, z.B. welches Feld, welche Position oder welche Release Note zu validieren ist. "
                "confidence ist eine Zahl von 0 bis 100. Gib keine Woerter wie 'hoch' statt einer Zahl zurueck."
            ),
        },
        {"role": "user", "content": json.dumps(_json_safe(evidence_payload), ensure_ascii=True)},
    ]
    report = _llm_client_response(messages)
    if not report or report.get("llm_error"):
        report = {"llm_error": report.get("llm_error") if report else "OpenAI is not configured"}
        status = "fallback"
    else:
        report = _normalize_report_fields(report)
        violations = _report_quality_violations(report, position_facts)
        if violations:
            retry_messages = messages + [
                {
                    "role": "system",
                    "content": (
                        "Die vorherige Antwort wurde wegen Qualitaetsverstoessen abgelehnt. "
                        "Erzeuge das komplette JSON neu. Behebe alle folgenden Punkte strikt: "
                        + json.dumps(violations, ensure_ascii=False)
                    ),
                }
            ]
            retry_report = _llm_client_response(retry_messages)
            if retry_report and not retry_report.get("llm_error"):
                report = _normalize_report_fields(retry_report)
                violations = _report_quality_violations(report, position_facts)
            if violations:
                report["quality_warnings"] = violations
        human_overrides = state.get("human_overrides", {})
        primary_override = str(human_overrides.get("primary_cause_override") or "").strip()
        if primary_override:
            report["primary_cause"] = primary_override
            root_cause_text = str(report.get("root_cause") or "").strip()
            explanation_text = str(report.get("explanation") or "").strip()
            override_marker = "Menschlich festgelegte Hauptursache:"
            if primary_override.casefold() not in root_cause_text.casefold():
                report["root_cause"] = f"{override_marker} {primary_override}\n\n{root_cause_text}" if root_cause_text else f"{override_marker} {primary_override}"
            if primary_override.casefold() not in explanation_text.casefold():
                report["explanation"] = f"{override_marker} {primary_override}\n\n{explanation_text}" if explanation_text else f"{override_marker} {primary_override}"
            report["human_override_applied"] = True
        if state.get("human_review") or human_overrides:
            report["human_review_applied"] = True
        status = "completed"
    state["llm_report"] = report
    _append_stage(state, "Final Rootcause Report", status, {
        "process_steps": [
            "Merged comparison, lineage, changed fields, release-note evidence, and warnings into one evidence packet.",
            "Prepared a compact evidence payload from that merged packet for final report generation.",
            "Asked the configured LLM to write German JSON output using only supplied evidence and position-specific release-note candidates.",
            "Parsed the LLM JSON response and normalized confidence, evidence, and next-check fields for UI rendering.",
            f"Final report status: {status}.",
        ],
        "classification": classification,
        "merged_evidence": merged_evidence,
        "confidence": report.get("confidence", _confidence(state)),
        "llm_model": os.environ.get("OPENAI_MODEL") or "not configured",
        "llm_error": report.get("llm_error"),
    })
    return state


def _normalize_row_explanations(report: Dict[str, Any]) -> Dict[str, str]:
    explanations: Dict[str, str] = {}
    raw = report.get("row_explanations")
    if isinstance(raw, dict):
        for position, explanation in raw.items():
            if isinstance(explanation, str) and explanation.strip():
                explanations[str(position)] = explanation.strip()
            elif isinstance(explanation, dict):
                text = explanation.get("explanation") or explanation.get("text") or explanation.get("summary")
                if isinstance(text, str) and text.strip():
                    explanations[str(position)] = text.strip()
    rows = report.get("rows")
    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, dict):
                continue
            position = row.get("position") or row.get("key") or row.get("deviation")
            explanation = row.get("explanation") or row.get("root_cause") or row.get("summary")
            if position is not None and isinstance(explanation, str) and explanation.strip():
                explanations.setdefault(str(position), explanation.strip())
    return explanations


def _build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("comparison_analyst", comparison_analyst_node)
    graph.add_node("formula_lineage_analyst", formula_lineage_analyst_node)
    graph.add_node("input_change_agent", input_change_agent_node)
    graph.add_node("release_note_agent", release_note_agent_node)
    graph.add_node("llm_rootcause_report", llm_rootcause_report_node)
    graph.add_edge(START, "comparison_analyst")
    graph.add_edge("comparison_analyst", "formula_lineage_analyst")
    graph.add_edge("formula_lineage_analyst", "input_change_agent")
    graph.add_edge("input_change_agent", "release_note_agent")
    graph.add_edge("release_note_agent", "llm_rootcause_report")
    graph.add_edge("llm_rootcause_report", END)
    return graph.compile(checkpointer=MemorySaver())


ROOTCAUSE_GRAPH = _build_graph()


def _first_interrupt(snapshot: Any) -> Optional[Dict[str, Any]]:
    for task in getattr(snapshot, "tasks", ()) or ():
        for item in getattr(task, "interrupts", ()) or ():
            value = getattr(item, "value", None)
            if isinstance(value, dict):
                return value
    return None


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
    for comparison_row in state.get("comparison", {}).get("comparison_data", []):
        position = str(comparison_row.get("key"))
        left = output_a.get(position, {}).get(output)
        right = output_b.get(position, {}).get(output)
        changed_fields = [item for item in state.get("input_changes", []) if str(item.get("position")) == position]
        position_notes = state.get("position_release_notes", {}).get(position, [])
        note_labels = [_release_note_label(note) for note in position_notes if _release_note_label(note)]
        explanation = row_explanations.get(position)
        if not isinstance(explanation, str) or not explanation.strip():
            explanation = ""
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
            details.append({
                "position": position,
                "output": field_name,
                "value_a": _safe_value(field_left),
                "value_b": _safe_value(field_right),
                "difference": _safe_value(_numeric_difference(field_left, field_right)),
                "lineage": lineage_path,
                "input": ", ".join(field_parents),
                "release_note": _join_release_note_labels(field_notes),
                "explanation": "",
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
        driver["why_it_matters"] = ""
    return ranked


def _format_success_response(final_state: AgentState, review_id: Optional[str] = None) -> Dict[str, Any]:
    rows, details = _build_rows(final_state)
    report = final_state.get("llm_report", {})
    ranked_drivers = _build_ranked_drivers(final_state, rows)
    release_note_assessments = _coerce_dict_list(report.get("release_note_assessments"))
    uncertainty_notes = _coerce_text_list(report.get("uncertainty_notes"))
    validation_plan = _coerce_text_list(report.get("validation_plan"))
    key_evidence = _coerce_text_list(report.get("key_evidence"))
    driver_summaries = _coerce_dict_list(report.get("driver_summaries"))
    architecture_agents = [
        "Comparison Analyst Agent",
        "Formula/Lineage Analyst Agent",
        "Input-Change Agent",
        "Release-Note Agent",
        "Final Rootcause Report",
    ]
    return _json_safe({
        "status": "success",
        "review_id": review_id,
        "post_run_review_available": bool(review_id),
        "comparison_direction": "B - A (execution_b minus execution_a)",
        "stages": {
            "comparison_direction": "B - A (execution_b minus execution_a)",
            "dependencies": final_state.get("lineage", {}).get("ordered", [])[:-1],
            "changed_source_fields": final_state.get("input_changes", []),
            "release_notes": final_state.get("release_notes", []),
            "deviations": final_state.get("comparison", {}).get("comparison_data", []),
        },
        "analysis": {
            "root_cause": report.get("root_cause", ""),
            "explanation": report.get("explanation", ""),
            "confidence": report.get("confidence", _confidence(final_state)),
            "primary_cause": report.get("primary_cause", ""),
            "evidence": report.get("evidence", []),
            "key_evidence": key_evidence,
            "changed_fields": sorted({str(item.get("field")) for item in final_state.get("input_changes", []) if item.get("field")}),
            "release_note_links": [str(note.get("workbook")) for note in final_state.get("release_notes", []) if note.get("workbook")],
            "next_checks": report.get("next_checks", []),
            "ranked_drivers": ranked_drivers,
            "driver_summaries": driver_summaries,
            "release_note_assessments": release_note_assessments,
            "uncertainty_notes": uncertainty_notes,
            "uncertainty_summary": report.get("uncertainty_summary", ""),
            "validation_plan": validation_plan,
            "human_review_applied": bool(final_state.get("human_review") or final_state.get("human_overrides")),
            "human_override_applied": bool(report.get("human_override_applied")),
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
                "llm_rootcause_report",
            ],
            "agents": architecture_agents,
            "final_report": "Final Rootcause Report",
            "llm_provider": "openai" if os.environ.get("OPENAI_API_KEY") else "not_configured",
        },
    })


def _format_release_note_review_response(review_id: str, snapshot: Any) -> Dict[str, Any]:
    interrupt_payload = _first_interrupt(snapshot) or {}
    values = getattr(snapshot, "values", {}) or {}
    candidates = interrupt_payload.get("candidates", []) if isinstance(interrupt_payload, dict) else []
    return _json_safe({
        "status": "requires_review",
        "review_id": review_id,
        "review_type": "release_notes",
        "message": interrupt_payload.get("message") or "Release-note review required before the graph can continue.",
        "release_note_candidates": candidates,
        "agent_stages": list(values.get("stages", [])) + [{
            "agent": "Release-Note Agent",
            "status": "requires_review",
            "findings": {
                "process_steps": [
                    "Scanned and ranked release-note candidates.",
                    "Paused the LangGraph run with interrupt() before final report generation.",
                    "Waiting for human accept, reject, or partial decisions for the proposed links.",
                ],
                "review_type": "release_notes",
                "candidate_count": len(candidates),
                "release_notes_found": len(candidates),
                "position_specific_release_notes": {
                    str(position): sum(1 for candidate in candidates if str(candidate.get("position")) == str(position))
                    for position in sorted({str(candidate.get("position")) for candidate in candidates})
                },
                "review_required": True,
            },
        }],
        "agent_architecture": {
            "orchestrator": "LangGraph StateGraph with interrupt/checkpoint resume",
            "human_in_the_loop": "Release-Note Agent only",
            "paused_node": "release_note_agent",
        },
    })


def run_agent_rootcause(execution_id_a: str, execution_id_b: str, output_column: str, position: Optional[str] = None) -> Dict[str, Any]:
    review_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": review_id}}
    final_state: AgentState = ROOTCAUSE_GRAPH.invoke({
        "execution_a": _load_execution(execution_id_a),
        "execution_b": _load_execution(execution_id_b),
        "output_column": output_column.strip(),
        "position": position,
        "comparison": {},
        "lineage": {},
        "input_changes": [],
        "release_notes": [],
        "human_review": {},
        "human_overrides": {},
        "warnings": [],
        "position_release_notes": {},
        "merged_evidence": {},
        "llm_report": {},
        "stages": [],
    }, config=config)
    snapshot = ROOTCAUSE_GRAPH.get_state(config)
    if _first_interrupt(snapshot):
        return _format_release_note_review_response(review_id, snapshot)
    return _format_success_response(final_state, review_id)


def resume_agent_rootcause(review_id: str, human_review: Dict[str, Any]) -> Dict[str, Any]:
    if not review_id:
        raise ValueError("review_id is required")
    config = {"configurable": {"thread_id": review_id}}
    snapshot = ROOTCAUSE_GRAPH.get_state(config)
    if not getattr(snapshot, "next", None):
        raise ValueError(f"Review session {review_id} not found or already completed")
    final_state: AgentState = ROOTCAUSE_GRAPH.invoke(Command(resume=human_review), config=config)
    return _format_success_response(final_state, review_id)


def _apply_post_run_overrides(state: AgentState, overrides: Dict[str, Any]) -> AgentState:
    state["human_overrides"] = overrides
    decisions = {
        str(item.get("candidate_id") or item.get("index")): item
        for item in overrides.get("release_note_decisions", [])
        if isinstance(item, dict)
    }
    if decisions:
        all_notes = list(state.get("release_notes", []))
        kept_notes: List[Dict[str, Any]] = []
        for index, note in enumerate(all_notes):
            candidate_id = str(note.get("candidate_id") or index)
            decision = decisions.get(candidate_id, decisions.get(str(index), {}))
            choice = str(decision.get("decision") or "accept").casefold()
            if choice == "reject":
                continue
            reviewed_note = dict(note)
            reviewed_note["human_review"] = {
                "decision": choice if choice in {"accept", "partial"} else "accept",
                "comment": decision.get("comment") or "",
            }
            kept_notes.append(reviewed_note)
        state["release_notes"] = kept_notes
        filtered_positions: Dict[str, List[Dict[str, Any]]] = {}
        for position, notes in state.get("position_release_notes", {}).items():
            filtered_positions[str(position)] = [
                note for note in notes
                if note in kept_notes or any(
                    note.get("jira_id") == kept.get("jira_id")
                    and note.get("workbook") == kept.get("workbook")
                    and note.get("sheet") == kept.get("sheet")
                    for kept in kept_notes
                )
            ]
        state["position_release_notes"] = filtered_positions
    return state


def post_run_agent_rootcause_review(review_id: str, overrides: Dict[str, Any]) -> Dict[str, Any]:
    if not review_id:
        raise ValueError("review_id is required")
    config = {"configurable": {"thread_id": review_id}}
    snapshot = ROOTCAUSE_GRAPH.get_state(config)
    values = getattr(snapshot, "values", {}) or {}
    if not values or not values.get("comparison"):
        raise ValueError(f"Completed review session {review_id} not found")
    final_state = _apply_post_run_overrides(dict(values), overrides)
    final_state = llm_rootcause_report_node(final_state)
    ROOTCAUSE_GRAPH.update_state(config, {
        "human_overrides": overrides,
        "llm_report": final_state.get("llm_report", {}),
        "stages": final_state.get("stages", []),
        "release_notes": final_state.get("release_notes", []),
        "position_release_notes": final_state.get("position_release_notes", {}),
    })
    return _format_success_response(final_state, review_id)
