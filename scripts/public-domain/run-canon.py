#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import time
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import catalog_metadata as catalog_metadata
import run as standard
import sync as engine

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "src/publications/curated-canon.tsv"
CURATION_MODE = "curated-library-canon"


@dataclass(frozen=True)
class CanonItem:
    title: str
    author: str
    collection: str
    rights_mode: str
    position: int


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.casefold())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("&", " and ")
    text = re.sub(r"\bthe\b|\ba\b|\ban\b", " ", text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def surname_set(value: str) -> set[str]:
    stop = {"and", "various", "anonymous", "gita", "bhagavad"}
    pieces = re.split(r"[,/&]|\band\b", value, flags=re.I)
    result: set[str] = set()
    for piece in pieces:
        tokens = normalize(piece).split()
        if tokens and tokens[-1] not in stop:
            result.add(tokens[-1])
    return result


def load_catalog() -> list[CanonItem]:
    rows: list[CanonItem] = []
    with CATALOG_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for position, row in enumerate(reader, start=1):
            title = str(row.get("title") or "").strip()
            author = str(row.get("author") or "").strip()
            collection = str(row.get("collection") or "").strip()
            rights_mode = str(row.get("rightsMode") or "").strip()
            if not title or not author or not collection or not rights_mode:
                raise ValueError(f"invalid curated canon row {position}: {row}")
            rows.append(CanonItem(title, author, collection, rights_mode, position))
    return rows


def catalog_records() -> list[dict[str, str]]:
    raw = gzip.decompress(engine.request_bytes(engine.PG_CATALOG_URL, timeout=120))
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace")))
    records: list[dict[str, str]] = []
    for record in reader:
        if (record.get("Type") or "").casefold() != "text":
            continue
        languages = [part.strip().casefold() for part in (record.get("Language") or "").split(";")]
        if "en" not in languages:
            continue
        try:
            gid = int(record.get("Text#") or "0")
        except ValueError:
            continue
        title = str(record.get("Title") or "").strip()
        if gid <= 0 or not title or engine.is_low_value_title(title):
            continue
        records.append(record)
    return records


def title_score(wanted: str, candidate: str) -> float:
    w = normalize(wanted)
    c = normalize(candidate)
    if not w or not c:
        return 0.0
    if w == c:
        return 1.0
    if c.startswith(w + " ") or w.startswith(c + " "):
        return 0.96
    wr = standard.canonical_title_key(wanted)
    cr = standard.canonical_title_key(candidate)
    if wr and cr and wr == cr:
        return 0.95
    seq = SequenceMatcher(a=w, b=c).ratio()
    ws, cs = set(w.split()), set(c.split())
    token = len(ws & cs) / len(ws | cs) if ws and cs else 0.0
    return max(seq, token)


def author_score(wanted: str, candidate: str) -> float:
    wanted_surnames = surname_set(wanted)
    if not wanted_surnames:
        return 0.55
    candidate_norm = normalize(candidate)
    hits = sum(1 for surname in wanted_surnames if re.search(rf"\b{re.escape(surname)}\b", candidate_norm))
    if hits == len(wanted_surnames):
        return 1.0
    if hits:
        return 0.72
    if normalize(wanted) in {"anonymous", "various"}:
        return 0.55
    return 0.0


def resolve_item(item: CanonItem, records: list[dict[str, str]]) -> tuple[engine.Candidate | None, str]:
    scored: list[tuple[float, dict[str, str]]] = []
    for record in records:
        raw_title = str(record.get("Title") or "")
        ts = title_score(item.title, raw_title)
        if ts < 0.58:
            continue
        authors_raw = str(record.get("Authors") or "")
        a_score = author_score(item.author, authors_raw)
        if a_score == 0.0:
            continue

        penalty = 0.0
        candidate_norm = normalize(raw_title)
        wanted_norm = normalize(item.title)
        if any(token in candidate_norm for token in (" volume ", " vol ", " part ")) and not any(
            token in wanted_norm for token in (" volume ", " vol ", " part ")
        ):
            penalty += 0.12
        if "complete" in candidate_norm and len(candidate_norm) > len(wanted_norm) * 1.8:
            penalty += 0.04

        score = 0.78 * ts + 0.22 * a_score - penalty
        scored.append((score, record))

    if not scored:
        return None, "no English Project Gutenberg catalog match"

    scored.sort(key=lambda pair: pair[0], reverse=True)
    best_score, best = scored[0]
    if best_score < 0.76:
        return None, f"best source match confidence too low ({best_score:.3f})"
    if len(scored) > 1 and scored[1][0] >= best_score - 0.015:
        first_id = str(best.get("Text#") or "")
        second_id = str(scored[1][1].get("Text#") or "")
        if first_id != second_id and normalize(str(best.get("Title") or "")) != normalize(str(scored[1][1].get("Title") or "")):
            return None, f"ambiguous source match ({best_score:.3f} vs {scored[1][0]:.3f})"

    gid = int(best.get("Text#") or 0)
    title = str(best.get("Title") or item.title).strip()
    shelves = [part.strip() for part in str(best.get("Bookshelves") or "").split(";") if part.strip()]
    subjects = [part.strip() for part in str(best.get("Subjects") or "").split(";") if part.strip()]
    authors = [
        engine.parse_lifespan_author(part)
        for part in str(best.get("Authors") or "").split(";")
        if part.strip()
    ]
    candidate = engine.Candidate(
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
    return candidate, f"matched PG#{gid} confidence={best_score:.3f}"


def existing_display_keys() -> set[str]:
    keys: set[str] = set()
    for path in engine.WORKS_ROOT.glob("*/work.yaml"):
        try:
            work = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        title = str(work.get("title") or "")
        authors = catalog_metadata.author_names(work)
        if title and authors:
            keys.add(f"{normalize(title)}::{normalize(authors[0])}")
            keys.add(f"{standard.canonical_title_key(title)}::{next(iter(surname_set(authors[0])), '')}")
    return keys


def item_keys(item: CanonItem) -> set[str]:
    surname = next(iter(surname_set(item.author)), "")
    return {
        f"{normalize(item.title)}::{normalize(item.author)}",
        f"{standard.canonical_title_key(item.title)}::{surname}",
    }


def annotate_entry(ledger: dict[str, Any], gid: int, item: CanonItem, match_note: str) -> None:
    for entry in reversed(ledger.get("entries") or []):
        if not isinstance(entry, dict):
            continue
        try:
            if int(entry.get("gutenbergId")) != gid:
                continue
        except Exception:
            continue
        entry["curation"] = {
            "mode": CURATION_MODE,
            "requestedPosition": item.position,
            "requestedTitle": item.title,
            "requestedAuthor": item.author,
            "collection": item.collection,
            "rightsMode": item.rights_mode,
            "sourceMatch": match_note,
        }
        return


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest the user-curated Library canon with rights and source verification.")
    parser.add_argument("--max-books", type=int, default=300)
    parser.add_argument("--max-candidate-checks", type=int, default=500)
    args = parser.parse_args()

    max_books = max(0, min(args.max_books, 350))
    max_checks = max(max_books, min(args.max_candidate_checks, 700))

    items = load_catalog()
    records = catalog_records()
    ledger = engine.load_ledger()
    known_ids = engine.existing_pg_ids(ledger)
    display_keys = existing_display_keys()

    if engine.STAGING_ROOT.exists():
        engine.shutil.rmtree(engine.STAGING_ROOT)
    engine.STAGING_ROOT.mkdir(parents=True, exist_ok=True)

    added: list[dict[str, Any]] = []
    skips: list[dict[str, Any]] = []
    checked = 0

    for item in items:
        if len(added) >= max_books or checked >= max_checks:
            break

        if item.rights_mode != "global":
            skips.append(
                {
                    "position": item.position,
                    "title": item.title,
                    "author": item.author,
                    "rightsMode": item.rights_mode,
                    "reason": "not eligible for globally accessible automatic publication",
                }
            )
            continue

        if display_keys.intersection(item_keys(item)):
            print(f"[skip:existing] {item.position} {item.title} — {item.author}", flush=True)
            continue

        candidate, match_note = resolve_item(item, records)
        if candidate is None:
            skips.append(
                {
                    "position": item.position,
                    "title": item.title,
                    "author": item.author,
                    "rightsMode": item.rights_mode,
                    "reason": match_note,
                }
            )
            print(f"[skip:source] {item.position} {item.title}: {match_note}", flush=True)
            continue

        gid = candidate.gutenberg_id
        if gid in known_ids:
            skips.append(
                {
                    "position": item.position,
                    "title": item.title,
                    "author": item.author,
                    "gutenbergId": gid,
                    "reason": "resolved source edition already exists in Library",
                }
            )
            continue

        checked += 1
        print(f"[candidate:canon] {item.position} PG#{gid} — {item.title} / {item.author}", flush=True)
        try:
            meta, rdf_raw = engine.rdf_metadata(gid)
            standard.normalize_publication_metadata(candidate, meta)
            allowed, reason = engine.legal_gate(candidate, meta)
            if not allowed:
                rejection = {
                    "gutenbergId": gid,
                    "title": item.title,
                    "author": item.author,
                    "curationMode": CURATION_MODE,
                    "reason": reason,
                    "checkedAt": engine.utc_now(),
                    "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
                }
                ledger.setdefault("rejections", {})[str(gid)] = rejection
                skips.append(rejection)
                print(f"[skip:rights] PG#{gid}: {reason}", flush=True)
                continue

            epub_raw, epub_url = engine.download_epub(candidate)
            artifact = engine.materialize(candidate, meta, rdf_raw, epub_raw, epub_url, ledger)
            catalog_metadata.update_work(
                artifact["workId"],
                gutenberg_id=gid,
                preferred_title=item.title,
                preferred_author=item.author if item.author not in {"Anonymous", "Various"} else None,
                collections=[item.collection],
            )
            annotate_entry(ledger, gid, item, match_note)
            artifact["curatedPosition"] = item.position
            artifact["collection"] = item.collection
            added.append(artifact)
            known_ids.add(gid)
            display_keys.update(item_keys(item))
            print(f"[add:canon] {artifact['workId']} — {item.title}", flush=True)
            time.sleep(0.05)
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            skips.append(
                {
                    "position": item.position,
                    "title": item.title,
                    "author": item.author,
                    "gutenbergId": gid,
                    "reason": reason,
                }
            )
            print(f"[skip:error] {item.title}: {reason}", flush=True)

    ledger["lastRun"] = {
        "at": engine.utc_now(),
        "rankingMode": CURATION_MODE,
        "catalog": str(CATALOG_PATH.relative_to(ROOT)),
        "catalogEntries": len(items),
        "globallyEligible": sum(1 for item in items if item.rights_mode == "global"),
        "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
        "checkedCount": checked,
        "candidateCheckLimit": max_checks,
        "addedCount": len(added),
        "skippedCount": len(skips),
        "recentSkips": skips[:500],
    }
    engine.json_dump(engine.LEDGER_PATH, ledger)
    engine.json_dump(engine.STAGING_ROOT / "artifacts.json", added)

    engine.set_github_output("added_count", str(len(added)))
    engine.set_github_output("work_ids", ",".join(str(item["workId"]) for item in added))
    engine.set_github_output("ranking_mode", CURATION_MODE)
    print(
        f"CURATED_CANON_COMPLETE added={len(added)} skipped={len(skips)} checked={checked}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
