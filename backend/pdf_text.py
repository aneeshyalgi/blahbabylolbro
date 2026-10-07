"""Text extraction from uploaded release-note PDFs.

A PDF has no rows, so its text is split into short passages per page; each passage carries the Jira
ID it mentions. Regulation PDFs have their own structured parser in regulation_text.py.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pypdf import PdfReader

CHUNK_CHARS = 700

JIRA_PATTERN = re.compile(r"\b[A-Z][A-Z0-9]+-\d+\b")
ITEM_START = re.compile(r"^(?:[-•*▪●◦]|\d+[.)]|[A-Z][A-Z0-9]+-\d+\b)\s*")
SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")

_CACHE: Dict[Tuple[str, str], Tuple[Tuple[float, int], Any]] = {}


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
        starts_new = ITEM_START.match(line)
        if current and (starts_new or length + len(line) > CHUNK_CHARS):
            flush()
        current.append(line)
        length += len(line) + 1
    flush()
    return passages


def _page_texts(path: Path, max_pages: int) -> Tuple[int, List[str]]:
    reader = _open(path)
    texts = []
    for page in reader.pages[:max_pages]:
        try:
            texts.append(page.extract_text() or "")
        except Exception:
            texts.append("")
    return len(reader.pages), texts


def _cached(path: Path, kind: str, build):
    stat = path.stat()
    signature = (stat.st_mtime, stat.st_size)
    key = (str(path), kind)
    cached = _CACHE.get(key)
    if cached and cached[0] == signature:
        return cached[1]
    result = build()
    _CACHE[key] = (signature, result)
    return result


def pdf_release_note_pages(path: Path, max_pages: int = 300, max_chars: int = 100_000) -> Dict[str, Any]:
    """Pages of a PDF release note as {"page", "records"}; records carry the Jira ID they mention."""

    def build() -> Dict[str, Any]:
        page_count, texts = _page_texts(path, max_pages)
        pages: List[Dict[str, Any]] = []
        total = 0
        truncated = page_count > max_pages
        for index, text in enumerate(texts, start=1):
            records: List[Dict[str, Any]] = []
            for passage in _passages(text):
                if total >= max_chars:
                    truncated = True
                    break
                passage = passage[: max_chars - total]
                total += len(passage)
                record: Dict[str, Any] = {"Page": index}
                jira = JIRA_PATTERN.search(passage)
                if jira:
                    record["Jira ID"] = jira.group(0)
                record["Text"] = passage
                records.append(record)
            pages.append({"page": index, "records": records})
            if total >= max_chars:
                truncated = truncated or index < page_count
                break
        return {"page_count": page_count, "pages": pages, "truncated": truncated}

    return _cached(path, "release_notes", build)
