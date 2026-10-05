#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import catalog_metadata

ROOT = Path(__file__).resolve().parents[2]
WORKS_ROOT = ROOT / "src/content/works"
LEDGER_PATH = ROOT / "src/publications/public-domain-ledger.json"


def ledger_source_ids() -> dict[str, int]:
    if not LEDGER_PATH.exists():
        return {}
    ledger = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    result: dict[str, int] = {}
    for entry in ledger.get("entries") or []:
        if not isinstance(entry, dict):
            continue
        work_id = str(entry.get("workId") or "")
        gid = entry.get("gutenbergId")
        if work_id and isinstance(gid, int):
            result[work_id] = gid
    return result


def candidates(*, include_verified: bool) -> list[tuple[str, Path]]:
    result: list[tuple[str, Path]] = []
    for path in sorted(WORKS_ROOT.glob("pd-*/work.yaml")):
        try:
            work = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        first = str((work.get("publication") or {}).get("firstPublished") or "").strip()
        if include_verified or first in {"", "Not verified", "Ancient work"}:
            result.append((str(work.get("id") or path.parent.name), path))
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Deep-enrich unresolved public-domain bibliographic metadata.")
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--include-verified", action="store_true")
    args = parser.parse_args()

    todo = candidates(include_verified=args.include_verified)[: max(0, min(args.limit, 400))]
    source_ids = ledger_source_ids()
    changed = 0
    failures: list[dict[str, str]] = []

    def enrich(work_id: str) -> tuple[str, str]:
        work = catalog_metadata.update_work(
            work_id,
            gutenberg_id=source_ids.get(work_id),
            deep_bibliography=True,
        )
        first = str((work.get("publication") or {}).get("firstPublished") or "")
        return work_id, first

    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 6))) as pool:
        future_map = {pool.submit(enrich, work_id): work_id for work_id, _ in todo}
        for future in as_completed(future_map):
            work_id = future_map[future]
            try:
                _, first = future.result()
                changed += 1
                print(f"[bibliography] {work_id}: {first}", flush=True)
            except Exception as exc:
                failures.append({"workId": work_id, "error": f"{type(exc).__name__}: {exc}"})
                print(f"[bibliography:error] {work_id}: {exc}", flush=True)

    unresolved = 0
    for _, path in candidates(include_verified=False):
        unresolved += 1

    print(
        f"BIBLIOGRAPHY_ENRICHMENT_COMPLETE processed={changed} failures={len(failures)} unresolved={unresolved}",
        flush=True,
    )
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())
