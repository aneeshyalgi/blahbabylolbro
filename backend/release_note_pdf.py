"""Text extraction for PDF release notes.

Excel release notes are read row by row; a PDF has no rows, so its text is split
into short passages ("records") per page. Each record carries the page number and,
when one appears in the passage, a Jira ID, so the same matching code that reads
Excel rows (agent search, chat context, RootCause) can read PDFs as well.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

from pypdf import PdfReader

MAX_PAGES = 300
# Bounds the text one PDF contributes, like the row/column caps applied to workbooks.
MAX_TEXT_CHARS = 100_000
CHUNK_CHARS = 700

JIRA_PATTERN = re.compile(r"\b[A-Z][A-Z0-9]+-\d+\b")
ITEM_START = re.compile(r"^(?:[-•*▪●◦]|\d+[.)]|[A-Z][A-Z0-9]+-\d+\b)\s*")
SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")

_CACHE: Dict[str, Tuple[Tuple[float, int], Dict[str, Any]]] = {}


def _open(path: Path) -> PdfReader:
    reader = PdfReader(str(path))
    if reader.is_encrypted and not reader.decrypt(""):
        raise ValueError("The PDF is password-protected")
    return reader


def inspect_pdf(path: Path) -> int:
    """Return the page count, raising ValueError when the file is not a readable PDF."""
    try:
        page_count = len(_open(path).pages)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(str(exc)) from exc
    if page_count == 0:
        raise ValueError("The PDF has no pages")
    return page_count


def _split_long(block: str) -> List[str]:
    if len(block) <= CHUNK_CHARS * 2:
        return [block]
    pieces: List[str] = []
    current = ""
    for sentence in SENTENCE_BREAK.split(block):
        if current and len(current) + len(sentence) > CHUNK_CHARS:
            pieces.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        pieces.append(current)
    return pieces


def _passages(text: str) -> List[str]:
    """Group page lines into passages: break on blank lines, list items, Jira IDs and length."""
    passages: List[str] = []
    current: List[str] = []
    length = 0

    def flush() -> None:
        nonlocal current, length
        if current:
            passages.extend(_split_long(" ".join(current)))
        current, length = [], 0

    for raw_line in text.splitlines():
        line = " ".join(raw_line.split())
        if not line:
            flush()
            continue
        if current and (ITEM_START.match(line) or length + len(line) > CHUNK_CHARS):
            flush()
        current.append(line)
        length += len(line) + 1
    flush()
    return passages


def _extract(path: Path) -> Dict[str, Any]:
    reader = _open(path)
    page_count = len(reader.pages)
    pages: List[Dict[str, Any]] = []
    total = 0
    truncated = page_count > MAX_PAGES
    for index, page in enumerate(reader.pages[:MAX_PAGES], start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        records: List[Dict[str, Any]] = []
        for passage in _passages(text):
            if total >= MAX_TEXT_CHARS:
                truncated = True
                break
            passage = passage[: MAX_TEXT_CHARS - total]
            total += len(passage)
            record: Dict[str, Any] = {"Page": index}
            jira = JIRA_PATTERN.search(passage)
            if jira:
                record["Jira ID"] = jira.group(0)
            record["Text"] = passage
            records.append(record)
        pages.append({"page": index, "records": records})
        if total >= MAX_TEXT_CHARS:
            truncated = truncated or index < page_count
            break
    return {"page_count": page_count, "pages": pages, "truncated": truncated}


def pdf_release_note_pages(path: Path) -> Dict[str, Any]:
    """Pages of a PDF release note as {"page", "records"}; cached until the file changes."""
    stat = path.stat()
    signature = (stat.st_mtime, stat.st_size)
    key = str(path)
    cached = _CACHE.get(key)
    if cached and cached[0] == signature:
        return cached[1]
    result = _extract(path)
    _CACHE[key] = (signature, result)
    return result
