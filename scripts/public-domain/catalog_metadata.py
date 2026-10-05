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
            "limit": "24",
        }
    )
    payload = request_json(f"https://openlibrary.org/search.json?{params}")
    docs = payload.get("docs") if isinstance(payload, dict) else None
    if not isinstance(docs, list):
        return None

    want_title = normalize(title)
    want_surname = author_surname(author)
    best: tuple[float, dict[str, Any]] | None = None
    matched_years: list[int] = []
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
        first_year = doc.get("first_publish_year")
        if title_score >= 0.90 and author_score == 1.0 and isinstance(first_year, int):
            matched_years.append(first_year)
        if best is None or score > best[0]:
            best = (score, doc)
    if best is None or best[0] < 0.72:
        return None
    result = dict(best[1])
    result["_matched_years"] = sorted(set(matched_years))
    result["_match_score"] = best[0]
    return result


def _year_label_from_wikidata_time(value: str, precision: int | None = None) -> str | None:
    match = re.match(r"^([+-])(\d{1,16})-", str(value or ""))
    if not match:
        return None
    sign, raw_year = match.groups()
    year = int(raw_year)
    if sign == "-":
        if year <= 0:
            return None
        if precision is not None and precision <= 7:
            century = (year + 99) // 100
            return f"c. {century}th century BC"
        return f"{year} BC"
    if year <= 0 or year > date.today().year:
        return None
    if precision is not None and precision <= 7:
        century = (year + 99) // 100
        suffix = "th"
        if century % 10 == 1 and century % 100 != 11:
            suffix = "st"
        elif century % 10 == 2 and century % 100 != 12:
            suffix = "nd"
        elif century % 10 == 3 and century % 100 != 13:
            suffix = "rd"
        return f"{century}{suffix} century"
    return str(year)


def wikidata_publication_label(title: str, author: str) -> str | None:
    surname = author_surname(author)
    query = f"{title} {surname}".strip()
    params = urllib.parse.urlencode(
        {
            "action": "wbsearchentities",
            "search": query,
            "language": "en",
            "format": "json",
            "limit": "8",
            "type": "item",
        }
    )
    payload = request_json(f"https://www.wikidata.org/w/api.php?{params}")
    results = payload.get("search") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        return None

    want_title = normalize(title)
    scored: list[tuple[float, str]] = []
    for result in results:
        if not isinstance(result, dict):
            continue
        qid = str(result.get("id") or "")
        label = normalize(str(result.get("label") or ""))
        description = normalize(str(result.get("description") or ""))
        if not qid.startswith("Q") or not label:
            continue

        if label == want_title:
            title_score = 1.0
        elif label.startswith(want_title) or want_title.startswith(label):
            title_score = 0.88
        else:
            wanted = set(want_title.split())
            got = set(label.split())
            title_score = len(wanted & got) / len(wanted | got) if wanted and got else 0.0

        author_score = 0.25 if surname and re.search(rf"\b{re.escape(surname)}\b", description) else 0.0
        type_score = 0.10 if any(
            token in description
            for token in ("novel", "book", "play", "poem", "treatise", "work", "essay", "dialogue", "scripture")
        ) else 0.0
        score = 0.70 * title_score + author_score + type_score
        if score >= 0.70:
            scored.append((score, qid))

    if not scored:
        return None
    scored.sort(reverse=True)
    ids = [qid for _, qid in scored[:3]]
    params = urllib.parse.urlencode(
        {
            "action": "wbgetentities",
            "ids": "|".join(ids),
            "props": "claims|descriptions",
            "languages": "en",
            "format": "json",
        }
    )
    payload = request_json(f"https://www.wikidata.org/w/api.php?{params}")
    entities = payload.get("entities") if isinstance(payload, dict) else {}
    if not isinstance(entities, dict):
        return None

    for score, qid in scored[:3]:
        entity = entities.get(qid)
        if not isinstance(entity, dict):
            continue
        claims = entity.get("claims") if isinstance(entity.get("claims"), dict) else {}
        dates = claims.get("P577") if isinstance(claims, dict) else None
        if not isinstance(dates, list):
            continue
        labels: list[tuple[int, str]] = []
        for claim in dates:
            try:
                value = claim["mainsnak"]["datavalue"]["value"]
                time_value = str(value.get("time") or "")
                precision = int(value.get("precision")) if value.get("precision") is not None else None
            except Exception:
                continue
            label = _year_label_from_wikidata_time(time_value, precision)
            if not label:
                continue
            sortable = 10**9
            year_match = re.fullmatch(r"(\d{1,4})", label)
            bc_match = re.fullmatch(r"(\d{1,4}) BC", label)
            if year_match:
                sortable = int(year_match.group(1))
            elif bc_match:
                sortable = -int(bc_match.group(1))
            labels.append((sortable, label))
        if labels:
            labels.sort(key=lambda item: item[0])
            return labels[0][1]
    return None


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


def author_death_years(work: dict[str, Any]) -> list[int]:
    years: list[int] = []
    for contributor in work.get("contributors") or []:
        if not isinstance(contributor, dict):
            continue
        role = ROLE_MAP.get(str(contributor.get("role") or "").casefold(), "")
        year = contributor.get("deathYear")
        if role == "author" and isinstance(year, int):
            years.append(year)
    return years


def author_birth_years(work: dict[str, Any]) -> list[int]:
    years: list[int] = []
    for contributor in work.get("contributors") or []:
        if not isinstance(contributor, dict):
            continue
        role = ROLE_MAP.get(str(contributor.get("role") or "").casefold(), "")
        year = contributor.get("birthYear")
        if role == "author" and isinstance(year, int):
            years.append(year)
    return years


def verified_first_publication_year(
    work: dict[str, Any],
    bibliographic: dict[str, Any] | None,
    *,
    title: str,
    author: str,
) -> str:
    births = author_birth_years(work)
    years: list[int] = []
    if isinstance(bibliographic, dict):
        years = [
            year
            for year in (bibliographic.get("_matched_years") or [])
            if isinstance(year, int) and 1000 <= year <= date.today().year
        ]
        if not years:
            first = bibliographic.get("first_publish_year")
            if isinstance(first, int) and 1000 <= first <= date.today().year:
                years = [first]

    death_years = author_death_years(work)
    if death_years:
        latest_plausible = max(death_years) + 20
        years = [year for year in years if year <= latest_plausible]
    if years:
        return str(min(years))

    try:
        wikidata_label = wikidata_publication_label(title, author)
    except Exception:
        wikidata_label = None
    if wikidata_label:
        if re.fullmatch(r"\d{4}", wikidata_label):
            year = int(wikidata_label)
            if death_years and year > max(death_years) + 20:
                return "Not verified"
        return wikidata_label

    if births and min(births) < 0:
        return "Ancient work"
    return "Not verified"


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

    work.setdefault("publication", {})["firstPublished"] = verified_first_publication_year(
        work,
        bibliographic,
        title=title,
        author=author,
    )

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
