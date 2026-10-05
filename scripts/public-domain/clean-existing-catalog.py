#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import catalog_metadata as metadata

ROOT = Path(__file__).resolve().parents[2]
LEDGER_PATH = ROOT / "src/publications/public-domain-ledger.json"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Normalize reader-facing metadata for every existing public-domain Library work."
    )
    parser.add_argument("--limit", type=int, default=0, help="Optional positive work limit for diagnostics")
    args = parser.parse_args()

    ledger = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    entries = [entry for entry in ledger.get("entries") or [] if isinstance(entry, dict)]
    if args.limit > 0:
        entries = entries[: args.limit]

    changed = 0
    failures: list[dict[str, str]] = []

    def process(entry: dict) -> str:
        work_id = str(entry.get("workId") or "").strip()
        if not work_id:
            return ""
        gid = entry.get("gutenbergId")
        metadata.update_work(
            work_id,
            gutenberg_id=int(gid) if gid is not None else None,
        )
        return work_id

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(process, entry): entry for entry in entries}
        for future in as_completed(futures):
            entry = futures[future]
            work_id = str(entry.get("workId") or "").strip()
            try:
                completed = future.result()
                if completed:
                    changed += 1
            except Exception as exc:
                failures.append({"workId": work_id, "error": f"{type(exc).__name__}: {exc}"})
                print(f"[metadata:error] {work_id}: {exc}", flush=True)

    print(f"CATALOG_METADATA_CLEANUP changed={changed} failures={len(failures)}", flush=True)
    if failures:
        failure_path = ROOT / ".catalog-metadata-failures.json"
        failure_path.write_text(json.dumps(failures, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())
