#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
WORKS_ROOT = ROOT / "src/content/works"
USER_AGENT = "THIEPN-Library-Catalog/2.0 (+https://thiepn.dev/library/)"

ROLE_MAP = {
    "creator": "author",
    "aut": "author",
    "author": "author",
    "trl": "translator",
    "translator": "translator",
    "edt": "editor",
    "editor": "editor",
    "ill": "illustrator",
    "illustrator": "illustrator",
}


def request_json(url: str, *, timeout: int = 45) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Accept-Encoding": "identity",
        },
    )
    last: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"request failed: {last}")


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.casefold())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def author_surname(value: str) -> str:
    tokens = normalize(value).split()
    particles = {"jr", "sr", "ii", "iii", "iv"}
    for token in reversed(tokens):
        if token not in particles:
            return token
    return ""


def clean_display_title(value: str) -> str:
    raw = str(value or "").strip()
    if "\n" in raw:
        raw = raw.split("\n", 1)[0].strip()
    raw = raw.replace(" : $b ", ": ").replace(": $b ", ": ").replace(" $b ", " ")
    raw = re.sub(r",\s*Complete\s*$", "", raw, flags=re.I)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw


def author_names(work: dict[str, Any]) -> list[str]:
    result: list[str] = []
    for contributor in work.get("contributors") or []:
        if not isinstance(contributor, dict):
            continue
        role = ROLE_MAP.get(str(contributor.get("role") or "").casefold(), "")
        name = str(contributor.get("name") or "").strip()
        if role == "author" and name:
            result.append(name)
    return result


def normalize_contributors(work: dict[str, Any], preferred_author: str | None = None) -> None:
    contributors: list[dict[str, Any]] = []
    for contributor in work.get("contributors") or []:
        if not isinstance(contributor, dict):
            continue
        item = dict(contributor)
        item["role"] = ROLE_MAP.get(str(item.get("role") or "").casefold(), str(item.get("role") or "contributor"))
        contributors.append(item)

    if preferred_author:
        nonauthors = [item for item in contributors if item.get("role") != "author"]
        existing_authors = [item for item in contributors if item.get("role") == "author"]
        lifespan: dict[str, Any] = {}
        if len(existing_authors) == 1:
            for key in ("birthYear", "deathYear"):
                if key in existing_authors[0]:
                    lifespan[key] = existing_authors[0][key]
        contributors = [{"name": preferred_author, "role": "author", **lifespan}, *nonauthors]

    work["contributors"] = contributors


def openlibrary_match(title: str, author: str) -> dict[str, Any] | None:
    params = urllib.parse.urlencode(
        {
            "title": title,
            "author": author,
            "fields": "key,title,author_name,first_publish_year",
            "limit": "8",
        }
    )
    payload = request_json(f"https://openlibrary.org/search.json?{params}")
    docs = payload.get("docs") if isinstance(payload, dict) else None
    if not isinstance(docs, list):
        return None

    want_title = normalize(title)
    want_surname = author_surname(author)
    best: tuple[float, dict[str, Any]] | None = None
    for doc in docs:
        if not isinstance(doc, dict):
            continue
        candidate_title = normalize(str(doc.get("title") or ""))
        if not candidate_title:
            continue
        title_score = 1.0 if candidate_title == want_title else (
            0.92 if candidate_title.startswith(want_title) or want_title.startswith(candidate_title) else 0.0
        )
        if title_score == 0.0:
            wanted = set(want_title.split())
            got = set(candidate_title.split())
            if wanted and got:
                title_score = len(wanted & got) / len(wanted | got)
        authors = [str(value) for value in (doc.get("author_name") or []) if str(value).strip()]
        author_score = 0.0
        if want_surname and any(want_surname == author_surname(name) for name in authors):
            author_score = 1.0
        score = 0.78 * title_score + 0.22 * author_score
        if best is None or score > best[0]:
            best = (score, doc)
    if best is None or best[0] < 0.72:
        return None
    return best[1]


def gutendex_summary(gutenberg_id: int) -> str | None:
    try:
        data = request_json(f"https://gutendex.com/books/{gutenberg_id}/")
    except Exception:
        return None
    summaries = data.get("summaries") if isinstance(data, dict) else None
    if not isinstance(summaries, list):
        return None
    for raw in summaries:
        summary = re.sub(r"\s+", " ", str(raw)).strip()
        if len(summary) >= 80:
            summary = re.sub(r"\bProject Gutenberg\b", "the source edition", summary, flags=re.I)
            return summary[:1000].rstrip()
    return None


def clean_public_description(text: str) -> str:
    value = re.sub(r"\s+", " ", text or "").strip()
    value = re.sub(r"\bProject Gutenberg(?:-tm)?\b", "the source edition", value, flags=re.I)
    value = re.sub(r"\bGutenberg\b", "the source edition", value, flags=re.I)
    return value


def update_work(
    work_id: str,
    *,
    gutenberg_id: int | None = None,
    preferred_title: str | None = None,
    preferred_author: str | None = None,
    collections: list[str] | None = None,
) -> dict[str, Any]:
    path = WORKS_ROOT / work_id / "work.yaml"
    work = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(work, dict):
        raise ValueError(f"{path} is not an object")

    if preferred_title:
        work["title"] = preferred_title.strip()
    else:
        work["title"] = clean_display_title(str(work.get("title") or ""))
    normalize_contributors(work, preferred_author)

    authors = author_names(work)
    author = preferred_author or (authors[0] if authors else "")
    title = str(work.get("title") or "").strip()

    bibliographic = None
    if title and author:
        try:
            bibliographic = openlibrary_match(title, author)
        except Exception as exc:
            print(f"[metadata:openlibrary:error] {work_id}: {exc}", flush=True)

    if preferred_author is None and isinstance(bibliographic, dict):
        canonical_authors = [
            str(value).strip()
            for value in (bibliographic.get("author_name") or [])
            if str(value).strip()
        ]
        current_authors = author_names(work)
        if len(current_authors) == 1 and canonical_authors:
            current_norm = normalize(current_authors[0])
            canonical_norm = normalize(canonical_authors[0])
            if author_surname(current_authors[0]) == author_surname(canonical_authors[0]) and (
                "," in current_authors[0]
                or any(token in current_norm for token in (" graf ", " emperor ", " abbé ", " abbe "))
                or len(canonical_norm) < len(current_norm)
            ):
                normalize_contributors(work, canonical_authors[0])
                author = canonical_authors[0]

    first_year = bibliographic.get("first_publish_year") if isinstance(bibliographic, dict) else None
    if isinstance(first_year, int) and -4000 < first_year <= date.today().year:
        work.setdefault("publication", {})["firstPublished"] = str(first_year)

    description = ""
    if gutenberg_id is not None:
        description = gutendex_summary(gutenberg_id) or ""
    current = clean_public_description(str(work.get("description") or ""))
    if not description and current and "public-domain edition of" not in current.casefold():
        description = current
    if not description:
        subject_labels = [
            str(item).replace("-", " ")
            for item in ((work.get("classification") or {}).get("subjects") or [])[:3]
        ]
        topics = ", ".join(subject_labels)
        description = (
            f"{title} by {author} is a classic work"
            + (f" exploring {topics}" if topics else "")
            + ". This Library edition presents the work for modern digital reading."
        )
    description = clean_public_description(description)
    work["description"] = description
    work["shortDescription"] = description if len(description) <= 190 else description[:187].rstrip() + "…"

    publication = work.setdefault("publication", {})
    publication["editionLabel"] = "THIEPN Library Edition"
    publication["lastUpdated"] = date.today().isoformat()

    classification = work.setdefault("classification", {})
    tags = [
        str(tag)
        for tag in classification.get("tags") or []
        if str(tag).casefold() not in {"project-gutenberg", "gutenberg"}
    ]
    for tag in ("public-domain", "classic"):
        if tag not in tags:
            tags.append(tag)
    classification["tags"] = tags

    if collections:
        current_collections = [str(value) for value in classification.get("collections") or []]
        for collection in collections:
            if collection not in current_collections:
                current_collections.append(collection)
        classification["collections"] = current_collections

    work["resources"] = []
    rights = work.setdefault("rights", {})
    rights["status"] = "Public domain in Germany"
    rights["notice"] = (
        "This Library edition is offered as a public-domain work under German copyright law. "
        "Copyright status can differ in other jurisdictions."
    )

    cover = work.setdefault("cover", {})
    cover["alt"] = f"Cover of {title}" + (f" by {author}" if author else "")

    path.write_text(json.dumps(work, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"[metadata] {work_id} year={publication.get('firstPublished')} "
        f"title={title!r} author={author!r}",
        flush=True,
    )
    return work
