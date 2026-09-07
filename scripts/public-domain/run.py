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
from typing import Any

import sync as engine

MIN_POPULARITY_PAGES = 5
MAX_POPULARITY_PAGES = 8


def bounded_request_bytes(url: str, *, timeout: int = 12, accept: str = "*/*") -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": engine.USER_AGENT,
            "Accept": accept,
            "Accept-Encoding": "identity",
        },
    )
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code != 429 and exc.code < 500:
                raise
            if attempt == 1:
                raise
            time.sleep(1.0)
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt == 1:
                raise
            time.sleep(1.0)
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


engine.request_bytes = bounded_request_bytes


def normalize_identity_text(value: str) -> str:
    """Normalize catalog/display variants without changing the published title."""
    text = unicodedata.normalize("NFKD", value.casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def canonical_work_key(title: str, creator: str) -> str:
    normalized_title = normalize_identity_text(title)
    normalized_creator = normalize_identity_text(creator)
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


def discover_official_catalog_ranked(limit: int = 2500) -> list[engine.Candidate]:
    """Rank the complete official Gutenberg catalog before truncating it.

    This is the durable fallback when live popularity enrichment is unavailable.
    The complete catalog is scanned before truncation so fallback ranking is never
    biased toward low Gutenberg IDs.
    """
    raw = gzip.decompress(engine.request_bytes(engine.PG_CATALOG_URL, timeout=90))
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows: list[engine.Candidate] = []

    recognized_shelves = {name.casefold() for name in engine.QUALITY_BOOKSHELVES}
    for record in reader:
        if (record.get("Type") or "").casefold() != "text":
            continue

        languages = [item.strip().casefold() for item in (record.get("Language") or "").split(";")]
        if "en" not in languages:
            continue

        title = (record.get("Title") or "").strip()
        if not title or engine.is_low_value_title(title):
            continue

        shelves = [item.strip() for item in (record.get("Bookshelves") or "").split(";") if item.strip()]
        if not any(shelf.casefold() in recognized_shelves for shelf in shelves):
            continue

        try:
            gutenberg_id = int(record.get("Text#") or 0)
        except (TypeError, ValueError):
            continue
        if gutenberg_id <= 0:
            continue

        subjects = [item.strip() for item in (record.get("Subjects") or "").split(";") if item.strip()]
        authors = [
            engine.parse_lifespan_author(item)
            for item in (record.get("Authors") or "").split(";")
            if item.strip()
        ]
        score = engine.quality_score(
            {
                "title": title,
                "download_count": 0,
                "bookshelves": shelves,
                "subjects": subjects,
                "authors": authors,
            }
        )
        rows.append(
            engine.Candidate(
                gutenberg_id=gutenberg_id,
                title=title,
                language="en",
                authors=authors,
                subjects=subjects,
                bookshelves=shelves,
                download_count=0,
                copyright=None,
                formats={},
                summary="",
                score=score,
            )
        )

    rows.sort(key=lambda candidate: (-candidate.score, candidate.gutenberg_id))
    return rows[: max(1, limit)]


def popularity_sort_key(candidate: engine.Candidate) -> tuple[int, int, float, int]:
    """Prefer live download popularity before editorial/curation score.

    Candidates carrying live Gutendex download counts always sort ahead of
    catalog-only fallback candidates. Within that live set, higher downloads win;
    quality score breaks ties. If live popularity is unavailable, the durable
    official-catalog quality score remains the fallback.
    """
    has_live_popularity = 0 if candidate.download_count > 0 else 1
    return (
        has_live_popularity,
        -candidate.download_count,
        -candidate.score,
        candidate.gutenberg_id,
    )


def discover_durable(popularity_pages: int) -> list[engine.Candidate]:
    """Use live popularity as the acquisition order and Gutenberg catalog as fallback."""
    engine.log("[discover] loading and ranking complete official Project Gutenberg catalog")
    official = discover_official_catalog_ranked(limit=2500)

    popular: list[engine.Candidate] = []
    pages = min(MAX_POPULARITY_PAGES, max(MIN_POPULARITY_PAGES, popularity_pages))
    try:
        # Inspect a sufficiently deep live popularity window so legally ineligible,
        # duplicate, or edition-specific entries do not prevent the next truly
        # popular safe books from being reached.
        popular = engine.discover_gutendex(pages)
        engine.log(
            f"[discover] live popularity primary: {len(popular)} candidate(s) "
            f"across {pages} Gutendex page(s)"
        )
    except Exception as exc:
        engine.log(
            "[discover] live popularity unavailable; "
            f"continuing from official curated catalog fallback: {exc}"
        )

    merged: dict[int, engine.Candidate] = {candidate.gutenberg_id: candidate for candidate in official}
    for candidate in popular:
        existing = merged.get(candidate.gutenberg_id)
        if existing is None:
            merged[candidate.gutenberg_id] = candidate
            continue
        existing.download_count = max(existing.download_count, candidate.download_count)
        existing.formats.update(candidate.formats)
        if candidate.summary and not existing.summary:
            existing.summary = candidate.summary
        # Preserve the stronger editorial score only as a secondary signal.
        existing.score = max(existing.score, candidate.score)

    candidates = list(merged.values())
    candidates.sort(key=popularity_sort_key)
    return candidates


def normalize_publication_metadata(candidate: engine.Candidate, meta: dict) -> None:
    """Keep display metadata distinct from rights/provenance metadata."""
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Bounded public-domain acquisition runner.")
    parser.add_argument("--max-books", type=int, default=10)
    parser.add_argument("--discovery-pages", type=int, default=MIN_POPULARITY_PAGES)
    parser.add_argument("--max-candidate-checks", type=int, default=80)
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
    candidates = discover_durable(max(0, args.discovery_pages))
    engine.log(
        f"[discover] {len(candidates)} ranked candidates; "
        f"{len(known_ids)} Gutenberg IDs and {len(known_work_keys)} logical works already known"
    )

    added: list[dict] = []
    skips: list[dict] = []
    checked = 0

    for candidate in candidates:
        if len(added) >= max_books or checked >= max_candidate_checks:
            break

        gid = candidate.gutenberg_id
        if gid in known_ids:
            continue

        prior_rejection = (ledger.get("rejections") or {}).get(str(gid))
        if isinstance(prior_rejection, dict) and prior_rejection.get("copyrightCutoffYear") == engine.COPYRIGHT_CUTOFF_YEAR:
            continue

        checked += 1
        engine.log(
            f"[candidate] PG#{gid} check={checked}/{max_candidate_checks} "
            f"downloads={candidate.download_count} score={candidate.score:.1f} — {candidate.title}"
        )

        try:
            meta, rdf_raw = engine.rdf_metadata(gid)
            normalize_publication_metadata(candidate, meta)

            creator = engine.author_display(candidate.authors)
            logical_key = canonical_work_key(str(meta.get("title") or candidate.title), creator)
            if logical_key and logical_key in known_work_keys:
                reason = f"logical work already represented in Library: {candidate.title} — {creator}"
                engine.log(f"[skip:duplicate] PG#{gid}: {reason}")
                skips.append({"gutenbergId": gid, "title": candidate.title, "reason": reason})
                time.sleep(0.05)
                continue

            allowed, reason = engine.legal_gate(candidate, meta)
            if not allowed:
                rejection = {
                    "gutenbergId": gid,
                    "title": candidate.title,
                    "reason": reason,
                    "checkedAt": engine.utc_now(),
                    "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
                }
                engine.log(f"[skip:rights] PG#{gid}: {reason}")
                skips.append(rejection)
                ledger.setdefault("rejections", {})[str(gid)] = rejection
                time.sleep(0.1)
                continue

            epub_raw, epub_url = engine.download_epub(candidate)
            artifact = engine.materialize(candidate, meta, rdf_raw, epub_raw, epub_url, ledger)
            added.append(artifact)
            known_ids.add(gid)
            if logical_key:
                known_work_keys.add(logical_key)
            engine.log(f"[add] {artifact['workId']} — {artifact['title']} ({artifact['sizeBytes']} bytes)")
            time.sleep(0.15)
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            engine.log(f"[skip:error] PG#{gid}: {reason}")
            skips.append({"gutenbergId": gid, "reason": reason})
            time.sleep(0.1)

    ledger["lastRun"] = {
        "at": engine.utc_now(),
        "rankingMode": "live-download-popularity-first",
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
    engine.log(
        f"[autopilot] complete: {len(added)} added, {len(skips)} skipped, "
        f"{checked}/{max_candidate_checks} source checks"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
