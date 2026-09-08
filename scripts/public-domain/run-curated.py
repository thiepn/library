#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import time
from typing import Any

import sync as engine
import run as standard


CURATION_MODE = "curated-christian-classics"
CURATION_SOURCE = "user-requested-christian-classics"


def parse_ids(raw: str) -> list[int]:
    seen: set[int] = set()
    result: list[int] = []
    for token in re.split(r"[\s,;]+", raw.strip()):
        if not token:
            continue
        try:
            gid = int(token)
        except ValueError as exc:
            raise ValueError(f"invalid Gutenberg ID {token!r}") from exc
        if gid <= 0:
            raise ValueError(f"invalid Gutenberg ID {gid}")
        if gid not in seen:
            seen.add(gid)
            result.append(gid)
    if not result:
        raise ValueError("no Gutenberg IDs supplied")
    return result


def catalog_candidates_for_ids(ids: list[int]) -> tuple[list[engine.Candidate], list[int]]:
    wanted = set(ids)
    raw = gzip.decompress(engine.request_bytes(engine.PG_CATALOG_URL, timeout=90))
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace")))
    candidates: dict[int, engine.Candidate] = {}

    for record in reader:
        try:
            gid = int(record.get("Text#") or 0)
        except (TypeError, ValueError):
            continue
        if gid not in wanted:
            continue
        if (record.get("Type") or "").casefold() != "text":
            continue
        languages = [item.strip().casefold() for item in (record.get("Language") or "").split(";")]
        if "en" not in languages:
            continue

        title = (record.get("Title") or "").strip()
        if not title or engine.is_low_value_title(title):
            continue

        shelves = [item.strip() for item in (record.get("Bookshelves") or "").split(";") if item.strip()]
        subjects = [item.strip() for item in (record.get("Subjects") or "").split(";") if item.strip()]
        authors = [
            engine.parse_lifespan_author(item)
            for item in (record.get("Authors") or "").split(";")
            if item.strip()
        ]
        candidates[gid] = engine.Candidate(
            gutenberg_id=gid,
            title=title,
            language="en",
            authors=authors,
            subjects=subjects,
            bookshelves=shelves,
            download_count=0,
            copyright=None,
            formats={},
            summary="",
            score=engine.quality_score(
                {
                    "title": title,
                    "download_count": 0,
                    "bookshelves": shelves,
                    "subjects": subjects,
                    "authors": authors,
                }
            ),
        )

    missing = [gid for gid in ids if gid not in candidates]
    return [candidates[gid] for gid in ids if gid in candidates], missing


def mark_christian_classic(work_id: str) -> None:
    path = engine.WORKS_ROOT / work_id / "work.yaml"
    work = json.loads(path.read_text(encoding="utf-8"))
    classification = work.setdefault("classification", {})
    tags = classification.setdefault("tags", [])
    collections = classification.setdefault("collections", [])
    for tag in ("christian", "christian-classic"):
        if tag not in tags:
            tags.append(tag)
    if "christian-classics" not in collections:
        collections.append("christian-classics")
    path.write_text(json.dumps(work, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def annotate_curation(ledger: dict[str, Any], gid: int, position: int) -> None:
    for entry in reversed(ledger.get("entries") or []):
        try:
            if int(entry.get("gutenbergId")) != gid:
                continue
        except Exception:
            continue
        entry["curation"] = {
            "mode": CURATION_MODE,
            "source": CURATION_SOURCE,
            "requestedPosition": position,
            "collection": "christian-classics",
        }
        return
    raise RuntimeError(f"new ledger entry for PG#{gid} not found for curation annotation")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ingest an explicit user-curated batch of legally safe Christian classics from Project Gutenberg."
    )
    parser.add_argument("--ids", required=True, help="Comma/space-separated Project Gutenberg ebook IDs")
    parser.add_argument("--max-books", type=int, default=20)
    parser.add_argument("--max-candidate-checks", type=int, default=100)
    args = parser.parse_args()

    requested_ids = parse_ids(args.ids)
    max_books = max(0, min(args.max_books, 20))
    max_candidate_checks = max(max_books, min(args.max_candidate_checks, 200))
    if max_books == 0:
        engine.set_github_output("added_count", "0")
        engine.set_github_output("ranking_mode", CURATION_MODE)
        return 0

    if engine.STAGING_ROOT.exists():
        engine.shutil.rmtree(engine.STAGING_ROOT)
    engine.STAGING_ROOT.mkdir(parents=True, exist_ok=True)

    ledger = engine.load_ledger()
    known_ids = engine.existing_pg_ids(ledger)
    known_work_keys = standard.existing_work_keys(ledger)
    candidates, missing_catalog_ids = catalog_candidates_for_ids(requested_ids)
    position_by_id = {gid: index + 1 for index, gid in enumerate(requested_ids)}

    engine.log(
        f"[discover:curated] requested={len(requested_ids)} catalog_candidates={len(candidates)} "
        f"missing_or_non_english={len(missing_catalog_ids)} known_ids={len(known_ids)} "
        f"known_logical_works={len(known_work_keys)}"
    )

    added: list[dict[str, Any]] = []
    skips: list[dict[str, Any]] = [
        {
            "gutenbergId": gid,
            "requestedPosition": position_by_id[gid],
            "reason": "not found as an English text in official Project Gutenberg catalog",
        }
        for gid in missing_catalog_ids
    ]
    checked = 0

    for candidate in candidates:
        if len(added) >= max_books or checked >= max_candidate_checks:
            break

        gid = candidate.gutenberg_id
        position = position_by_id[gid]
        if gid in known_ids:
            engine.log(f"[skip:existing] curated={position} PG#{gid} — {candidate.title}")
            continue

        prior_rejection = (ledger.get("rejections") or {}).get(str(gid))
        if isinstance(prior_rejection, dict) and prior_rejection.get("copyrightCutoffYear") == engine.COPYRIGHT_CUTOFF_YEAR:
            engine.log(f"[skip:prior-rights] curated={position} PG#{gid} — {candidate.title}")
            continue

        checked += 1
        engine.log(
            f"[candidate:curated] position={position} PG#{gid} "
            f"check={checked}/{max_candidate_checks} — {candidate.title}"
        )

        try:
            meta, rdf_raw = engine.rdf_metadata(gid)
            standard.normalize_publication_metadata(candidate, meta)

            creator = engine.author_display(candidate.authors)
            logical_key = standard.canonical_work_key(str(meta.get("title") or candidate.title), creator)
            if logical_key and logical_key in known_work_keys:
                reason = f"logical work already represented in Library: {candidate.title} — {creator}"
                engine.log(f"[skip:duplicate] curated={position} PG#{gid}: {reason}")
                skips.append(
                    {
                        "gutenbergId": gid,
                        "title": candidate.title,
                        "requestedPosition": position,
                        "reason": reason,
                    }
                )
                continue

            allowed, reason = engine.legal_gate(candidate, meta)
            if not allowed:
                rejection = {
                    "gutenbergId": gid,
                    "title": candidate.title,
                    "requestedPosition": position,
                    "curationMode": CURATION_MODE,
                    "reason": reason,
                    "checkedAt": engine.utc_now(),
                    "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
                }
                engine.log(f"[skip:rights] curated={position} PG#{gid}: {reason}")
                skips.append(rejection)
                ledger.setdefault("rejections", {})[str(gid)] = rejection
                continue

            epub_raw, epub_url = engine.download_epub(candidate)
            artifact = engine.materialize(candidate, meta, rdf_raw, epub_raw, epub_url, ledger)
            mark_christian_classic(artifact["workId"])
            annotate_curation(ledger, gid, position)
            artifact["curatedPosition"] = position
            added.append(artifact)
            known_ids.add(gid)
            if logical_key:
                known_work_keys.add(logical_key)
            engine.log(
                f"[add:curated] position={position} {artifact['workId']} — "
                f"{artifact['title']} ({artifact['sizeBytes']} bytes)"
            )
            time.sleep(0.1)
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            engine.log(f"[skip:error] curated={position} PG#{gid}: {reason}")
            skips.append(
                {
                    "gutenbergId": gid,
                    "requestedPosition": position,
                    "reason": reason,
                }
            )

    ledger["lastRun"] = {
        "at": engine.utc_now(),
        "rankingMode": CURATION_MODE,
        "curationSource": CURATION_SOURCE,
        "collection": "christian-classics",
        "requestedIds": requested_ids,
        "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
        "candidateCount": len(candidates),
        "checkedCount": checked,
        "candidateCheckLimit": max_candidate_checks,
        "addedCount": len(added),
        "skippedCount": len(skips),
        "recentSkips": skips[:100],
    }
    engine.json_dump(engine.LEDGER_PATH, ledger)
    engine.json_dump(engine.STAGING_ROOT / "artifacts.json", added)

    engine.set_github_output("added_count", str(len(added)))
    engine.set_github_output("work_ids", ",".join(item["workId"] for item in added))
    engine.set_github_output("ranking_mode", CURATION_MODE)
    engine.log(
        f"[curated] complete: {len(added)} added, {len(skips)} skipped, "
        f"{checked}/{max_candidate_checks} rights/source checks"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
