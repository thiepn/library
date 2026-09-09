#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DOMAIN_DIR = ROOT / "scripts/public-domain"
sys.path.insert(0, str(PUBLIC_DOMAIN_DIR))

spec = importlib.util.spec_from_file_location("run_curated_ia", PUBLIC_DOMAIN_DIR / "run-curated-ia.py")
if spec is None or spec.loader is None:
    raise RuntimeError("could not load run-curated-ia.py")
provider = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provider)


def assert_raises(fragment: str, fn) -> None:
    try:
        fn()
    except Exception as exc:
        if fragment.casefold() not in str(exc).casefold():
            raise AssertionError(f"expected error containing {fragment!r}, got {exc!r}") from exc
        return
    raise AssertionError(f"expected failure containing {fragment!r}")


def fake_entry() -> dict:
    return {
        "itemId": "sampleoldbook00auth",
        "openLibraryId": "OL12345M",
        "title": "A Sample Christian Classic",
        "sourceTitleAliases": ["A Sample Christian Classic"],
        "editionPublishedYear": 1850,
        "creativeContributors": [
            {"name": "Example Author", "role": "author", "birthYear": 1800, "deathYear": 1870}
        ],
        "subjects": ["christianity"],
        "description": "Fixture only.",
        "rightsBasis": "Fixture historical edition; all creative contributors are explicitly declared.",
        "rightsEvidence": [
            "https://archive.org/details/sampleoldbook00auth",
            "https://openlibrary.org/books/OL12345M"
        ]
    }


def fake_payload() -> dict:
    return {
        "metadata": {
            "identifier": "sampleoldbook00auth",
            "mediatype": "texts",
            "title": "A Sample Christian Classic",
            "creator": "Author, Example, 1800-1870",
            "date": "1850"
        },
        "files": [
            {"name": "sampleoldbook00auth.epub", "format": "EPUB", "source": "derivative", "size": "4096"}
        ]
    }


def main() -> int:
    manifest = provider.load_manifest()
    if len(manifest["entries"]) < 5:
        raise AssertionError("curated IA manifest unexpectedly small")

    entry = fake_entry()
    provider.validate_manifest_entry(entry)
    checked = provider.validate_live_metadata(entry, fake_payload())
    if checked["epub"]["name"] != "sampleoldbook00auth.epub":
        raise AssertionError("EPUB selection did not choose the unrestricted EPUB")

    recent = copy.deepcopy(entry)
    recent["creativeContributors"][0]["deathYear"] = provider.engine.COPYRIGHT_CUTOFF_YEAR + 1
    assert_raises("after German cutoff", lambda: provider.validate_manifest_entry(recent))

    no_evidence = copy.deepcopy(entry)
    no_evidence["rightsEvidence"] = ["https://archive.org/details/sampleoldbook00auth"]
    assert_raises("at least two", lambda: provider.validate_manifest_entry(no_evidence))

    restricted = fake_payload()
    restricted["metadata"]["access-restricted-item"] = "true"
    assert_raises("access-restricted", lambda: provider.validate_live_metadata(entry, restricted))

    wrong_year = fake_payload()
    wrong_year["metadata"]["date"] = "1955"
    assert_raises("year mismatch", lambda: provider.validate_live_metadata(entry, wrong_year))

    wrong_creator = fake_payload()
    wrong_creator["metadata"]["creator"] = "Someone Else"
    assert_raises("creator mismatch", lambda: provider.validate_live_metadata(entry, wrong_creator))

    encrypted = fake_payload()
    encrypted["files"] = [{"name": "sample_encrypted.epub", "format": "EPUB"}]
    assert_raises("no unrestricted EPUB", lambda: provider.validate_live_metadata(entry, encrypted))

    modern = copy.deepcopy(entry)
    modern["editionPublishedYear"] = 1975
    assert_raises("too recent", lambda: provider.validate_manifest_entry(modern))

    print("CURATED_IA_PROVIDER_VERIFICATION_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
