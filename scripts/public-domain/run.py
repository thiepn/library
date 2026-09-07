#!/usr/bin/env python3
from __future__ import annotations

import argparse
import time
import urllib.error
import urllib.request

import sync as engine


def bounded_request_bytes(url: str, *, timeout: int = 12, accept: str = "*/*") -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": engine.USER_AGENT,
            "Accept": accept,
            "Accept-Encoding": "identity",
        },
    )
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code != 429 and exc.code < 500:
                raise
            if attempt == 1:
                raise
            time.sleep(1.0)
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt == 1:
                raise
            time.sleep(1.0)
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


engine.request_bytes = bounded_request_bytes


def discover_durable(popularity_pages: int) -> list[engine.Candidate]:
    """Use Gutenberg's own catalog as the durable discovery base.

    Gutendex is optional enrichment only. A third-party outage must never prevent
    autonomous publication from continuing from Project Gutenberg's own catalog.
    """
    engine.log("[discover] loading official Project Gutenberg catalog")
    official = engine.discover_official_catalog(limit=2500)

    popular: list[engine.Candidate] = []
    if popularity_pages > 0:
        try:
            # One small request window is enough to nudge globally popular classics
            # upward without making the pipeline operationally dependent on Gutendex.
            popular = engine.discover_gutendex(min(popularity_pages, 2))
            engine.log(f"[discover] optional popularity enrichment: {len(popular)} candidate(s)")
        except Exception as exc:
            engine.log(f"[discover] popularity enrichment unavailable; continuing from official catalog: {exc}")

    merged: dict[int, engine.Candidate] = {candidate.gutenberg_id: candidate for candidate in official}
    for candidate in popular:
        existing = merged.get(candidate.gutenberg_id)
        if existing is None:
            merged[candidate.gutenberg_id] = candidate
            continue
        existing.download_count = max(existing.download_count, candidate.download_count)
        existing.formats.update(candidate.formats)
        if candidate.summary and not existing.summary:
            existing.summary = candidate.summary
        existing.score = max(existing.score, candidate.score + 35.0)

    candidates = list(merged.values())
    candidates.sort(key=lambda c: (-c.score, -c.download_count, c.gutenberg_id))
    return candidates


def main() -> int:
    parser = argparse.ArgumentParser(description="Bounded public-domain acquisition runner.")
    parser.add_argument("--max-books", type=int, default=10)
    parser.add_argument("--discovery-pages", type=int, default=2)
    parser.add_argument("--max-candidate-checks", type=int, default=40)
    args = parser.parse_args()

    max_books = max(0, min(args.max_books, 20))
    max_candidate_checks = max(max_books, min(args.max_candidate_checks, 200))
    if max_books == 0:
        engine.set_github_output("added_count", "0")
        return 0

    if engine.STAGING_ROOT.exists():
        engine.shutil.rmtree(engine.STAGING_ROOT)
    engine.STAGING_ROOT.mkdir(parents=True, exist_ok=True)

    ledger = engine.load_ledger()
    known = engine.existing_pg_ids(ledger)
    candidates = discover_durable(max(0, args.discovery_pages))
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
                time.sleep(0.1)
                continue

            epub_raw, epub_url = engine.download_epub(candidate)
            artifact = engine.materialize(candidate, meta, rdf_raw, epub_raw, epub_url, ledger)
            added.append(artifact)
            known.add(gid)
            engine.log(f"[add] {artifact['workId']} — {artifact['title']} ({artifact['sizeBytes']} bytes)")
            time.sleep(0.15)
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            engine.log(f"[skip:error] PG#{gid}: {reason}")
            skips.append({"gutenbergId": gid, "reason": reason})
            time.sleep(0.1)

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
