"""AI-written Python for the Code tab: code that fills the empty cells of a dataset's table.

The model (gpt-6.1-sol unless CODE_GENERATOR_MODEL names another one; with Azure the configured deployment) sees the
table itself - every column with its type and empty cells, the values each text column takes, the rows - and the
user's instructions. Every answer is checked here and test-run by the caller's `test_run`, in the sandbox the Results
tab runs code in, on the same input table. An error, a construct the platform does not allow, a column the code fills
only partly or a column the instructions name but the code leaves empty goes back to the model to be fixed (at most
MAX_ROUNDS answers). The page gets the code, the rules the model assumed and the outcome of the test run, so it shows
what the code will do in the Results tab before the code is saved.
"""
from __future__ import annotations

import ast
import json
import math
import os
import re
import time
from datetime import date, datetime
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

import agent_runtime as runtime

DEFAULT_OPENAI_MODEL = "gpt-6.1-sol"  # CODE_GENERATOR_MODEL overrides it; with Azure the configured deployment
MAX_ROUNDS = 3  # answers per generation: the first one and up to two fixes
TIME_BUDGET = 100.0  # seconds after which no further fix is asked for
REQUEST_TIMEOUT = 150.0  # per answer; the page's request (Next route, 300 s) outlasts budget + one answer
PROMPT_ROWS = 60  # rows of the table the model sees
DISTINCT_VALUES = 40  # values listed per text column
PREVIEW_ROWS = 200  # rows of the test-run result the page gets
INSTRUCTIONS_LIMIT = 8000
LANGUAGES = {"en": "English", "de": "German", "es": "Spanish"}

# Built-in functions of the sandbox (main.EXECUTION_BUILTINS), named in the prompt.
SANDBOX_BUILTINS = (
    "len, range, enumerate, zip, map, filter, sum, min, max, abs, round, int, float, str, list, dict, set, tuple, "
    "isinstance, sorted, reversed, any, all, bool, next, iter, divmod, pow, format"
)


class GenerationError(Exception):
    """The language model could not be reached or gave no usable answer."""


# --------------------------------------------------------------------------------------------------
# The language model
# --------------------------------------------------------------------------------------------------

# Parameters a model refused once, so later calls leave them out. gpt-6.1-sol accepts only its default temperature.
_REFUSED: Dict[str, set] = {DEFAULT_OPENAI_MODEL: {"temperature"}}


def model_name() -> str:
    _client, configured = runtime._llm_client()
    override = os.environ.get("CODE_GENERATOR_MODEL", "").strip()
    return override or (DEFAULT_OPENAI_MODEL if os.environ.get("OPENAI_API_KEY") else configured)


def _parse(content: str) -> Dict[str, Any]:
    text = (content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise GenerationError("The language model did not answer with JSON.")
        try:
            parsed = json.loads(text[start: end + 1])
        except json.JSONDecodeError as exc:
            raise GenerationError("The language model did not answer with valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise GenerationError("The language model did not answer with a JSON object.")
    return parsed


def _call(messages: List[Dict[str, str]], schema_name: str, schema: Dict[str, Any], effort: str) -> Dict[str, Any]:
    """One JSON answer. Parameters the model refuses are dropped and the call repeated; an unavailable model falls
    back to the configured one; busy or failing providers are retried. A timeout is not retried (it took minutes)."""
    client, configured = runtime._llm_client()
    client = client.with_options(timeout=REQUEST_TIMEOUT, max_retries=0)
    model = model_name()

    def options_for(name: str) -> Dict[str, Any]:
        refused = _REFUSED.get(name, set())
        options: Dict[str, Any] = {"response_format": {"type": "json_object"}} if "json_schema" in refused else {
            "response_format": {"type": "json_schema", "json_schema": {"name": schema_name, "strict": True, "schema": schema}},
        }
        options["max_tokens" if "max_completion_tokens" in refused else "max_completion_tokens"] = 16000
        if "temperature" not in refused:
            options["temperature"] = 0.2
        if "reasoning_effort" not in refused:
            options["reasoning_effort"] = effort
        return options

    options = options_for(model)
    last: Optional[Exception] = None
    for attempt in range(6):
        try:
            response = client.chat.completions.create(model=model, messages=messages, **options)
        except Exception as exc:  # provider errors: degrade, fall back or retry
            last = exc
            if type(exc).__name__ == "APITimeoutError":
                raise GenerationError("The language model did not answer in time. Try again.") from exc
            status = getattr(exc, "status_code", None)
            text = str(exc)
            refused = None
            for parameter in ("temperature", "reasoning_effort", "max_completion_tokens"):
                if status == 400 and parameter in options and parameter in text:
                    refused = parameter
                    break
            if refused is None and status == 400 and options["response_format"]["type"] == "json_schema" and ("response_format" in text or "json_schema" in text):
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
            raise GenerationError(runtime._friendly_llm_error(exc).replace("The agent run failed", "The request to the language model failed")) from exc
        choice = response.choices[0]
        refusal = getattr(choice.message, "refusal", None)
        if refusal:
            raise GenerationError(f"The language model declined: {refusal}")
        if getattr(choice, "finish_reason", "") == "length":
            raise GenerationError("The answer of the language model was cut off. Shorten the instructions and try again.")
        return _parse(choice.message.content or "")
    raise GenerationError(runtime._friendly_llm_error(last).replace("The agent run failed", "The request to the language model failed") if last else "The language model did not answer.")


# --------------------------------------------------------------------------------------------------
# The table as the model sees it
# --------------------------------------------------------------------------------------------------

def _missing(value: Any) -> bool:
    if value is None:
        return True
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def _plain(value: Any) -> Any:
    """A cell for the prompt: numbers as numbers (16000, not 16000.0), dates as ISO text, empty cells as None."""
    if _missing(value):
        return None
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if isinstance(value, (int, float, np.integer, np.floating)):
        number = float(value)
        if not math.isfinite(number):
            return None
        return int(number) if number.is_integer() and abs(number) < 1e15 else round(number, 10)
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    return str(value)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float, np.integer, np.floating)) and not isinstance(value, (bool, np.bool_))


def _kind(values: Sequence[Any]) -> str:
    present = [value for value in values if not _missing(value)]
    if not present:
        return "empty"
    if all(_is_number(value) for value in present):
        return "number"
    if all(isinstance(value, (bool, np.bool_)) for value in present):
        return "true/false"
    if all(isinstance(value, (pd.Timestamp, datetime, date)) or (isinstance(value, str) and re.match(r"^\d{4}-\d{2}-\d{2}", value)) for value in present):
        return "date"
    if all(isinstance(value, str) for value in present):
        if all(not pd.isna(pd.to_numeric(value.strip().replace(" ", ""), errors="coerce")) for value in present):
            return "number stored as text"
        return "text"
    return "mixed numbers and text"


def _number_text(value: float) -> str:
    plain = _plain(value)
    return json.dumps(plain)


def describe_table(name: str, frame: pd.DataFrame) -> str:
    """The table for the prompt: columns (exact names, type, empty cells, values) and the rows as JSON."""
    total = len(frame)
    lines = [
        f'Table "{name}": {total} rows, {len(frame.columns)} columns. The code receives it as `df`.',
        "",
        "Columns (name exactly as in df; type; empty cells; values):",
    ]
    for column in frame.columns:
        values = frame[column].tolist()
        empty = sum(1 for value in values if _missing(value))
        kind = _kind(values)
        label = json.dumps(str(column), ensure_ascii=False)
        if kind == "empty":
            lines.append(f"- {label}: empty in all {total} rows")
            continue
        detail = f"- {label}: {kind}; {empty} of {total} empty"
        present = [value for value in values if not _missing(value)]
        if kind == "number":
            numbers = [float(value) for value in present]
            low, high = min(numbers), max(numbers)
            detail += f"; from {_number_text(low)} to {_number_text(high)}" if low != high else f"; always {_number_text(low)}"
        elif kind in ("text", "mixed numbers and text", "number stored as text", "true/false", "date"):
            distinct: List[Any] = []
            for value in present:
                plain = _plain(value)
                if plain not in distinct:
                    distinct.append(plain)
            shown = ", ".join(json.dumps(value, ensure_ascii=False) for value in distinct[:DISTINCT_VALUES])
            more = f" … ({len(distinct)} different values)" if len(distinct) > DISTINCT_VALUES else ""
            detail += f"; values: {shown}{more}"
        lines.append(detail)
    shown_rows = frame.head(PROMPT_ROWS)
    records = [{str(column): _plain(row[column]) for column in frame.columns} for _, row in shown_rows.iterrows()]
    lines.append("")
    lines.append(f"Rows ({'all ' + str(total) if total <= PROMPT_ROWS else f'the first {PROMPT_ROWS} of {total}'}) as JSON, null = empty cell:")
    lines.append(json.dumps(records, ensure_ascii=False, default=str))
    return "\n".join(lines)


def _language(code: Optional[str]) -> str:
    return LANGUAGES.get((code or "en").split("-")[0].lower(), "English")


# --------------------------------------------------------------------------------------------------
# Checking the code
# --------------------------------------------------------------------------------------------------

_FORBIDDEN_NAMES = {
    "eval", "exec", "compile", "open", "input", "__import__", "globals", "locals", "vars", "getattr", "setattr",
    "delattr", "breakpoint", "exit", "quit", "help", "memoryview", "object", "type",
}
_FORBIDDEN_ATTRIBUTES = {
    "eval", "query", "system", "popen", "save", "savez", "savez_compressed", "savetxt", "load", "loadtxt", "genfromtxt",
    "fromfile", "tofile", "memmap", "read", "write",
}
_FILE_ATTRIBUTE = re.compile(r"^(read_|to_(csv|excel|pickle|parquet|sql|json|hdf|feather|stata|html|latex|markdown|clipboard|xml|orc|gbq)$)")


def check_code(code: str) -> Optional[Tuple[str, Optional[int]]]:
    """Why the platform does not run this code (None: it may run it): invalid syntax, an import, file, system or eval
    access, double-underscore names or a while loop. Uploaded code is not checked like this; generated code is, because
    it is test-run before anyone has read it."""
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return f"SyntaxError: {exc.msg}", exc.lineno
    for node in ast.walk(tree):
        line = getattr(node, "lineno", None)
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            modules = [alias.name for alias in node.names] if isinstance(node, ast.Import) else [node.module or ""]
            if any(module.split(".")[0] not in ("pandas", "numpy") for module in modules):
                return "Import statements are not available: only pd (pandas) and np (numpy) exist.", line
        elif isinstance(node, ast.Name) and (node.id in _FORBIDDEN_NAMES or node.id.startswith("__")):
            return f"{node.id} is not available in the platform.", line
        elif isinstance(node, ast.Attribute) and (node.attr.startswith("__") or node.attr in _FORBIDDEN_ATTRIBUTES or _FILE_ATTRIBUTE.match(node.attr)):
            return f".{node.attr} is not allowed: the code may not read or write files, run text as code or reach the system.", line
        elif isinstance(node, ast.While):
            return "while loops are not allowed: compute on whole columns.", line
    return None


def clean_code(text: str) -> str:
    """The code without markdown fences, with "\\n" line ends and a final newline."""
    code = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip("\n")
    fenced = re.match(r"^\s*```[a-zA-Z]*\n(.*?)\n?```\s*$", code, flags=re.S)
    if fenced:
        code = fenced.group(1)
    return code.rstrip() + "\n" if code.strip() else ""


# --------------------------------------------------------------------------------------------------
# What the test run shows
# --------------------------------------------------------------------------------------------------

def _same(left: Any, right: Any) -> bool:
    if _missing(left) or _missing(right):
        return _missing(left) and _missing(right)
    if _is_number(left) or _is_number(right):
        try:
            return abs(float(left) - float(right)) <= 1e-9 * max(1.0, abs(float(left)))
        except (TypeError, ValueError):
            return False
    return str(left).strip() == str(right).strip()


def _row_labels(frame: pd.DataFrame) -> List[str]:
    """How rows are named in feedback: by the first text column whose values are all present and unique (Position)."""
    for column in frame.columns:
        values = frame[column].tolist()
        if values and all(isinstance(value, str) and value.strip() for value in values) and len(set(values)) == len(values):
            return [value.strip() for value in values]
    return [f"row {index + 1}" for index in range(len(frame))]


def _mentions(instructions: str, column: str) -> bool:
    if not instructions.strip():
        return False
    pattern = r"(?<![\w])" + re.escape(column.strip().lower()) + r"(?![\w])"
    return re.search(pattern, instructions.lower()) is not None


def assess(before: pd.DataFrame, outcome: Dict[str, Any], instructions: str) -> Dict[str, Any]:
    """The check the page shows and the problems that go back to the model."""
    if not outcome.get("ok"):
        return {"ok": False, "error": outcome.get("error") or "The code failed.", "line": outcome.get("line"), "rows": len(before)}
    after: pd.DataFrame = outcome["after"]
    labels = _row_labels(before)
    positions = {label: position for position, label in enumerate(before.index)}
    computed = [(positions.get(cell["row"], cell["row"]), cell["column"]) for cell in outcome.get("computed") or []]
    filled_by_column: Dict[str, int] = {}
    for _row, column in computed:
        filled_by_column[column] = filled_by_column.get(column, 0) + 1

    columns: List[Dict[str, Any]] = []
    partial: List[Tuple[str, List[str]]] = []
    ignored: List[Tuple[str, int]] = []
    changed: List[Tuple[str, str, Any, Any]] = []
    for column in before.columns:
        values_before = before[column].tolist()
        values_after = after[column].tolist() if column in after.columns else [None] * len(before)
        empty_before = sum(1 for value in values_before if _missing(value))
        empty_after = sum(1 for value in values_after if _missing(value))
        filled = filled_by_column.get(column, 0)
        if empty_before or filled:
            columns.append({"name": str(column), "empty_before": empty_before, "filled": filled, "empty_after": empty_after})
        if filled and empty_after:
            partial.append((str(column), [labels[index] for index, value in enumerate(values_after) if _missing(value)]))
        elif not filled and empty_after and _mentions(instructions, str(column)):
            ignored.append((str(column), empty_after))
        for index, (old, new) in enumerate(zip(values_before, values_after)):
            if not _missing(old) and not _same(old, new):
                changed.append((str(column), labels[index], _plain(old), _plain(new)))
    new_columns = [str(column) for column in after.columns if column not in before.columns]
    records: List[Dict[str, Any]] = outcome.get("records") or []
    preview_columns = [str(column) for column in after.columns]
    return {
        "ok": True,
        "rows": len(before),
        "filled": len(computed),
        "columns": columns,
        "new_columns": new_columns,
        "changed": len(changed),
        "preview": {
            "columns": preview_columns,
            "rows": records[:PREVIEW_ROWS],
            "total_rows": len(records),
            "computed": [[row, column] for row, column in computed if isinstance(row, int) and row < PREVIEW_ROWS],
        },
        "_partial": partial,
        "_ignored": ignored,
        "_changed": changed,
    }


def _feedback(check: Dict[str, Any], asked: set) -> Optional[str]:
    """What goes back to the model about its last answer (None: nothing to fix). Gaps and overwritten values are raised
    once; when the model keeps them, they are what it intends."""
    if not check["ok"]:
        line = f" (line {check['line']})" if check.get("line") else ""
        return (
            f"The platform test-ran your code on the table and it failed{line}:\n{check['error']}\n\n"
            "Fix the code so that it runs and does what the instructions say. Answer in the same JSON format, with the "
            "complete corrected code."
        )
    parts: List[str] = []
    if check["_partial"] and "partial" not in asked:
        asked.add("partial")
        items = [f'- "{column}": still empty for {", ".join(rows[:8])}{" …" if len(rows) > 8 else ""}' for column, rows in check["_partial"]]
        parts.append(
            "Your code ran, but it leaves cells empty in columns it computes:\n" + "\n".join(items) + "\n"
            "Usual causes: a mapping that misses a value the column takes, or an empty input used in a calculation."
        )
    if check["_ignored"] and "ignored" not in asked:
        asked.add("ignored")
        items = [f'- "{column}": {count} empty cells, none filled' for column, count in check["_ignored"]]
        parts.append("The instructions name these columns, but your code fills none of their empty cells:\n" + "\n".join(items))
    if check["_changed"] and "changed" not in asked:
        asked.add("changed")
        items = [f'- "{column}" for {row}: {json.dumps(old, ensure_ascii=False)} -> {json.dumps(new, ensure_ascii=False)}' for column, row, old, new in check["_changed"][:10]]
        parts.append(
            "Your code changes values the table already had:\n" + "\n".join(items) + "\n"
            "Fill only empty cells unless the instructions ask to change given values."
        )
    if not parts:
        return None
    return (
        "\n\n".join(parts)
        + "\n\nFix the code where the instructions, the data or the definition of the field determine other values. "
        "Where the current result is right, keep that part of the code unchanged and say why in \"assumptions\". "
        "Answer in the same JSON format, with the complete code."
    )


def _score(check: Dict[str, Any]) -> Tuple[int, int, int]:
    if not check["ok"]:
        return (0, 0, 0)
    gaps = sum(len(rows) for _column, rows in check["_partial"]) + sum(count for _column, count in check["_ignored"])
    return (1, -gaps, -len(check["_changed"]))


# --------------------------------------------------------------------------------------------------
# Generating
# --------------------------------------------------------------------------------------------------

CODE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "code": {"type": "string"},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["code", "assumptions"],
    "additionalProperties": False,
}

CODE_SYSTEM = """You write the Python code of one calculation step in a bank's reporting platform. The step gets one table and fills its empty cells: derived fields such as a balance-sheet type, an assessment base, a conversion factor, an exposure value, a risk weight or a carrying amount.

Where the code runs
- `df` is a pandas DataFrame with the table, one row per position. `pd` (pandas) and `np` (numpy) are available.
- Nothing else is: no import statements, no files, no network, no print. The only built-in functions are: {builtins}.
- The platform runs the code exactly as written and compares the table before and after. Every cell that was empty and has a value afterwards is shown to the user as a computed value.

What the code must do
1. Follow the user's instructions exactly wherever they say something. They take precedence over the data and over every rule below.
2. Fill empty cells only. Never overwrite a value the table already has: use fillna(...), or a mask with .isna() and df.loc[mask, 'X'] = ...
3. Fill every empty cell whose value the instructions, the data or the standard definition of the field determine. Descriptive input columns (identifiers, names, dates, given amounts) stay as they are unless the instructions say otherwise or the field's meaning gives an obvious default (accrued interest not given = 0).
4. For a column the instructions do not cover: when completely filled rows show a consistent relationship to other columns (check it on at least two rows), use it; otherwise use the field's standard definition in banking and regulatory reporting (for example the CRR standardised approach), based on the column names and values. List every such choice in "assumptions".
5. A mapping (dict) must cover every value its column takes in the table (listed below). Compare texts exactly as they appear.
6. Keep every row and every input column, in their order and with their names. Add a column only when the instructions ask for one.
7. Compute in dependency order: a value before the values that use it. An empty input used in a calculation leaves the result empty, so fill or default the input first where its meaning allows it.
8. Convert columns that hold numbers as text with pd.to_numeric(df['X'], errors='coerce') before calculating with them.

How the code must look (business analysts read it, and the platform's lineage tools replay it statement by statement)
- One block per filled column, in dependency order, each with a one-line comment above it saying what it computes.
- Mappings as dicts used with .map(...); conditions as boolean masks with df.loc[...], np.where or np.select; arithmetic on whole columns.
- No loops over rows, no df.apply, no lambda, no function or class definitions, no try/except.
- Column names exactly as listed (spaces, case, umlauts).

Answer as JSON:
- "code": the complete Python code, without markdown fences.
- "assumptions": one short sentence in {language} per rule you chose that is neither in the instructions nor visible in the data, e.g. "Risk Weight: 100 % for Corporates, 50 % for Banks, 0 % for Sovereigns (CRR standardised approach)." Empty when there is none."""


def generate(
    dataset_name: str,
    frame: pd.DataFrame,
    instructions: str,
    test_run: Callable[[str], Dict[str, Any]],
    language: Optional[str] = None,
) -> Dict[str, Any]:
    """Code for the table, its assumptions and the check of its test run. Up to MAX_ROUNDS answers: an answer that
    fails, or leaves cells empty the instructions or the field determine, goes back once more with what the test run
    showed; the best answer is returned."""
    instructions = (instructions or "").strip()[:INSTRUCTIONS_LIMIT]
    language_name = _language(language)
    request = describe_table(dataset_name, frame) + "\n\n"
    if instructions:
        request += 'Instructions from the user:\n"""\n' + instructions + '\n"""'
    else:
        request += "The user gave no instructions: fill the empty cells as the data and the standard definitions of the fields determine."
    messages = [
        {"role": "system", "content": CODE_SYSTEM.replace("{builtins}", SANDBOX_BUILTINS).replace("{language}", language_name)},
        {"role": "user", "content": request},
    ]
    started = time.monotonic()
    asked: set = set()
    best: Optional[Dict[str, Any]] = None
    rounds = 0
    for rounds in range(1, MAX_ROUNDS + 1):
        answer = _call(messages, "generated_code", CODE_SCHEMA, effort="medium")
        code = clean_code(str(answer.get("code") or ""))
        assumptions = [str(item).strip() for item in answer.get("assumptions") or [] if str(item).strip()][:20]
        if not code:
            check = {"ok": False, "error": "The answer contained no code.", "line": None, "rows": len(frame)}
        else:
            problem = check_code(code)
            outcome = {"ok": False, "error": problem[0], "line": problem[1]} if problem else test_run(code)
            check = assess(frame, outcome, instructions)
        candidate = {"code": code, "assumptions": assumptions, "check": check, "round": rounds}
        if code and (best is None or _score(check) >= _score(best["check"])):
            best = candidate
        feedback = _feedback(check, asked)
        if feedback is None or rounds == MAX_ROUNDS or time.monotonic() - started > TIME_BUDGET:
            break
        messages.append({"role": "assistant", "content": json.dumps({"code": code, "assumptions": assumptions}, ensure_ascii=False)})
        messages.append({"role": "user", "content": feedback})
    if best is None:
        raise GenerationError("The language model returned no code. Try again or describe the rules in the instructions.")
    check = {key: value for key, value in best["check"].items() if not key.startswith("_")}
    return {"code": best["code"], "assumptions": best["assumptions"], "check": check, "attempts": rounds}


# --------------------------------------------------------------------------------------------------
# Drafting the instructions
# --------------------------------------------------------------------------------------------------

DRAFT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "rules": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"column": {"type": "string"}, "rule": {"type": "string"}},
                "required": ["column", "rule"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["rules"],
    "additionalProperties": False,
}

DRAFT_SYSTEM = """You draft the instructions for the code that fills the empty cells of a bank's reporting table. The user reads and edits them before the code is written.

For every column with empty cells that the code should fill, write one rule: a formula over other columns (by their exact names), a value per category (name every value the category column takes in the table), or a default. Use completely filled rows where they exist (check a relationship on at least two rows); otherwise use the field's standard definition in banking and regulatory reporting (for example the CRR standardised approach). Leave out descriptive input columns (identifiers, names, dates, given amounts) unless the field's meaning gives an obvious default (accrued interest not given = 0).

Keep each rule as short as a formula, without reasons or caveats, for example:
- "Book Value + Accrued Interests"
- "Loan, Deposit, Security → OnBalance; Limit, Guarantee → OffBalance"
- "1.0 for OnBalance, 0.2 for OffBalance"
- "0 where empty"
A value the code writes into a text column is a short code-like value (OnBalance), not a sentence.

Order the rules so that a value comes before the rules that use it. Write the rules in {language}, plainly and without markdown, and keep column names and category values exactly as in the table.

Answer as JSON: {"rules": [{"column": "<exact column name>", "rule": "<the rule>"}]}"""


def draft_instructions(dataset_name: str, frame: pd.DataFrame, language: Optional[str] = None) -> Dict[str, Any]:
    """Rules for the columns with empty cells, one per line ("Column: rule"), for the page's instructions box."""
    messages = [
        {"role": "system", "content": DRAFT_SYSTEM.replace("{language}", _language(language))},
        {"role": "user", "content": describe_table(dataset_name, frame) + "\n\nWrite the rules for the columns whose empty cells the code should fill."},
    ]
    answer = _call(messages, "column_rules", DRAFT_SCHEMA, effort="low")
    by_lower = {str(column).strip().lower(): str(column) for column in frame.columns}
    rules: List[Tuple[str, str]] = []
    for item in answer.get("rules") or []:
        if not isinstance(item, dict):
            continue
        column = by_lower.get(str(item.get("column") or "").strip().lower())
        rule = re.sub(r"\s+", " ", str(item.get("rule") or "")).strip()
        if column and rule and all(column != existing for existing, _rule in rules):
            rules.append((column, rule))
    if not rules:
        raise GenerationError("The language model suggested no rules. Write the instructions yourself or try again.")
    return {"instructions": dict(rules), "text": "\n".join(f"{column}: {rule}" for column, rule in rules)}
