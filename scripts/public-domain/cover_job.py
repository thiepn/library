#!/usr/bin/env python3
from __future__ import annotations

import copy

import cover_pipeline as pipeline

# Cover presentation can be cleaner than source-edition catalog metadata without
# rewriting provenance. These are intentionally narrow, editorial display names.
DISPLAY_OVERRIDES: dict[str, dict[str, str]] = {
    "pd-pg-84": {
        "title": "Frankenstein; or, The Modern Prometheus",
        "author": "Mary Shelley",
    },
    "pd-pg-43": {
        "title": "The Strange Case of Dr. Jekyll and Mr. Hyde",
    },
    "pd-pg-1399": {
        "author": "Leo Tolstoy",
    },
    "pd-pg-2680": {
        "author": "Marcus Aurelius",
    },
    "pd-pg-1695": {
        "author": "G. K. Chesterton",
    },
    "pd-pg-1597": {
        "author": "Hans Christian Andersen",
    },
    "pd-pg-8492": {
        "author": "Robert W. Chambers",
    },
    "pd-pg-67979": {
        "author": "L. M. Montgomery",
    },
    "pd-pg-3300": {
        "title": "The Wealth of Nations",
    },
    "pd-pg-59828": {
        "title": "The String of Pearls",
    },
}


def creator_display(work: dict, fallback: str) -> str:
    creators: list[str] = []
    for contributor in work.get("contributors") or []:
        if not isinstance(contributor, dict):
            continue
        role = str(contributor.get("role") or "").casefold()
        name = str(contributor.get("name") or "").strip()
        if role in {"creator", "aut", "author"} and name:
            creators.append(name)
    return ", ".join(creators[:3]) or fallback


def display_metadata(work_id: str, entry: dict, work: dict) -> tuple[str, str]:
    title = str(work.get("title") or entry.get("title") or work_id).strip()
    author = creator_display(work, str(entry.get("author") or "Unknown author").strip())
    override = DISPLAY_OVERRIDES.get(work_id, {})
    return override.get("title", title), override.get("author", author)


_original_style_direction = pipeline.style_direction


def _expanded_style_direction(bookshelves: list[str]) -> str:
    blob = " ".join(bookshelves).casefold()
    if "science fiction" in blob or "science-fiction" in blob:
        return (
            "Literary science-fiction illustration: imaginative retrofuturist or speculative imagery, "
            "period-aware where relevant, graphic silhouette, restrained luminous accents, and tactile print texture."
        )
    if "horror" in blob and "gothic" not in blob:
        return (
            "Literary horror illustration: uncanny atmosphere, symbolic menace rather than gore, deep shadow, "
            "restrained detail, and sophisticated printmaking texture."
        )
    if "biograph" in blob:
        return (
            "Editorial biographical illustration: one defining object, place, gesture, or restrained portrait motif, "
            "historically grounded and dignified rather than photographic."
        )
    if "economics" in blob:
        return (
            "Conceptual historical-economics illustration: trade, labor, markets, industry, or exchange expressed "
            "through elegant symbolic geometry and period printmaking texture."
        )
    return _original_style_direction(bookshelves)


pipeline.style_direction = _expanded_style_direction
_original_build_prompt = pipeline.build_prompt


def _build_prompt_with_library_context(entry: dict) -> str:
    prompt = _original_build_prompt(entry)
    summary = str(entry.get("_coverSummary") or "").strip()
    if not summary:
        return prompt
    return (
        prompt
        + "\nLibrary synopsis/context for this exact edition:\n"
        + summary[:900]
        + "\nUse this context to avoid generic or title-literal imagery.\n"
    )


pipeline.build_prompt = _build_prompt_with_library_context
_original_update_cover_assets = pipeline.update_cover_assets


def _update_cover_assets_with_polished_metadata(
    work_id: str,
    entry: dict,
    work: dict,
    *,
    force: bool,
):
    title, author = display_metadata(work_id, entry, work)
    display_entry = copy.copy(entry)
    display_entry["title"] = title
    display_entry["author"] = author
    display_entry["_coverSummary"] = str(
        work.get("shortDescription") or work.get("description") or ""
    ).strip()

    result = _original_update_cover_assets(work_id, display_entry, work, force=force)
    if isinstance(display_entry.get("cover"), dict):
        entry["cover"] = display_entry["cover"]
    return result


pipeline.update_cover_assets = _update_cover_assets_with_polished_metadata


if __name__ == "__main__":
    raise SystemExit(pipeline.main())
