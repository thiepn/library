#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import time
import unicodedata
import urllib.error
import urllib.request
from html.parser import HTMLParser
from typing import Any

import sync as engine

MIN_POPULARITY_PAGES = 5
MAX_POPULARITY_PAGES = 8
PG_TOP_URL = "https://www.gutenberg.org/browse/scores/top"
TARGET_POPULARITY_HEADING = "top 100 ebooks last 7 days"
CREATOR_ROLES = {"creator", "aut", "author"}


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
            time.sleep(1.0 + attempt)
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt == 2:
                raise
            time.sleep(1.0 + attempt)
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


engine.request_bytes = bounded_request_bytes


def normalize_identity_text(value: str) -> str:
    """Normalize catalog/display variants without changing the published title."""
    text = unicodedata.normalize("NFKD", value.casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def ledger_creator(entry: dict[str, Any]) -> str:
    contributors = entry.get("legalContributors") or []
    creators = [
        str(contributor.get("name") or "").strip()
        for contributor in contributors
        if isinstance(contributor, dict)
        and str(contributor.get("role") or "").casefold() in CREATOR_ROLES
        and str(contributor.get("name") or "").strip()
    ]
    if creators:
        return ", ".join(creators[:3])
    return str(entry.get("author") or "")


def canonical_work_key(title: str, creator: str) -> str:
    normalized_title = normalize_identity_text(title)
    normalized_creator = normalize_identity_text(creator)
    if not normalized_title or not normalized_creator:
        return ""
    return f"{normalized_title}::{normalized_creator}"


def logical_title_stem(title: str) -> str:
    """Collapse obvious edition/translation wording without conflating sequels."""
    text = normalize_identity_text(title)
    text = re.sub(r"\btranslated\b.*$", "", text)
    text = re.sub(r"\brendered\b.*$", "", text)
    text = re.sub(r"\bwith (?:an? |the )?(?:introduction|preface|notes)\b.*$", "", text)
    text = re.sub(r"\b(?:illustrated|annotated|revised) edition\b.*$", "", text)
    text = re.sub(r"\b(?:a |the )?tragedy\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def logical_work_stem(title: str, creator: str) -> str:
    normalized_creator = normalize_identity_text(creator)
    stem = logical_title_stem(title)
    if not normalized_creator or not stem:
        return ""
    return f"{stem}::{normalized_creator}"


def existing_work_keys(ledger: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for entry in ledger.get("entries") or []:
        if not isinstance(entry, dict):
            continue
        key = canonical_work_key(str(entry.get("title") or ""), ledger_creator(entry))
        if key:
            keys.add(key)
    return keys


def existing_work_stems(ledger: dict[str, Any]) -> set[str]:
    stems: set[str] = set()
    for entry in ledger.get("entries") or []:
        if not isinstance(entry, dict):
            continue
        stem = logical_work_stem(str(entry.get("title") or ""), ledger_creator(entry))
        if stem:
            stems.add(stem)
    return stems


class GutenbergTopParser(HTMLParser):
    """Extract Project Gutenberg's official seven-day eBook ranking."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._in_h2 = False
        self._heading: list[str] = []
        self._active = False
        self._href: str | None = None
        self._link_text: list[str] = []
        self.rows: list[tuple[int, str, int]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lowered = tag.casefold()
        if lowered == "h2":
            self._in_h2 = True
            self._heading = []
            self._active = False
            return
        if lowered != "a" or not self._active:
            return
        href = next((value for name, value in attrs if name.casefold() == "href"), None)
        if href and re.search(r"/ebooks/\d+(?:$|[/?#])", href):
            self._href = href
            self._link_text = []

    def handle_data(self, data: str) -> None:
        if self._in_h2:
            self._heading.append(data)
        if self._href is not None:
            self._link_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.casefold()
        if lowered == "h2" and self._in_h2:
            heading = normalize_identity_text(" ".join(self._heading))
            self._active = heading == TARGET_POPULARITY_HEADING
            self._in_h2 = False
            self._heading = []
            return
        if lowered != "a" or self._href is None:
            return

        href = self._href
        label = re.sub(r"\s+", " ", " ".join(self._link_text)).strip()
        self._href = None
        self._link_text = []

        id_match = re.search(r"/ebooks/(\d+)(?:$|[/?#])", href)
        count_match = re.search(r"\(([0-9][0-9,]*)\)\s*$", label)
        if not id_match or not count_match:
            return
        gutenberg_id = int(id_match.group(1))
        downloads = int(count_match.group(1).replace(",", ""))
        title_and_author = label[: count_match.start()].strip()
        title = title_and_author.rsplit(" by ", 1)[0].strip() or title_and_author
        if gutenberg_id > 0 and downloads > 0:
            self.rows.append((gutenberg_id, title, downloads))


def discover_official_popularity() -> list[engine.Candidate]:
    raw = engine.request_bytes(PG_TOP_URL, timeout=35, accept="text/html,application/xhtml+xml")
    parser = GutenbergTopParser()
    parser.feed(raw.decode("utf-8", errors="replace"))
    parser.close()

    unique: dict[int, engine.Candidate] = {}
    for gutenberg_id, title, downloads in parser.rows:
        existing = unique.get(gutenberg_id)
        if existing is not None and existing.download_count >= downloads:
            continue
        unique[gutenberg_id] = engine.Candidate(
            gutenberg_id=gutenberg_id,
            title=title,
            language="en",
            authors=[],
            subjects=[],
            bookshelves=[],
            download_count=downloads,
            copyright=None,
            formats={},
            summary="",
            score=0.0,
        )

    candidates = list(unique.values())
    candidates.sort(key=lambda candidate: (-candidate.download_count, candidate.gutenberg_id))
    if len(candidates) < 50:
        raise RuntimeError(
            f"official Project Gutenberg seven-day ranking parsed only {len(candidates)} eBooks"
        )
    return candidates


def discover_live_popularity(popularity_pages: int) -> tuple[list[engine.Candidate], str]:
    """Acquire from a live download ranking or add nothing; never invent popularity."""
    try:
        candidates = discover_official_popularity()
        engine.log(
            f"[discover] official Project Gutenberg 7-day popularity primary: "
            f"{len(candidates)} ranked eBook(s)"
        )
        return candidates, "project-gutenberg-official-7-day-downloads"
    except Exception as exc:
        engine.log(f"[discover] official Gutenberg popularity unavailable: {exc}")

    pages = min(MAX_POPULARITY_PAGES, max(MIN_POPULARITY_PAGES, popularity_pages))
    try:
        candidates = engine.discover_gutendex(pages)
        candidates.sort(key=lambda candidate: (-candidate.download_count, -candidate.score, candidate.gutenberg_id))
        candidates = [candidate for candidate in candidates if candidate.download_count > 0]
        if len(candidates) < 20:
            raise RuntimeError(f"Gutendex returned only {len(candidates)} live-popularity candidates")
        engine.log(
            f"[discover] Gutendex live popularity fallback: {len(candidates)} candidate(s) "
            f"across {pages} page(s)"
        )
        return candidates, "gutendex-live-downloads"
    except Exception as exc:
        engine.log(f"[discover] live popularity unavailable; acquisition stops fail-closed: {exc}")
        return [], "unavailable-fail-closed"


def normalize_publication_metadata(candidate: engine.Candidate, meta: dict) -> None:
    """Keep display metadata distinct from rights/provenance metadata."""
    creators = [
        contributor
        for contributor in (meta.get("contributors") or [])
        if contributor.role in CREATOR_ROLES
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


def is_english_metadata(meta: dict[str, Any]) -> bool:
    language = normalize_identity_text(str(meta.get("language") or ""))
    return language == "en" or language.startswith("en ") or language.endswith(" en")


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
    known_work_stems = existing_work_stems(ledger)
    candidates, ranking_mode = discover_live_popularity(max(0, args.discovery_pages))
    engine.log(
        f"[discover] {len(candidates)} live-ranked candidates; "
        f"{len(known_ids)} Gutenberg IDs and {len(known_work_stems)} logical works already known"
    )

    if not candidates:
        engine.set_github_output("added_count", "0")
        engine.set_github_output("work_ids", "")
        engine.log("[autopilot] no publication changes: current popularity could not be established")
        return 0

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
            f"downloads7d={candidate.download_count} — {candidate.title}"
        )

        try:
            meta, rdf_raw = engine.rdf_metadata(gid)
            normalize_publication_metadata(candidate, meta)

            if not is_english_metadata(meta):
                reason = f"non-English Project Gutenberg edition: {meta.get('language') or 'unknown'}"
                engine.log(f"[skip:language] PG#{gid}: {reason}")
                skips.append({"gutenbergId": gid, "title": candidate.title, "reason": reason})
                time.sleep(0.05)
                continue

            creator = engine.author_display(candidate.authors)
            logical_key = canonical_work_key(str(meta.get("title") or candidate.title), creator)
            logical_stem = logical_work_stem(str(meta.get("title") or candidate.title), creator)
            if (logical_key and logical_key in known_work_keys) or (
                logical_stem and logical_stem in known_work_stems
            ):
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
            if logical_stem:
                known_work_stems.add(logical_stem)
            engine.log(
                f"[add] {artifact['workId']} — {artifact['title']} "
                f"(7d downloads={candidate.download_count}, {artifact['sizeBytes']} bytes)"
            )
            time.sleep(0.15)
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            engine.log(f"[skip:error] PG#{gid}: {reason}")
            skips.append({"gutenbergId": gid, "reason": reason})
            time.sleep(0.1)

    ledger["lastRun"] = {
        "at": engine.utc_now(),
        "rankingMode": ranking_mode,
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
        f"{checked}/{max_candidate_checks} source checks; ranking={ranking_mode}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
