"""Independent multi-agent RootCause analysis pipeline.

This module intentionally does not import ``main`` or call the normal RootCause
endpoint.  It owns the AI-agent workflow used only by
``/api/rootcause/agents/analyze``.
"""
from __future__ import annotations

import ast
import json
import math
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import openpyxl

import database as db


RESULTS_DIR = Path(os.environ.get("RESULTS_DIR", str(Path(__file__).parent / "results")))
CODE_DIR = Path(os.environ.get("CODE_DIR", str(Path(__file__).parent / "uploads" / "code")))
RELEASE_NOTES_DIR = Path(
    os.environ.get("RELEASE_NOTES_DIR", str(Path(__file__).parent / "uploads" / "release_notes"))
)


@dataclass
class AgentContext:
    execution_a: Dict[str, Any]
    execution_b: Dict[str, Any]
    output_column: str
    position: Optional[str]
    comparison: Dict[str, Any] = field(default_factory=dict)
    lineage: Dict[str, Any] = field(default_factory=dict)
    input_changes: List[Dict[str, Any]] = field(default_factory=list)
    release_notes: List[Dict[str, Any]] = field(default_factory=list)
    verification: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    stages: List[Dict[str, Any]] = field(default_factory=list)


class Agent:
    name = "Agent"

    def run(self, context: AgentContext) -> Dict[str, Any]:
        raise NotImplementedError

    def record(self, context: AgentContext, status: str, findings: Dict[str, Any]) -> Dict[str, Any]:
        result = {"agent": self.name, "status": status, "findings": findings}
        context.stages.append(result)
        return result


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


def _position_map(rows: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    rows = list(rows)
    position_key = next(
        (key for key in (rows[0].keys() if rows else []) if str(key).strip().casefold() == "position"),
        None,
    )
    if position_key:
        return {str(row.get(position_key)): row for row in rows if row.get(position_key) is not None}
    return {str(index): row for index, row in enumerate(rows)}


def _numeric_difference(left: Any, right: Any) -> Optional[float]:
    try:
        return float(right) - float(left)
    except (TypeError, ValueError):
        return None


def _common_columns(result_a: Dict[str, Any], result_b: Dict[str, Any]) -> List[str]:
    columns_a = result_a.get("summary", {}).get("columns", [])
    columns_b = result_b.get("summary", {}).get("columns", [])
    return [column for column in columns_a if column in columns_b]


def _key_column(columns: List[str]) -> Optional[str]:
    candidates = ["ID", "Id", "id", "KEY", "Key", "key", "INDEX", "Index", "index", "Position", "position"]
    return next((candidate for candidate in candidates if candidate in columns), columns[0] if columns else None)


class ComparisonAnalystAgent(Agent):
    name = "Comparison Analyst Agent"

    def run(self, context: AgentContext) -> Dict[str, Any]:
        columns = _common_columns(context.execution_a, context.execution_b)
        key_column = _key_column(columns)
        rows_a = context.execution_a.get("data", [])
        rows_b = context.execution_b.get("data", [])
        map_a = {str(row.get(key_column)): row for row in rows_a if key_column and row.get(key_column) is not None}
        map_b = {str(row.get(key_column)): row for row in rows_b if key_column and row.get(key_column) is not None}
        keys = sorted(set(map_a) | set(map_b))
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
                        "difference": _numeric_difference(row_a.get(column), row_b.get(column)),
                    }
                    for column in columns
                ],
            })
        context.comparison = {
            "key_column": key_column,
            "common_columns": columns,
            "comparison_data": comparison_rows,
            "comparison_direction": "B - A (execution_b minus execution_a)",
        }
        deviations = [
            row for row in comparison_rows
            if any(column.get("difference") not in (None, 0) or not _values_equal(column.get("value_a"), column.get("value_b")) for column in row["columns"])
        ]
        return self.record(context, "completed", {
            "positions_reviewed": len(comparison_rows),
            "deviations_found": len(deviations),
            "key_column": key_column,
            "common_columns": columns,
        })


def _dataset_columns(dataset_id: str) -> List[str]:
    metadata = db.get_dataset_metadata(dataset_id) or {}
    tables = metadata.get("tables") or []
    return [column.get("name") for column in (tables[0].get("columns") or []) if column.get("name")] if tables else []


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


class FormulaLineageAnalystAgent(Agent):
    name = "Formula/Lineage Analyst Agent"

    def run(self, context: AgentContext) -> Dict[str, Any]:
        graph_a = _lineage_from_code(_code_for_execution(context.execution_a), context.output_column)
        graph_b = _lineage_from_code(_code_for_execution(context.execution_b), context.output_column)
        graph: Dict[str, Set[str]] = {}
        for source in (graph_a, graph_b):
            for output, parents in source.items():
                graph.setdefault(output, set()).update(parents)
        ordered = _ordered_lineage(graph, context.output_column)
        context.lineage = {"graph": graph, "ordered": ordered}
        return self.record(context, "completed" if len(ordered) > 1 else "limited", {
            "calculation_path": " -> ".join(ordered),
            "dependencies": ordered[:-1],
            "lineage_available": len(ordered) > 1,
        })


class InputChangeAgent(Agent):
    name = "Input-Change Agent"

    def run(self, context: AgentContext) -> Dict[str, Any]:
        source_fields = [field for field in context.lineage.get("ordered", []) if field != context.output_column]
        input_a = _position_map(_input_rows(context.execution_a.get("dataset_id")))
        input_b = _position_map(_input_rows(context.execution_b.get("dataset_id")))
        output_a = _position_map(context.execution_a.get("data", []))
        output_b = _position_map(context.execution_b.get("data", []))
        positions = [row["key"] for row in context.comparison.get("comparison_data", [])]
        if context.position:
            positions = [item for item in positions if str(item) == str(context.position)]
        changes: List[Dict[str, Any]] = []
        for position in positions:
            for field_name in source_fields:
                derived = field_name in context.lineage.get("graph", {})
                left_row = output_a.get(str(position), {}) if derived else input_a.get(str(position), {})
                right_row = output_b.get(str(position), {}) if derived else input_b.get(str(position), {})
                left = left_row.get(field_name)
                right = right_row.get(field_name)
                if not _values_equal(left, right):
                    changes.append({"position": str(position), "field": field_name, "value_a": _safe_value(left), "value_b": _safe_value(right), "classification": "changed"})
        context.input_changes = changes
        return self.record(context, "completed", {
            "changed_source_fields": len(changes),
            "changed_fields_by_position": _group_fields(changes),
        })


def _input_rows(dataset_id: Optional[str]) -> List[Dict[str, Any]]:
    if not dataset_id:
        return []
    metadata = db.get_dataset_metadata(dataset_id) or {}
    tables = metadata.get("tables") or []
    if not tables:
        return []
    frame = db.get_table_data(metadata.get("user_name", ""), tables[0].get("id"), "input_data")
    return frame.to_dict(orient="records") if frame is not None and not frame.empty else []


def _group_fields(items: Iterable[Dict[str, Any]]) -> Dict[str, List[str]]:
    grouped: Dict[str, List[str]] = {}
    for item in items:
        grouped.setdefault(str(item.get("position", "")), []).append(str(item.get("field", "")))
    return grouped


class ReleaseNoteAgent(Agent):
    name = "Release-Note Agent"

    def run(self, context: AgentContext) -> Dict[str, Any]:
        dependencies = set(context.lineage.get("ordered", []))
        notes: List[Dict[str, Any]] = []
        for metadata_path in RELEASE_NOTES_DIR.glob("*.json"):
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                workbook_path = RELEASE_NOTES_DIR / str(metadata.get("stored_filename", ""))
                if not workbook_path.exists():
                    continue
                workbook = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True, keep_vba=workbook_path.suffix.lower() == ".xlsm")
                for worksheet in workbook.worksheets:
                    for row in worksheet.iter_rows(values_only=True):
                        text = " ".join(str(value) for value in row if value is not None)
                        matched = sorted(field for field in dependencies if field.casefold() in text.casefold())
                        if matched:
                            notes.append({"workbook": metadata.get("filename"), "sheet": worksheet.title, "matched_fields": matched, "record_text": text[:2000]})
                workbook.close()
            except Exception:
                continue
        context.release_notes = notes[:60]
        return self.record(context, "completed" if notes else "no evidence", {
            "release_notes_found": len(notes),
            "matched_fields": sorted({field for note in notes for field in note.get("matched_fields", [])}),
        })


class CausalVerificationAgent(Agent):
    name = "Causal Verification Agent"

    def run(self, context: AgentContext) -> Dict[str, Any]:
        context.verification = []
        output_rows_a = _position_map(context.execution_a.get("data", []))
        output_rows_b = _position_map(context.execution_b.get("data", []))
        positions = [row["key"] for row in context.comparison.get("comparison_data", [])]
        if context.position:
            positions = [item for item in positions if str(item) == str(context.position)]
        for position in positions:
            left = output_rows_a.get(str(position), {}).get(context.output_column)
            right = output_rows_b.get(str(position), {}).get(context.output_column)
            changed = [item for item in context.input_changes if str(item.get("position")) == str(position)]
            context.verification.append({
                "position": str(position),
                "output_a": _safe_value(left),
                "output_b": _safe_value(right),
                "difference": _numeric_difference(left, right),
                "candidate_fields": [item.get("field") for item in changed],
                "classification": "partially supported" if changed else "unable to verify",
            })
        return self.record(context, "completed", {
            "positions_verified": len(context.verification),
            "supported_positions": sum(1 for item in context.verification if item["candidate_fields"]),
        })


class ConsistencyAgent(Agent):
    name = "Critic/Consistency Agent"

    def run(self, context: AgentContext) -> Dict[str, Any]:
        warnings: List[str] = []
        for row in context.comparison.get("comparison_data", []):
            for column in row.get("columns", []):
                left = column.get("value_a")
                right = column.get("value_b")
                difference = column.get("difference")
                if difference is not None and not _values_equal(_numeric_difference(left, right), difference):
                    warnings.append(f"{row.get('key')}:{column.get('column_name')}")
        context.warnings = warnings
        return self.record(context, "warning" if warnings else "completed", {
            "direction": "B - A",
            "inconsistencies": warnings,
            "evidence_warnings": len(warnings),
        })


class EvidenceMergerAgent(Agent):
    name = "Evidence Merger Agent"

    def run(self, context: AgentContext) -> Dict[str, Any]:
        warnings = [stage["agent"] for stage in context.stages if stage.get("status") in {"warning", "limited", "no evidence"}]
        classification = "Confirmed Cause" if not warnings and context.input_changes else "Likely Cause" if context.input_changes else "Unresolved Issue"
        return self.record(context, "completed", {
            "confirmed_facts": {"comparison_positions": len(context.comparison.get("comparison_data", [])), "changed_inputs": len(context.input_changes)},
            "verified_causes": context.verification,
            "supporting_documentation": context.release_notes,
            "warnings": warnings,
            "classification": classification,
        })


class FinalRootCauseReportAgent(Agent):
    name = "Final Rootcause Report"

    def run(self, context: AgentContext) -> Dict[str, Any]:
        merger = context.stages[-1].get("findings", {}) if context.stages else {}
        return self.record(context, "completed", {
            "classification": merger.get("classification", "Unresolved Issue"),
            "confidence": _confidence(context),
            "affected_positions": len(context.verification),
            "calculation_path": " -> ".join(context.lineage.get("ordered", [])),
        })


def _confidence(context: AgentContext) -> int:
    score = 35
    if context.lineage.get("ordered") and len(context.lineage["ordered"]) > 1:
        score += 20
    if context.input_changes:
        score += 20
    if context.verification and all(item.get("candidate_fields") for item in context.verification):
        score += 15
    if context.release_notes:
        score += 10
    if context.warnings:
        score -= min(25, len(context.warnings) * 5)
    return max(0, min(100, score))


def _build_rows(context: AgentContext) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    output_a = _position_map(context.execution_a.get("data", []))
    output_b = _position_map(context.execution_b.get("data", []))
    rows: List[Dict[str, Any]] = []
    details: List[Dict[str, Any]] = []
    output = context.output_column
    lineage_path = " -> ".join(context.lineage.get("ordered", []))
    for verification in context.verification:
        position = str(verification["position"])
        left = output_a.get(position, {}).get(output)
        right = output_b.get(position, {}).get(output)
        changed_fields = [item for item in context.input_changes if str(item.get("position")) == position]
        note_labels = [note.get("workbook") for note in context.release_notes if any(field in note.get("matched_fields", []) for field in [item.get("field") for item in changed_fields])]
        explanation = f"For {position}, {output} moved from {_value_text(left)} to {_value_text(right)} (B - A = {_value_text(_numeric_difference(left, right))})."
        if changed_fields:
            explanation += " Changed source fields: " + ", ".join(str(item.get("field")) for item in changed_fields) + "."
        else:
            explanation += " No changed source field was verified for this output."
        if note_labels:
            explanation += " Supporting release-note context: " + ", ".join(str(label) for label in note_labels[:3]) + "."
        rows.append({"position": position, "output": output, "value_a": _safe_value(left), "value_b": _safe_value(right), "difference": _safe_value(_numeric_difference(left, right)), "lineage": lineage_path, "input": ", ".join(str(item.get("field")) for item in changed_fields), "release_note": ", ".join(str(label) for label in note_labels[:3]), "explanation": explanation, "confidence": _confidence(context)})
        for field_name in context.lineage.get("ordered", []):
            details.append({"position": position, "output": field_name, "value_a": _safe_value(output_a.get(position, {}).get(field_name)), "value_b": _safe_value(output_b.get(position, {}).get(field_name)), "difference": _safe_value(_numeric_difference(output_a.get(position, {}).get(field_name), output_b.get(position, {}).get(field_name))), "lineage": lineage_path, "input": ", ".join(sorted(context.lineage.get("graph", {}).get(field_name, set()))), "release_note": "", "explanation": f"{field_name} is part of the independently analyzed calculation path for {output}.", "confidence": _confidence(context)})
    return rows, details


class RootcauseOrchestratorAgent:
    """Coordinates the independent analysis agents in the documented order."""

    def __init__(self) -> None:
        self.analysis_agents = [
            ComparisonAnalystAgent(),
            FormulaLineageAnalystAgent(),
            InputChangeAgent(),
            ReleaseNoteAgent(),
            CausalVerificationAgent(),
            ConsistencyAgent(),
        ]
        self.evidence_merger = EvidenceMergerAgent()
        self.final_report = FinalRootCauseReportAgent()

    def run(self, context: AgentContext) -> Dict[str, Any]:
        for agent in self.analysis_agents:
            agent.run(context)
        self.evidence_merger.run(context)
        self.final_report.run(context)
        rows, details = _build_rows(context)
        merger = next((stage for stage in context.stages if stage["agent"] == "Evidence Merger Agent"), {})
        final = next((stage for stage in context.stages if stage["agent"] == "Final Rootcause Report"), {})
        return {
            "status": "success",
            "comparison_direction": "B - A (execution_b minus execution_a)",
            "stages": {"comparison_direction": "B - A (execution_b minus execution_a)", "dependencies": context.lineage.get("ordered", [])[:-1], "changed_source_fields": context.input_changes, "release_notes": context.release_notes, "deviations": context.comparison.get("comparison_data", [])},
            "analysis": {"root_cause": merger.get("findings", {}).get("classification", "Unresolved Issue"), "explanation": "Independent multi-agent RootCause analysis completed.", "confidence": final.get("findings", {}).get("confidence", 0), "evidence": [stage["agent"] + " completed" for stage in context.stages if stage["agent"] not in {"Evidence Merger Agent", "Final Rootcause Report"}], "changed_fields": sorted({str(item.get("field")) for item in context.input_changes}), "release_note_links": [str(note.get("workbook")) for note in context.release_notes], "next_checks": context.warnings, "rows": rows, "detail_rows": details},
            "agent_stages": context.stages,
            "agent_architecture": {"orchestrator": self.__class__.__name__, "agents": [agent.name for agent in self.analysis_agents], "evidence_merger": self.evidence_merger.name, "final_report": self.final_report.name},
        }


def run_agent_rootcause(execution_id_a: str, execution_id_b: str, output_column: str, position: Optional[str] = None) -> Dict[str, Any]:
    context = AgentContext(_load_execution(execution_id_a), _load_execution(execution_id_b), output_column.strip(), position)
    return RootcauseOrchestratorAgent().run(context)
