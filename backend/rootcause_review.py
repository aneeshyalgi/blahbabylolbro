"""Post-run human review of a normal RootCause report, as a chat.

The reviewer writes a message; the language model answers it and may edit the report: per position the Explanation
Status, the score, the input, the release notes, the explanation and a reviewer note; the summary and the next checks;
and which rows the table shows in which order. The page applies the edits on top of the computed result, so every edit
stays visible as a review change and can be undone. Positions, the values of both runs, the deviations and the lineage
come from the runs and are never edited.

Everything the model returns is checked here against the report and the release notes before it reaches the page.
"""
from __future__ import annotations

import json
import math
import os
import re
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

import agent_runtime as runtime

DEFAULT_OPENAI_MODEL = "gpt-6.1-sol"  # ROOTCAUSE_REVIEW_MODEL overrides it; with Azure the configured deployment
STATUSES = ("explained", "partial", "unexplained")
FIELDS = ("status", "score", "input", "release_note", "explanation", "comment")
SORTS = ("deviation_desc", "deviation_asc", "score_desc", "score_asc", "position")
MAX_HISTORY = 16
MAX_NOTES = 60
TEXT_LIMITS = {"input": 200, "explanation": 6000, "comment": 2000}


class ReviewError(Exception):
    """The language model could not be reached or gave no usable answer."""


# --------------------------------------------------------------------------------------------------
# The report as the model sees it
# --------------------------------------------------------------------------------------------------

def _number(value: Any) -> Optional[float]:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _plain(value: Any) -> Any:
    """A value for the prompt: numbers as numbers (16000, not 16000.0), texts trimmed, nothing as null."""
    number = _number(value)
    if number is not None:
        return int(number) if number.is_integer() and abs(number) < 1e15 else round(number, 6)
    if value is None or str(value).strip() == "":
        return None
    return str(value).strip()[:200]


def _text(value: Any, limit: int) -> str:
    text = str(value if value is not None else "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _chain_text(chain: Dict[str, Any]) -> str:
    """Nominal -> Assessment Base -> EAD -> RWA; the sources of a rule side by side: Saldo + Anteilige Zinsen -> ..."""
    fields = [str(name) for name in chain.get("fields") or []]
    heads = [str(name) for name in chain.get("heads") or []]
    if heads and fields[: len(heads)] == heads and len(fields) > len(heads):
        return " + ".join(heads) + " -> " + " -> ".join(fields[len(heads):])
    return " -> ".join(fields)


def _changes_behind(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The changes behind a deviation: each changed field the lineage starts from, with both values and its note."""
    values = row.get("values") if isinstance(row.get("values"), dict) else {}
    found: List[Dict[str, Any]] = []
    seen = set()
    for chain in [*(row.get("chains") or []), *(row.get("other_chains") or [])]:
        if not isinstance(chain, dict):
            continue
        origin = str(chain.get("origin") or "")
        if not origin or origin in seen:
            continue
        seen.add(origin)
        entry = values.get(origin) if isinstance(values.get(origin), dict) else {}
        rule = chain.get("rule") if isinstance(chain.get("rule"), dict) else None
        item: Dict[str, Any] = {
            "field": origin,
            "kind": "new calculation" if chain.get("kind") == "rule" else "changed input data",
            "A": _plain(entry.get("a")),
            "B": _plain(entry.get("b")),
            "covered_by_release_note": chain.get("note") or None,
        }
        if chain.get("condition"):
            item["for"] = str(chain["condition"])
        if rule:
            item["compare_run_computes_it_from"] = rule.get("compare") or []
            item["base_run_computed_it_from"] = rule.get("base") or "input data"
        found.append(item)
    return found


def _edited(row: Dict[str, Any]) -> Dict[str, Any]:
    """The fields the review changed on this row, each with its computed value (sent by the page)."""
    edited = row.get("edited")
    if isinstance(edited, dict):
        return {key: value for key, value in edited.items() if key in FIELDS}
    if isinstance(edited, list):
        return {key: None for key in edited if key in FIELDS}
    return {}


def _prompt_rows(rows: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str], bool]:
    """The deviating rows as compact records, the unchanged positions by name, and whether explanations were cut."""
    deviating = [row for row in rows if row.get("changed", True)]
    unchanged = [str(row.get("position")) for row in rows if not row.get("changed", True)]
    explanation_limit = 1600 if len(deviating) <= 40 else 400 if len(deviating) <= 150 else 0
    records: List[Dict[str, Any]] = []
    for row in deviating:
        record: Dict[str, Any] = {
            "position": str(row.get("position")),
            "status": row.get("status") or "unexplained",
            "score": _plain(row.get("score")),
            "A": _plain(row.get("value_a")),
            "B": _plain(row.get("value_b")),
            "B_minus_A": _plain(row.get("difference")),
            "input": str(row.get("input") or ""),
            "release_note": str(row.get("release_note") or ""),
        }
        lineage = [_chain_text(chain) for chain in row.get("chains") or [] if isinstance(chain, dict)]
        if lineage:
            record["lineage"] = lineage
        changes = _changes_behind(row)
        if changes:
            record["changes_behind_the_deviation"] = changes
        if explanation_limit:
            record["explanation"] = _text(row.get("explanation"), explanation_limit)
        if str(row.get("comment") or "").strip():
            record["reviewer_note"] = _text(row.get("comment"), 600)
        edited = _edited(row)
        if edited:
            record["edited_in_review"] = list(edited)
            computed = {key: _text(value, 160) if isinstance(value, str) else value for key, value in edited.items() if key != "explanation" and value is not None}
            if computed:
                record["computed_values_before_review"] = computed
        records.append(record)
    return records, unchanged, bool(deviating) and explanation_limit < 1600


def _prompt_notes(notes: List[Dict[str, Any]], rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The release notes with a short reference each (two notes may share a Jira ID); the ones the report uses first."""
    used = {str(note.get("id")) for row in rows for note in row.get("notes") or [] if isinstance(note, dict)}
    ordered = sorted(enumerate(notes), key=lambda item: (str(item[1].get("id")) not in used, item[0]))
    return [
        {"ref": f"N{index + 1}", "id": str(note.get("id") or ""), "problem": _text(note.get("problem"), 400), "solution": _text(note.get("solution"), 600)}
        for index, note in ordered[:MAX_NOTES]
    ]


_GERMAN_WORDS = {
    "und", "der", "die", "das", "den", "dem", "des", "nicht", "ist", "sind", "bitte", "setze", "setz", "zeige", "zeig", "warum",
    "wieso", "weshalb", "mit", "für", "fuer", "auf", "von", "ein", "eine", "einen", "nur", "alle", "alles", "wie", "was", "welche",
    "welcher", "welches", "ich", "wir", "auch", "noch", "oder", "aber", "mach", "mache", "entferne", "füge", "fuege", "hinzu",
    "erkläre", "erklaere", "kürze", "kuerze", "übersetze", "sortiere", "markiere", "rückgängig", "zurück", "statt", "anstatt",
    "wird", "wurde", "hat", "haben", "kann", "soll", "dass", "weil", "keine", "kein", "neu", "zu", "zum", "zur", "im", "bei",
}
_ENGLISH_WORDS = {
    "the", "and", "is", "are", "why", "what", "which", "show", "set", "only", "all", "to", "of", "please", "with", "for", "make",
    "remove", "add", "explain", "how", "this", "that", "it", "as", "be", "can", "you", "me", "sort", "hide", "mark", "change",
    "undo", "translate", "shorten", "does", "do", "not", "no", "instead", "again", "a", "an", "into", "from", "by", "on", "every",
}


def reply_language(text: str) -> str:
    """German or English, from the words of the message; English (the language of the page) when unsure."""
    words = re.findall(r"[a-zäöüß]+", text.lower())
    german = sum(word in _GERMAN_WORDS for word in words) + 2 * len(re.findall(r"[äöüß]", text.lower()))
    english = sum(word in _ENGLISH_WORDS for word in words)
    return "German" if german > english else "English"


SYSTEM_PROMPT = """You are the review assistant of a RootCause report in a bank's regulatory reporting platform. The report explains, per position, why the result field "{output}" differs between the base run A and the compare run B. Deviations are always B - A.

A human reviewer checks the report with you in a chat. You get the report as it is now (with the reviewer's earlier changes), the release notes of the analysis and the current table view. Answer the reviewer's last message.

THE TABLE has one row per deviating position:
- status (shown as Explanation Status): explained = release notes cover every change behind the deviation; partial = they cover some of these changes; unexplained = none.
- score: 0-100, how well the release notes fit the changes.
- input: the first field of the release-note lineage that both runs have and that changed.
- release_note: the IDs of the release notes that explain the deviation.
Each row also has an explanation (shown in the row's details) and may have a reviewer note (comment).

WHAT YOU CAN DO
1. Edit rows with items in "changes". Each item sets one field to one value for the positions listed:
   - status: explained | partial | unexplained
   - score: a whole number from 0 to 100
   - input: a field name
   - release_note: note refs from the release notes list, separated by ", " (for example "N1, N3"); an ID the reviewer gives that is not in the list is written as given; "" removes the notes
   - explanation: the full new text
   - comment: the reviewer note; "" removes it
   positions ["*"] means every deviating position; "statuses" then limits it to rows with these statuses (otherwise leave it empty). Different values per position need one item per position.
   restore true (value "") puts a field the review changed back to the value the analysis computed (computed_values_before_review); use it when the reviewer wants a change undone.
2. Rewrite the whole "summary" or the "next_checks" when the reviewer asks for it; null keeps them. restore_summary / restore_next_checks true put them back to the computed text.
   When a row change makes a position's line in the summary wrong (its status, its release notes or the reviewer's decision), do not rewrite the summary: put that position and its corrected statement into "summary_lines". The status counts line ("Davon: ...") is kept in step automatically.
3. Change what the table shows with "view": statuses to show, positions to show, positions to hide (empty lists: no filter), whether the positions without deviation are listed too (show_unchanged), and the order (deviation_desc = largest deviation first, the default; deviation_asc; score_desc; score_asc; position). null keeps the current view. The default view is empty lists, show_unchanged false and deviation_desc.

You cannot change positions, the values of A and B, the deviations or the lineage: they come from the runs. If the reviewer asks for that, say so in the reply and change nothing.

RULES
- Do exactly what the reviewer asks, for every position meant, and nothing else. Never change rows, fields or texts the reviewer did not ask about.
- Only when the reviewer gives a reason for a change (because, as, since, da, weil ...), put that reason as the comment of the positions concerned, in the reviewer's words. Never write comments of your own.
- Requests to rewrite, shorten, reformulate or translate report texts change those texts in the report; they are not answered in the reply.
- A question gets an answer in the reply and no changes. Base every statement on the report and the release notes. Never invent values, fields or release-note IDs. Name release notes by their IDs; the refs (N1, N2 ...) are only for "changes" and never appear in texts.
- If it is unclear which positions or which value the reviewer means, ask one short question in the reply and change nothing.
- If the reviewer sets a status or score that the evidence does not support, do it, and name the conflict in one short sentence (for example the change that no release note covers).
- Explanations, the summary and the next checks are German; keep them German unless the reviewer asks for another language. Keep their facts right (values, deviations, fields, release-note IDs) and write numbers the German way (16.000; -7.000). A comment is written in the reviewer's language.
- The reply is written in {reply_language}: 1 to 3 short sentences, plain text without markdown or lists. Say what you changed or answer the question; do not copy report texts into the reply, the page shows them.

Answer with JSON only: {{"reply": string, "changes": [{{"positions": [string], "statuses": [string], "field": string, "value": string, "restore": boolean}}], "summary": string or null, "summary_lines": [{{"position": string, "text": string}}], "restore_summary": boolean, "next_checks": [string] or null, "restore_next_checks": boolean, "view": {{"statuses": [string], "positions": [string], "hide_positions": [string], "show_unchanged": boolean, "sort": string}} or null}}"""


RESPONSE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["reply", "changes", "summary", "summary_lines", "restore_summary", "next_checks", "restore_next_checks", "view"],
    "properties": {
        "reply": {"type": "string"},
        "changes": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["positions", "statuses", "field", "value", "restore"],
                "properties": {
                    "positions": {"type": "array", "items": {"type": "string"}},
                    "statuses": {"type": "array", "items": {"type": "string", "enum": list(STATUSES)}},
                    "field": {"type": "string", "enum": list(FIELDS)},
                    "value": {"type": "string"},
                    "restore": {"type": "boolean"},
                },
            },
        },
        "summary": {"type": ["string", "null"]},
        "summary_lines": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["position", "text"],
                "properties": {"position": {"type": "string"}, "text": {"type": "string"}},
            },
        },
        "restore_summary": {"type": "boolean"},
        "next_checks": {"anyOf": [{"type": "array", "items": {"type": "string"}}, {"type": "null"}]},
        "restore_next_checks": {"type": "boolean"},
        "view": {
            "anyOf": [
                {"type": "null"},
                {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["statuses", "positions", "hide_positions", "show_unchanged", "sort"],
                    "properties": {
                        "statuses": {"type": "array", "items": {"type": "string", "enum": [*STATUSES, "unchanged"]}},
                        "positions": {"type": "array", "items": {"type": "string"}},
                        "hide_positions": {"type": "array", "items": {"type": "string"}},
                        "show_unchanged": {"type": "boolean"},
                        "sort": {"type": "string", "enum": list(SORTS)},
                    },
                },
            ]
        },
    },
}


def _history_messages(history: Sequence[Dict[str, Any]]) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = []
    for turn in list(history)[-MAX_HISTORY:]:
        if not isinstance(turn, dict):
            continue
        role = "assistant" if turn.get("role") == "assistant" else "user"
        content = _text(turn.get("content"), 2000)
        if role == "assistant":
            applied = []
            for change in turn.get("changes") or []:
                if not isinstance(change, dict):
                    continue
                if change.get("restore"):
                    applied.append(f"{change.get('position')}: {change.get('field')} back to the computed value")
                elif change.get("field") in ("explanation", "comment"):
                    applied.append(f"{change.get('position')}: {change.get('field')} rewritten")
                else:
                    applied.append(f"{change.get('position')}: {change.get('field')} = {_text(change.get('value'), 80)}")
            applied += [label for key, label in (("summary", "summary rewritten"), ("next_checks", "next checks rewritten"), ("view", "table view changed")) if turn.get(key)]
            if applied:
                prefix = "The reviewer undid these changes: " if turn.get("undone") else "Applied: "
                content += "\n[" + prefix + "; ".join(applied[:30]) + (" …" if len(applied) > 30 else "") + "]"
        if content:
            messages.append({"role": role, "content": content})
    return messages


def build_messages(request: Dict[str, Any], notes: List[Dict[str, Any]]) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
    rows = [row for row in request.get("rows") or [] if isinstance(row, dict) and row.get("position") is not None]
    records, unchanged, cut = _prompt_rows(rows)
    listed_notes = _prompt_notes(notes, rows)
    runs = request.get("runs") if isinstance(request.get("runs"), dict) else {}
    report: Dict[str, Any] = {
        "field": request.get("output_column") or "",
        "base_run_A": runs.get("base") or "",
        "compare_run_B": runs.get("compare") or "",
        "rows": records,
        "unchanged_positions": unchanged[:300],
        "summary": _text(request.get("summary"), 6000),
        "summary_edited_in_review": bool(request.get("summary_edited")),
        "next_checks": [_text(item, 600) for item in request.get("next_checks") or []][:12],
        "next_checks_edited_in_review": bool(request.get("next_checks_edited")),
        "release_notes": listed_notes,
        "table_view": request.get("view") or "default: every deviating position, largest deviation first",
    }
    if cut:
        report["note"] = "Explanations are shortened (or left out) because the table is large."
    message = _text(request.get("message"), 4000)
    system = SYSTEM_PROMPT.format(output=request.get("output_column") or "the output field", reply_language=reply_language(message))
    messages = [
        {"role": "system", "content": system},
        {"role": "system", "content": "THE REPORT NOW (JSON):\n" + json.dumps(report, ensure_ascii=False)},
        *_history_messages(request.get("history") or []),
        {"role": "user", "content": message},
    ]
    return messages, listed_notes


# --------------------------------------------------------------------------------------------------
# The language model
# --------------------------------------------------------------------------------------------------

def _parse(content: str) -> Dict[str, Any]:
    text = (content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise ReviewError("The language model did not answer with JSON.")
        try:
            parsed = json.loads(text[start: end + 1])
        except json.JSONDecodeError as exc:
            raise ReviewError("The language model did not answer with valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise ReviewError("The language model did not answer with a JSON object.")
    return parsed


def model_name() -> str:
    _client, configured = runtime._llm_client()
    override = os.environ.get("ROOTCAUSE_REVIEW_MODEL", "").strip()
    return override or (DEFAULT_OPENAI_MODEL if os.environ.get("OPENAI_API_KEY") else configured)


# Parameters a model refused once ("temperature", "max_completion_tokens", "json_schema"), so later calls leave them out.
_REFUSED: Dict[str, set] = {}


def call_model(messages: List[Dict[str, str]], model: Optional[str] = None) -> Dict[str, Any]:
    """One JSON answer. Parameters the model refuses (a fixed temperature, strict JSON schemas) are dropped and the
    call repeated; an unavailable model falls back to the configured one; busy or failing providers are retried."""
    client, configured = runtime._llm_client()
    model = model or model_name()

    def options_for(name: str) -> Dict[str, Any]:
        refused = _REFUSED.get(name, set())
        options: Dict[str, Any] = {"response_format": {"type": "json_object"}} if "json_schema" in refused else {
            "response_format": {"type": "json_schema", "json_schema": {"name": "rootcause_review", "strict": True, "schema": RESPONSE_SCHEMA}},
        }
        options["max_tokens" if "max_completion_tokens" in refused else "max_completion_tokens"] = 8000
        if "temperature" not in refused:
            options["temperature"] = 0.2
        return options

    options = options_for(model)
    last: Optional[Exception] = None
    for attempt in range(7):
        try:
            response = client.chat.completions.create(model=model, messages=messages, **options)
        except Exception as exc:  # provider errors: degrade, fall back or retry
            last = exc
            status = getattr(exc, "status_code", None)
            text = str(exc)
            refused = None
            if status == 400 and "temperature" in options and "temperature" in text:
                refused = "temperature"
            elif status == 400 and "max_completion_tokens" in options and "max_completion_tokens" in text:
                refused = "max_completion_tokens"
            elif status == 400 and options["response_format"]["type"] == "json_schema" and ("response_format" in text or "json_schema" in text):
                refused = "json_schema"
            if refused:
                _REFUSED.setdefault(model, set()).add(refused)
                options = options_for(model)
                continue
            if status in (403, 404) and model != configured:
                model = configured
                options = options_for(model)
                continue
            if status in (408, 409, 429) or (status or 0) >= 500 or status is None:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise ReviewError(runtime._friendly_llm_error(exc)) from exc
        choice = response.choices[0]
        if getattr(choice, "finish_reason", "") == "length":
            raise ReviewError("The answer got too long. Ask for fewer positions at once.")
        return _parse(choice.message.content or "")
    raise ReviewError(runtime._friendly_llm_error(last) if last else "The language model did not answer.")


# --------------------------------------------------------------------------------------------------
# Checking the answer
# --------------------------------------------------------------------------------------------------

_STATUS_WORDS = {
    "explained": "explained", "fully explained": "explained", "erklärt": "explained", "erklaert": "explained",
    "vollständig erklärt": "explained", "partial": "partial", "partially explained": "partial", "partly explained": "partial",
    "teilweise": "partial", "teilweise erklärt": "partial", "teilweise erklaert": "partial", "unexplained": "unexplained",
    "not explained": "unexplained", "nicht erklärt": "unexplained", "nicht erklaert": "unexplained",
}


def _status(value: str) -> Optional[str]:
    return _STATUS_WORDS.get(re.sub(r"\s+", " ", value.strip().lower().replace("_", " ")))


def _score(value: str) -> Optional[int]:
    match = re.search(r"-?\d+(?:[.,]\d+)?", value)
    if not match:
        return None
    number = float(match.group(0).replace(",", "."))
    return int(round(max(0.0, min(100.0, number)))) if math.isfinite(number) else None


def _same_text(left: Any, right: Any) -> bool:
    return re.sub(r"\s+", " ", str(left if left is not None else "")).strip() == re.sub(r"\s+", " ", str(right if right is not None else "")).strip()


def _note_key(value: str) -> str:
    return re.sub(r"\s+", "", value).lower()


def _resolve_notes(value: str, row: Dict[str, Any], notes: List[Dict[str, Any]], listed: List[Dict[str, Any]], said: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Note refs (N1) or IDs to the notes they name. An ID two notes share means the one the row already has, else the
    first. An ID that is in no note is kept only when the reviewer wrote it."""
    by_ref = {item["ref"].lower(): notes[int(item["ref"][1:]) - 1] for item in listed}
    on_row = [note for note in row.get("notes") or [] if isinstance(note, dict)]
    chosen: List[Dict[str, Any]] = []
    unknown: List[str] = []
    for part in re.split(r"[,;\n]+", value):
        token = part.strip().strip("\"'„“")
        if not token:
            continue
        note = by_ref.get(token.lower())
        if note is None:
            key = _note_key(token)
            note = next((item for item in on_row if _note_key(str(item.get("id") or "")) == key), None)
            note = note or next((item for item in notes if _note_key(str(item.get("id") or "")) == key), None)
        if note is None:
            if _note_key(token) in _note_key(said):
                note = {"id": token}
            else:
                unknown.append(token)
                continue
        reference = {key: str(note.get(key) or "") for key in ("id", "workbook", "sheet", "solution", "problem")}
        if reference not in chosen:
            chosen.append(reference)
    return chosen, unknown


def _replace_lines(summary: str, lines: List[Tuple[str, str]]) -> str:
    """The summary with the statements of some positions replaced; each line keeps its "Position (deviation): " start."""
    texts = summary.split("\n")
    for position, statement in lines:
        pattern = re.compile(rf"^{re.escape(position)}(?: \([^)]*\))?: ")
        statement = pattern.sub("", statement.strip()).strip()
        for index, line in enumerate(texts):
            match = pattern.match(line)
            if match and statement:
                texts[index] = match.group(0) + statement
                break
    return "\n".join(texts)


def _without_counts(summary: Any) -> str:
    """The summary without its "Davon: …" line, which the page keeps in step with the statuses itself."""
    return "\n".join(line for line in str(summary or "").split("\n") if not line.startswith("Davon:"))


def check_answer(answer: Dict[str, Any], request: Dict[str, Any], notes: List[Dict[str, Any]], listed: List[Dict[str, Any]]) -> Dict[str, Any]:
    rows = [row for row in request.get("rows") or [] if isinstance(row, dict) and row.get("position") is not None]
    by_position = {str(row["position"]): row for row in rows}
    folded = {key.lower(): key for key in by_position}
    deviating = [str(row["position"]) for row in rows if row.get("changed", True)]
    said = str(request.get("message") or "")
    rejected: List[str] = []
    settled: Dict[Tuple[str, str], Dict[str, Any]] = {}

    def find(name: Any) -> Optional[str]:
        text = str(name or "").strip()
        return text if text in by_position else folded.get(text.lower())

    for item in answer.get("changes") or []:
        if not isinstance(item, dict):
            continue
        field = str(item.get("field") or "")
        if field not in FIELDS:
            continue
        value = str(item.get("value") if item.get("value") is not None else "")
        names = [str(name) for name in item.get("positions") or []]
        statuses = {status for status in item.get("statuses") or [] if status in STATUSES}
        if "*" in names or (not names and statuses):
            targets = [key for key in deviating if not statuses or by_position[key].get("status") in statuses]
        else:
            targets = []
            for name in names:
                key = find(name)
                if key is None:
                    rejected.append(f"There is no position {name} in the report.")
                elif key not in targets:
                    targets.append(key)
        for key in targets:
            row = by_position[key]
            if item.get("restore"):
                if field in _edited(row):
                    settled[(key, field)] = {"position": key, "field": field, "restore": True}
                else:
                    settled.pop((key, field), None)
                continue
            change: Dict[str, Any] = {"position": key, "field": field}
            if field in ("status", "score") and not row.get("changed", True):
                rejected.append(f"{key} has no deviation, so it has no {'Explanation Status' if field == 'status' else 'score'}.")
                continue
            if field == "status":
                status = _status(value)
                if status is None:
                    rejected.append(f"'{value}' is not an Explanation Status; {key} kept its status.")
                    continue
                change["value"] = status
                same = row.get("status") == status
            elif field == "score":
                score = _score(value)
                if score is None:
                    rejected.append(f"'{value}' is not a score; the score of {key} was kept.")
                    continue
                change["value"] = score
                same = _number(row.get("score")) == score
            elif field == "release_note":
                chosen, unknown = _resolve_notes(value, row, notes, listed, said)
                for token in unknown:
                    rejected.append(f"{token} is not in the release notes; it was not linked to {key}.")
                if unknown and not chosen:
                    continue
                change["value"] = ", ".join(dict.fromkeys(note["id"] for note in chosen))
                change["notes"] = chosen
                same = _same_text(row.get("release_note"), change["value"])
            else:
                text = _text(value, TEXT_LIMITS[field])
                change["value"] = text[:1].upper() + text[1:] if field == "comment" else text
                same = _same_text(row.get(field), change["value"])
            if same:
                settled.pop((key, field), None)
            else:
                settled[(key, field)] = change

    order = {key: index for index, key in enumerate(by_position)}
    changes = sorted(settled.values(), key=lambda change: (order.get(change["position"], 0), FIELDS.index(change["field"])))

    restore_summary = bool(answer.get("restore_summary")) and bool(request.get("summary_edited"))
    summary = answer.get("summary")
    summary = summary.strip() if isinstance(summary, str) and summary.strip() else None
    lines = [
        (find(item.get("position")), str(item.get("text") or ""))
        for item in answer.get("summary_lines") or [] if isinstance(item, dict)
    ]
    lines = [(position, text) for position, text in lines if position and text.strip()]
    if summary is None and lines and not restore_summary:
        summary = _replace_lines(str(request.get("summary") or ""), lines)
    if restore_summary or summary is None or _same_text(_without_counts(summary), _without_counts(request.get("summary"))):
        summary = None

    restore_next_checks = bool(answer.get("restore_next_checks")) and bool(request.get("next_checks_edited"))
    next_checks = answer.get("next_checks")
    if isinstance(next_checks, list) and not restore_next_checks:
        next_checks = [_text(item, 1000) for item in next_checks if isinstance(item, str) and item.strip()][:12]
        if next_checks == [str(item).strip() for item in request.get("next_checks") or []]:
            next_checks = None
    else:
        next_checks = None

    view = answer.get("view")
    if isinstance(view, dict):
        requested = [str(name) for name in view.get("positions") or []]
        shown = [find(name) for name in requested]
        hidden = [find(name) for name in view.get("hide_positions") or []]
        statuses = [status for status in view.get("statuses") or [] if status in (*STATUSES, "unchanged")]
        if requested and not any(shown):
            # An empty list would show every position, the opposite of what was asked.
            rejected.append(f"There is no position {', '.join(requested[:3])} in the report; the table view was kept.")
            view = None
        else:
            view = {
                "statuses": list(dict.fromkeys(statuses)),
                "positions": [key for key in dict.fromkeys(shown) if key],
                "hide_positions": [key for key in dict.fromkeys(hidden) if key],
                "show_unchanged": bool(view.get("show_unchanged")) or "unchanged" in statuses,
                "sort": view.get("sort") if view.get("sort") in SORTS else "deviation_desc",
            }
            if view == (request.get("view") or {"statuses": [], "positions": [], "hide_positions": [], "show_unchanged": bool(request.get("show_unchanged")), "sort": "deviation_desc"}):
                view = None
    else:
        view = None

    reply = str(answer.get("reply") or "").strip()
    if not reply:
        reply = "Done." if changes or summary or next_checks is not None or view or restore_summary or restore_next_checks else "I have no answer to that."
    return {
        "reply": reply,
        "changes": changes,
        "summary": summary,
        "restore_summary": restore_summary,
        "next_checks": next_checks,
        "restore_next_checks": restore_next_checks,
        "view": view,
        "rejected": list(dict.fromkeys(rejected))[:10],
    }


def review_turn(request: Dict[str, Any], notes: List[Dict[str, Any]], model: Optional[str] = None) -> Dict[str, Any]:
    """One chat turn: the reviewer's message in, the answer and the checked edits out."""
    messages, listed = build_messages(request, notes)
    answer = call_model(messages, model)
    return check_answer(answer, request, notes, listed)
