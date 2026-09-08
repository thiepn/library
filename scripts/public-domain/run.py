#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import io
import re
import time
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any

import sync as engine

POPULARITY_URL = "https://www.gutenberg.org/browse/scores/top"
POPULARITY_WINDOW = "last 30 days"
MIN_REQUIRED_POPULARITY_ROWS = 80


@dataclass(frozen=True)
class PopularityEntry:
    rank: int
    gutenberg_id: int
    title: str
    downloads: int


class GutenbergTop100Parser(HTMLParser):
    """Extract the official 30-day Top 100 without depending on page CSS/layout."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.entries: list[PopularityEntry] = []
        self._in_h2 = False
        self._heading_chunks: list[str] = []
        self._target_section = False
        self._in_li = False
        self._li_chunks: list[str] = []
        self._anchor_chunks: list[str] = []
        self._anchor_gid: int | None = None
        self._in_anchor = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.casefold()
        if tag == "h2":
            self._in_h2 = True
            self._heading_chunks = []
            return
        if self._target_section and tag == "li":
            self._in_li = True
            self._li_chunks = []
            self._anchor_chunks = []
            self._anchor_gid = None
            return
        if self._target_section and self._in_li and tag == "a":
            href = dict(attrs).get("href") or ""
            match = re.search(r"(?:^|/)ebooks/(\d+)(?:[/?#]|$)", href)
            if match:
                self._anchor_gid = int(match.group(1))
                self._in_anchor = True
                self._anchor_chunks = []

    def handle_data(self, data: str) -> None:
        if self._in_h2:
            self._heading_chunks.append(data)
        if self._target_section and self._in_li:
            self._li_chunks.append(data)
            if self._in_anchor:
                self._anchor_chunks.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag == "h2" and self._in_h2:
            heading = re.sub(r"\s+", " ", "".join(self._heading_chunks)).strip().casefold()
            self._target_section = heading == "top 100 ebooks last 30 days"
            self._in_h2 = False
            self._heading_chunks = []
            return
        if tag == "a" and self._in_anchor:
            self._in_anchor = False
            return
        if tag == "li" and self._target_section and self._in_li:
            text = re.sub(r"\s+", " ", "".join(self._li_chunks)).strip()
            title = re.sub(r"\s+", " ", "".join(self._anchor_chunks)).strip()
            count_match = re.search(r"\(([0-9,]+)\)\s*$", text)
            if self._anchor_gid is not None and title and count_match:
                downloads = int(count_match.group(1).replace(",", ""))
                self.entries.append(
                    PopularityEntry(
                        rank=len(self.entries) + 1,
                        gutenberg_id=self._anchor_gid,
                        title=title,
                        downloads=downloads,
                    )
                )
            self._in_li = False
            self._li_chunks = []
            self._anchor_chunks = []
            self._anchor_gid = None


def bounded_request_bytes(url: str, *, timeout: int = 20, accept: str = "*/*") -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": engine.USER_AGENT,
            "Accept": accept,
            "Accept-Encoding": "identity",
        },
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code != 429 and exc.code < 500:
                raise
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


engine.request_bytes = bounded_request_bytes


def request_official_popularity_page() -> bytes:
    """Use a separate long-timeout path for the one authoritative ranking request."""
    req = urllib.request.Request(
        POPULARITY_URL,
        headers={
            "User-Agent": engine.USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Encoding": "identity",
        },
    )
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return response.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            last_error = exc
            if attempt == 3:
                break
            time.sleep(2.0 * (attempt + 1))
    raise RuntimeError(f"official Gutenberg popularity page unavailable: {last_error}")


def discover_official_popularity() -> list[PopularityEntry]:
    raw = request_official_popularity_page()
    parser = GutenbergTop100Parser()
    parser.feed(raw.decode("utf-8", errors="replace"))
    entries = parser.entries
    if len(entries) < MIN_REQUIRED_POPULARITY_ROWS:
        raise RuntimeError(
            f"official Gutenberg {POPULARITY_WINDOW} ranking parse incomplete: "
            f"expected at least {MIN_REQUIRED_POPULARITY_ROWS}, found {len(entries)}"
        )
    if len({entry.gutenberg_id for entry in entries}) < MIN_REQUIRED_POPULARITY_ROWS:
        raise RuntimeError("official Gutenberg popularity ranking contains unexpectedly few unique ebook IDs")
    return entries[:100]


def normalize_identity_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def canonical_title_key(title: str) -> str:
    """Collapse obvious edition/subtitle variants while preserving numbered parts."""
    raw = re.sub(r"\s+", " ", title).strip()
    normalized_full = normalize_identity_text(raw)

    part = ""
    part_match = re.search(r"\b(?:part|volume|vol)\s*([0-9]+|[ivx]+)\b", normalized_full)
    if part_match:
        part = f" part {part_match.group(1)}"

    # A subtitle after :, ;, or a dash is normally edition/display metadata for
    # logical-work deduplication. Keep an explicit part/volume token separately.
    root = re.split(r"\s*(?:;|:|—|–)\s*", raw, maxsplit=1)[0]
    normalized = normalize_identity_text(root)
    normalized = re.sub(r"^(?:the|a|an)\s+", "", normalized)
    normalized = re.sub(r"\b(?:translated|translation)\b.*$", "", normalized).strip()
    return (normalized + part).strip()


def canonical_creator_key(creator: str) -> str:
    names = [normalize_identity_text(name) for name in creator.split(",") if normalize_identity_text(name)]
    return "|".join(sorted(names))


def canonical_work_key(title: str, creator: str) -> str:
    normalized_title = canonical_title_key(title)
    normalized_creator = canonical_creator_key(creator)
    if not normalized_title or not normalized_creator:
        return ""
    return f"{normalized_title}::{normalized_creator}"


def existing_work_keys(ledger: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for entry in ledger.get("entries") or []:
        if not isinstance(entry, dict):
            continue
        key = canonical_work_key(str(entry.get("title") or ""), str(entry.get("author") or ""))
        if key:
            keys.add(key)
    return keys


def catalog_candidates_for_popularity(entries: list[PopularityEntry]) -> list[engine.Candidate]:
    """Join official popularity IDs to Gutenberg's official machine-readable catalog."""
    wanted = {entry.gutenberg_id: entry for entry in entries}
    raw = gzip.decompress(engine.request_bytes(engine.PG_CATALOG_URL, timeout=90))
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace")))
    candidates: dict[int, engine.Candidate] = {}

    for record in reader:
        try:
            gid = int(record.get("Text#") or 0)
        except (TypeError, ValueError):
            continue
        popularity = wanted.get(gid)
        if popularity is None:
            continue
        if (record.get("Type") or "").casefold() != "text":
            continue
        languages = [item.strip().casefold() for item in (record.get("Language") or "").split(";")]
        if "en" not in languages:
            continue

        title = (record.get("Title") or popularity.title).strip()
        if not title or engine.is_low_value_title(title):
            continue
        shelves = [item.strip() for item in (record.get("Bookshelves") or "").split(";") if item.strip()]
        subjects = [item.strip() for item in (record.get("Subjects") or "").split(";") if item.strip()]
        authors = [
            engine.parse_lifespan_author(item)
            for item in (record.get("Authors") or "").split(";")
            if item.strip()
        ]
        quality = engine.quality_score(
            {
                "title": title,
                "download_count": popularity.downloads,
                "bookshelves": shelves,
                "subjects": subjects,
                "authors": authors,
            }
        )
        candidates[gid] = engine.Candidate(
            gutenberg_id=gid,
            title=title,
            language="en",
            authors=authors,
            subjects=subjects,
            bookshelves=shelves,
            download_count=popularity.downloads,
            copyright=None,
            formats={},
            summary="",
            score=quality,
        )

    # Exact official rank is authoritative; candidate.score is never allowed to
    # move a lower-ranked book ahead of a higher-ranked one.
    return [candidates[item.gutenberg_id] for item in entries if item.gutenberg_id in candidates]


def normalize_publication_metadata(candidate: engine.Candidate, meta: dict[str, Any]) -> None:
    creators = [
        contributor
        for contributor in (meta.get("contributors") or [])
        if contributor.role in {"creator", "aut", "author"}
    ]
    if creators:
        candidate.authors = [
            {
                "name": contributor.name,
                "birth_year": contributor.birth_year,
                "death_year": contributor.death_year,
            }
            for contributor in creators[:3]
        ]

    raw_title = str(meta.get("title") or candidate.title or "").strip()
    physical_lines = [re.sub(r"\s+", " ", line).strip() for line in raw_title.splitlines() if line.strip()]
    normalized_title = physical_lines[0] if physical_lines else re.sub(r"\s+", " ", raw_title)
    if normalized_title:
        meta["title"] = normalized_title
        candidate.title = normalized_title


def annotate_popularity(ledger: dict[str, Any], gid: int, popularity: PopularityEntry) -> None:
    for entry in reversed(ledger.get("entries") or []):
        try:
            if int(entry.get("gutenbergId")) != gid:
                continue
        except Exception:
            continue
        entry["popularity"] = {
            "source": POPULARITY_URL,
            "window": POPULARITY_WINDOW,
            "rank": popularity.rank,
            "downloadCount": popularity.downloads,
        }
        return
    raise RuntimeError(f"new ledger entry for PG#{gid} not found for popularity annotation")


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest the most popular legally safe public-domain Gutenberg EPUBs.")
    parser.add_argument("--max-books", type=int, default=20)
    # Kept for workflow/API compatibility; ranking now comes from Gutenberg's
    # official Top 100 page, not paginated Gutendex enrichment.
    parser.add_argument("--discovery-pages", type=int, default=5)
    parser.add_argument("--max-candidate-checks", type=int, default=100)
    args = parser.parse_args()

    max_books = max(0, min(args.max_books, 20))
    max_candidate_checks = max(max_books, min(args.max_candidate_checks, 200))
    if max_books == 0:
        engine.set_github_output("added_count", "0")
        return 0

    if engine.STAGING_ROOT.exists():
        engine.shutil.rmtree(engine.STAGING_ROOT)
    engine.STAGING_ROOT.mkdir(parents=True, exist_ok=True)

    ledger = engine.load_ledger()
    known_ids = engine.existing_pg_ids(ledger)
    known_work_keys = existing_work_keys(ledger)

    # Fail closed on ranking: no official Top 100 means no substitute batch.
    popularity_entries = discover_official_popularity()
    popularity_by_id = {entry.gutenberg_id: entry for entry in popularity_entries}
    candidates = catalog_candidates_for_popularity(popularity_entries)
    engine.log(
        f"[discover] authoritative Project Gutenberg Top 100 {POPULARITY_WINDOW}: "
        f"{len(popularity_entries)} ranked rows, {len(candidates)} English text candidates; "
        f"{len(known_ids)} Gutenberg IDs and {len(known_work_keys)} logical works already known"
    )

    added: list[dict[str, Any]] = []
    skips: list[dict[str, Any]] = []
    checked = 0

    for candidate in candidates:
        if len(added) >= max_books or checked >= max_candidate_checks:
            break

        gid = candidate.gutenberg_id
        popularity = popularity_by_id[gid]
        if gid in known_ids:
            continue

        prior_rejection = (ledger.get("rejections") or {}).get(str(gid))
        if isinstance(prior_rejection, dict) and prior_rejection.get("copyrightCutoffYear") == engine.COPYRIGHT_CUTOFF_YEAR:
            continue

        checked += 1
        engine.log(
            f"[candidate] rank={popularity.rank} PG#{gid} check={checked}/{max_candidate_checks} "
            f"downloads30d={popularity.downloads} — {candidate.title}"
        )

        try:
            meta, rdf_raw = engine.rdf_metadata(gid)
            normalize_publication_metadata(candidate, meta)

            creator = engine.author_display(candidate.authors)
            logical_key = canonical_work_key(str(meta.get("title") or candidate.title), creator)
            if logical_key and logical_key in known_work_keys:
                reason = f"logical work already represented in Library: {candidate.title} — {creator}"
                engine.log(f"[skip:duplicate] rank={popularity.rank} PG#{gid}: {reason}")
                skips.append(
                    {
                        "gutenbergId": gid,
                        "title": candidate.title,
                        "popularityRank": popularity.rank,
                        "reason": reason,
                    }
                )
                continue

            allowed, reason = engine.legal_gate(candidate, meta)
            if not allowed:
                rejection = {
                    "gutenbergId": gid,
                    "title": candidate.title,
                    "popularityRank": popularity.rank,
                    "downloadCount30d": popularity.downloads,
                    "reason": reason,
                    "checkedAt": engine.utc_now(),
                    "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
                }
                engine.log(f"[skip:rights] rank={popularity.rank} PG#{gid}: {reason}")
                skips.append(rejection)
                ledger.setdefault("rejections", {})[str(gid)] = rejection
                continue

            epub_raw, epub_url = engine.download_epub(candidate)
            artifact = engine.materialize(candidate, meta, rdf_raw, epub_raw, epub_url, ledger)
            annotate_popularity(ledger, gid, popularity)
            artifact["popularityRank"] = popularity.rank
            artifact["downloadCount30d"] = popularity.downloads
            added.append(artifact)
            known_ids.add(gid)
            if logical_key:
                known_work_keys.add(logical_key)
            engine.log(
                f"[add] rank={popularity.rank} {artifact['workId']} — "
                f"{artifact['title']} ({artifact['sizeBytes']} bytes)"
            )
            time.sleep(0.1)
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            engine.log(f"[skip:error] rank={popularity.rank} PG#{gid}: {reason}")
            skips.append(
                {
                    "gutenbergId": gid,
                    "popularityRank": popularity.rank,
                    "reason": reason,
                }
            )

    ledger["lastRun"] = {
        "at": engine.utc_now(),
        "rankingMode": "official-project-gutenberg-top100-30d",
        "rankingSource": POPULARITY_URL,
        "rankingWindow": POPULARITY_WINDOW,
        "rankingRowsVerified": len(popularity_entries),
        "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
        "candidateCount": len(candidates),
        "checkedCount": checked,
        "candidateCheckLimit": max_candidate_checks,
        "addedCount": len(added),
        "skippedCount": len(skips),
        "recentSkips": skips[:50],
    }
    engine.json_dump(engine.LEDGER_PATH, ledger)
    engine.json_dump(engine.STAGING_ROOT / "artifacts.json", added)

    engine.set_github_output("added_count", str(len(added)))
    engine.set_github_output("work_ids", ",".join(item["workId"] for item in added))
    engine.set_github_output("ranking_mode", "official-project-gutenberg-top100-30d")
    engine.log(
        f"[autopilot] complete: {len(added)} added, {len(skips)} skipped, "
        f"{checked}/{max_candidate_checks} Top-100 source checks"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
