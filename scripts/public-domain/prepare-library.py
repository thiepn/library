#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "src/pages/works/[slug].astro"
CERT = ROOT / "scripts/certification/work-detail.mjs"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"{label}: expected source pattern was not found")
    return text.replace(old, new, 1)


page = PAGE.read_text(encoding="utf-8")
page = replace_once(
    page,
    "import { taxonomyLabel } from '../../lib/content/taxonomy';",
    "import { taxonomyLabel } from '../../lib/content/taxonomy';\nimport { readerCanOpen } from '../../lib/reader/migration';",
    "readerCanOpen import",
)
page = replace_once(
    page,
    "const readHref = work.webMaterialized ? `${base}/works/${work.slug}/read` : undefined;",
    "const canRead = readerCanOpen(work);\nconst readHref = canRead ? `${base}/works/${work.slug}/read` : undefined;",
    "reader href",
)
page = page.replace(
    "const availableFormats = [work.webMaterialized ? 'Reader' : null, epub ? 'EPUB' : null, pdf ? 'PDF' : null]",
    "const availableFormats = [canRead ? 'Reader' : null, epub ? 'EPUB' : null, pdf ? 'PDF' : null]",
)
page = page.replace(
    "const editionLabel = work.publication.edition === 1 ? 'First edition' : `Edition ${work.publication.edition}`;",
    "const editionLabel = work.publication.editionLabel;",
)
page = page.replace(
    "data-format-state={work.webMaterialized ? 'available' : 'unavailable'}",
    "data-format-state={canRead ? 'available' : 'unavailable'}",
)
page = page.replace(
    "{work.webMaterialized ? 'Available' : 'Unavailable'}",
    "{canRead ? 'Available' : 'Unavailable'}",
)
PAGE.write_text(page, encoding="utf-8")

cert = CERT.read_text(encoding="utf-8")
cert = replace_once(
    cert,
    "page.includes('const readHref = work.webMaterialized')",
    "page.includes('const canRead = readerCanOpen(work)')\n      && page.includes('const readHref = canRead')",
    "work-detail reader certification",
)
cert = cert.replace(
    "The public reader action remains gated by a materialized reader route before ER5 considers it for unified entry",
    "The public reader action remains gated by readerCanOpen so native EPUB releases and materialized legacy Web payloads both enter the Library reader",
)
CERT.write_text(cert, encoding="utf-8")

print("PUBLIC_DOMAIN_READER_COMPATIBILITY_PASS")
