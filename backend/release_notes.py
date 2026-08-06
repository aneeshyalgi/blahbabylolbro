from pathlib import Path
from datetime import datetime
import io
import json
import pandas as pd
import os
import requests
from typing import Any, Dict, List

UPLOAD_DIR = Path("uploads/patch_notes")
RESULTS_DIR = Path("results/patch_notes")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

SUMMARY_TXT_PATH = RESULTS_DIR / "patch_notes_summary.txt"
SUMMARY_META_PATH = RESULTS_DIR / "patch_notes_summary.json"

def extract_text_from_excel(file_bytes: bytes, max_chars: int = 12000) -> str:
    """
    Convert Excel workbook into a plain-text digest for LLM summarization.
    """
    buf = io.BytesIO(file_bytes)
    try:
        sheets = pd.read_excel(buf, sheet_name=None, engine="openpyxl", dtype=str)
    except Exception as e:
        raise ValueError(f"Could not read Excel: {e}")

    lines: List[str] = []

    for sheet_name, df in sheets.items():
        if df is None or df.empty:
            continue

        lines.append(f"# Sheet: {sheet_name}")

        df = df.fillna("")
        for _, row in df.iterrows():
            cells = [c.strip() for c in row.tolist() if isinstance(c, str) and c.strip()]
            if cells:
                lines.append("• " + " | ".join(cells))

        lines.append("")

    text = "\n".join(lines).strip()

    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[Truncated for prompt length]"

    return text or "No content found in the Excel file."

def build_patch_notes_prompt(extracted_text: str) -> str:
    return f"""
You are an expert technical writer specializing in changelogs and release notes for enterprise web platforms.
Summarize the patch notes below into a single, clear, user-facing document.

Requirements:
- Start with a concise **Highlights** section (3–7 bullets).
- Group changes under **New**, **Improvements**, **Fixes**, **Deprecated/Removed**, and **Breaking Changes** (include sections only if applicable).
- Use short, scannable bullet points; prefer plain language over internal jargon.
- If dates, module names, or ticket/issue IDs exist, include them succinctly.
- If links are present, preserve them in markdown `url` form.
- Keep the overall length to ~400–700 words.

Raw patch notes (may include multiple sheets/columns):
---
{extracted_text}
---
"""

def call_llm(prompt: str) -> str:
    #TODO: Add API link and key
    api_key = os.environ["API_KEY"]
    model = os.getenv("MODEL", "")

    resp = requests.post(
        "",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a release-notes writer."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 1200,
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()

def save_summary(summary: str, source_filename: str) -> Dict[str, Any]:
    SUMMARY_TXT_PATH.write_text(summary, encoding="utf-8")

    metadata = {
        "source_filename": source_filename,
        "last_updated_utc": datetime.utcnow().isoformat() + "Z",
        "summary_path": str(SUMMARY_TXT_PATH),
    }

    SUMMARY_META_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    return metadata

def load_summary() -> Dict[str, Any]:
    if not SUMMARY_TXT_PATH.exists():
        return {
            "summary_text": "No patch notes have been uploaded yet.",
            "meta": {
                "source_filename": None,
                "last_updated_utc": None,
                "summary_path": None,
            }
        }

    text = SUMMARY_TXT_PATH.read_text(encoding="utf-8")

    meta = {}
    if SUMMARY_META_PATH.exists():
        meta = json.loads(SUMMARY_META_PATH.read_text(encoding="utf-8"))

    return {"summary_text": text, "meta": meta}