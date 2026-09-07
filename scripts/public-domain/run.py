#!/usr/bin/env python3
from __future__ import annotations

import argparse
import time
import urllib.error
import urllib.request

import sync as engine


def bounded_request_bytes(url: str, *, timeout: int = 20, accept: str = "*/*") -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": engine.USER_AGENT,
            "Accept": accept,
            "Accept-Encoding": "identity",
        },
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code != 429 and exc.code < 500:
                raise
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


engine.request_bytes = bounded_request_bytes


def main() -> int:
    parser = argparse.ArgumentParser(description="Bounded public-domain acquisition runner.")
    parser.add_argument("--max-books", type=int, default=10)
    parser.add_argument("--discovery-pages", type=int, default=30)
    parser.add_argument("--max-candidate-checks", type=int, default=100)
    args = parser.parse_args()

    max_books = max(0, min(args.max_books, 20))
    max_candidate_checks = max(max_books, min(args.max_candidate_checks, 500))
    if max_books == 0:
        engine.set_github_output("added_count", "0")
        return 0

    if engine.STAGING_ROOT.exists():
        engine.shutil.rmtree(engine.STAGING_ROOT)
    engine.STAGING_ROOT.mkdir(parents=True, exist_ok=True)

    ledger = engine.load_ledger()
    known = engine.existing_pg_ids(ledger)
    candidates = engine.discover_candidates(max(1, args.discovery_pages))
    engine.log(f"[discover] {len(candidates)} ranked candidates; {len(known)} already known")

    added: list[dict] = []
    skips: list[dict] = []
    checked = 0

    for candidate in candidates:
        if len(added) >= max_books or checked >= max_candidate_checks:
            break

        gid = candidate.gutenberg_id
        if gid in known:
            continue

        prior_rejection = (ledger.get("rejections") or {}).get(str(gid))
        if isinstance(prior_rejection, dict) and prior_rejection.get("copyrightCutoffYear") == engine.COPYRIGHT_CUTOFF_YEAR:
            continue

        checked += 1
        engine.log(
            f"[candidate] PG#{gid} check={checked}/{max_candidate_checks} "
            f"score={candidate.score:.1f} downloads={candidate.download_count} — {candidate.title}"
        )

        try:
            meta, rdf_raw = engine.rdf_metadata(gid)
            allowed, reason = engine.legal_gate(candidate, meta)
            if not allowed:
                rejection = {
                    "gutenbergId": gid,
                    "title": candidate.title,
                    "reason": reason,
                    "checkedAt": engine.utc_now(),
                    "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
                }
                engine.log(f"[skip:rights] PG#{gid}: {reason}")
                skips.append(rejection)
                ledger.setdefault("rejections", {})[str(gid)] = rejection
                time.sleep(0.2)
                continue

            epub_raw, epub_url = engine.download_epub(candidate)
            artifact = engine.materialize(candidate, meta, rdf_raw, epub_raw, epub_url, ledger)
            added.append(artifact)
            known.add(gid)
            engine.log(f"[add] {artifact['workId']} — {artifact['title']} ({artifact['sizeBytes']} bytes)")
            time.sleep(0.35)
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            engine.log(f"[skip:error] PG#{gid}: {reason}")
            skips.append({"gutenbergId": gid, "reason": reason})
            time.sleep(0.2)

    ledger["lastRun"] = {
        "at": engine.utc_now(),
        "copyrightCutoffYear": engine.COPYRIGHT_CUTOFF_YEAR,
        "candidateCount": len(candidates),
        "checkedCount": checked,
        "candidateCheckLimit": max_candidate_checks,
        "addedCount": len(added),
        "skippedCount": len(skips),
        "recentSkips": skips[:50],
    }
    engine.json_dump(engine.LEDGER_PATH, ledger)
    engine.json_dump(engine.STAGING_ROOT / "artifacts.json", added)

    engine.set_github_output("added_count", str(len(added)))
    engine.set_github_output("work_ids", ",".join(item["workId"] for item in added))
    engine.log(
        f"[autopilot] complete: {len(added)} added, {len(skips)} skipped, "
        f"{checked}/{max_candidate_checks} source checks"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
