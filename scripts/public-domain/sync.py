#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import html
import io
import json
import math
import os
import re
import shutil
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
WORKS_ROOT = ROOT / "src/content/works"
RELEASES_ROOT = ROOT / "src/publications/releases"
LEDGER_PATH = ROOT / "src/publications/public-domain-ledger.json"
COVERS_ROOT = ROOT / "public/covers/public-domain"
STAGING_ROOT = ROOT / ".public-domain-staging"

GUTENDEX_URL = "https://gutendex.com/books/"
PG_CATALOG_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz"
PG_CACHE_ROOT = "https://www.gutenberg.org/cache/epub"
PG_EBOOK_ROOT = "https://www.gutenberg.org/ebooks"
MEDIA_ORIGIN = "https://thiepn.dev/library/media/"
USER_AGENT = "THIEPN-Library-Public-Domain-Autopilot/1.0 (+https://thiepn.dev/library/)"

# In Germany, the ordinary term is 70 years after the author's death and expires
# at the end of the calendar year. In calendar year Y, a normal-term work by a
# contributor who died in Y-71 or earlier is therefore out of copyright.
COPYRIGHT_CUTOFF_YEAR = date.today().year - 71

# Creative MARC relator codes whose term can independently matter to a hosted edition.
# Unknown death year for any detected protected contributor makes the candidate fail closed.
PROTECTED_ROLES = {
    "creator", "aut", "author",
    "trl", "translator",
    "ill", "illustrator",
    "art", "artist",
    "edt", "editor",
    "aui", "author-of-introduction",
    "ann", "annotator",
    "adp", "adapter",
    "arr", "arranger",
    "cmp", "composer",
    "cwt", "commentator-for-written-text",
    "lyr", "lyricist",
    "com", "compiler",
    "drt", "director",
    "pht", "photographer",
}

QUALITY_BOOKSHELVES = {
    "Best Books Ever Listings": 120,
    "Harvard Classics": 105,
    "Classics of Literature": 100,
    "Great Books of the Western World": 100,
    "Banned Books from Anne Haight's library": 70,
    "Children's Literature": 35,
    "Science Fiction": 25,
    "Gothic Fiction": 25,
    "Historical Fiction": 20,
}

LOW_VALUE_TITLE_PATTERNS = [
    r"\bindex\b",
    r"\bcatalog(?:ue)?\b",
    r"\bbibliograph(?:y|ies)\b",
    r"\bmagazine\b",
    r"\bjournal\b",
    r"\bperiodical\b",
    r"\bnewsletter\b",
    r"\bminutes of\b",
    r"\bproceedings of\b",
    r"\bannual report\b",
    r"\bdirectory\b",
]


@dataclass
class Contributor:
    name: str
    role: str
    birth_year: int | None
    death_year: int | None


@dataclass
class Candidate:
    gutenberg_id: int
    title: str
    language: str
    authors: list[dict[str, Any]]
    subjects: list[str]
    bookshelves: list[str]
    download_count: int
    copyright: bool | None
    formats: dict[str, str]
    summary: str
    score: float


def log(message: str) -> None:
    print(message, flush=True)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def slugify(value: str, fallback: str = "book") -> str:
    text = value.lower()
    text = re.sub(r"[’'`]", "", text)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:80].strip("-") or fallback


def json_dump(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def request_bytes(url: str, *, timeout: int = 45, accept: str = "*/*") -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": accept,
            "Accept-Encoding": "identity",
        },
    )
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            last_error = exc
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def request_json(url: str) -> dict[str, Any]:
    return json.loads(request_bytes(url, accept="application/json").decode("utf-8"))


def local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    if ":" in tag:
        return tag.rsplit(":", 1)[1]
    return tag


def parse_int(text: str | None) -> int | None:
    if not text:
        return None
    match = re.search(r"-?\d{1,4}", text)
    if not match:
        return None
    try:
        return int(match.group(0))
    except ValueError:
        return None


def normalize_author_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name).strip()
    if "," in name:
        family, given = [part.strip() for part in name.split(",", 1)]
        if family and given and not re.search(r"\d", given):
            return f"{given} {family}"
    return name


def author_display(authors: list[dict[str, Any]]) -> str:
    names = [normalize_author_name(str(a.get("name", "")).strip()) for a in authors if a.get("name")]
    return ", ".join(names[:3]) if names else "Unknown author"


def is_low_value_title(title: str) -> bool:
    return any(re.search(pattern, title, re.I) for pattern in LOW_VALUE_TITLE_PATTERNS)


def quality_score(book: dict[str, Any]) -> float:
    title = str(book.get("title", ""))
    if not title or is_low_value_title(title):
        return -1_000_000

    downloads = int(book.get("download_count") or 0)
    score = math.log10(max(downloads, 1) + 1) * 25.0

    bookshelves = [str(x) for x in book.get("bookshelves") or []]
    for shelf, bonus in QUALITY_BOOKSHELVES.items():
        if any(shelf.casefold() == candidate.casefold() for candidate in bookshelves):
            score += bonus

    subjects = [str(x) for x in book.get("subjects") or []]
    subject_blob = " ".join(subjects).casefold()
    if "fiction" in subject_blob:
        score += 8
    if any(term in subject_blob for term in ("philosophy", "ethics", "religion", "science", "mathematics", "history")):
        score += 10
    if book.get("authors"):
        score += 8
    return score


def discover_gutendex(pages: int) -> list[Candidate]:
    candidates: list[Candidate] = []
    url = f"{GUTENDEX_URL}?languages=en&sort=popular"
    for page in range(max(1, pages)):
        if not url:
            break
        data = request_json(url)
        for book in data.get("results") or []:
            gid = int(book.get("id") or 0)
            if gid <= 0:
                continue
            languages = [str(x) for x in book.get("languages") or []]
            language = languages[0] if languages else "en"
            summaries = book.get("summaries") or []
            summary = str(summaries[0]).strip() if summaries else ""
            candidate = Candidate(
                gutenberg_id=gid,
                title=str(book.get("title") or "").strip(),
                language=language,
                authors=list(book.get("authors") or []),
                subjects=[str(x) for x in book.get("subjects") or []],
                bookshelves=[str(x) for x in book.get("bookshelves") or []],
                download_count=int(book.get("download_count") or 0),
                copyright=book.get("copyright") if isinstance(book.get("copyright"), bool) else None,
                formats={str(k): str(v) for k, v in (book.get("formats") or {}).items()},
                summary=summary,
                score=quality_score(book),
            )
            if candidate.score > -100_000:
                candidates.append(candidate)
        next_url = data.get("next")
        url = str(next_url) if next_url else ""
        if page < pages - 1:
            time.sleep(0.35)
    candidates.sort(key=lambda c: (-c.score, -c.download_count, c.gutenberg_id))
    return candidates


def parse_lifespan_author(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    years = re.findall(r"(-?\d{3,4})", raw)
    birth = int(years[-2]) if len(years) >= 2 else None
    death = int(years[-1]) if years else None
    name = re.sub(r",?\s*-?\d{3,4}\s*-\s*-?\d{0,4}\s*$", "", raw).strip()
    return {"name": name or raw, "birth_year": birth, "death_year": death}


def discover_official_catalog(limit: int = 2500) -> list[Candidate]:
    # Fallback discovery from Project Gutenberg's official machine-readable catalog.
    raw = gzip.decompress(request_bytes(PG_CATALOG_URL, timeout=90))
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows: list[Candidate] = []
    for record in reader:
        if len(rows) >= limit:
            break
        if (record.get("Type") or "").casefold() != "text":
            continue
        languages = (record.get("Language") or "").split(";")
        if "en" not in [x.strip().casefold() for x in languages]:
            continue
        title = (record.get("Title") or "").strip()
        if not title or is_low_value_title(title):
            continue
        shelves = [x.strip() for x in (record.get("Bookshelves") or "").split(";") if x.strip()]
        subjects = [x.strip() for x in (record.get("Subjects") or "").split(";") if x.strip()]
        shelf_bonus = max(
            [bonus for shelf, bonus in QUALITY_BOOKSHELVES.items() if any(shelf.casefold() == x.casefold() for x in shelves)]
            or [0]
        )
        if shelf_bonus == 0:
            continue
        author_rows = [parse_lifespan_author(x) for x in (record.get("Authors") or "").split(";") if x.strip()]
        gid = int(record.get("Text#") or 0)
        if gid <= 0:
            continue
        rows.append(Candidate(
            gutenberg_id=gid,
            title=title,
            language="en",
            authors=author_rows,
            subjects=subjects,
            bookshelves=shelves,
            download_count=0,
            copyright=None,
            formats={},
            summary="",
            score=float(shelf_bonus + (8 if author_rows else 0)),
        ))
    rows.sort(key=lambda c: (-c.score, c.gutenberg_id))
    return rows


def discover_candidates(pages: int) -> list[Candidate]:
    try:
        log(f"[discover] Gutendex popularity discovery: {pages} page(s)")
        candidates = discover_gutendex(pages)
        if candidates:
            return candidates
    except Exception as exc:
        log(f"[discover] Gutendex unavailable: {exc}; falling back to official Project Gutenberg catalog")
    return discover_official_catalog()


def find_ebook_node(root: ET.Element) -> ET.Element:
    for element in root.iter():
        if local_name(element.tag) == "ebook":
            return element
    raise ValueError("Project Gutenberg RDF does not contain pgterms:ebook")


def extract_agent(element: ET.Element, role: str) -> Contributor | None:
    agent = next((node for node in element.iter() if local_name(node.tag) == "agent"), None)
    if agent is None:
        return None
    name = ""
    birth: int | None = None
    death: int | None = None
    for node in agent.iter():
        lname = local_name(node.tag)
        if lname == "name" and node.text and not name:
            name = node.text.strip()
        elif lname == "birthdate":
            birth = parse_int(node.text)
        elif lname == "deathdate":
            death = parse_int(node.text)
    if not name:
        return None
    return Contributor(normalize_author_name(name), role, birth, death)


def rdf_metadata(gutenberg_id: int) -> tuple[dict[str, Any], bytes]:
    url = f"{PG_CACHE_ROOT}/{gutenberg_id}/pg{gutenberg_id}.rdf"
    raw = request_bytes(url, accept="application/rdf+xml, application/xml, text/xml")
    root = ET.fromstring(raw)
    ebook = find_ebook_node(root)

    title = ""
    issued = ""
    language = ""
    rights = ""
    subjects: list[str] = []
    bookshelves: list[str] = []
    contributors: list[Contributor] = []

    for child in list(ebook):
        role = local_name(child.tag).casefold()
        text = "".join(child.itertext()).strip()
        if role == "title" and text and not title:
            title = text
        elif role == "issued" and text and not issued:
            issued = text
        elif role == "language" and text and not language:
            language = text
        elif role == "rights" and text and not rights:
            rights = text
        elif role == "subject":
            value_nodes = [n for n in child.iter() if local_name(n.tag) == "value" and n.text]
            for n in value_nodes:
                value = n.text.strip()
                if value and value not in subjects:
                    subjects.append(value)
        elif role == "bookshelf":
            value_nodes = [n for n in child.iter() if local_name(n.tag) == "value" and n.text]
            for n in value_nodes:
                value = n.text.strip()
                if value and value not in bookshelves:
                    bookshelves.append(value)

        if role in PROTECTED_ROLES:
            contributor = extract_agent(child, role)
            if contributor:
                contributors.append(contributor)

    unique: dict[tuple[str, str], Contributor] = {}
    for contributor in contributors:
        key = (contributor.name.casefold(), contributor.role)
        existing = unique.get(key)
        if not existing or (existing.death_year is None and contributor.death_year is not None):
            unique[key] = contributor

    return {
        "title": title,
        "issued": issued,
        "language": language,
        "rights": rights,
        "subjects": subjects,
        "bookshelves": bookshelves,
        "contributors": list(unique.values()),
        "rdf_url": url,
    }, raw


def legal_gate(candidate: Candidate, meta: dict[str, Any]) -> tuple[bool, str]:
    if candidate.copyright is True:
        return False, "Project Gutenberg metadata marks the title as copyrighted"

    contributors: list[Contributor] = meta.get("contributors") or []
    if not contributors:
        return False, "no creative contributors found in official RDF"
    if not any(c.role in {"creator", "aut", "author"} for c in contributors):
        return False, "no identifiable creator in official RDF"

    for contributor in contributors:
        if contributor.death_year is None:
            return False, f"unknown death year for {contributor.role} {contributor.name}"
        if contributor.death_year > COPYRIGHT_CUTOFF_YEAR:
            return False, (
                f"{contributor.role} {contributor.name} died {contributor.death_year}, "
                f"after automatic German cutoff {COPYRIGHT_CUTOFF_YEAR}"
            )

    rights = str(meta.get("rights") or "").casefold()
    if rights and "copyright" in rights and "public domain" not in rights:
        return False, f"ambiguous Project Gutenberg rights statement: {meta.get('rights')}"

    return True, "all detected creative contributors pass the ordinary German 70-year term gate"


def validate_epub(raw: bytes) -> None:
    if len(raw) < 1024 or not raw.startswith(b"PK"):
        raise ValueError("download is not a plausible EPUB ZIP")
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = set(zf.namelist())
        if "mimetype" not in names or "META-INF/container.xml" not in names:
            raise ValueError("EPUB is missing mimetype or META-INF/container.xml")
        mimetype = zf.read("mimetype").decode("ascii", errors="replace").strip()
        if mimetype != "application/epub+zip":
            raise ValueError(f"unexpected EPUB mimetype: {mimetype!r}")


def epub_urls(candidate: Candidate) -> Iterable[str]:
    gid = candidate.gutenberg_id
    yield f"{PG_CACHE_ROOT}/{gid}/pg{gid}.epub"
    preferred: list[str] = []
    fallback: list[str] = []
    for mime, url in candidate.formats.items():
        if mime != "application/epub+zip":
            continue
        lowered = url.casefold()
        if "noimages" in lowered or f"pg{gid}.epub" in lowered:
            preferred.append(url)
        else:
            fallback.append(url)
    for url in preferred:
        yield url
    for url in fallback:
        yield url


def download_epub(candidate: Candidate) -> tuple[bytes, str]:
    seen: set[str] = set()
    errors: list[str] = []
    for url in epub_urls(candidate):
        if not url or url in seen:
            continue
        seen.add(url)
        try:
            raw = request_bytes(url, timeout=90, accept="application/epub+zip, application/octet-stream")
            validate_epub(raw)
            return raw, url
        except Exception as exc:
            errors.append(f"{url}: {exc}")
            time.sleep(0.4)
    raise RuntimeError("no usable EPUB: " + " | ".join(errors[-3:]))


def clean_summary(candidate: Candidate, meta: dict[str, Any], author: str) -> str:
    summary = re.sub(r"\s+", " ", candidate.summary or "").strip()
    if summary:
        return summary[:420].rstrip(" .") + ("." if len(summary) <= 420 else "…")
    subjects = [s for s in (meta.get("subjects") or candidate.subjects) if s][:3]
    if subjects:
        subject_text = ", ".join(subjects)
        return f"A public-domain edition of {candidate.title} by {author}. Project Gutenberg classifies it under {subject_text}."
    return f"A public-domain edition of {candidate.title} by {author}, sourced from Project Gutenberg."


def make_cover_svg(title: str, author: str) -> str:
    def lines(text: str, max_chars: int, max_lines: int) -> list[str]:
        words = text.split()
        output: list[str] = []
        current = ""
        for word in words:
            test = f"{current} {word}".strip()
            if len(test) <= max_chars or not current:
                current = test
            else:
                output.append(current)
                current = word
                if len(output) >= max_lines - 1:
                    break
        if current and len(output) < max_lines:
            output.append(current)
        if len(output) == max_lines and len(" ".join(output)) < len(text):
            output[-1] = output[-1].rstrip(" .") + "…"
        return output

    title_lines = lines(title, 27, 5)
    author_lines = lines(author, 34, 2)
    title_markup = "\n".join(
        f'<text x="80" y="{300 + i * 76}" class="title">{html.escape(line)}</text>'
        for i, line in enumerate(title_lines)
    )
    author_start = 790
    author_markup = "\n".join(
        f'<text x="80" y="{author_start + i * 42}" class="author">{html.escape(line)}</text>'
        for i, line in enumerate(author_lines)
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200" role="img" aria-labelledby="title desc">
  <title id="title">{html.escape(title)} — {html.escape(author)}</title>
  <desc id="desc">Library cover for the public-domain edition.</desc>
  <rect width="800" height="1200" fill="#171714"/>
  <rect x="44" y="44" width="712" height="1112" rx="8" fill="none" stroke="#e9e4d4" stroke-width="2"/>
  <text x="80" y="120" class="kicker">THIEPN LIBRARY · PUBLIC DOMAIN</text>
  <line x1="80" x2="720" y1="164" y2="164" stroke="#e9e4d4" stroke-width="2"/>
  {title_markup}
  <line x1="80" x2="220" y1="742" y2="742" stroke="#e9e4d4" stroke-width="2"/>
  {author_markup}
  <text x="80" y="1090" class="source">PROJECT GUTENBERG SOURCE EDITION</text>
  <style>
    .kicker,.source{{fill:#b9b3a1;font:600 20px system-ui,sans-serif;letter-spacing:3px}}
    .title{{fill:#f5f0df;font:700 56px Georgia,serif}}
    .author{{fill:#d8d1bc;font:400 30px Georgia,serif}}
  </style>
</svg>
"""


def taxonomy_subjects(subjects: list[str]) -> list[str]:
    result: list[str] = []
    for raw in subjects[:8]:
        head = re.split(r"--|;", raw)[0].strip()
        slug = slugify(head, "")
        if slug and slug not in result:
            result.append(slug)
        if len(result) >= 5:
            break
    return result or ["classics"]


def collection_slugs(bookshelves: list[str]) -> list[str]:
    result = ["public-domain"]
    for shelf in bookshelves:
        if shelf in QUALITY_BOOKSHELVES:
            slug = slugify(shelf)
            if slug not in result:
                result.append(slug)
    return result[:4]


def load_ledger() -> dict[str, Any]:
    if LEDGER_PATH.exists():
        try:
            value = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
            if isinstance(value, dict):
                value.setdefault("schemaVersion", 1)
                value.setdefault("entries", [])
                value.setdefault("rejections", {})
                return value
        except Exception:
            pass
    return {
        "schemaVersion": 1,
        "policy": {
            "jurisdiction": "Germany",
            "ordinaryTerm": "70 years after death, calculated to the end of the calendar year",
            "uncertaintyPolicy": "fail-closed",
            "sourcePolicy": "Project Gutenberg machine-readable metadata and source EPUBs; text-only EPUB preferred",
        },
        "entries": [],
        "rejections": {},
    }


def existing_pg_ids(ledger: dict[str, Any]) -> set[int]:
    ids: set[int] = set()
    for entry in ledger.get("entries") or []:
        try:
            ids.add(int(entry.get("gutenbergId")))
        except Exception:
            pass
    for path in WORKS_ROOT.glob("pd-pg-*"):
        match = re.fullmatch(r"pd-pg-(\d+)", path.name)
        if match:
            ids.add(int(match.group(1)))
    return ids


def source_issue_date(meta: dict[str, Any]) -> str:
    raw = str(meta.get("issued") or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        return raw
    if re.fullmatch(r"\d{4}", raw):
        return f"{raw}-01-01"
    return date.today().isoformat()


def materialize(candidate: Candidate, meta: dict[str, Any], rdf_raw: bytes, epub_raw: bytes, epub_url: str, ledger: dict[str, Any]) -> dict[str, Any]:
    gid = candidate.gutenberg_id
    work_id = f"pd-pg-{gid}"
    author = author_display(candidate.authors)
    if author == "Unknown author":
        creators: list[Contributor] = [c for c in meta.get("contributors", []) if c.role in {"creator", "aut", "author"}]
        if creators:
            author = ", ".join(c.name for c in creators[:3])

    title = str(meta.get("title") or candidate.title).strip() or candidate.title
    epub_hash = sha256_bytes(epub_raw)
    version = f"pg-{gid}-{epub_hash[:12]}"
    filename = f"{slugify(title)}-project-gutenberg.epub"
    released_at = utc_now()
    source_issued = source_issue_date(meta)
    description = clean_summary(candidate, meta, author)
    short_description = description if len(description) <= 180 else description[:177].rstrip() + "…"

    cover_rel = f"/covers/public-domain/{work_id}.svg"
    cover_path = COVERS_ROOT / f"{work_id}.svg"
    cover_path.parent.mkdir(parents=True, exist_ok=True)
    cover_path.write_text(make_cover_svg(title, author), encoding="utf-8")

    contributors: list[dict[str, Any]] = []
    for c in meta.get("contributors") or []:
        contributors.append({
            "name": c.name,
            "role": c.role,
            **({"birthYear": c.birth_year} if c.birth_year is not None else {}),
            **({"deathYear": c.death_year} if c.death_year is not None else {}),
        })

    work = {
        "schemaVersion": 1,
        "id": work_id,
        "slug": work_id,
        "title": title,
        "type": "book",
        "language": candidate.language or "en",
        "contributors": contributors,
        "description": description,
        "shortDescription": short_description,
        "status": "published",
        "visibility": "public",
        "publication": {
            "firstPublished": source_issued,
            "lastUpdated": date.today().isoformat(),
            "edition": 1,
            "editionLabel": "Project Gutenberg public-domain edition",
            "version": version,
            "activeRelease": version,
        },
        "cover": {
            "src": cover_rel,
            "alt": f"Cover for {title} by {author}",
        },
        "classification": {
            "subjects": taxonomy_subjects(meta.get("subjects") or candidate.subjects),
            "tags": ["public-domain", "project-gutenberg", "classic"],
            "collections": collection_slugs(meta.get("bookshelves") or candidate.bookshelves),
        },
        "parts": [],
        "formats": {
            "web": {"enabled": False},
            "pdf": {"enabled": False},
            "epub": {"enabled": True},
        },
        "relationships": {"relatedWorks": [], "prerequisites": []},
        "resources": [
            {
                "type": "source",
                "label": "Project Gutenberg",
                "url": f"{PG_EBOOK_ROOT}/{gid}",
                "gutenbergId": gid,
            },
            {
                "type": "provenance",
                "label": "Official Project Gutenberg RDF metadata",
                "url": meta.get("rdf_url"),
            },
        ],
        "rights": {
            "status": "Public domain — automated Germany/EU ordinary-term gate passed",
            "notice": (
                f"Source edition: Project Gutenberg #{gid}. The Library's automated rights gate "
                f"found all detected creative contributors in the official Project Gutenberg RDF "
                f"to have died in {COPYRIGHT_CUTOFF_YEAR} or earlier, satisfying the ordinary "
                f"German 70-year post-mortem term for calendar year {date.today().year}. "
                f"Uncertain candidates are not published automatically. The EPUB is retained as "
                f"a Project Gutenberg source edition, including its embedded notices and terms."
            ),
        },
    }

    work_dir = WORKS_ROOT / work_id
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    json_dump(work_dir / "work.yaml", work)

    r2_key = f"works/{work_id}/editions/{version}/{filename}"
    release = {
        "schemaVersion": 1,
        "workId": work_id,
        "version": version,
        "edition": 1,
        "releasedAt": released_at,
        "sourceHash": sha256_bytes(rdf_raw),
        "artifacts": {
            "epub": {
                "url": MEDIA_ORIGIN + r2_key,
                "filename": filename,
                "mimeType": "application/epub+zip",
                "sizeBytes": len(epub_raw),
                "sha256": epub_hash,
            }
        },
    }
    release_dir = RELEASES_ROOT / work_id
    release_dir.mkdir(parents=True, exist_ok=True)
    json_dump(release_dir / f"{version}.yaml", release)

    stage_dir = STAGING_ROOT / work_id
    stage_dir.mkdir(parents=True, exist_ok=True)
    epub_stage = stage_dir / filename
    epub_stage.write_bytes(epub_raw)

    legal_contributors = [
        {
            "name": c.name,
            "role": c.role,
            "birthYear": c.birth_year,
            "deathYear": c.death_year,
        }
        for c in (meta.get("contributors") or [])
    ]
    entry = {
        "gutenbergId": gid,
        "workId": work_id,
        "title": title,
        "author": author,
        "score": round(candidate.score, 3),
        "downloadCountAtSelection": candidate.download_count,
        "bookshelves": meta.get("bookshelves") or candidate.bookshelves,
        "sourcePage": f"{PG_EBOOK_ROOT}/{gid}",
        "sourceRdf": meta.get("rdf_url"),
        "sourceEpub": epub_url,
        "sourceRdfSha256": sha256_bytes(rdf_raw),
        "sourceEpubSha256": epub_hash,
        "copyrightCutoffYear": COPYRIGHT_CUTOFF_YEAR,
        "legalContributors": legal_contributors,
        "selectedAt": released_at,
        "releaseVersion": version,
    }
    ledger.setdefault("entries", []).append(entry)

    return {
        "workId": work_id,
        "version": version,
        "title": title,
        "localPath": str(epub_stage.relative_to(ROOT)),
        "r2Key": r2_key,
        "sizeBytes": len(epub_raw),
        "sha256": epub_hash,
    }


def set_github_output(key: str, value: str) -> None:
    output = os.getenv("GITHUB_OUTPUT")
    if not output:
        return
    with open(output, "a", encoding="utf-8") as handle:
        handle.write(f"{key}={value}\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Autonomously ingest high-value public-domain Project Gutenberg EPUBs.")
    parser.add_argument("--max-books", type=int, default=3, help="Maximum new books to publish in this run.")
    parser.add_argument("--discovery-pages", type=int, default=12, help="Popularity pages to inspect.")
    args = parser.parse_args()

    max_books = max(0, min(args.max_books, 20))
    if max_books == 0:
        log("[autopilot] max-books=0; nothing to do")
        set_github_output("added_count", "0")
        return 0

    if STAGING_ROOT.exists():
        shutil.rmtree(STAGING_ROOT)
    STAGING_ROOT.mkdir(parents=True, exist_ok=True)

    ledger = load_ledger()
    known = existing_pg_ids(ledger)
    candidates = discover_candidates(max(1, args.discovery_pages))
    log(f"[discover] {len(candidates)} ranked candidates; {len(known)} already known")

    added: list[dict[str, Any]] = []
    skips: list[dict[str, Any]] = []

    for candidate in candidates:
        if len(added) >= max_books:
            break
        gid = candidate.gutenberg_id
        if gid in known:
            continue
        prior_rejection = (ledger.get("rejections") or {}).get(str(gid))
        if isinstance(prior_rejection, dict) and prior_rejection.get("copyrightCutoffYear") == COPYRIGHT_CUTOFF_YEAR:
            continue

        log(f"[candidate] PG#{gid} score={candidate.score:.1f} downloads={candidate.download_count} — {candidate.title}")
        try:
            meta, rdf_raw = rdf_metadata(gid)
            allowed, reason = legal_gate(candidate, meta)
            if not allowed:
                log(f"[skip:rights] PG#{gid}: {reason}")
                rejection = {
                    "gutenbergId": gid,
                    "title": candidate.title,
                    "reason": reason,
                    "checkedAt": utc_now(),
                    "copyrightCutoffYear": COPYRIGHT_CUTOFF_YEAR,
                }
                skips.append(rejection)
                ledger.setdefault("rejections", {})[str(gid)] = rejection
                time.sleep(0.35)
                continue

            epub_raw, epub_url = download_epub(candidate)
            artifact = materialize(candidate, meta, rdf_raw, epub_raw, epub_url, ledger)
            added.append(artifact)
            known.add(gid)
            log(f"[add] {artifact['workId']} — {artifact['title']} ({artifact['sizeBytes']} bytes)")
            time.sleep(0.75)
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            log(f"[skip:error] PG#{gid}: {reason}")
            skips.append({"gutenbergId": gid, "reason": reason})
            time.sleep(0.5)

    ledger["lastRun"] = {
        "at": utc_now(),
        "copyrightCutoffYear": COPYRIGHT_CUTOFF_YEAR,
        "candidateCount": len(candidates),
        "addedCount": len(added),
        "skippedCount": len(skips),
        "recentSkips": skips[:50],
    }
    json_dump(LEDGER_PATH, ledger)
    json_dump(STAGING_ROOT / "artifacts.json", added)

    set_github_output("added_count", str(len(added)))
    set_github_output("work_ids", ",".join(item["workId"] for item in added))
    log(f"[autopilot] complete: {len(added)} added, {len(skips)} skipped in this search window")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
