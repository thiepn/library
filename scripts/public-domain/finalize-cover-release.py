#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
WORKS_ROOT = ROOT / "src/content/works"
RELEASES_ROOT = ROOT / "src/publications/releases"
LEDGER_PATH = ROOT / "src/publications/public-domain-ledger.json"
MEDIA_ORIGIN = "https://thiepn.dev/library/media/"


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected object in {path}")
    return value


def dump_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def find_entry(ledger: dict[str, Any], work_id: str) -> dict[str, Any]:
    for entry in ledger.get("entries") or []:
        if isinstance(entry, dict) and entry.get("workId") == work_id:
            return entry
    raise KeyError(f"No public-domain ledger entry for {work_id}")


def finalize(*, mode: str) -> int:
    staging_root = ROOT / (".public-domain-staging" if mode == "new" else ".cover-staging")
    artifacts_path = staging_root / "artifacts.json"
    artifacts = json.loads(artifacts_path.read_text(encoding="utf-8"))
    if not isinstance(artifacts, list):
        raise ValueError(f"{artifacts_path} must contain an array")

    ledger = load_json(LEDGER_PATH)
    changed = 0

    for item in artifacts:
        if not isinstance(item, dict):
            raise ValueError("Artifact manifest entries must be objects")
        work_id = str(item.get("workId") or "")
        old_version = str(item.get("version") or "")
        artifact_hash = str(item.get("sha256") or "").lower()
        if not work_id or not old_version or len(artifact_hash) != 64:
            raise ValueError(f"Incomplete staged artifact: {item}")

        old_release_path = RELEASES_ROOT / work_id / f"{old_version}.yaml"
        release = load_json(old_release_path)
        pipeline = release.get("coverPipeline") if isinstance(release.get("coverPipeline"), dict) else {}
        source_version = str(pipeline.get("sourceReleaseVersion") or old_version)
        new_version = f"{source_version}-cover-{artifact_hash[:12]}"

        epub = ((release.get("artifacts") or {}).get("epub") or {})
        filename = str(epub.get("filename") or "")
        if not filename:
            raise ValueError(f"{old_release_path} has no EPUB filename")
        r2_key = f"works/{work_id}/editions/{new_version}/{filename}"

        release["version"] = new_version
        release.setdefault("coverPipeline", {})
        release["coverPipeline"]["sourceReleaseVersion"] = source_version
        release["coverPipeline"]["finalArtifactSha256"] = artifact_hash
        release["coverPipeline"]["releaseVersioning"] = "content-addressed"
        release["artifacts"]["epub"]["url"] = MEDIA_ORIGIN + r2_key
        release["artifacts"]["epub"]["sha256"] = artifact_hash
        release["artifacts"]["epub"]["sizeBytes"] = int(item["sizeBytes"])

        new_release_path = RELEASES_ROOT / work_id / f"{new_version}.yaml"
        dump_json(new_release_path, release)
        if new_release_path != old_release_path and old_release_path.exists():
            old_release_path.unlink()

        work_path = WORKS_ROOT / work_id / "work.yaml"
        work = load_json(work_path)
        work["publication"]["version"] = new_version
        work["publication"]["activeRelease"] = new_version
        work["publication"]["lastUpdated"] = date.today().isoformat()
        dump_json(work_path, work)

        entry = find_entry(ledger, work_id)
        cover = entry.get("cover") if isinstance(entry.get("cover"), dict) else {}
        cover["releaseVersion"] = new_version
        cover["artifactSha256"] = artifact_hash
        entry["cover"] = cover
        if mode == "new":
            # For a newly ingested work this cover-enhanced package is its first
            # published Library release. Existing-work backfills intentionally
            # preserve the ledger's original Project Gutenberg source release.
            entry["releaseVersion"] = new_version

        item["version"] = new_version
        item["r2Key"] = r2_key
        changed += 1
        print(f"CONTENT_ADDRESSED_RELEASE {work_id} {new_version}", flush=True)

    dump_json(LEDGER_PATH, ledger)
    artifacts_path.write_text(json.dumps(artifacts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description="Give AI-cover EPUB releases content-addressed immutable version keys.")
    parser.add_argument("--mode", choices=["new", "backfill"], required=True)
    args = parser.parse_args()
    count = finalize(mode=args.mode)
    print(f"COVER_RELEASE_FINALIZATION_PASS count={count}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
