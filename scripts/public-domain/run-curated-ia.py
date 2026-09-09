#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import time
import urllib.parse
from datetime import date
from pathlib import Path
from typing import Any

import run as standard
import sync as engine

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "scripts/public-domain/christian-openlibrary-sources.json"
IA_METADATA_ROOT = "https://archive.org/metadata"
IA_DOWNLOAD_ROOT = "https://archive.org/download"
OPENLIBRARY_ROOT = "https://openlibrary.org/books"
CURATION_MODE = "curated-christian-openlibrary"
CURATION_SOURCE = "user-requested-christian-classics-openlibrary-internet-archive"
MAX_EDITION_YEAR = 1929
ALLOWED_EVIDENCE_HOSTS = {"archive.org", "openlibrary.org", "commons.wikimedia.org", "www.loc.gov"}
CREATIVE_METADATA_FIELDS = ("editor", "translator", "illustrator", "annotator", "adapter", "compiler")


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def parse_items(raw: str) -> list[str]:
    result: list[str] = []
    for token in re.split(r"[\s,;]+", raw.strip()):
        item = token.strip()
        if not item:
            continue
        if not re.fullmatch(r"[A-Za-z0-9._-]{3,120}", item):
            raise ValueError(f"invalid Internet Archive item identifier {item!r}")
        if item not in result:
            result.append(item)
    if not result:
        raise ValueError("no Internet Archive item identifiers supplied")
    return result


def _year(value: Any, field: str) -> int:
    try:
        year = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be a year") from exc
    if year < 1 or year > date.today().year:
        raise ValueError(f"{field} is outside the supported range: {year}")
    return year


def validate_manifest_entry(entry: Any) -> None:
    if not isinstance(entry, dict):
        raise ValueError("manifest entries must be objects")
    item_id = str(entry.get("itemId") or "")
    if not re.fullmatch(r"[A-Za-z0-9._-]{3,120}", item_id):
        raise ValueError(f"invalid itemId {item_id!r}")
    if not re.fullmatch(r"OL\d+M", str(entry.get("openLibraryId") or "")):
        raise ValueError(f"invalid Open Library edition id for {item_id}")
    if not str(entry.get("title") or "").strip():
        raise ValueError(f"missing display title for {item_id}")
    aliases = entry.get("sourceTitleAliases")
    if not isinstance(aliases, list) or not any(str(value).strip() for value in aliases):
        raise ValueError(f"missing sourceTitleAliases for {item_id}")
    publication_year = _year(entry.get("editionPublishedYear"), "editionPublishedYear")
    if publication_year > MAX_EDITION_YEAR:
        raise ValueError(f"edition {item_id} is too recent for automatic ingestion: {publication_year}")

    contributors = entry.get("creativeContributors")
    if not isinstance(contributors, list) or not contributors:
        raise ValueError(f"no creative contributors declared for {item_id}")
    author_roles = {"author", "creator", "aut"}
    if not any(isinstance(c, dict) and str(c.get("role") or "").casefold() in author_roles for c in contributors):
        raise ValueError(f"no author/creator declared for {item_id}")
    for contributor in contributors:
        if not isinstance(contributor, dict) or not str(contributor.get("name") or "").strip():
            raise ValueError(f"invalid creative contributor for {item_id}")
        death = _year(contributor.get("deathYear"), f"deathYear for {contributor.get('name')}")
        if death > engine.COPYRIGHT_CUTOFF_YEAR:
            raise ValueError(
                f"creative contributor {contributor.get('name')} died {death}, after German cutoff {engine.COPYRIGHT_CUTOFF_YEAR}"
            )

    evidence = entry.get("rightsEvidence")
    if not isinstance(evidence, list) or len(evidence) < 2:
        raise ValueError(f"at least two rights/provenance evidence URLs are required for {item_id}")
    for raw_url in evidence:
        parsed = urllib.parse.urlparse(str(raw_url))
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_EVIDENCE_HOSTS:
            raise ValueError(f"unapproved rights-evidence URL for {item_id}: {raw_url}")
    if not str(entry.get("rightsBasis") or "").strip():
        raise ValueError(f"rightsBasis is required for {item_id}")


def load_manifest(path: Path = MANIFEST_PATH) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schemaVersion") != 1:
        raise ValueError("curated Internet Archive source manifest must be schemaVersion 1")
    entries = value.get("entries")
    if not isinstance(entries, list) or not entries:
        raise ValueError("curated Internet Archive source manifest has no entries")
    seen: set[str] = set()
    for entry in entries:
        validate_manifest_entry(entry)
        item_id = str(entry["itemId"])
        if item_id in seen:
            raise ValueError(f"duplicate Internet Archive itemId {item_id}")
        seen.add(item_id)
    return value


def metadata_values(metadata: dict[str, Any], key: str) -> list[str]:
    value = metadata.get(key)
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value or "").strip()
    return [text] if text else []


def metadata_value(metadata: dict[str, Any], key: str) -> str:
    return " ".join(metadata_values(metadata, key)).strip()


def metadata_year(metadata: dict[str, Any]) -> int | None:
    for key in ("date", "year", "publicdate"):
        match = re.search(r"\b(1[0-9]{3}|20[0-9]{2})\b", metadata_value(metadata, key))
        if match:
            return int(match.group(1))
    return None


def normalized(value: str) -> str:
    return standard.normalize_identity_text(value)


def person_tokens(value: str) -> set[str]:
    return {token for token in normalized(value).split() if token and not token.isdigit() and not re.fullmatch(r"\d{3,4}", token)}


def person_matches(expected: str, live: str) -> bool:
    expected_tokens = person_tokens(expected)
    live_tokens = person_tokens(live)
    return bool(expected_tokens) and expected_tokens.issubset(live_tokens)


def title_matches(live_title: str, aliases: list[Any]) -> bool:
    live = normalized(live_title)
    if not live:
        return False
    return any(
        (candidate := normalized(str(alias))) and (candidate == live or candidate in live or live in candidate)
        for alias in aliases
    )


def authors_from_manifest(entry: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        contributor
        for contributor in entry["creativeContributors"]
        if str(contributor.get("role") or "").casefold() in {"author", "creator", "aut"}
    ]


def creator_matches(metadata: dict[str, Any], entry: dict[str, Any]) -> bool:
    live_creators = metadata_values(metadata, "creator")
    if not live_creators:
        return False
    for author in authors_from_manifest(entry):
        expected = str(author.get("name") or "")
        if not any(person_matches(expected, live) for live in live_creators):
            return False
    return True


def undeclared_creative_metadata(metadata: dict[str, Any], entry: dict[str, Any]) -> list[str]:
    declared = [str(c.get("name") or "") for c in entry["creativeContributors"]]
    unknown: list[str] = []
    for field in CREATIVE_METADATA_FIELDS:
        for live in metadata_values(metadata, field):
            if not any(person_matches(name, live) for name in declared):
                unknown.append(f"{field}: {live}")
    return unknown


def is_truthy(value: Any) -> bool:
    return value is True or str(value or "").strip().casefold() in {"1", "true", "yes", "y"}


def select_epub_file(files: Any) -> dict[str, Any]:
    if not isinstance(files, list):
        raise ValueError("Internet Archive metadata contains no file list")
    candidates: list[dict[str, Any]] = []
    for item in files:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        fmt = str(item.get("format") or "").casefold()
        lowered = name.casefold()
        if not lowered.endswith(".epub"):
            continue
        if fmt and "epub" not in fmt:
            continue
        if any(marker in lowered for marker in ("encrypted", "lcp", "borrow")):
            continue
        if any(is_truthy(item.get(key)) for key in ("private", "hidden", "access-restricted")):
            continue
        candidates.append(item)
    if not candidates:
        raise ValueError("no unrestricted EPUB file is exposed by Internet Archive metadata")
    candidates.sort(key=lambda item: (0 if str(item.get("source") or "").casefold() == "derivative" else 1, len(str(item.get("name") or ""))))
    return candidates[0]


def validate_live_metadata(entry: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        raise ValueError("Internet Archive payload has no metadata object")
    identifier = metadata_value(metadata, "identifier")
    if identifier and identifier != str(entry["itemId"]):
        raise ValueError("Internet Archive metadata identifier mismatch")
    if metadata_value(metadata, "mediatype").casefold() not in {"texts", "text"}:
        raise ValueError("Internet Archive item is not a text item")
    if is_truthy(metadata.get("access-restricted-item")):
        raise ValueError("Internet Archive item is access-restricted/borrow-only")
    live_title = metadata_value(metadata, "title")
    if not title_matches(live_title, list(entry["sourceTitleAliases"])):
        raise ValueError(f"source title mismatch: {live_title!r}")
    if not creator_matches(metadata, entry):
        raise ValueError(f"source creator mismatch: {metadata_value(metadata, 'creator')!r}")
    undeclared = undeclared_creative_metadata(metadata, entry)
    if undeclared:
        raise ValueError("undeclared creative contributor metadata: " + "; ".join(undeclared))
    year = metadata_year(metadata)
    expected_year = int(entry["editionPublishedYear"])
    if year is None or year != expected_year or year > MAX_EDITION_YEAR:
        raise ValueError(f"source edition year mismatch: expected {expected_year}, got {year}")
    return {"metadata": metadata, "epub": select_epub_file(payload.get("files"))}


def source_url(item_id: str, filename: str) -> str:
    return f"{IA_DOWNLOAD_ROOT}/{urllib.parse.quote(item_id, safe='')}/{urllib.parse.quote(filename)}"


def known_ia_items(ledger: dict[str, Any]) -> set[str]:
    return {
        str(entry["internetArchiveId"])
        for entry in ledger.get("entries") or []
        if isinstance(entry, dict) and entry.get("internetArchiveId")
    }


def authors_display(contributors: list[dict[str, Any]]) -> str:
    names = [
        str(c.get("name") or "").strip()
        for c in contributors
        if str(c.get("role") or "").casefold() in {"author", "creator", "aut"}
    ]
    return ", ".join(name for name in names if name) or "Unknown author"


def materialize(entry: dict[str, Any], payload: dict[str, Any], epub_raw: bytes, epub_url: str, ledger: dict[str, Any]) -> dict[str, Any]:
    item_id = str(entry["itemId"])
    work_id = f"pd-ia-{engine.slugify(item_id, 'archive')[:72]}"
    title = str(entry["title"]).strip()
    contributors = [dict(value) for value in entry["creativeContributors"]]
    author = authors_display(contributors)
    epub_hash = engine.sha256_bytes(epub_raw)
    version = f"ia-{engine.slugify(item_id, 'archive')[:44]}-{epub_hash[:12]}"
    filename = f"{engine.slugify(title)}-internet-archive.epub"
    released_at = engine.utc_now()
    edition_year = int(entry["editionPublishedYear"])
    description = str(entry.get("description") or f"A curated public-domain historical edition of {title} by {author}.").strip()
    short_description = description if len(description) <= 180 else description[:177].rstrip() + "…"
    metadata_raw = canonical_json_bytes(payload)

    work = {
        "schemaVersion": 1,
        "id": work_id,
        "slug": work_id,
        "title": title,
        "type": "book",
        "language": "en",
        "contributors": contributors,
        "description": description,
        "shortDescription": short_description,
        "status": "published",
        "visibility": "public",
        "publication": {
            "firstPublished": f"{edition_year}-01-01",
            "lastUpdated": date.today().isoformat(),
            "edition": 1,
            "editionLabel": "THIEPN Library public-domain edition (Internet Archive/Open Library source)",
            "version": version,
            "activeRelease": version
        },
        "cover": {"src": f"/covers/public-domain/{work_id}.svg", "alt": f"Cover for {title} by {author}"},
        "classification": {
            "subjects": [str(value) for value in entry.get("subjects") or ["christianity"]][:5],
            "tags": ["public-domain", "internet-archive", "open-library", "christian", "christian-classic"],
            "collections": ["public-domain", "christian-classics"]
        },
        "parts": [],
        "formats": {"web": {"enabled": False}, "pdf": {"enabled": False}, "epub": {"enabled": True}},
        "relationships": {"relatedWorks": [], "prerequisites": []},
        "resources": [
            {"type": "source", "label": "Internet Archive", "url": f"https://archive.org/details/{item_id}", "internetArchiveId": item_id},
            {"type": "source", "label": "Open Library edition", "url": f"{OPENLIBRARY_ROOT}/{entry['openLibraryId']}", "openLibraryId": entry["openLibraryId"]},
            *[{"type": "rights-evidence", "label": "Public-domain provenance evidence", "url": str(url)} for url in entry["rightsEvidence"]]
        ],
        "rights": {
            "status": "Public domain — curated Germany/EU ordinary-term and historical-edition gate passed",
            "notice": (
                f"Curated source edition: Internet Archive item {item_id}, published {edition_year}. "
                f"All creative contributors explicitly recorded for this edition have death years at or before "
                f"the Library's German ordinary-term cutoff {engine.COPYRIGHT_CUTOFF_YEAR}. The edition predates "
                f"{MAX_EDITION_YEAR + 1}, live source metadata matched the pinned title/creator/date, and the item "
                f"exposed an unrestricted EPUB. Rights/provenance evidence is retained in the work resources. "
                f"Uncertain, restricted, modern, or contributor-incomplete editions are rejected automatically."
            )
        }
    }

    work_dir = engine.WORKS_ROOT / work_id
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    engine.json_dump(work_dir / "work.yaml", work)

    r2_key = f"works/{work_id}/editions/{version}/{filename}"
    metadata_hash = hashlib.sha256(metadata_raw).hexdigest()
    release = {
        "schemaVersion": 1,
        "workId": work_id,
        "version": version,
        "edition": 1,
        "releasedAt": released_at,
        "sourceHash": metadata_hash,
        "artifacts": {"epub": {
            "url": engine.MEDIA_ORIGIN + r2_key,
            "filename": filename,
            "mimeType": "application/epub+zip",
            "sizeBytes": len(epub_raw),
            "sha256": epub_hash
        }}
    }
    release_dir = engine.RELEASES_ROOT / work_id
    release_dir.mkdir(parents=True, exist_ok=True)
    engine.json_dump(release_dir / f"{version}.yaml", release)

    stage_dir = engine.STAGING_ROOT / work_id
    stage_dir.mkdir(parents=True, exist_ok=True)
    epub_stage = stage_dir / filename
    epub_stage.write_bytes(epub_raw)

    ledger.setdefault("entries", []).append({
        "sourceProvider": "internet-archive-open-library",
        "internetArchiveId": item_id,
        "openLibraryId": str(entry["openLibraryId"]),
        "workId": work_id,
        "title": title,
        "author": author,
        "score": 0,
        "downloadCountAtSelection": 0,
        "bookshelves": ["Christian Classics"],
        "sourcePage": f"https://archive.org/details/{item_id}",
        "sourceMetadata": f"{IA_METADATA_ROOT}/{item_id}",
        "sourceEpub": epub_url,
        "sourceMetadataSha256": metadata_hash,
        "sourceEpubSha256": epub_hash,
        "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
        "editionPublishedYear": edition_year,
        "legalContributors": contributors,
        "rightsEvidence": list(entry["rightsEvidence"]),
        "rightsBasis": str(entry["rightsBasis"]),
        "selectedAt": released_at,
        "releaseVersion": version,
        "curation": {"mode": CURATION_MODE, "source": CURATION_SOURCE, "collection": "christian-classics"}
    })
    return {
        "workId": work_id,
        "version": version,
        "title": title,
        "localPath": str(epub_stage.relative_to(ROOT)),
        "r2Key": r2_key,
        "sizeBytes": len(epub_raw),
        "sha256": epub_hash
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest manifest-pinned public-domain Christian classics from Internet Archive/Open Library.")
    parser.add_argument("--items", required=True, help="Comma/space-separated Internet Archive item identifiers from the curated manifest")
    parser.add_argument("--max-books", type=int, default=10)
    args = parser.parse_args()

    requested = parse_items(args.items)
    max_books = max(0, min(args.max_books, 20))
    manifest = load_manifest()
    by_item = {str(entry["itemId"]): entry for entry in manifest["entries"]}
    unknown = [item for item in requested if item not in by_item]
    if unknown:
        raise ValueError(f"unapproved Internet Archive item(s): {', '.join(unknown)}")

    if engine.STAGING_ROOT.exists():
        shutil.rmtree(engine.STAGING_ROOT)
    engine.STAGING_ROOT.mkdir(parents=True, exist_ok=True)
    ledger = engine.load_ledger()
    ledger.setdefault("policy", {})["sourcePolicy"] = (
        "Project Gutenberg machine-readable metadata/source EPUBs for general acquisition; "
        "manifest-pinned Internet Archive/Open Library historical editions for explicit curated acquisition."
    )
    known_items = known_ia_items(ledger)
    known_work_keys = standard.existing_work_keys(ledger)
    added: list[dict[str, Any]] = []
    skips: list[dict[str, Any]] = []

    for position, item_id in enumerate(requested, start=1):
        if len(added) >= max_books:
            break
        entry = by_item[item_id]
        if item_id in known_items:
            engine.log(f"[skip:existing:ia] position={position} {item_id}")
            continue
        logical_key = standard.canonical_work_key(str(entry["title"]), authors_display(list(entry["creativeContributors"])))
        if logical_key and logical_key in known_work_keys:
            engine.log(f"[skip:duplicate:ia] position={position} {item_id} — {entry['title']}")
            continue

        engine.log(f"[candidate:ia] position={position} {item_id} — {entry['title']}")
        try:
            payload = engine.request_json(f"{IA_METADATA_ROOT}/{urllib.parse.quote(item_id, safe='')}")
            checked = validate_live_metadata(entry, payload)
            epub_file = checked["epub"]
            epub_name = str(epub_file["name"])
            epub_url = source_url(item_id, epub_name)
            epub_raw = engine.request_bytes(epub_url, timeout=180, accept="application/epub+zip, application/octet-stream")
            engine.validate_epub(epub_raw)
            expected_size = epub_file.get("size")
            if expected_size not in (None, "") and int(expected_size) != len(epub_raw):
                raise ValueError(f"Internet Archive EPUB size mismatch: metadata={expected_size}, downloaded={len(epub_raw)}")
            artifact = materialize(entry, payload, epub_raw, epub_url, ledger)
            artifact["curatedPosition"] = position
            added.append(artifact)
            known_items.add(item_id)
            if logical_key:
                known_work_keys.add(logical_key)
            engine.log(f"[add:ia] {artifact['workId']} — {artifact['title']} ({artifact['sizeBytes']} bytes)")
            time.sleep(0.2)
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            engine.log(f"[skip:error:ia] {item_id}: {reason}")
            rejection = {
                "internetArchiveId": item_id,
                "title": entry["title"],
                "reason": reason,
                "checkedAt": engine.utc_now(),
                "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
                "curationMode": CURATION_MODE
            }
            skips.append(rejection)
            ledger.setdefault("rejections", {})[f"ia:{item_id}"] = rejection

    ledger["lastRun"] = {
        "at": engine.utc_now(),
        "rankingMode": CURATION_MODE,
        "curationSource": CURATION_SOURCE,
        "collection": "christian-classics",
        "requestedInternetArchiveItems": requested,
        "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
        "addedCount": len(added),
        "skippedCount": len(skips),
        "recentSkips": skips[:100]
    }
    engine.json_dump(engine.LEDGER_PATH, ledger)
    engine.json_dump(engine.STAGING_ROOT / "artifacts.json", added)
    engine.set_github_output("added_count", str(len(added)))
    engine.set_github_output("work_ids", ",".join(item["workId"] for item in added))
    engine.set_github_output("ranking_mode", CURATION_MODE)
    engine.log(f"[curated:ia] complete: {len(added)} added, {len(skips)} skipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
