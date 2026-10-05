#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "src/publications/curated-canon.tsv"
WORKS_ROOT = ROOT / "src/content/works"
STATUS_PATH = ROOT / "src/publications/curated-canon-status.json"


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.casefold())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def surname(value: str) -> str:
    parts = normalize(value).split()
    return parts[-1] if parts else ""


def author_names(work: dict[str, Any]) -> list[str]:
    result: list[str] = []
    for contributor in work.get("contributors") or []:
        if not isinstance(contributor, dict):
            continue
        role = str(contributor.get("role") or "").casefold()
        if role not in {"author", "creator", "aut"}:
            continue
        name = str(contributor.get("name") or "").strip()
        if name:
            result.append(name)
    return result


def represented_works() -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for path in WORKS_ROOT.glob("*/work.yaml"):
        try:
            work = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            # Native author-written YAML is not part of the curated public-domain canon.
            continue
        authors = author_names(work)
        result.append(
            {
                "id": str(work.get("id") or path.parent.name),
                "title": str(work.get("title") or ""),
                "author": authors[0] if authors else "",
            }
        )
    return result


def match_item(title: str, author: str, works: list[dict[str, str]]) -> dict[str, str] | None:
    wanted_title = normalize(title)
    wanted_surname = surname(author.split(",")[0])
    exact: list[dict[str, str]] = []
    for work in works:
        if normalize(work["title"]) != wanted_title:
            continue
        if not wanted_surname or surname(work["author"]) == wanted_surname:
            exact.append(work)
    if exact:
        return exact[0]
    return None


def main() -> int:
    works = represented_works()
    rows: list[dict[str, Any]] = []
    counts: dict[str, int] = {
        "represented": 0,
        "missing-global-source": 0,
        "regional-de": 0,
        "translation-review": 0,
        "protected": 0,
        "protected-until-2027-de": 0,
        "rights-review": 0,
    }

    with CATALOG_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for position, row in enumerate(reader, start=1):
            title = str(row.get("title") or "").strip()
            author = str(row.get("author") or "").strip()
            collection = str(row.get("collection") or "").strip()
            rights_mode = str(row.get("rightsMode") or "").strip()
            match = match_item(title, author, works)
            if match:
                state = "represented"
                counts[state] += 1
            elif rights_mode == "global":
                state = "missing-global-source"
                counts[state] += 1
            else:
                state = rights_mode
                counts[state] = counts.get(state, 0) + 1
            rows.append(
                {
                    "position": position,
                    "title": title,
                    "author": author,
                    "collection": collection,
                    "rightsMode": rights_mode,
                    "state": state,
                    **({"workId": match["id"]} if match else {}),
                }
            )

    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "catalogEntries": len(rows),
        "counts": counts,
        "items": rows,
    }
    STATUS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("CURATED_CANON_AUDIT " + " ".join(f"{key}={value}" for key, value in counts.items()), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
