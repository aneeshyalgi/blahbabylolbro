"""Structured extraction, search and quote verification for regulation PDFs.

A regulation is not free text: it is a tree of parts, titles, chapters, sections, articles and annexes,
and every requirement sits in a numbered paragraph or point. The index keeps that structure so agents
can cite "Article 111(2)(a), page 163" and check every quote against the source text.

Extraction: pypdf's layout mode keeps words whole (plain mode splits them, e.g. "prud ential") and
keeps indentation, which tells centred headings from body text. Running headers and footers,
consolidation markers (▼M9, ►C1 … ◄) and footnotes are removed from the body, two-column pages are
split, and headings are parsed into units (articles, annexes, recitals) with their hierarchy.

Search: BM25 over passages with light English/German stemming, German compound matching and a
bilingual glossary of prudential terms, fused with embedding similarity when an index exists.
"""
from __future__ import annotations

import math
import os
import re
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from pypdf import PdfReader

INDEX_VERSION = 3  # 3: sub-section headings in every spelling ("Sub-Section 1", "Subsection 2")
# Called as progress(stage, done, total) while indexing: stages 'reading', 'structure', 'embedding'.
Progress = Callable[[str, int, int], None]
PASSAGE_TARGET = 900
PASSAGE_MAX = 1600
MAX_PAGES = 2500

# --------------------------------------------------------------------------------------------------
# Page text
# --------------------------------------------------------------------------------------------------

_MARKER = re.compile(r"[▼►]\s?[A-Z]\d{0,3}\b|◄")
_AMENDMENT = re.compile(r"▼\s?([A-Z]\d{0,3})\b")
_FOOTNOTE_START = re.compile(r"^\(\s+(\d{1,3})\s+\)\s*\S")
_PAGE_NUMBER = re.compile(r"^(?:-\s*)?\d{1,4}(?:\s*-)?$|^(?:page|seite)\s+\d+(?:\s+(?:of|von)\s+\d+)?$", re.IGNORECASE)
_QUOTE_OPENERS = ("‘", "“", "'", '"', "„", "«")


class Line:
    __slots__ = ("text", "indent", "page", "amendment", "spread")

    def __init__(self, text: str, indent: int, page: int, amendment: Optional[str], spread: float = 0.0):
        self.text = text
        self.indent = indent
        self.page = page
        self.amendment = amendment
        # Share of word gaps wider than one space: justified body lines are stretched, titles are not.
        self.spread = spread


def _spread(raw: str) -> float:
    gaps = re.findall(r" +", raw.strip())
    return (sum(1 for gap in gaps if len(gap) >= 2) / len(gaps)) if len(gaps) >= 3 else 0.0


_SHORT_WORDS = {
    "a", "an", "as", "at", "be", "by", "in", "is", "it", "of", "on", "or", "to", "no", "eu", "if", "up", "we", "i",
    "ii", "iv", "vi", "ix", "xi", "x", "y", "z", "e", "n", "s", "m", "b", "c", "d", "f", "g", "h", "k", "l", "p", "q",
    "r", "t", "u", "v", "w", "j", "o", "am", "do", "go", "he", "me", "my", "so", "us", "de", "en", "et", "la", "le",
    "im", "zu", "ob", "um", "da", "es", "er", "du", "ab", "an", "so", "pd", "rw", "sa", "ii",
}


def _fragmentation(text: str) -> float:
    """Share of words that are stray one- or two-letter fragments ("w he re t he p ort io n")."""
    words = re.findall(r"[A-Za-zÄÖÜäöüß]+", text)
    if len(words) < 40:
        return 0.0
    return sum(1 for word in words if len(word) <= 2 and word.lower() not in _SHORT_WORDS) / len(words)


def _rejoin_split_words(text: str, vocabulary: Counter) -> str:
    """Plain extraction splits words ("governm ents"); join pairs whose concatenation is a word of the
    document while at least one half is not."""

    def joinable(left: str, right: str) -> bool:
        tail = re.search(r"([A-Za-zÄÖÜäöüß]+)$", left)
        head = re.match(r"([a-zäöüß]+)", right)
        if not tail or not head:
            return False
        a, b = tail.group(1).lower(), head.group(1).lower()
        return vocabulary.get(a + b, 0) >= 2 and (vocabulary.get(a, 0) < 2 or vocabulary.get(b, 0) < 2)

    repaired = []
    for line in text.split("\n"):
        words = line.split(" ")
        out: List[str] = []
        for word in words:
            if out and word and joinable(out[-1], word):
                out[-1] += word
            else:
                out.append(word)
        repaired.append(" ".join(out))
    return "\n".join(repaired)


def _read_pages(path: Path, max_pages: int, progress: Optional[Progress] = None) -> Tuple[int, List[str], List[int]]:
    """Layout text per page; a page whose layout text is badly fragmented falls back to plain mode."""
    reader = PdfReader(str(path))
    if reader.is_encrypted and not reader.decrypt(""):
        raise ValueError("The PDF is password-protected")
    texts: List[str] = []
    plain: Dict[int, str] = {}
    total = min(len(reader.pages), max_pages)
    for number, page in enumerate(reader.pages[:max_pages]):
        if progress:
            progress("reading", number, total)
        try:
            text = page.extract_text(extraction_mode="layout") or ""
        except Exception:
            text = ""
        fragmented = _fragmentation(text)
        if not text.strip() or fragmented > 0.15:
            try:
                alternative = page.extract_text() or ""
            except Exception:
                alternative = ""
            if alternative.strip() and (not text.strip() or _fragmentation(alternative) < fragmented / 2):
                plain[number] = alternative
        texts.append(text)
    if plain:
        vocabulary = Counter(word.lower() for number, text in enumerate(texts) if number not in plain for word in re.findall(r"[A-Za-zÄÖÜäöüß]+", text))
        for number, alternative in plain.items():
            texts[number] = _rejoin_split_words(alternative, vocabulary)
    return len(reader.pages), texts, sorted(number + 1 for number in plain)


def _split_columns(raw_lines: List[str]) -> Tuple[List[str], bool]:
    """Read a two-column page column by column: find a gutter that is blank on nearly every line."""
    lines = [line.rstrip() for line in raw_lines]
    width = max((len(line) for line in lines), default=0)
    if width < 60:
        return lines, False
    for x in range(int(width * 0.38), int(width * 0.62)):
        spanning = [line for line in lines if len(line) > x + 3 and line[:x].strip() and line[x + 3:].strip()]
        if len(spanning) < 20:
            continue
        if sum(1 for line in spanning if not line[x - 1:x + 2].strip()) < 0.96 * len(spanning):
            continue
        # Two columns of prose, not a table: both sides hold full lines of words.
        prose = sum(
            1 for line in spanning
            if len(re.sub(r"\s+", " ", line[:x]).strip()) >= 25 and len(re.sub(r"\s+", " ", line[x:]).strip()) >= 25
        )
        if prose >= 0.7 * len(spanning):
            left = [line[:x] for line in lines]
            right = [" " * x + line[x:] if len(line) > x else "" for line in lines]
            return left + right, True
    return lines, False


def _collapse_letter_spacing(segment: str) -> str:
    """'S e c t i o n' -> 'Section' (headings typeset with letter spacing)."""
    tokens = segment.split(" ")
    if len(tokens) >= 3 and all(len(token) == 1 for token in tokens) and sum(token.isalpha() for token in tokens) >= 0.6 * len(tokens):
        return "".join(tokens)
    return segment


def _clean_line(raw: str) -> Tuple[str, int, List[str]]:
    stripped = raw.strip()
    indent = len(raw) - len(raw.lstrip(" "))
    amendments = _AMENDMENT.findall(stripped)
    text = " ".join(_collapse_letter_spacing(segment) for segment in re.split(r" {2,}", stripped))
    text = _MARKER.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if _FOOTNOTE_START.match(text):
        return text, indent, amendments  # keep "( 1 )": the spacing is what marks a footnote
    # Typography spacing from the layout: "item ’s" -> "item’s", "gearing ’)" -> "gearing’)".
    text = re.sub(r"(?<=\w) +’(?=s\b|[^\w]|$)", "’", text)
    text = re.sub(r"([‘“„]) +", r"\1", text)
    text = re.sub(r" +([,;:)\]])", r"\1", text)
    text = re.sub(r"([(\[]) +(?=\S)", r"\1", text)
    if re.fullmatch(r"_{3,}", text):
        text = "[deleted]"
    return text, indent, amendments


def _furniture_key(text: str) -> str:
    return re.sub(r"\d+", "#", text.casefold()).strip()


def _page_lines(texts: List[str]) -> Tuple[List[List[Line]], List[Tuple[int, List[Line]]], Dict[str, Any]]:
    """Clean lines per page, without running headers/footers and with footnotes split off."""
    cleaned: List[List[Tuple[str, int, float]]] = []
    amendment: Optional[str] = None
    amendments_per_page: List[List[Optional[str]]] = []
    two_column_pages = 0
    for text in texts:
        raw_lines, split = _split_columns(text.splitlines())
        two_column_pages += split
        page: List[Tuple[str, int, float]] = []
        page_amendments: List[Optional[str]] = []
        for raw in raw_lines:
            line, indent, markers = _clean_line(raw)
            if markers:
                amendment = markers[-1]
            if line:
                page.append((line, indent, _spread(_MARKER.sub(" ", raw))))
                page_amendments.append(amendment)
        cleaned.append(page)
        amendments_per_page.append(page_amendments)

    # Running headers and footers repeat (up to the page number) at the top or bottom of most pages.
    edge_counts: Counter = Counter()
    for page in cleaned:
        edges = {_furniture_key(line) for line, _, _ in page[:3] + page[-3:]}
        edge_counts.update(edges)
    threshold = max(3, int(len(cleaned) * 0.25))
    furniture = {key for key, count in edge_counts.items() if count >= threshold and len(key) >= 2}

    pages: List[List[Line]] = []
    footnotes: List[Tuple[int, List[Line]]] = []
    removed = 0
    for number, (page, page_amendments) in enumerate(zip(cleaned, amendments_per_page), start=1):
        lines: List[Line] = []
        for position, ((text, indent, spread), page_amendment) in enumerate(zip(page, page_amendments)):
            at_edge = position < 3 or position >= len(page) - 3
            if at_edge and (_furniture_key(text) in furniture or _PAGE_NUMBER.match(text)):
                removed += 1
                continue
            lines.append(Line(text, indent, number, page_amendment, spread))
        # Footnotes ("( 1 ) Directive 2013/36/EU ...") run from the first footnote line to the page end.
        start = next(
            (index for index, line in enumerate(lines) if index >= len(lines) * 0.3 and _FOOTNOTE_START.match(line.text)),
            None,
        )
        if start is not None:
            footnotes.append((number, lines[start:]))
            lines = lines[:start]
        pages.append(lines)
    stats = {
        "furniture_patterns": sorted(furniture, key=lambda key: -edge_counts[key])[:5],
        "furniture_lines_removed": removed,
        "two_column_pages": two_column_pages,
    }
    return pages, footnotes, stats


# --------------------------------------------------------------------------------------------------
# Structure
# --------------------------------------------------------------------------------------------------

_LEVELS: List[Tuple[str, re.Pattern]] = [
    ("part", re.compile(r"^(?:PART|TEIL)\s+([A-ZÄÖÜ]+|[IVXLC]+|\d+)$")),
    ("title", re.compile(r"^(?:TITLE|TITEL)\s+([IVXLC]+[A-Za-z]?|\d+)$")),
    ("chapter", re.compile(r"^(?:CHAPTER|KAPITEL)\s+(\d+[a-z]?|[IVXLC]+)$")),
    ("section", re.compile(r"^(?:section|abschnitt)\s+(\d+[a-z]?|[IVXLC]+)$", re.IGNORECASE)),
    ("subsection", re.compile(r"^(?:sub-?section|unterabschnitt)[\s-]+(\d+[a-z]?)$", re.IGNORECASE)),
]
_LEVEL_NAMES = [name for name, _ in _LEVELS]
_ARTICLE = re.compile(r"^(?:Article|Artikel)\s+(\d{1,4}[a-z]{0,3})$")
_ARTICLE_WITH_TITLE = re.compile(r"^(?:Article|Artikel)\s+(\d{1,4}[a-z]{0,3})\s+([A-ZÄÖÜ][^;:]{2,150})$")
_ANNEX = re.compile(r"^(?:ANNEX|ANHANG|Annex|Anhang)(?:\s+([IVXLC]+[a-z]?|\d+[a-z]?))?$")
_RECITALS = re.compile(r"^(?:Whereas|in Erwägung nachstehender Gründe)\s*:?$", re.IGNORECASE)
_DOC_TITLE = re.compile(r"^(?:(?:COMMISSION\s+)?(?:DELEGATED\s+|IMPLEMENTING\s+)?(?:REGULATION|DIRECTIVE|DECISION)|(?:DELEGIERTE\s+|DURCHFÜHRUNGS)?(?:VERORDNUNG|RICHTLINIE|BESCHLUSS))\b")
_PARAGRAPH = re.compile(r"^(\d{1,3}[a-z]?)\.\s+\S")
_POINT = re.compile(r"^\((\d{1,3}[a-z]?|[a-z]{1,4})\)\s")
_ANNEX_GROUP = re.compile(r"^(\d{1,2})\s+\((?:a|i|1)\)\s")
_TABLE = re.compile(r"^(?:Table|Tabelle)\s+\d+[a-z]?\b")
_SENTENCE_END = re.compile(r"(?<=[.;:])\s+(?=[(A-ZÄÖÜ0-9‘“])")
# Formulas set in symbol fonts come out as runs of stray glyphs ("X Í Î h ¼ H"); such passages are
# flagged so agents check the formula on the PDF page instead of trusting the extracted text.
_FORMULA_GLYPHS = re.compile(r"(?:(?<!\S)[ÍÎÏÐÑ¼½¾±×÷∑∏√∫≈∆Δσμ·](?!\S)\s*){2,}|(?:(?<!\S)[^\s\d%(),.;:'’‘\"-](?!\S)\s+){5,}")


def _article_key(number: str) -> Tuple[int, int, str]:
    """EU numbering: 325 < 325a < … < 325z < 325aa < 325ab."""
    match = re.match(r"(\d+)([a-z]*)", number)
    return (int(match.group(1)), len(match.group(2)), match.group(2)) if match else (0, 0, "")


def _heading_kind(text: str) -> Optional[Tuple[str, str]]:
    for name, pattern in _LEVELS:
        match = pattern.match(text)
        if match:
            return name, match.group(1)
    match = _ARTICLE.match(text)
    if match:
        return "article", match.group(1)
    match = _ANNEX.match(text)
    if match:
        return "annex", (match.group(1) or "")
    return None


def _left_margin(lines: List[Line], fallback: int) -> int:
    """Left edge of the body text: a low percentile of the indents of full lines (points are indented)."""
    indents = sorted(line.indent for line in lines if len(line.text) > 40)
    if len(indents) < 3:
        return fallback
    return indents[len(indents) // 10]


def _is_centred(line: Line, margin: int) -> bool:
    """Headings are short lines set well inside the margin; justified layout makes exact centring unreliable."""
    return line.indent >= margin + 15


class _Builder:
    """Turns the cleaned lines into units (articles, annexes, ...) and paragraph-aware passages."""

    def __init__(self, require_centred: bool):
        self.require_centred = require_centred
        self.units: List[Dict[str, Any]] = []
        self.passages: List[Dict[str, Any]] = []
        self.path: Dict[str, str] = {}
        self.rejected: List[Dict[str, Any]] = []
        self.last_article: Optional[Tuple[int, int, str]] = None
        self.in_annexes = False
        self.last_annex = 0
        self.justified = False
        self.german = False
        self.document_title: Optional[str] = None
        self._buffer: List[str] = []
        self._buffer_page: Optional[int] = None
        self._buffer_last_page: Optional[int] = None
        self._buffer_amendment: Optional[str] = None
        self._points: List[str] = []
        self._table = False
        self._table_header: Optional[str] = None
        self.paragraph: Optional[str] = None
        self.group: Optional[str] = None
        self._open_unit("front", "Front matter", None, None, 1)

    # -- units -----------------------------------------------------------------------------------
    def _open_unit(self, kind: str, label: str, number: Optional[str], title: Optional[str], page: int) -> None:
        self.flush()
        self.units.append({
            "kind": kind,
            "label": label,
            "number": number,
            "title": title,
            "path": [self.path[level] for level in _LEVEL_NAMES if level in self.path],
            "page_start": page,
            "page_end": page,
        })
        self.paragraph = None
        self.group = None

    @property
    def unit_index(self) -> int:
        return len(self.units) - 1

    def set_level(self, level: str, label: str) -> None:
        self.flush()
        position = _LEVEL_NAMES.index(level)
        for deeper in _LEVEL_NAMES[position:]:
            self.path.pop(deeper, None)
        self.path[level] = label

    # -- passages --------------------------------------------------------------------------------
    def add_text(self, line: Line) -> None:
        if not self._buffer:
            self._buffer_page = line.page
            self._buffer_amendment = line.amendment
        self._buffer_last_page = line.page
        text = line.text
        if self._buffer and not self._table:
            previous = self._buffer[-1]
            if previous.endswith("­"):
                self._buffer[-1] = previous[:-1] + text
                text = None
            elif re.search(r"[A-Za-zÄÖÜäöüß]-$", previous) and text[:1].islower():
                self._buffer[-1] = previous + text
                text = None
        if text is not None:
            self._buffer.append(text)
        self.units[-1]["page_end"] = line.page
        size = sum(len(item) for item in self._buffer)
        if self._table and size > PASSAGE_MAX and len(self._buffer) > 3:
            # Long tables are cut at row boundaries; later parts carry the table's heading rows as context.
            header = self._table_header or "\n".join(self._buffer[:2])
            last = self._buffer.pop()
            self.flush(keep_table=True)
            self._table_header = header
            self._buffer = [last]
            self._buffer_page = self._buffer_last_page = line.page
        elif not self._table and size > PASSAGE_MAX:
            self._flush_long()

    def _flush_long(self) -> None:
        text = " ".join(self._buffer)
        pieces = _SENTENCE_END.split(text)
        if len(pieces) < 2:
            pieces = text.split(" ")  # no sentence ends (lists, correlation tables): cut between words
        head, tail = "", []
        for index, piece in enumerate(pieces):
            if head and len(head) + len(piece) > PASSAGE_TARGET:
                tail = pieces[index:]
                break
            head = f"{head} {piece}".strip()
        if not tail:
            return
        self._buffer = [head]
        rest = " ".join(tail)
        last_page = self._buffer_last_page
        self.flush()
        self._buffer = [rest]
        self._buffer_page = last_page
        self._buffer_last_page = last_page

    def flush(self, keep_table: bool = False) -> None:
        table = self._table
        if self._buffer:
            joiner = "\n" if table else " "
            text = joiner.join(self._buffer).replace("­", "").strip()
            if text:
                passage: Dict[str, Any] = {
                    "unit": self.unit_index,
                    "page": self._buffer_page,
                    "kind": "table" if table else "text",
                    "text": text,
                }
                if self._buffer_last_page and self._buffer_last_page != self._buffer_page:
                    passage["page_end"] = self._buffer_last_page
                if self.paragraph:
                    passage["paragraph"] = self.paragraph
                if self.group:
                    passage["group"] = self.group
                if self._points:
                    passage["points"] = self._points[:12]
                if self._buffer_amendment:
                    passage["amendment"] = self._buffer_amendment
                if table and self._table_header:
                    passage["context"] = f"{self._table_header} (continued)"
                if _FORMULA_GLYPHS.search(text):
                    passage["formula"] = True
                self.passages.append(passage)
        self._buffer = []
        self._points = []
        if not keep_table:
            self._table = False
            self._table_header = None

    def body_line(self, line: Line, body: int) -> None:
        text = line.text
        unit = self.units[-1]
        centred = _is_centred(line, body)
        paragraph = _PARAGRAPH.match(text)
        if paragraph and not centred and unit["kind"] != "front":
            self.flush()
            self.paragraph = paragraph.group(1)
            self.group = None
        elif unit["kind"] == "annex" and _ANNEX_GROUP.match(text):
            self.flush()
            self.group = _ANNEX_GROUP.match(text).group(1)
            self._points.append(re.search(r"\((\w+)\)", text).group(1))
        elif _TABLE.match(text):
            self.flush()
            self._table = True
        elif _POINT.match(text):
            label = _POINT.match(text).group(1)
            if self._table or unit["kind"] == "recitals" or sum(len(item) for item in self._buffer) >= PASSAGE_TARGET * 0.6:
                self.flush()
            self._points.append(label)
        self.add_text(line)


def _title_lines(lines: List[Line], start: int, margin: int, justified: bool, german: bool = False, limit: int = 6) -> List[int]:
    """Indexes of the heading's title lines that follow ``start``.

    In a justified document body lines are stretched (wide word gaps) and titles are not, so a title is
    any run of unstretched or indented lines. Otherwise the first line is the title unless it reads as
    body text, and a wrapped title continues on indented lines."""
    def stops(text: str) -> bool:
        return bool(
            _heading_kind(text) or _PARAGRAPH.match(text) or _POINT.match(text) or _TABLE.match(text)
            or _RECITALS.match(text) or len(text) > 200 or text == "[deleted]"
        )

    # A wrapped title ends on a short indented line ("… in a financial" / "sector entity"), whatever the
    # spacing of the full lines before it; body text never ends that way right after a heading.
    for tail in range(start + 1, min(len(lines), start + limit)):
        line = lines[tail]
        if stops(line.text) or lines[tail - 1].text.endswith((".", ":", ";")):
            break
        if line.indent >= margin + 8 and len(line.text) < 80 and len(lines[tail - 1].text) >= 45:
            following = lines[tail + 1] if tail + 1 < len(lines) else None
            if following is None or following.indent < margin + 8 or stops(following.text):
                return list(range(start, tail + 1))
            break
        if line.indent > margin + 2:
            break

    picked: List[int] = []
    for index in range(start, min(len(lines), start + limit)):
        line = lines[index]
        text = line.text
        if stops(text):
            break
        at_margin = line.indent <= margin + 2
        previous = lines[picked[-1]].text if picked else ""
        if previous.endswith((".", ":", ";")) or (picked and (len(text) > 140 or len(previous) < 45)):
            break  # a title only wraps when the line before it is full
        if picked and previous.isupper() != text.isupper():
            break
        if justified:
            if at_margin and line.spread > 0.34:
                # A stretched one-line title is still a title when the next line opens paragraph 1 or a new
                # sentence; body text instead continues mid-sentence in lower case.
                following = lines[index + 1] if index + 1 < len(lines) else None
                first_word = following.text.split(" ", 1)[0] if following else ""
                opens = following is not None and bool(
                    _PARAGRAPH.match(following.text) or _POINT.match(following.text)
                    # German capitalises every noun, so only English can rely on the capital letter.
                    or (not german and first_word[:1].isupper() and first_word not in _CAPITALISED_IN_SENTENCES)
                )
                if picked or text.endswith((".", ":", ";", ",")) or len(text) > 110 or not opens:
                    break
            if not picked and text.endswith((".", ":", ";")) and len(text) > 60:
                break
        elif not picked:
            if text.endswith((".", ":", ";")):
                break
            if at_margin and len(text) > 60:
                # A long title wraps: its first line runs at the margin and the rest is indented, or the
                # article's paragraph 1 follows directly. Body text continues at the margin instead.
                following = lines[index + 1] if index + 1 < len(lines) else None
                wrapped = following is not None and following.indent >= margin + 8 and len(following.text) < 120 \
                    and not (_PARAGRAPH.match(following.text) or _POINT.match(following.text) or _heading_kind(following.text))
                numbered = following is not None and bool(_PARAGRAPH.match(following.text) or _POINT.match(following.text))
                if not (wrapped or numbered):
                    break
        elif at_margin or line.indent < margin + 8 or len(text) > 120:
            break
        picked.append(index)
    return picked


_CAPITALISED_IN_SENTENCES = {
    "Article", "Articles", "Annex", "Regulation", "Directive", "Member", "Union", "EBA", "ESMA", "EIOPA", "ECB",
    "Commission", "Part", "Title", "Chapter", "Section", "Subsection", "Sub-section", "Table", "Tier", "Common",
    "Additional", "Council", "European", "EU", "G-SII", "G-SIIs", "IRB", "Standardised", "Approach", "CVA",
    "Artikel", "Anhang", "Verordnung", "Richtlinie", "Mitgliedstaat", "Mitgliedstaaten", "Union", "Kommission",
}
_ROMAN = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}


def _annex_key(number: str) -> int:
    value = number.lower().rstrip("abcdefgh") if not number.isdigit() else number
    if value.isdigit():
        return int(value)
    total = 0
    for current, following in zip(value, list(value[1:]) + [""]):
        amount = _ROMAN.get(current, 0)
        total += -amount if following and _ROMAN.get(following, 0) > amount else amount
    return total


def _parse(pages: List[List[Line]], german: bool = False) -> _Builder:
    page_margins = [_left_margin(lines, -1) for lines in pages]
    known = sorted(margin for margin in page_margins if margin >= 0)
    default_margin = known[len(known) // 2] if known else 0
    margins = [margin if margin >= 0 else default_margin for margin in page_margins]
    # Decide whether headings are recognisably set apart in this PDF (layout mode keeps indentation).
    article_lines = centred = 0
    for lines, margin in zip(pages, margins):
        for line in lines:
            if _ARTICLE.match(line.text):
                article_lines += 1
                centred += _is_centred(line, margin)
    require_centred = article_lines >= 3 and centred >= 0.6 * article_lines
    body_spreads = sorted(
        line.spread for lines, margin in zip(pages, margins) for line in lines
        if len(line.text) > 60 and line.indent <= margin + 2
    )
    justified = bool(body_spreads) and body_spreads[len(body_spreads) // 2] >= 0.4
    builder = _Builder(require_centred)
    builder.justified = justified
    builder.german = german

    for lines, body in zip(pages, margins):
        index = 0
        while index < len(lines):
            line = lines[index]
            text = line.text
            if builder.document_title is None and _DOC_TITLE.match(text):
                title_lines = [text]
                for follower in lines[index + 1:index + 4]:
                    if follower.text.isupper() or follower.text.startswith(("of ", "vom ", "on ", "über ", "zur ")):
                        title_lines.append(follower.text)
                    else:
                        break
                builder.document_title = " ".join(title_lines)[:240]
            kind = None if text.startswith(_QUOTE_OPENERS) else _heading_kind(text)
            inline_title = None
            if kind is None and _is_centred(line, body) and not text.startswith(_QUOTE_OPENERS):
                match = _ARTICLE_WITH_TITLE.match(text)
                if match:
                    kind, inline_title = ("article", match.group(1)), match.group(2).strip()
            centred_here = _is_centred(line, body)
            if kind and builder.require_centred and not centred_here:
                kind = None
            if kind:
                name, number = kind
                title_indexes = [] if inline_title else _title_lines(lines, index + 1, body, builder.justified, builder.german)
                title = inline_title or " ".join(lines[i].text for i in title_indexes) or None
                if name == "article":
                    key = _article_key(number)
                    # Articles only move forward and never follow the annexes; anything else is a quoted
                    # article, a correlation table or a cross-reference set on its own line.
                    reason = None
                    if builder.in_annexes:
                        reason = "inside an annex"
                    elif builder.last_article and key <= builder.last_article:
                        reason = "out of sequence"
                    if reason:
                        builder.rejected.append({"page": line.page, "text": text, "reason": reason})
                        builder.body_line(line, body)
                        index += 1
                        continue
                    builder.last_article = key
                    builder._open_unit("article", f"Article {number}", number, title, line.page)
                elif name == "annex" and number and builder.last_annex and _annex_key(number) <= builder.last_annex:
                    builder.rejected.append({"page": line.page, "text": text, "reason": "annex out of sequence"})
                    builder.body_line(line, body)
                    index += 1
                    continue
                elif name == "annex":
                    builder.in_annexes = True
                    builder.last_annex = _annex_key(number) if number else builder.last_annex
                    builder.path = {}
                    label = f"Annex {number}".strip()
                    builder._open_unit("annex", label, number or None, title, line.page)
                elif builder.in_annexes:
                    builder.body_line(line, body)  # "PART 1" etc. inside an annex is the annex's own structure
                    index += 1
                    continue
                else:
                    heading = f"{text} — {title}" if title else text
                    builder.set_level(name, heading)
                    # Level headings start a new unit only once articles began; keep text before as is.
                index = (title_indexes[-1] + 1) if title_indexes else index + 1
                continue
            if _RECITALS.match(text) and builder.units[-1]["kind"] == "front":
                builder._open_unit("recitals", "Recitals", None, None, line.page)
                index += 1
                continue
            builder.body_line(line, body)
            index += 1
    builder.flush()
    return builder


# --------------------------------------------------------------------------------------------------
# Index
# --------------------------------------------------------------------------------------------------

def build_regulation_index(path: Path, max_pages: int = MAX_PAGES, progress: Optional[Progress] = None) -> Dict[str, Any]:
    """Parse a regulation PDF into units, passages and a quality report (JSON-serialisable)."""
    page_count, texts, plain_pages = _read_pages(path, max_pages, progress)
    if progress:
        progress("structure", 0, 1)
    pages, footnote_blocks, page_stats = _page_lines(texts)
    page_stats["pages_read_in_plain_mode"] = plain_pages[:40]
    german = sum(1 for text in texts[:60] if re.search(r"\bArtikel\s+\d", text)) > sum(
        1 for text in texts[:60] if re.search(r"\bArticle\s+\d", text)
    )
    builder = _parse(pages, german)

    units = builder.units
    passages = builder.passages
    # Footnotes belong to the unit that is open on their page; they are kept apart from the body text.
    unit_by_page: Dict[int, int] = {}
    for passage in passages:
        for page in range(passage["page"], passage.get("page_end", passage["page"]) + 1):
            unit_by_page.setdefault(page, passage["unit"])
            unit_by_page[page] = passage["unit"]
    footnote_count = 0
    for page, lines in footnote_blocks:
        current: List[str] = []
        number = None

        def emit() -> None:
            nonlocal footnote_count
            if current and number is not None:
                passages.append({
                    "unit": unit_by_page.get(page, 0),
                    "page": page,
                    "kind": "footnote",
                    "footnote": number,
                    "text": " ".join(current).replace("­", ""),
                })
                footnote_count += 1

        for line in lines:
            match = _FOOTNOTE_START.match(line.text)
            if match:
                emit()
                current, number = [re.sub(r"^\(\s+\d+\s+\)\s*", "", line.text)], match.group(1)
            else:
                current.append(line.text)
        emit()

    # Drop empty units (a heading directly followed by another heading) but keep their numbering.
    used = {passage["unit"] for passage in passages}
    remap: Dict[int, int] = {}
    kept_units: List[Dict[str, Any]] = []
    for index, unit in enumerate(units):
        if index in used or unit["kind"] in ("article", "annex"):
            remap[index] = len(kept_units)
            kept_units.append(unit)
    for passage in passages:
        passage["unit"] = remap.get(passage["unit"], 0)
    passages.sort(key=lambda item: (item["unit"], item["kind"] == "footnote", item["page"]))
    for unit in kept_units:
        unit["passages"] = 0
        unit["chars"] = 0
    for passage in passages:
        unit = kept_units[passage["unit"]]
        unit["passages"] += 1
        unit["chars"] += len(passage["text"])

    articles = [unit for unit in kept_units if unit["kind"] == "article"]
    annexes = [unit for unit in kept_units if unit["kind"] == "annex"]
    numbers = sorted({_article_key(unit["number"])[0] for unit in articles})
    gaps = [n for n in range(numbers[0], numbers[-1] + 1) if n not in set(numbers)] if numbers else []
    empty_pages = [number for number, lines in enumerate(pages, start=1) if sum(len(line.text) for line in lines) < 20]
    quality = {
        "page_count": page_count,
        "pages_indexed": len(texts),
        "pages_without_text": len(empty_pages),
        "pages_without_text_sample": empty_pages[:20],
        "articles": len(articles),
        "first_article": articles[0]["number"] if articles else None,
        "last_article": articles[-1]["number"] if articles else None,
        "article_number_gaps": gaps[:40],
        "article_number_gap_count": len(gaps),
        "articles_without_title": [unit["number"] for unit in articles if not unit.get("title")][:20],
        "empty_articles": [unit["number"] for unit in articles if not unit["passages"]][:20],
        "annexes": len(annexes),
        "passages": sum(1 for passage in passages if passage["kind"] != "footnote"),
        "tables": sum(1 for passage in passages if passage["kind"] == "table"),
        "footnotes": footnote_count,
        "formula_passages": sum(1 for passage in passages if passage.get("formula")),
        "rejected_headings": len(builder.rejected),
        "rejected_heading_sample": builder.rejected[:10],
        "structure": "headings centred" if builder.require_centred else "headings by pattern",
        "language": "de" if german else "en",
        "truncated": page_count > len(texts),
        **page_stats,
    }
    warnings = []
    if empty_pages and len(empty_pages) >= max(3, 0.1 * page_count):
        warnings.append("scanned_pages")
    if not articles and not annexes:
        warnings.append("no_structure")
    if quality["truncated"]:
        warnings.append("truncated")
    quality["warnings"] = warnings
    return {
        "version": INDEX_VERSION,
        "document_title": builder.document_title,
        "units": kept_units,
        "passages": passages,
        "quality": quality,
    }


def passage_reference(unit: Dict[str, Any], passage: Optional[Dict[str, Any]] = None) -> str:
    """'Article 111(2)', 'Annex I (row 1)', 'Recitals (12)'."""
    label = unit["label"]
    if passage is None:
        return label
    if passage.get("paragraph") and unit["kind"] == "article":
        label += f"({passage['paragraph']})"
    elif passage.get("group") and unit["kind"] == "annex":
        label += f", row {passage['group']}"
    elif unit["kind"] == "recitals" and passage.get("points"):
        label += f" ({passage['points'][0]})"
    return label


def page_label(passage: Dict[str, Any]) -> str:
    if passage.get("page_end") and passage["page_end"] != passage["page"]:
        return f"{passage['page']}-{passage['page_end']}"
    return str(passage["page"])


# --------------------------------------------------------------------------------------------------
# Search
# --------------------------------------------------------------------------------------------------

_STOPWORDS = {
    "of", "to", "in", "on", "at", "by", "as", "an", "or", "be", "is", "it", "no", "if", "its", "per", "via",
    "im", "zu", "am", "um", "ob", "es", "so",
    "the", "and", "for", "with", "from", "that", "this", "shall", "such", "where", "which", "referred", "paragraph",
    "point", "points", "article", "articles", "regulation", "annex", "are", "was", "were", "has", "have", "been",
    "its", "their", "they", "them", "than", "into", "onto", "under", "within", "any", "all", "each", "other",
    "not", "may", "can", "also", "only", "out", "set", "accordance", "pursuant", "what", "how", "does", "which",
    "der", "die", "das", "den", "dem", "des", "und", "oder", "mit", "für", "von", "vom", "ein", "eine", "einer",
    "eines", "einem", "einen", "ist", "sind", "wird", "werden", "wurde", "nach", "gemäß", "bei", "auf", "aus",
    "zur", "zum", "durch", "dass", "sowie", "artikel", "absatz", "buchstabe", "verordnung", "anhang", "nicht",
}
_SUFFIXES = ("ungen", "ung", "ies", "ions", "ion", "en", "er", "es", "em", "e", "s", "n")
_ACRONYM_TERMS = {"ead", "rw", "rwa", "ccf", "pd", "lgd", "crm", "sa", "irb", "sme", "kmu", "cqs", "ecai", "lcr", "nsfr", "ewb", "pwb", "ksa"}

# Concept groups for query expansion: dataset column names, English and German regulatory language.
GLOSSARY: List[List[str]] = [
    ["exposure value", "exposure at default", "ead", "risikopositionswert", "forderungswert"],
    ["risk weight", "rw", "risikogewicht"],
    ["risk-weighted exposure amount", "rwa", "risk weighted assets", "risikogewichteter positionsbetrag", "risikogewichtete aktiva"],
    ["credit conversion factor", "ccf", "conversion factor", "umrechnungsfaktor", "off-balance-sheet item", "nominal value", "bucket", "außerbilanzielle posten"],
    ["guarantee", "guarantees", "garantie", "bürgschaft", "gewährleistung"],
    ["undrawn commitment", "commitment", "commitments", "credit line", "credit lines", "credit facility", "limit", "limits", "credit limit", "zusage", "kreditzusage", "kreditlinie", "kreditlimit", "kreditrahmen"],
    ["institution", "credit institution", "institut", "kreditinstitut"],
    ["corporate", "corporates", "unternehmen"],
    ["retail", "retail exposures", "mengengeschäft", "natural person", "natürliche person", "private households", "private haushalte"],
    ["central government", "central bank", "sovereign", "zentralstaat", "zentralbank"],
    ["regional government", "local authority", "regionale gebietskörperschaft", "lokale gebietskörperschaft"],
    ["public sector entity", "öffentliche stelle"],
    ["immovable property", "real estate", "mortgage", "residential property", "commercial immovable property", "immobilie", "immobilieneigentum", "grundpfandrecht", "hypothek", "wohnimmobilie", "gewerbeimmobilie"],
    ["exposures in default", "defaulted", "default", "ausfall", "ausgefallene positionen", "non-performing", "notleidend"],
    ["specific credit risk adjustment", "impairment", "einzelwertberichtigung", "ewb", "spezifische kreditrisikoanpassung", "wertberichtigung", "risikovorsorge"],
    ["general credit risk adjustment", "pauschalwertberichtigung", "pwb", "allgemeine kreditrisikoanpassung"],
    ["accounting value", "carrying amount", "book value", "buchwert", "bilanzwert", "bruttobuchwert"],
    ["credit risk mitigation", "crm", "collateral", "financial collateral", "kreditrisikominderung", "sicherheit", "sicherheiten", "finanzielle sicherheit"],
    ["credit quality step", "cqs", "credit assessment", "ecai", "rating", "bonitätsstufe", "bonitätsbeurteilung", "ratingagentur"],
    ["equity exposure", "equity", "beteiligung", "beteiligungsposition"],
    ["covered bond", "gedeckte schuldverschreibung", "pfandbrief"],
    ["residual maturity", "maturity", "laufzeit", "restlaufzeit"],
    ["own funds requirement", "own funds", "capital requirement", "eigenmittel", "eigenmittelanforderung"],
    ["standardised approach", "sa", "ksa", "standardansatz", "kreditrisiko-standardansatz"],
    ["internal ratings based approach", "irb", "irb-ansatz"],
    ["probability of default", "pd", "ausfallwahrscheinlichkeit"],
    ["loss given default", "lgd", "verlustquote bei ausfall"],
    ["exposure class", "forderungsklasse", "risikopositionsklasse"],
    ["loan", "loans", "darlehen", "kredit"],
    ["small and medium-sized enterprise", "sme", "sme supporting factor", "kmu", "kmu-faktor"],
    ["accrued interest", "zinsen", "anteilige zinsen", "aufgelaufene zinsen"],
    ["nominal amount", "nominal value", "nennwert", "nominalbetrag"],
    ["derivative", "counterparty credit risk", "derivat", "gegenparteiausfallrisiko"],
    ["leverage ratio", "verschuldungsquote"],
    ["large exposures", "großkredite"],
    ["liquidity coverage ratio", "lcr", "liquiditätsdeckungsquote"],
    ["net stable funding ratio", "nsfr", "strukturelle liquiditätsquote"],
]


# Exposure classes by name in data (category values), English and German regulation titles. Used to check
# that a cited article actually covers a category ("Banks" is not covered by "Exposures to central
# governments or central banks"). Longer phrases win, so "central banks" never counts as "banks".
EXPOSURE_CLASSES: Dict[str, List[str]] = {
    "central_government": ["central government", "central governments", "central bank", "central banks", "sovereign", "sovereigns", "government", "zentralstaat", "zentralstaaten", "zentralbank", "zentralbanken", "staaten"],
    "regional_government": ["regional government", "regional governments", "local authority", "local authorities", "regionale gebietskörperschaft", "lokale gebietskörperschaft", "gebietskörperschaften"],
    "public_sector_entity": ["public sector entity", "public sector entities", "pse", "öffentliche stelle", "öffentliche stellen"],
    "multilateral_development_bank": ["multilateral development bank", "multilateral development banks", "mdb", "multilaterale entwicklungsbank", "multilaterale entwicklungsbanken"],
    "international_organisation": ["international organisation", "international organisations", "internationale organisation", "internationale organisationen"],
    "institution": ["institution", "institutions", "bank", "banks", "credit institution", "credit institutions", "institut", "institute", "kreditinstitut", "kreditinstitute", "banken"],
    "corporate": ["corporate", "corporates", "company", "companies", "unternehmen", "firmenkunden"],
    "retail": ["retail", "retail exposures", "private household", "private households", "natural person", "natural persons", "mengengeschäft", "private haushalte", "privatkunden"],
    "immovable_property": ["immovable property", "real estate", "mortgage", "mortgages", "residential property", "commercial immovable property", "immobilie", "immobilien", "grundpfandrecht", "hypothek", "wohnimmobilie", "gewerbeimmobilie"],
    "default": ["exposures in default", "default", "defaulted", "in default", "ausfall", "ausgefallene positionen", "notleidend"],
    "equity": ["equity", "equities", "equity exposures", "beteiligung", "beteiligungen", "beteiligungspositionen"],
    "covered_bond": ["covered bond", "covered bonds", "gedeckte schuldverschreibung", "gedeckte schuldverschreibungen", "pfandbrief", "pfandbriefe"],
    "ciu": ["collective investment undertaking", "collective investment undertakings", "ciu", "cius", "organismen für gemeinsame anlagen"],
    "securitisation": ["securitisation", "securitisations", "verbriefung", "verbriefungen"],
}
_CLASS_PHRASES = sorted(
    ((phrase, name) for name, phrases in EXPOSURE_CLASSES.items() for phrase in phrases),
    key=lambda item: -len(item[0]),
)


def exposure_classes(text: str) -> Set[str]:
    """Exposure classes named in a text; each word counts once, for its longest matching phrase."""
    folded = " " + re.sub(r"[^a-zäöü0-9]+", " ", fold(text)) + " "
    found: Set[str] = set()
    for phrase, name in _CLASS_PHRASES:
        needle = " " + fold(phrase) + " "
        if needle in folded:
            found.add(name)
            folded = folded.replace(needle, " # ")
    return found


# Glossary groups that name a quantity or treatment (not an exposure class or a generic word); used to check that
# a provision linked to a change actually deals with the concept the change affects.
_GENERIC_GROUPS = {
    "exposure", "loan", "institution", "corporate", "retail", "central government", "regional government",
    "public sector entity", "residual maturity", "nominal amount", "derivative", "exposure class",
}


_CONCEPT_PATTERNS: Optional[List[Tuple[int, List[Any]]]] = None


def _concept_patterns() -> List[Tuple[int, List[Any]]]:
    """Per glossary group, the compiled patterns of its phrases (built once)."""
    global _CONCEPT_PATTERNS
    if _CONCEPT_PATTERNS is None:
        built = []
        for position, group in enumerate(GLOSSARY):
            if group[0] in _GENERIC_GROUPS:
                continue
            patterns = []
            for phrase in group:
                words = re.sub(r"[^a-zäöü0-9]+", " ", fold(phrase)).strip()
                if len(words) >= 3:
                    patterns.append(re.compile(rf" {re.escape(words)}(?:s|es|en|n|e)? "))
                # Coordinated form: 'general and specific credit risk adjustments' names both adjustments.
                first, _, head = words.partition(" ")
                if head:
                    patterns.append(re.compile(
                        rf" {re.escape(first)}(?:e|en|er|es)? (?:and|or|und|oder|bzw) [a-zäöü]+ {re.escape(head)}(?:s|es|en|n|e)? "
                    ))
            built.append((position, patterns))
        _CONCEPT_PATTERNS = built
    return _CONCEPT_PATTERNS


@lru_cache(maxsize=8192)
def _concepts_of(text: str) -> frozenset:
    folded = " " + re.sub(r"[^a-zäöü0-9]+", " ", fold(text)) + " "
    return frozenset(position for position, patterns in _concept_patterns() if any(pattern.search(folded) for pattern in patterns))


def concepts(text: str) -> Set[int]:
    """Indexes of the GLOSSARY concept groups named in a text (plural endings tolerated)."""
    return set(_concepts_of(str(text or "")))


def concept_name(position: int) -> str:
    return GLOSSARY[position][0]


_FOLDED_PASSAGES: Dict[int, Tuple[Dict[str, Any], List[str]]] = {}


def _folded_passages(index: Dict[str, Any]) -> List[str]:
    """fold() of every passage text, computed once per loaded index."""
    cached = _FOLDED_PASSAGES.get(id(index))
    if cached is None or cached[0] is not index:
        if len(_FOLDED_PASSAGES) > 16:
            _FOLDED_PASSAGES.clear()
        cached = (index, [fold(passage["text"]) for passage in index["passages"]])
        _FOLDED_PASSAGES[id(index)] = cached
    return cached[1]


def concept_evidence(index: Dict[str, Any], positions: Iterable[int], limit: int = 3) -> List[Dict[str, Any]]:
    """Units (articles, annexes) whose text names the given concepts, most mentions first, each with the first
    sentence that names it (reference, page and text), so a reviewer or agent can judge the link directly."""
    patterns = [
        re.compile(rf"(?<![a-zäöü0-9]){re.escape(fold(phrase))}(?:s|es|en|n|e)?(?![a-zäöü0-9])")
        for position in positions for phrase in GLOSSARY[position] if len(phrase) >= 5
    ]
    if not patterns:
        return []
    # One scan rules out the passages that name none of the phrases; the others are counted phrase by phrase.
    anywhere = re.compile("|".join(pattern.pattern for pattern in patterns))
    counts: Counter = Counter()
    first: Dict[int, Tuple[Dict[str, Any], int]] = {}
    for passage, folded in zip(index["passages"], _folded_passages(index)):
        if passage["kind"] == "footnote" or not anywhere.search(folded):
            continue
        hits = [match for pattern in patterns for match in pattern.finditer(folded)]
        if hits:
            counts[passage["unit"]] += len(hits)
            first.setdefault(passage["unit"], (passage, min(hit.start() for hit in hits)))
    # Provisions whose title names the concept (e.g. "Treatment of credit risk adjustment") come first, then the
    # ones that mention it most; a long article that mentions it in passing should not outrank them.
    concept_words = {word for position in positions for phrase in GLOSSARY[position] for word in tokens(phrase) if len(word) > 3}
    ranked = sorted(
        counts.items(),
        key=lambda item: (-len(concept_words & set(tokens(index["units"][item[0]].get("title") or ""))), -item[1]),
    )
    evidence = []
    for unit_position, mentions in ranked[:limit]:
        passage, at = first[unit_position]
        text = passage["text"]
        # The sentence (or list item) around the first mention; fold() keeps positions for these texts.
        start = max(text.rfind(". ", 0, at), text.rfind("; ", 0, at), text.rfind(": ", 0, at))
        start = 0 if start < 0 else start + 2
        ends = [position for position in (text.find(". ", at), text.find("; ", at)) if position >= 0]
        end = min(ends) + 1 if ends else len(text)
        evidence.append({
            "unit": unit_position,
            "mentions": mentions,
            "title_match": len(concept_words & set(tokens(index["units"][unit_position].get("title") or ""))),
            "reference": passage_reference(index["units"][unit_position], passage),
            "page": page_label(passage),
            "sentence": text[start:end].strip()[:300],
        })
    return evidence


def concept_units(index: Dict[str, Any], positions: Iterable[int], limit: int = 4) -> List[Tuple[int, int]]:
    """Units whose text names the given concepts, as (unit, mentions), most mentions first."""
    return [(item["unit"], item["mentions"]) for item in concept_evidence(index, positions, limit)]


def closest_original(quote: str, original: str) -> Tuple[float, str]:
    """The stretch of an original text (case and spelling kept) that best matches a quote, with its similarity."""
    text = re.sub(r"\s+", " ", original or "").strip()
    wanted = re.sub(r"\s+", " ", quote or "").strip()
    if not text or not wanted:
        return 0.0, ""
    lower_text, lower_quote, size = text.lower(), wanted.lower(), len(wanted)
    step = max(1, size // 25)
    best = (0.0, 0, size)
    for start in range(0, max(1, len(text) - size + 1), step):
        ratio = SequenceMatcher(None, lower_quote, lower_text[start:start + size], autojunk=False).ratio()
        if ratio > best[0]:
            best = (ratio, start, size)
    _, origin, length = best
    for shift in range(-step, step + 1):
        for stretch in range(-4, 5):
            start, end = origin + shift, origin + shift + length + stretch
            if start < 0 or end > len(text) or end <= start:
                continue
            ratio = SequenceMatcher(None, lower_quote, lower_text[start:end], autojunk=False).ratio()
            if ratio > best[0]:
                best = (ratio, start, end - start)
    ratio, start, length = best
    return ratio, text[start:start + length]


# What a release note or a provision applies to, for the scope check of a link: the exposure classes plus loans
# (credit obligations) versus "other non credit-obligation assets". Longer phrases win, so "non credit-obligation"
# never counts as "credit obligation".
_SCOPE_EXTRA: Dict[str, List[str]] = {
    "credit_obligation": ["loan", "loans", "credit obligation", "credit obligations", "darlehen", "kredit", "kredite", "betriebsmitteldarlehen"],
    "non_credit_obligation": ["non credit obligation", "non credit obligations", "non credit-obligation", "non credit-obligation assets", "other non credit-obligation assets"],
}
_SCOPE_PHRASES = sorted(
    [(phrase, name) for name, phrases in {**EXPOSURE_CLASSES, **_SCOPE_EXTRA}.items() for phrase in phrases],
    key=lambda item: -len(item[0]),
)


_SCOPE_NEEDLES: Optional[List[Tuple[str, str]]] = None


@lru_cache(maxsize=8192)
def _scope_of(text: str) -> frozenset:
    global _SCOPE_NEEDLES
    if _SCOPE_NEEDLES is None:
        _SCOPE_NEEDLES = [
            (" " + re.sub(r"[^a-zäöü0-9]+", " ", fold(phrase)).strip() + " ", name) for phrase, name in _SCOPE_PHRASES
        ]
    folded = " " + re.sub(r"[^a-zäöü0-9]+", " ", fold(text)) + " "
    found: Set[str] = set()
    for needle, name in _SCOPE_NEEDLES:
        if needle.strip() and needle in folded:
            found.add(name)
            folded = folded.replace(needle, " # ")
    return frozenset(found)


def scope_classes(text: str) -> Set[str]:
    """Exposure classes and asset types a text is about (each word counts once, for its longest phrase)."""
    return set(_scope_of(str(text or "")))


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKC", str(text or "")).replace("­", "")
    text = text.casefold().replace("ß", "ss")
    text = re.sub(r"[‘’‚‛′`´]", "'", text)
    text = re.sub(r"[“”„‟″«»]", '"', text)
    return re.sub(r"[‐‑‒–—―−]", "-", text)


def stem(word: str) -> str:
    if word.isdigit() or len(word) <= 4:
        return word
    for _ in range(2):
        for suffix in _SUFFIXES:
            if word.endswith(suffix) and len(word) - len(suffix) >= 4:
                word = word[: -len(suffix)]
                break
        else:
            break
    return word


def _words(text: str) -> List[str]:
    return re.findall(r"[a-zäöü0-9]+", fold(text))


def tokens(text: str) -> List[str]:
    return [stem(word) for word in _words(text) if word not in _STOPWORDS and (len(word) > 1 or word.isdigit())]


def _phrase_in(phrase: str, folded_query: str, query_words: Set[str]) -> bool:
    if phrase in _ACRONYM_TERMS or " " not in phrase and "-" not in phrase:
        return fold(phrase) in query_words or stem(fold(phrase)) in {stem(word) for word in query_words}
    return re.search(rf"(?<![a-z0-9]){re.escape(fold(phrase))}(?![a-z0-9])", folded_query) is not None


def expand_query(query: str) -> Tuple[Dict[str, float], List[str]]:
    """Weighted query stems: the query's own words (1.0) plus glossary synonyms and translations (0.5)."""
    folded = fold(query)
    words = set(_words(query))
    weights: Dict[str, float] = {}
    for term in tokens(query):
        weights[term] = 1.0
    expansions: List[str] = []
    for group in GLOSSARY:
        if any(_phrase_in(phrase, folded, words) for phrase in group):
            for phrase in group:
                if fold(phrase) in folded:
                    continue
                expansions.append(phrase)
                for term in tokens(phrase):
                    weights.setdefault(term, EXPANSION_WEIGHT)
    return weights, expansions


EXPANSION_WEIGHT = 0.35


class _Field:
    """BM25 statistics for one field (passage body, unit title or hierarchy path)."""

    def __init__(self, documents: List[List[str]], k1: float = 1.4, b: float = 0.7):
        self.tf = [Counter(terms) for terms in documents]
        self.lengths = [len(terms) for terms in documents]
        self.df: Counter = Counter()
        for counts in self.tf:
            self.df.update(counts.keys())
        self.count = len(documents)
        self.average = (sum(self.lengths) / self.count) if self.count else 1.0
        self.k1, self.b = k1, b

    def idf(self, term: str) -> float:
        n = self.df.get(term, 0)
        return math.log(1 + (self.count - n + 0.5) / (n + 0.5))

    def score(self, position: int, query: Dict[str, float]) -> float:
        counts = self.tf[position]
        length = self.lengths[position]
        total = 0.0
        for term, weight in query.items():
            frequency = counts.get(term)
            if frequency:
                total += weight * self.idf(term) * frequency * (self.k1 + 1) / (
                    frequency + self.k1 * (1 - self.b + self.b * length / self.average)
                )
        return total


_DEFINITION_INTENT = re.compile(r"\b(?:defin\w*|meaning|means|begriff\w*|bedeutet|bezeichnet|what is)\b", re.IGNORECASE)
_DEFINED_TERM = re.compile(r"[‘'“\"]([^’'”\"]{2,90})[’'”\"]\s*,?\s*(?:or\s+[‘'“\"][^’'”\"]{2,40}[’'”\"]\s*,?\s*)?(?:means|bezeichnet|ist|sind)\b")


class SearchIndex:
    """BM25F over a regulation's passages: body text, plus the title and hierarchy of the unit it belongs to
    (a passage of 'Article 119 Exposures to institutions' matches 'institutions' through its title)."""

    TITLE_WEIGHT = 2.2
    PATH_WEIGHT = 0.6

    def __init__(self, index: Dict[str, Any]):
        self.units = index["units"]
        self.passages = index["passages"]
        self.searchable = [i for i, passage in enumerate(self.passages) if passage["kind"] != "footnote"]
        self.body = _Field([
            tokens(f"{self.passages[i].get('context') or ''} {self.passages[i]['text']}") for i in self.searchable
        ])
        self.titles = _Field([tokens(f"{unit['label']} {unit.get('title') or ''}") for unit in self.units], k1=1.2, b=0.3)
        self.paths = _Field([tokens(" ".join(unit.get("path", [])[-3:])) for unit in self.units], k1=1.2, b=0.3)
        self.defined: Dict[int, Set[str]] = {}
        for position, i in enumerate(self.searchable):
            match = _DEFINED_TERM.search(self.passages[i]["text"][:220])
            if match:
                self.defined[i] = set(tokens(match.group(1)))
        self.df = self.body.df

    def compound_terms(self, term: str) -> List[str]:
        """German compounds: 'gewicht' also matches 'risikogewicht'."""
        if len(term) < 5:
            return []
        return [word for word in self.df if term in word and word != term][:25]

    def prepare(self, weights: Dict[str, float]) -> Dict[str, float]:
        query = dict(weights)
        original = [term for term, weight in weights.items() if weight >= 1.0]
        missing = 0
        for term in original:
            if self.df.get(term, 0) == 0 and self.titles.df.get(term, 0) == 0:
                compounds = self.compound_terms(term)
                for compound in compounds:
                    query.setdefault(compound, 0.6)
                missing += not compounds
        if original and missing:
            # The user's own words are absent (another language, a column name): the glossary translations
            # carry the query, so they weigh almost as much as original words would.
            for term, weight in query.items():
                if weight == EXPANSION_WEIGHT:
                    query[term] = 0.9
        return query

    def score(self, weights: Dict[str, float], definition_query: bool = False) -> Dict[int, float]:
        query = self.prepare(weights)
        title_scores = {u: self.titles.score(u, query) for u in range(len(self.units))}
        path_scores = {u: self.paths.score(u, query) for u in range(len(self.units))}
        content = {term for term, weight in weights.items() if weight >= 1.0} - set(tokens("definition meaning means begriff bedeutet"))
        scores: Dict[int, float] = {}
        for position, i in enumerate(self.searchable):
            body = self.body.score(position, query)
            if not body:
                continue
            unit = self.passages[i]["unit"]
            total = body + self.TITLE_WEIGHT * title_scores[unit] + self.PATH_WEIGHT * path_scores[unit]
            defined = self.defined.get(i)
            if definition_query and content and defined:
                if defined == content:
                    total *= 3.0  # "(1) ‘exposure’ means …" for "definition of exposure"
                elif content <= defined and len(defined) - len(content) <= 1:
                    total *= 1.8
            scores[i] = total
        return scores


def fuse(rankings: Sequence[Sequence[int]], k: int = 60) -> Dict[int, float]:
    fused: Dict[int, float] = defaultdict(float)
    for ranking in rankings:
        for rank, item in enumerate(ranking):
            fused[item] += 1.0 / (k + rank + 1)
    return fused


def search_candidates(
    index: Dict[str, Any],
    search_index: "SearchIndex",
    query: str,
    embeddings: Any = None,
    query_vector: Any = None,
    depth: int = 200,
) -> Tuple[Dict[int, Dict[str, Any]], List[str]]:
    """Candidate passages of one document with their keyword (BM25F) score and, when an embedding index
    exists, their semantic similarity. Returns the candidates and the glossary expansions used."""
    weights, expansions = expand_query(query)
    keyword = search_index.score(weights, bool(_DEFINITION_INTENT.search(query)))
    candidates: Dict[int, Dict[str, Any]] = {}
    for rank, i in enumerate(sorted(keyword, key=keyword.get, reverse=True)[:depth], start=1):
        candidates[i] = {"keyword": keyword[i], "keyword_rank": rank}
    if embeddings is not None and query_vector is not None and len(embeddings) == len(index["passages"]):
        import numpy as np

        sims = embeddings.astype(np.float32) @ query_vector
        for i, passage in enumerate(index["passages"]):
            if passage["kind"] == "footnote":
                sims[i] = -1.0
        for i in np.argsort(-sims)[:depth]:
            candidates.setdefault(int(i), {})
        for i, signals in candidates.items():
            signals["similarity"] = float(sims[i])
    return candidates, expansions


def fuse_candidates(groups: Sequence[Tuple[Any, Dict[int, Dict[str, Any]]]], k: int = 60) -> List[Tuple[Any, int, float, Dict[str, Any]]]:
    """Rank candidates of several documents together by reciprocal-rank fusion of the keyword ranking and
    the semantic ranking. Both are global: raw BM25 already discounts terms common in a small document
    (low IDF), and cosine similarities share one embedding space."""
    entries = [(key, i, signals) for key, candidates in groups for i, signals in candidates.items()]
    fused: Dict[int, float] = defaultdict(float)
    by_keyword = sorted((n for n, (_, _, s) in enumerate(entries) if s.get("keyword")), key=lambda n: -entries[n][2]["keyword"])
    by_meaning = sorted((n for n, (_, _, s) in enumerate(entries) if s.get("similarity") is not None), key=lambda n: -entries[n][2]["similarity"])
    for ranking in (by_keyword, by_meaning):
        for rank, n in enumerate(ranking):
            fused[n] += 1.0 / (k + rank + 1)
    ordered = sorted(fused, key=fused.get, reverse=True)
    return [
        (entries[n][0], entries[n][1], fused[n], {
            "keyword_rank": entries[n][2].get("keyword_rank"),
            "semantic_similarity": round(entries[n][2]["similarity"], 3) if entries[n][2].get("similarity") is not None else None,
        })
        for n in ordered
    ]


# --------------------------------------------------------------------------------------------------
# Embeddings (optional)
# --------------------------------------------------------------------------------------------------

def embedding_client() -> Tuple[Any, Optional[str]]:
    """An OpenAI (or Azure OpenAI) client and embedding model, or (None, None) when not configured."""
    if os.environ.get("REGULATION_EMBEDDINGS", "on").lower() in ("0", "off", "false", "no"):
        return None, None
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        from openai import OpenAI

        return OpenAI(api_key=key, timeout=60.0, max_retries=2), os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    azure_key = os.environ.get("AZURE_OPENAI_API_KEY")
    azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    deployment = os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
    if azure_key and azure_endpoint and deployment:
        from openai import AzureOpenAI

        client = AzureOpenAI(
            api_key=azure_key,
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21"),
            azure_endpoint=azure_endpoint.rstrip("/"),
            timeout=60.0,
            max_retries=2,
        )
        return client, deployment
    return None, None


EMBEDDING_DIMENSIONS = 512


def _embed(client: Any, model: str, texts: List[str]) -> List[List[float]]:
    kwargs: Dict[str, Any] = {"model": model, "input": texts}
    if model.startswith("text-embedding-3"):
        kwargs["dimensions"] = EMBEDDING_DIMENSIONS
    response = client.embeddings.create(**kwargs)
    return [item.embedding for item in sorted(response.data, key=lambda item: item.index)]


def passage_embedding_text(index: Dict[str, Any], passage: Dict[str, Any]) -> str:
    unit = index["units"][passage["unit"]]
    context = " · ".join(filter(None, [passage_reference(unit, passage), unit.get("title"), (unit.get("path") or [""])[-1]]))
    return f"{context}\n{passage['text']}"[:2000]


def embed_passages(index: Dict[str, Any], client: Any, model: str, batch: int = 128, progress: Optional[Progress] = None):
    """Unit-normalised float16 embeddings for every passage (zero rows for footnotes)."""
    import numpy as np

    passages = index["passages"]
    matrix = np.zeros((len(passages), EMBEDDING_DIMENSIONS), dtype=np.float32)
    wanted = [i for i, passage in enumerate(passages) if passage["kind"] != "footnote"]
    for start in range(0, len(wanted), batch):
        if progress:
            progress("embedding", start, len(wanted))
        chunk = wanted[start:start + batch]
        vectors = _embed(client, model, [passage_embedding_text(index, passages[i]) for i in chunk])
        for i, vector in zip(chunk, vectors):
            matrix[i, : len(vector)] = vector[:EMBEDDING_DIMENSIONS]
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (matrix / norms).astype(np.float16)


_QUERY_VECTORS: Dict[Tuple[str, str], Any] = {}


def embed_query(query: str):
    import numpy as np

    client, model = embedding_client()
    if client is None:
        return None
    key = (model, query)
    if key not in _QUERY_VECTORS:
        vector = np.asarray(_embed(client, model, [query])[0][:EMBEDDING_DIMENSIONS], dtype=np.float32)
        norm = float(np.linalg.norm(vector)) or 1.0
        if len(_QUERY_VECTORS) > 256:
            _QUERY_VECTORS.clear()
        _QUERY_VECTORS[key] = vector / norm
    return _QUERY_VECTORS[key]


# --------------------------------------------------------------------------------------------------
# References, lookup and quote verification
# --------------------------------------------------------------------------------------------------

_REFERENCE = re.compile(
    r"\b(?:Articles?|Artikel[n]?)\s+(\d{1,4}[a-z]{0,3})((?:\(\d+[a-z]?\))?(?:\s*,?\s*points?\s+\([a-z0-9]+\))?)"
    r"(?!\s+(?:of|der|des)\s+(?:Directive|Regulation|Delegated|Implementing|Richtlinie|Verordnung|Delegierten|Durchführungs))",
)
_ANNEX_REFERENCE = re.compile(r"\b(?:Annex|Anhang)\s+([IVXLC]+[a-z]?)\b(?!\s+(?:to|of|der|zur)\s+(?:Directive|Regulation|Richtlinie|Verordnung))")
_UNIT_REQUEST = re.compile(
    r"^\s*(?:(?:art(?:icle|ikel)?\.?)\s*)?(\d{1,4}[a-z]{0,3})\s*(?:\(\s*(\d{1,3}[a-z]?)\s*\))?\s*(?:\(\s*([a-z0-9]{1,4})\s*\))?\s*$",
    re.IGNORECASE,
)
_ANNEX_REQUEST = re.compile(r"^\s*(?:annex|anhang)\s*([IVXLC]+[a-z]?|\d+)?\s*$", re.IGNORECASE)


def references(text: str, own_label: str) -> List[str]:
    found: List[str] = []
    for match in _REFERENCE.finditer(text):
        label = f"Article {match.group(1)}" + re.sub(r"\s+", " ", match.group(2) or "").strip()
        if label != own_label and label not in found:
            found.append(label)
    for match in _ANNEX_REFERENCE.finditer(text):
        label = f"Annex {match.group(1)}"
        if label != own_label and label not in found:
            found.append(label)
    return found[:40]


def parse_unit_request(value: Any) -> Optional[Dict[str, Optional[str]]]:
    """'111', 'Article 111(2)(a)', 'Art. 4(1)(39)', 'Annex I', 'recitals' -> what to read."""
    text = str(value or "").strip()
    if not text:
        return None
    if re.fullmatch(r"(?:recitals?|erwägungsgründe)", text, re.IGNORECASE):
        return {"kind": "recitals", "number": None, "paragraph": None, "point": None}
    annex = _ANNEX_REQUEST.match(text)
    if annex:
        return {"kind": "annex", "number": (annex.group(1) or "").upper() or None, "paragraph": None, "point": None}
    article = _UNIT_REQUEST.match(text)
    if article:
        return {"kind": "article", "number": article.group(1).lower(), "paragraph": article.group(2), "point": (article.group(3) or "").lower() or None}
    return None


def find_units(index: Dict[str, Any], request: Dict[str, Optional[str]]) -> List[int]:
    found = []
    for position, unit in enumerate(index["units"]):
        if unit["kind"] != request["kind"]:
            continue
        if request["kind"] == "article" and str(unit.get("number") or "").lower() != request["number"]:
            continue
        if request["kind"] == "annex" and request["number"] and str(unit.get("number") or "").upper() != request["number"]:
            continue
        found.append(position)
    return found


def normalise_for_match(text: str) -> str:
    text = fold(_MARKER.sub(" ", text))
    text = text.replace(" ", " ")
    text = re.sub(r"(\d)\s+%", r"\1%", text)
    text = re.sub(r"\s+([,.;:)\]'\"])", r"\1", text)
    text = re.sub(r"([(\[])\s+", r"\1", text)
    text = re.sub(r"(\w)-\s+(\w)", r"\1-\2", text)
    return re.sub(r"\s+", " ", text).strip()


def _best_window(quote: str, text: str) -> Tuple[float, str]:
    if not quote or not text:
        return 0.0, ""
    size = len(quote)
    if len(text) <= size:
        return SequenceMatcher(None, quote, text, autojunk=False).ratio(), text
    best = (0.0, "")
    step = max(8, size // 6)
    for start in range(0, len(text) - size + step, step):
        window = text[start:start + size]
        ratio = SequenceMatcher(None, quote, window, autojunk=False).ratio()
        if ratio > best[0]:
            best = (ratio, window)
    return best


def unit_text(index: Dict[str, Any], unit_position: int) -> str:
    return " ".join(p["text"] for p in index["passages"] if p["unit"] == unit_position and p["kind"] != "footnote")


def verify_quote(index: Dict[str, Any], quote: str, unit_positions: Optional[List[int]]) -> Dict[str, Any]:
    """Check a quote verbatim (whitespace, quote marks and dashes normalised) against the cited unit,
    then against the whole document; report the closest source text when it is not verbatim."""
    fragments = [normalise_for_match(part) for part in re.split(r"\s*(?:\.\.\.|…|\[\.\.\.\]|\[…\])\s*", quote) if part.strip()]
    # Punctuation around a quote is often added or dropped when quoting ("…have been applied." vs "…have been applied").
    fragments = [fragment.strip(" .;:,") for fragment in fragments]
    fragments = [fragment for fragment in fragments if fragment]
    if not fragments:
        return {"status": "empty_quote"}

    def locate(positions: Iterable[int]) -> Optional[Dict[str, Any]]:
        for position in positions:
            spans: List[Tuple[int, int, Dict[str, Any]]] = []
            parts: List[str] = []
            offset = 0
            for passage in index["passages"]:
                if passage["unit"] != position or passage["kind"] == "footnote":
                    continue
                normalised = normalise_for_match(passage["text"])
                spans.append((offset, offset + len(normalised), passage))
                parts.append(normalised)
                offset += len(normalised) + 1
            text = " ".join(parts)
            start = text.find(fragments[0])
            while start >= 0:
                cursor = start + len(fragments[0])
                for fragment in fragments[1:]:
                    found = text.find(fragment, cursor)
                    if found < 0:
                        cursor = -1
                        break
                    cursor = found + len(fragment)
                if cursor >= 0:
                    covered = [passage for begin, end, passage in spans if begin < cursor and end > start]
                    pages = sorted({page for passage in covered for page in range(passage["page"], passage.get("page_end", passage["page"]) + 1)})
                    paragraphs = list(dict.fromkeys(passage["paragraph"] for passage in covered if passage.get("paragraph")))
                    return {"unit": position, "pages": pages, "paragraphs": paragraphs}
                start = text.find(fragments[0], start + 1)
        return None

    cited = unit_positions or []
    hit = locate(cited)
    if hit:
        return {"status": "verified", **hit}
    elsewhere = locate(i for i in range(len(index["units"])) if i not in set(cited))
    if elsewhere:
        return {"status": "found_in_other_unit" if cited else "verified", **elsewhere}
    # Not verbatim: report the closest text in the cited unit (or the best keyword candidates).
    joined = " ".join(fragments)
    candidates = cited or []
    if not candidates:
        scores = SearchIndex(index).score({term: 1.0 for term in tokens(joined)})
        candidates = list(dict.fromkeys(index["passages"][i]["unit"] for i in sorted(scores, key=scores.get, reverse=True)[:12]))[:6]
    best = (0.0, "", None)
    for position in candidates:
        ratio, window = _best_window(joined, normalise_for_match(unit_text(index, position)))
        if ratio > best[0]:
            best = (ratio, window, position)
    status = "paraphrased" if best[0] >= 0.85 else "not_found"
    return {"status": status, "similarity": round(best[0], 3), "closest_text": best[1][:600], "unit": best[2]}
