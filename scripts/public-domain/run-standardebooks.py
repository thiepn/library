#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import html
from functools import lru_cache
import io
import json
import re
import shutil
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from typing import Any

import catalog_metadata
import sync as engine

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "src/publications/curated-canon.tsv"
STAGING_ROOT = ROOT / ".public-domain-staging"
MEDIA_ORIGIN = "https://thiepn.dev/library/media/"
STANDARD_EBOOKS = "https://standardebooks.org"
USER_AGENT = "THIEPN-Library-StandardEbooks/1.0 (+https://thiepn.dev/library/)"
COPYRIGHT_CUTOFF_YEAR = 1955

# Canonical detail-page hints for important works whose public display title,
# translator-specific edition slug, or original-language title prevents reliable
# discovery through the Standard Ebooks search UI. Hints are still subjected to
# EPUB contributor parsing and the same German rights gate as discovered works.
SOURCE_HINTS: dict[tuple[str, str], str] = {
    ("the hunchback of notre dame", "hugo"): "https://standardebooks.org/ebooks/victor-hugo/notre-dame-de-paris/isabel-f-hapgood",
    ("to the lighthouse", "woolf"): "https://standardebooks.org/ebooks/virginia-woolf/to-the-lighthouse",
    ("orlando", "woolf"): "https://standardebooks.org/ebooks/virginia-woolf/orlando",
    ("the portrait of a lady", "james"): "https://standardebooks.org/ebooks/henry-james/the-portrait-of-a-lady",
    ("notes from underground", "dostoevsky"): "https://standardebooks.org/ebooks/fyodor-dostoevsky/notes-from-underground/constance-garnett",
    ("the idiot", "dostoevsky"): "https://standardebooks.org/ebooks/fyodor-dostoevsky/the-idiot/eva-m-martin",
    ("demons", "dostoevsky"): "https://standardebooks.org/ebooks/fyodor-dostoevsky/demons/constance-garnett",
    ("the cherry orchard", "chekhov"): "https://standardebooks.org/ebooks/anton-chekhov/the-cherry-orchard/constance-garnett",
    ("on the origin of species", "darwin"): "https://standardebooks.org/ebooks/charles-darwin/the-origin-of-species",
}

CREATIVE_ROLES = {"author", "creator", "aut", "translator", "trl", "illustrator", "ill", "editor", "edt"}
ROLE_MAP = {
    "aut": "author",
    "author": "author",
    "creator": "author",
    "trl": "translator",
    "translator": "translator",
    "ill": "illustrator",
    "illustrator": "illustrator",
    "edt": "editor",
    "editor": "editor",
}


@dataclass(frozen=True)
class CanonItem:
    title: str
    author: str
    collection: str
    rights_mode: str
    position: int


class AnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.casefold() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self._href = href
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() == "a" and self._href is not None:
            text = re.sub(r"\s+", " ", "".join(self._text)).strip()
            self.links.append((self._href, text))
            self._href = None
            self._text = []


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def request_bytes(url: str, *, timeout: int = 90, accept: str = "*/*") -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": accept,
            "Accept-Encoding": "identity",
        },
    )
    last: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except Exception as exc:
            last = exc
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"request failed for {url}: {last}")


def request_text(url: str, *, timeout: int = 60) -> str:
    return request_bytes(url, timeout=timeout, accept="text/html,application/xhtml+xml").decode("utf-8", errors="replace")


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.casefold())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize(value)).strip("-")


def load_catalog() -> list[CanonItem]:
    result: list[CanonItem] = []
    with CATALOG_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for position, row in enumerate(reader, start=1):
            result.append(
                CanonItem(
                    title=str(row.get("title") or "").strip(),
                    author=str(row.get("author") or "").strip(),
                    collection=str(row.get("collection") or "").strip(),
                    rights_mode=str(row.get("rightsMode") or "").strip(),
                    position=position,
                )
            )
    return result


def primary_surname(value: str) -> str:
    primary = re.split(r",|\band\b", value, maxsplit=1, flags=re.I)[0].strip()
    return catalog_metadata.author_surname(primary)


def existing_keys() -> set[str]:
    result: set[str] = set()
    for path in engine.WORKS_ROOT.glob("*/work.yaml"):
        try:
            work = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        title = normalize(str(work.get("title") or ""))
        authors = catalog_metadata.author_names(work)
        if title and authors:
            result.add(f"{title}::{primary_surname(authors[0])}")
    return result


def item_key(item: CanonItem) -> str:
    return f"{normalize(item.title)}::{primary_surname(item.author)}"


def author_slug_score(wanted: str, href: str) -> float:
    parts = [part for part in urllib.parse.urlparse(href).path.split("/") if part]
    if len(parts) < 3 or parts[0] != "ebooks":
        return 0.0
    wanted_tokens = set(normalize(wanted).split())
    got_tokens = set(normalize(parts[1]).split())
    if not wanted_tokens or not got_tokens:
        return 0.0
    return len(wanted_tokens & got_tokens) / len(wanted_tokens | got_tokens)


def title_score(wanted: str, candidate: str, href: str) -> float:
    wanted_norm = normalize(wanted)
    candidate_norm = normalize(candidate)
    parts = [part for part in urllib.parse.urlparse(href).path.split("/") if part]
    href_title = normalize(parts[2]) if len(parts) >= 3 else ""
    scores: list[float] = []
    for value in (candidate_norm, href_title):
        if not value:
            continue
        if value == wanted_norm:
            scores.append(1.0)
        elif value.startswith(wanted_norm) or wanted_norm.startswith(value):
            scores.append(0.92)
        else:
            ws, cs = set(wanted_norm.split()), set(value.split())
            scores.append(len(ws & cs) / len(ws | cs) if ws and cs else 0.0)
    return max(scores or [0.0])


def discover_detail_page(item: CanonItem) -> tuple[str, str] | None:
    hinted = SOURCE_HINTS.get((normalize(item.title), primary_surname(item.author)))
    if hinted:
        try:
            request_text(hinted, timeout=45)
            return hinted, "standard-ebooks-explicit-hint"
        except Exception:
            pass

    query = urllib.parse.urlencode(
        {
            "query": f"{item.title} {item.author}",
            "per-page": "48",
            "view": "list",
        }
    )
    page = request_text(f"{STANDARD_EBOOKS}/ebooks?{query}")
    parser = AnchorParser()
    parser.feed(page)

    candidates: dict[str, tuple[float, str]] = {}
    for href, text in parser.links:
        path = urllib.parse.urlparse(href).path
        parts = [part for part in path.split("/") if part]
        if len(parts) < 3 or parts[0] != "ebooks":
            continue
        if parts[-1] in {"downloads", "feeds"}:
            continue
        t_score = title_score(item.title, text, href)
        a_score = author_slug_score(item.author, href)
        score = 0.82 * t_score + 0.18 * a_score
        if score < 0.72:
            continue
        absolute = urllib.parse.urljoin(STANDARD_EBOOKS, href)
        existing = candidates.get(absolute)
        if existing is None or score > existing[0]:
            candidates[absolute] = (score, text)

    if not candidates:
        return None
    ranked = sorted(((score, url, text) for url, (score, text) in candidates.items()), reverse=True)
    if len(ranked) > 1 and ranked[1][0] >= ranked[0][0] - 0.02 and ranked[1][1] != ranked[0][1]:
        return None
    score, url, _ = ranked[0]
    return url, f"standard-ebooks-match={score:.3f}"


def compatible_epub_url(detail_url: str) -> str | None:
    page = request_text(detail_url)
    parser = AnchorParser()
    parser.feed(page)
    candidates: list[str] = []
    for href, _ in parser.links:
        clean = href.split("?", 1)[0]
        lower = clean.casefold()
        if "/dist/" not in lower or not lower.endswith(".epub"):
            continue
        if ".advanced.epub" in lower or ".kepub" in lower:
            continue
        candidates.append(urllib.parse.urljoin(STANDARD_EBOOKS, href))
    if not candidates:
        return None
    candidates.sort(key=lambda value: (".advanced." in value.casefold(), len(value)))
    return candidates[0]


def package_rootfile(epub: zipfile.ZipFile) -> str:
    root = ET.fromstring(epub.read("META-INF/container.xml"))
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] == "rootfile":
            value = str(element.attrib.get("full-path") or "").strip()
            if value:
                return value
    raise ValueError("EPUB has no package rootfile")


def parse_epub_metadata(epub_raw: bytes) -> dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(epub_raw), "r") as epub:
        if "mimetype" not in epub.namelist():
            raise ValueError("EPUB has no mimetype")
        rootfile = package_rootfile(epub)
        package = ET.fromstring(epub.read(rootfile))

    metadata = next((node for node in package.iter() if node.tag.rsplit("}", 1)[-1] == "metadata"), None)
    if metadata is None:
        raise ValueError("EPUB package has no metadata")

    by_id: dict[str, dict[str, Any]] = {}
    title = ""
    language = "en"
    description = ""
    subjects: list[str] = []

    for child in list(metadata):
        local = child.tag.rsplit("}", 1)[-1]
        text = re.sub(r"\s+", " ", "".join(child.itertext())).strip()
        if local == "title" and text and not title:
            title = text
        elif local == "language" and text and language == "en":
            language = text
        elif local == "description" and text and not description:
            description = re.sub(r"<[^>]+>", " ", html.unescape(text))
            description = re.sub(r"\s+", " ", description).strip()
        elif local == "subject" and text:
            subjects.append(text)
        elif local in {"creator", "contributor"} and text:
            ident = str(child.attrib.get("id") or f"person-{len(by_id)+1}")
            by_id[ident] = {
                "name": text,
                "role": "author" if local == "creator" else "contributor",
            }

    for child in list(metadata):
        if child.tag.rsplit("}", 1)[-1] != "meta":
            continue
        prop = str(child.attrib.get("property") or "")
        refines = str(child.attrib.get("refines") or "").lstrip("#")
        value = re.sub(r"\s+", " ", "".join(child.itertext())).strip()
        if prop.endswith("role") and refines in by_id and value:
            by_id[refines]["role"] = ROLE_MAP.get(value.casefold(), value.casefold())

    contributors = list(by_id.values())
    return {
        "title": title,
        "language": language or "en",
        "description": description,
        "subjects": subjects,
        "contributors": contributors,
    }


@lru_cache(maxsize=512)
def wikidata_person_lifespan(name: str) -> tuple[int | None, int | None]:
    if normalize(name) in {"anonymous", "various"}:
        return None, -1000
    params = urllib.parse.urlencode(
        {
            "action": "wbsearchentities",
            "search": name,
            "language": "en",
            "format": "json",
            "limit": "5",
            "type": "item",
        }
    )
    data = catalog_metadata.request_json(f"https://www.wikidata.org/w/api.php?{params}")
    results = data.get("search") if isinstance(data, dict) else []
    qids: list[str] = []
    wanted = normalize(name)
    for result in results if isinstance(results, list) else []:
        if not isinstance(result, dict):
            continue
        label = normalize(str(result.get("label") or ""))
        description = normalize(str(result.get("description") or ""))
        if label == wanted or wanted in label or label in wanted:
            if any(token in description for token in ("writer", "author", "translator", "poet", "philosopher", "theologian", "clergy", "priest", "bishop", "scholar")):
                qids.append(str(result.get("id") or ""))
    qids = [qid for qid in qids if qid.startswith("Q")][:3]
    if not qids:
        return None, None

    params = urllib.parse.urlencode(
        {
            "action": "wbgetentities",
            "ids": "|".join(qids),
            "props": "claims",
            "format": "json",
        }
    )
    data = catalog_metadata.request_json(f"https://www.wikidata.org/w/api.php?{params}")
    entities = data.get("entities") if isinstance(data, dict) else {}
    if not isinstance(entities, dict):
        return None, None

    def extract_year(entity: dict[str, Any], prop: str) -> int | None:
        claims = entity.get("claims") if isinstance(entity.get("claims"), dict) else {}
        values = claims.get(prop) if isinstance(claims, dict) else None
        if not isinstance(values, list):
            return None
        for claim in values:
            try:
                raw = str(claim["mainsnak"]["datavalue"]["value"]["time"])
            except Exception:
                continue
            match = re.match(r"^([+-])(\d{1,16})-", raw)
            if not match:
                continue
            sign, digits = match.groups()
            year = int(digits)
            return -year if sign == "-" else year
        return None

    for qid in qids:
        entity = entities.get(qid)
        if not isinstance(entity, dict):
            continue
        birth = extract_year(entity, "P569")
        death = extract_year(entity, "P570")
        if death is not None:
            return birth, death
    return None, None


def legal_contributors(epub_meta: dict[str, Any], fallback_author: str) -> tuple[bool, list[dict[str, Any]], str]:
    raw = epub_meta.get("contributors") if isinstance(epub_meta.get("contributors"), list) else []
    relevant: list[dict[str, Any]] = []
    authors_present = False

    for person in raw:
        if not isinstance(person, dict):
            continue
        name = str(person.get("name") or "").strip()
        role = ROLE_MAP.get(str(person.get("role") or "").casefold(), str(person.get("role") or "").casefold())
        if not name or role not in {"author", "translator", "illustrator", "editor"}:
            continue
        if role == "author":
            authors_present = True
        birth, death = wikidata_person_lifespan(name)
        relevant.append({"name": name, "role": role, "birthYear": birth, "deathYear": death})
        if death is None:
            return False, relevant, f"unknown death year for {role} {name}"
        if death > COPYRIGHT_CUTOFF_YEAR:
            return False, relevant, f"{role} {name} died {death}, after German cutoff {COPYRIGHT_CUTOFF_YEAR}"

    if not authors_present and fallback_author:
        for name in [part.strip() for part in re.split(r",|\band\b", fallback_author) if part.strip()]:
            birth, death = wikidata_person_lifespan(name)
            relevant.append({"name": name, "role": "author", "birthYear": birth, "deathYear": death})
            if death is None:
                return False, relevant, f"unknown death year for author {name}"
            if death > COPYRIGHT_CUTOFF_YEAR:
                return False, relevant, f"author {name} died {death}, after German cutoff {COPYRIGHT_CUTOFF_YEAR}"

    if not relevant:
        return False, relevant, "no identifiable creative contributors"
    return True, relevant, "all creative contributors pass German ordinary-term cutoff"


def materialize(
    item: CanonItem,
    detail_url: str,
    epub_url: str,
    epub_raw: bytes,
    epub_meta: dict[str, Any],
    legal_people: list[dict[str, Any]],
    ledger: dict[str, Any],
) -> dict[str, Any]:
    source_key = urllib.parse.urlparse(detail_url).path.removeprefix("/ebooks/").strip("/")
    work_id = f"pd-se-{slugify(source_key)}"
    if len(work_id) > 180:
        work_id = f"pd-se-{hashlib.sha256(source_key.encode()).hexdigest()[:20]}"

    title = item.title
    author = item.author
    epub_hash = sha256_bytes(epub_raw)
    version = f"se-{epub_hash[:12]}"
    filename = f"{slugify(title)}.epub"
    released_at = utc_now()

    description = re.sub(r"\s+", " ", str(epub_meta.get("description") or "")).strip()
    if len(description) < 80:
        description = f"{title} by {author} is a classic work presented in a clean digital edition for reading in the THIEPN Library."
    if len(description) > 1000:
        description = description[:997].rstrip() + "…"
    short_description = description if len(description) <= 190 else description[:187].rstrip() + "…"

    contributors: list[dict[str, Any]] = []
    for person in legal_people:
        contributors.append({key: value for key, value in person.items() if value is not None})
    if not any(person.get("role") == "author" for person in contributors):
        contributors.insert(0, {"name": author, "role": "author"})

    cover_rel = f"/covers/public-domain/{work_id}.svg"
    cover_path = engine.COVERS_ROOT / f"{work_id}.svg"
    cover_path.parent.mkdir(parents=True, exist_ok=True)
    cover_path.write_text(engine.make_cover_svg(title, author), encoding="utf-8")

    subjects = [slugify(value) for value in (epub_meta.get("subjects") or []) if slugify(value)][:5]
    if not subjects:
        subjects = ["classics"]

    work = {
        "schemaVersion": 1,
        "id": work_id,
        "slug": work_id,
        "title": title,
        "type": "book",
        "language": str(epub_meta.get("language") or "en"),
        "contributors": contributors,
        "description": description,
        "shortDescription": short_description,
        "status": "published",
        "visibility": "public",
        "publication": {
            "firstPublished": "Not verified",
            "lastUpdated": date.today().isoformat(),
            "edition": 1,
            "editionLabel": "THIEPN Library Edition",
            "version": version,
            "activeRelease": version,
        },
        "cover": {"src": cover_rel, "alt": f"Cover of {title} by {author}"},
        "classification": {
            "subjects": subjects,
            "tags": ["public-domain", "classic"],
            "collections": ["public-domain", item.collection],
        },
        "parts": [],
        "formats": {
            "web": {"enabled": False},
            "pdf": {"enabled": False},
            "epub": {"enabled": True},
        },
        "relationships": {"relatedWorks": [], "prerequisites": []},
        "resources": [],
        "rights": {
            "status": "Public domain in Germany",
            "notice": (
                "This Library edition is offered as a public-domain work under German copyright law. "
                "Copyright status can differ in other jurisdictions."
            ),
        },
    }

    work_dir = engine.WORKS_ROOT / work_id
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    engine.json_dump(work_dir / "work.yaml", work)

    release = {
        "schemaVersion": 1,
        "workId": work_id,
        "version": version,
        "edition": 1,
        "releasedAt": released_at,
        "sourceHash": epub_hash,
        "artifacts": {
            "epub": {
                "url": f"{MEDIA_ORIGIN}works/{work_id}/editions/{version}/{filename}",
                "filename": filename,
                "mimeType": "application/epub+zip",
                "sizeBytes": len(epub_raw),
                "sha256": epub_hash,
            }
        },
    }
    release_dir = engine.RELEASES_ROOT / work_id
    release_dir.mkdir(parents=True, exist_ok=True)
    engine.json_dump(release_dir / f"{version}.yaml", release)

    stage_dir = STAGING_ROOT / work_id
    stage_dir.mkdir(parents=True, exist_ok=True)
    stage_path = stage_dir / filename
    stage_path.write_bytes(epub_raw)

    entry = {
        "sourceType": "standard-ebooks",
        "workId": work_id,
        "title": title,
        "author": author,
        "bookshelves": [item.collection, "classic"],
        "sourcePage": detail_url,
        "sourceEpub": epub_url,
        "sourceEpubSha256": epub_hash,
        "copyrightCutoffYear": COPYRIGHT_CUTOFF_YEAR,
        "legalContributors": legal_people,
        "selectedAt": released_at,
        "releaseVersion": version,
        "curation": {
            "mode": "curated-standard-ebooks",
            "requestedPosition": item.position,
            "requestedTitle": item.title,
            "requestedAuthor": item.author,
            "collection": item.collection,
            "rightsMode": item.rights_mode,
        },
    }
    ledger.setdefault("entries", []).append(entry)

    catalog_metadata.update_work(
        work_id,
        preferred_title=item.title,
        preferred_author=item.author if item.author not in {"Anonymous", "Various"} else None,
        collections=[item.collection],
    )

    return {
        "workId": work_id,
        "version": version,
        "title": title,
        "localPath": str(stage_path.relative_to(ROOT)),
        "r2Key": f"works/{work_id}/editions/{version}/{filename}",
        "sizeBytes": len(epub_raw),
        "sha256": epub_hash,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest missing curated classics from Standard Ebooks with German rights verification.")
    parser.add_argument("--max-books", type=int, default=80)
    parser.add_argument("--max-checks", type=int, default=180)
    args = parser.parse_args()

    max_books = max(0, min(args.max_books, 120))
    max_checks = max(max_books, min(args.max_checks, 300))

    if STAGING_ROOT.exists():
        shutil.rmtree(STAGING_ROOT)
    STAGING_ROOT.mkdir(parents=True, exist_ok=True)

    ledger = engine.load_ledger()
    keys = existing_keys()
    existing_source_pages = {
        str(entry.get("sourcePage") or "")
        for entry in ledger.get("entries") or []
        if isinstance(entry, dict)
    }

    added: list[dict[str, Any]] = []
    skips: list[dict[str, Any]] = []
    checked = 0

    for item in load_catalog():
        if len(added) >= max_books or checked >= max_checks:
            break
        if item.rights_mode != "global":
            continue
        if item_key(item) in keys:
            continue

        try:
            match = discover_detail_page(item)
        except Exception as exc:
            skips.append({"title": item.title, "author": item.author, "reason": f"search error: {exc}"})
            continue
        if match is None:
            continue

        detail_url, match_note = match
        if detail_url in existing_source_pages:
            continue
        checked += 1
        print(f"[candidate:se] {item.position} {item.title} — {detail_url}", flush=True)

        try:
            epub_url = compatible_epub_url(detail_url)
            if not epub_url:
                skips.append({"title": item.title, "author": item.author, "sourcePage": detail_url, "reason": "no compatible EPUB link"})
                continue
            epub_raw = request_bytes(epub_url, timeout=180, accept="application/epub+zip,application/octet-stream")
            engine.validate_epub(epub_raw)
            epub_meta = parse_epub_metadata(epub_raw)
            allowed, legal_people, reason = legal_contributors(epub_meta, item.author)
            if not allowed:
                skips.append({"title": item.title, "author": item.author, "sourcePage": detail_url, "reason": reason})
                print(f"[skip:se:rights] {item.title}: {reason}", flush=True)
                continue

            artifact = materialize(item, detail_url, epub_url, epub_raw, epub_meta, legal_people, ledger)
            artifact["sourceMatch"] = match_note
            added.append(artifact)
            keys.add(item_key(item))
            existing_source_pages.add(detail_url)
            print(f"[add:se] {artifact['workId']} — {item.title}", flush=True)
            time.sleep(0.2)
        except Exception as exc:
            skips.append({
                "title": item.title,
                "author": item.author,
                "sourcePage": detail_url,
                "reason": f"{type(exc).__name__}: {exc}",
            })
            print(f"[skip:se:error] {item.title}: {exc}", flush=True)

    ledger.setdefault("policy", {})["sourcePolicy"] = (
        "Reader-facing editions may originate from independently verified public-domain sources. "
        "Source provenance is retained internally; Standard Ebooks production contributions are CC0."
    )
    ledger["lastRun"] = {
        "at": utc_now(),
        "rankingMode": "curated-standard-ebooks",
        "catalog": str(CATALOG_PATH.relative_to(ROOT)),
        "copyrightCutoffYear": COPYRIGHT_CUTOFF_YEAR,
        "checkedCount": checked,
        "candidateCheckLimit": max_checks,
        "addedCount": len(added),
        "skippedCount": len(skips),
        "recentSkips": skips[:300],
    }
    engine.json_dump(engine.LEDGER_PATH, ledger)
    engine.json_dump(STAGING_ROOT / "artifacts.json", added)
    engine.set_github_output("added_count", str(len(added)))
    engine.set_github_output("work_ids", ",".join(str(item["workId"]) for item in added))
    engine.set_github_output("ranking_mode", "curated-standard-ebooks")
    print(f"STANDARD_EBOOKS_CURATED_COMPLETE added={len(added)} skipped={len(skips)} checked={checked}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
