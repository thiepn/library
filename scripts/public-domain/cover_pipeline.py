#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
WORKS_ROOT = ROOT / "src/content/works"
RELEASES_ROOT = ROOT / "src/publications/releases"
LEDGER_PATH = ROOT / "src/publications/public-domain-ledger.json"
COVERS_ROOT = ROOT / "public/covers/public-domain"
NEW_STAGING_ROOT = ROOT / ".public-domain-staging"
BACKFILL_STAGING_ROOT = ROOT / ".cover-staging"
MEDIA_ORIGIN = "https://thiepn.dev/library/media/"

OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations"
COVER_MODEL = os.getenv("COVER_IMAGE_MODEL", "gpt-image-2")
COVER_SIZE = os.getenv("COVER_IMAGE_SIZE", "1024x1536")
COVER_QUALITY = os.getenv("COVER_IMAGE_QUALITY", "medium")
COVER_PROMPT_VERSION = "libcover-v1"
USER_AGENT = "THIEPN-Library-Cover-Pipeline/1.0 (+https://thiepn.dev/library/)"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected object in {path}")
    return value


def dump_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def set_github_output(key: str, value: str) -> None:
    target = os.getenv("GITHUB_OUTPUT")
    if not target:
        return
    with open(target, "a", encoding="utf-8") as handle:
        handle.write(f"{key}={value}\n")


def request_bytes(url: str, *, timeout: int = 90, headers: dict[str, str] | None = None) -> bytes:
    request_headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "identity"}
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(url, headers=request_headers)
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code not in {429, 500, 502, 503, 504} or attempt == 3:
                raise
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt == 3:
                raise
        time.sleep(4 * (2**attempt))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def style_direction(bookshelves: list[str]) -> str:
    blob = " ".join(bookshelves).casefold()
    if "gothic" in blob:
        return "Gothic literary illustration: dramatic chiaroscuro, architectural shadow, restrained crimson accents, engraved texture."
    if any(term in blob for term in ("crime", "mystery", "thriller", "detective")):
        return "Literary mystery illustration: graphic shadow, one symbolic clue or setting detail, restrained noir influence without pulp clichés."
    if "romance" in blob:
        return "Elegant historical literary illustration: period-aware atmosphere, tactile paper and botanical or architectural detail, restrained warmth."
    if any(term in blob for term in ("philosophy", "ethics")):
        return "Conceptual classics illustration: a single symbolic idea, monumental geometry or classical texture, contemplative and minimal."
    if "adventure" in blob:
        return "Bold literary adventure illustration: strong silhouette, landscape or object as the focal motif, modernized engraving influence."
    if any(term in blob for term in ("children", "juvenile", "fairy")):
        return "Sophisticated storybook illustration: expressive shape language, tactile gouache or printmaking texture, timeless rather than childish."
    if any(term in blob for term in ("science", "mathematics", "natural history")):
        return "Editorial scientific illustration: diagrammatic forms and natural-history texture, precise but visually poetic."
    if "poetry" in blob:
        return "Lyrical editorial illustration: sparse symbolic imagery, expressive negative space, tactile ink or printmaking texture."
    return "Modern literary-classics illustration: one strong symbolic motif, restrained palette, tactile printmaking or painted texture."


def build_prompt(entry: dict[str, Any]) -> str:
    title = str(entry.get("title") or "Untitled").strip()
    author = str(entry.get("author") or "Unknown author").strip()
    shelves = [str(item) for item in entry.get("bookshelves") or [] if str(item).strip()]
    direction = style_direction(shelves)
    categories = ", ".join(shelves[:8]) or "classic literature"
    return f"""Create the artwork for a premium modern-classics book cover.

Book: {title}
Author: {author}
Catalog categories: {categories}

Use your knowledge of this specific book to choose imagery that genuinely reflects its themes, setting, central conflict, or most recognizable symbolic motif. Do not merely illustrate the title literally when that would misrepresent the work.

Art direction: {direction}
Collection direction: sophisticated independent literary press; visually distinctive at thumbnail size; one dominant concept rather than a collage; period-aware where relevant; painterly/printmaking texture; intentional composition; no generic fantasy-poster look; no photorealistic stock-photo look.

Composition requirements:
- portrait 2:3 book-cover artwork
- full bleed
- keep the lower 38% relatively calm and darker so deterministic title typography can be added later
- retain a clear focal point in the upper or middle area
- avoid busy detail behind the future typography zone

CRITICAL: artwork only. Absolutely no words, letters, numbers, pseudo-writing, signatures, captions, logos, book title, author name, or typographic marks anywhere in the image.
"""


def generate_art(prompt: str) -> bytes:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for AI cover generation")
    payload = json.dumps(
        {
            "model": COVER_MODEL,
            "prompt": prompt,
            "size": COVER_SIZE,
            "quality": COVER_QUALITY,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        OPENAI_IMAGE_URL,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    last_error: Exception | None = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                data = json.loads(response.read().decode("utf-8"))
            encoded = (((data.get("data") or [{}])[0]).get("b64_json") or "").strip()
            if not encoded:
                raise RuntimeError(f"Image API returned no b64_json payload: {data}")
            return base64.b64decode(encoded)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            last_error = RuntimeError(f"OpenAI image generation failed with HTTP {exc.code}: {body[:800]}")
            if exc.code not in {429, 500, 502, 503, 504} or attempt == 4:
                raise last_error
        except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError) as exc:
            last_error = exc
            if attempt == 4:
                raise
        time.sleep(8 * (attempt + 1))
    raise RuntimeError(f"OpenAI image generation failed: {last_error}")


def resolve_font(*, bold: bool) -> str:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    pattern = "DejaVu Serif:style=Bold" if bold else "DejaVu Serif:style=Book"
    try:
        result = subprocess.run(
            ["fc-match", "-f", "%{file}", pattern],
            check=True,
            capture_output=True,
            text=True,
        )
        if result.stdout.strip() and Path(result.stdout.strip()).exists():
            return result.stdout.strip()
    except Exception:
        pass
    raise RuntimeError("No suitable serif font was found on the runner")


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = re.sub(r"\s+", " ", text).strip().split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
            current = candidate
        elif current:
            lines.append(current)
            current = word
        else:
            lines.append(word)
            current = ""
    if current:
        lines.append(current)
    return lines


def fit_title(draw: ImageDraw.ImageDraw, title: str, max_width: int, max_lines: int = 4) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    font_path = resolve_font(bold=True)
    for size in range(82, 43, -2):
        font = ImageFont.truetype(font_path, size=size)
        lines = wrap_lines(draw, title, font, max_width)
        if len(lines) <= max_lines:
            return font, lines
    font = ImageFont.truetype(font_path, size=44)
    return font, wrap_lines(draw, title, font, max_width)[:max_lines]


def render_cover(art_bytes: bytes, title: str, author: str) -> tuple[bytes, bytes]:
    with Image.open(io.BytesIO(art_bytes)) as raw:
        art = ImageOps.fit(raw.convert("RGB"), (1024, 1536), method=Image.Resampling.LANCZOS)

    cover = art.convert("RGBA")
    shade = Image.new("RGBA", cover.size, (0, 0, 0, 0))
    shade_draw = ImageDraw.Draw(shade)
    for y in range(1536):
        t = y / 1535
        alpha = int(18 + 205 * max(0.0, (t - 0.42) / 0.58) ** 1.45)
        if y < 150:
            alpha = max(alpha, 66 - int(y * 0.22))
        shade_draw.line((0, y, 1024, y), fill=(0, 0, 0, min(alpha, 225)))
    cover = Image.alpha_composite(cover, shade)

    draw = ImageDraw.Draw(cover)
    white = (248, 246, 238, 255)
    soft = (224, 220, 207, 245)
    muted = (205, 200, 187, 230)
    left = 86
    max_width = 852

    kicker_font = ImageFont.truetype(resolve_font(bold=True), size=22)
    draw.text((left, 64), "THIEPN LIBRARY", font=kicker_font, fill=soft, stroke_width=0)
    draw.line((left, 112, left + 112, 112), fill=soft, width=2)

    title_font, title_lines = fit_title(draw, title, max_width)
    title_line_height = int(title_font.size * 1.06)
    title_height = title_line_height * len(title_lines)
    author_font = ImageFont.truetype(resolve_font(bold=False), size=34)
    bottom_caption_font = ImageFont.truetype(resolve_font(bold=True), size=17)

    title_y = max(875, 1324 - title_height - 112)
    for index, line in enumerate(title_lines):
        draw.text((left, title_y + index * title_line_height), line, font=title_font, fill=white)

    divider_y = title_y + title_height + 32
    draw.line((left, divider_y, left + 126, divider_y), fill=soft, width=2)
    draw.text((left, divider_y + 28), author, font=author_font, fill=soft)
    draw.text((left, 1460), "PUBLIC DOMAIN EDITION", font=bottom_caption_font, fill=muted)

    flattened = Image.new("RGB", cover.size, (20, 20, 18))
    flattened.paste(cover.convert("RGB"))

    jpeg = io.BytesIO()
    flattened.save(jpeg, format="JPEG", quality=92, optimize=True, progressive=True)
    webp = io.BytesIO()
    flattened.save(webp, format="WEBP", quality=84, method=6)
    return jpeg.getvalue(), webp.getvalue()


def package_rootfile(epub: zipfile.ZipFile) -> str:
    raw = epub.read("META-INF/container.xml")
    root = ET.fromstring(raw)
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] == "rootfile":
            value = element.attrib.get("full-path", "").strip()
            if value:
                return value
    raise ValueError("EPUB container.xml has no rootfile")


def ns_uri(tag: str) -> str:
    if tag.startswith("{") and "}" in tag:
        return tag[1:].split("}", 1)[0]
    return ""


def qname(namespace: str, local: str) -> str:
    return f"{{{namespace}}}{local}" if namespace else local


def unique_manifest_id(manifest: ET.Element, base: str) -> str:
    ids = {item.attrib.get("id") for item in list(manifest)}
    candidate = base
    index = 2
    while candidate in ids:
        candidate = f"{base}-{index}"
        index += 1
    return candidate


def embed_cover(epub_bytes: bytes, cover_jpeg: bytes) -> bytes:
    source = io.BytesIO(epub_bytes)
    with zipfile.ZipFile(source, "r") as zin:
        rootfile = package_rootfile(zin)
        files = {info.filename: zin.read(info.filename) for info in zin.infolist() if not info.is_dir()}

    opf_raw = files[rootfile]
    root = ET.fromstring(opf_raw)
    namespace = ns_uri(root.tag)
    metadata = root.find(qname(namespace, "metadata"))
    manifest = root.find(qname(namespace, "manifest"))
    spine = root.find(qname(namespace, "spine"))
    if metadata is None or manifest is None or spine is None:
        raise ValueError("EPUB package is missing metadata, manifest, or spine")

    version = str(root.attrib.get("version") or "2.0")
    opf_dir = PurePosixPath(rootfile).parent
    image_href = "images/thiepn-cover.jpg"
    page_href = "thiepn-cover.xhtml"
    image_path = str(opf_dir / image_href) if str(opf_dir) != "." else image_href
    page_path = str(opf_dir / page_href) if str(opf_dir) != "." else page_href

    for item in list(manifest):
        properties = item.attrib.get("properties", "").split()
        if "cover-image" in properties:
            item.attrib["properties"] = " ".join(value for value in properties if value != "cover-image")
            if not item.attrib["properties"]:
                item.attrib.pop("properties", None)

    cover_id = unique_manifest_id(manifest, "thiepn-cover-image")
    page_id = unique_manifest_id(manifest, "thiepn-cover-page")
    image_item = ET.Element(qname(namespace, "item"), {
        "id": cover_id,
        "href": image_href,
        "media-type": "image/jpeg",
    })
    if not version.startswith("2"):
        image_item.set("properties", "cover-image")
    manifest.append(image_item)
    manifest.append(ET.Element(qname(namespace, "item"), {
        "id": page_id,
        "href": page_href,
        "media-type": "application/xhtml+xml",
    }))

    for meta in list(metadata):
        if meta.tag.rsplit("}", 1)[-1] == "meta" and meta.attrib.get("name") == "cover":
            metadata.remove(meta)
    if version.startswith("2"):
        metadata.append(ET.Element(qname(namespace, "meta"), {"name": "cover", "content": cover_id}))

    spine.insert(0, ET.Element(qname(namespace, "itemref"), {"idref": page_id, "linear": "no"}))

    xhtml = f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Cover</title><meta name="viewport" content="width=device-width,height=device-height" /></head>
<body style="margin:0;padding:0;text-align:center;background:#111">
<img src="{image_href}" alt="Book cover" style="max-width:100%;max-height:100vh" />
</body></html>'''.encode("utf-8")

    files[image_path] = cover_jpeg
    files[page_path] = xhtml
    files[rootfile] = ET.tostring(root, encoding="utf-8", xml_declaration=True)

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as zout:
        if "mimetype" in files:
            zout.writestr("mimetype", files.pop("mimetype"), compress_type=zipfile.ZIP_STORED)
        else:
            zout.writestr("mimetype", b"application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for name, data in files.items():
            zout.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return output.getvalue()


def find_entry(ledger: dict[str, Any], work_id: str) -> dict[str, Any]:
    for entry in ledger.get("entries") or []:
        if isinstance(entry, dict) and entry.get("workId") == work_id:
            return entry
    raise KeyError(f"No ledger entry for {work_id}")


def work_path(work_id: str) -> Path:
    return WORKS_ROOT / work_id / "work.yaml"


def release_path(work_id: str, version: str) -> Path:
    return RELEASES_ROOT / work_id / f"{version}.yaml"


def update_cover_assets(work_id: str, entry: dict[str, Any], work: dict[str, Any], *, force: bool) -> tuple[bytes, str]:
    web_path = COVERS_ROOT / f"{work_id}.webp"
    current = entry.get("cover") if isinstance(entry.get("cover"), dict) else {}
    if not force and current.get("promptVersion") == COVER_PROMPT_VERSION and web_path.exists():
        raise FileExistsError(f"{work_id} already has {COVER_PROMPT_VERSION}")

    prompt = build_prompt(entry)
    print(f"[cover] generate {work_id} — {entry.get('title')}", flush=True)
    art = generate_art(prompt)
    jpeg, webp = render_cover(art, str(entry.get("title") or work.get("title") or work_id), str(entry.get("author") or "Unknown author"))

    COVERS_ROOT.mkdir(parents=True, exist_ok=True)
    web_path.write_bytes(webp)
    old_svg = COVERS_ROOT / f"{work_id}.svg"
    if old_svg.exists():
        old_svg.unlink()

    work["cover"] = {
        "src": f"/covers/public-domain/{work_id}.webp",
        "alt": f"Cover for {entry.get('title')} by {entry.get('author')}",
    }
    dump_json(work_path(work_id), work)

    entry["cover"] = {
        "promptVersion": COVER_PROMPT_VERSION,
        "model": COVER_MODEL,
        "size": COVER_SIZE,
        "quality": COVER_QUALITY,
        "generatedAt": utc_now(),
        "webCoverSha256": sha256_bytes(webp),
        "epubCoverSha256": sha256_bytes(jpeg),
    }
    return jpeg, prompt


def process_new_staging(*, force: bool) -> int:
    artifacts_path = NEW_STAGING_ROOT / "artifacts.json"
    if not artifacts_path.exists():
        raise FileNotFoundError(f"Missing {artifacts_path}")
    artifacts = json.loads(artifacts_path.read_text(encoding="utf-8"))
    if not isinstance(artifacts, list):
        raise ValueError("New-book artifacts.json must contain an array")
    ledger = load_json(LEDGER_PATH)
    changed = 0

    for item in artifacts:
        work_id = str(item["workId"])
        entry = find_entry(ledger, work_id)
        work = load_json(work_path(work_id))
        try:
            jpeg, _ = update_cover_assets(work_id, entry, work, force=force)
        except FileExistsError:
            print(f"[cover] skip existing {work_id}", flush=True)
            continue

        epub_path = ROOT / str(item["localPath"])
        enhanced = embed_cover(epub_path.read_bytes(), jpeg)
        epub_path.write_bytes(enhanced)
        digest = sha256_bytes(enhanced)
        item["sizeBytes"] = len(enhanced)
        item["sha256"] = digest

        release = load_json(release_path(work_id, str(item["version"])))
        artifact = ((release.get("artifacts") or {}).get("epub") or {})
        artifact["sizeBytes"] = len(enhanced)
        artifact["sha256"] = digest
        release.setdefault("coverPipeline", {})
        release["coverPipeline"] = {
            "promptVersion": COVER_PROMPT_VERSION,
            "model": COVER_MODEL,
            "sourceEpubSha256": entry.get("sourceEpubSha256"),
            "embeddedCover": True,
        }
        dump_json(release_path(work_id, str(item["version"])), release)
        entry["cover"]["releaseVersion"] = str(item["version"])
        entry["cover"]["artifactSha256"] = digest
        changed += 1

    dump_json(LEDGER_PATH, ledger)
    artifacts_path.write_text(json.dumps(artifacts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    set_github_output("processed_count", str(changed))
    print(f"[cover] new-book pipeline complete: {changed} cover(s)", flush=True)
    return changed


def download_release_artifact(release: dict[str, Any]) -> tuple[bytes, dict[str, Any]]:
    epub = ((release.get("artifacts") or {}).get("epub") or {})
    url = str(epub.get("url") or "")
    expected = str(epub.get("sha256") or "")
    if not url.startswith(MEDIA_ORIGIN) or not re.fullmatch(r"[a-f0-9]{64}", expected, re.I):
        raise ValueError("Source release has invalid EPUB artifact metadata")
    raw = request_bytes(url, timeout=180)
    actual = sha256_bytes(raw)
    if actual.casefold() != expected.casefold():
        raise ValueError(f"Source release hash mismatch: expected {expected}, got {actual}")
    return raw, epub


def process_backfill(*, limit: int, force: bool) -> int:
    if BACKFILL_STAGING_ROOT.exists():
        shutil.rmtree(BACKFILL_STAGING_ROOT)
    BACKFILL_STAGING_ROOT.mkdir(parents=True, exist_ok=True)

    ledger = load_json(LEDGER_PATH)
    staged: list[dict[str, Any]] = []
    processed_ids: list[str] = []

    for entry in ledger.get("entries") or []:
        if len(staged) >= limit:
            break
        if not isinstance(entry, dict):
            continue
        work_id = str(entry.get("workId") or "")
        if not work_id.startswith("pd-pg-") or not work_path(work_id).exists():
            continue
        work = load_json(work_path(work_id))
        current = entry.get("cover") if isinstance(entry.get("cover"), dict) else {}
        if not force and current.get("promptVersion") == COVER_PROMPT_VERSION and str(work.get("cover", {}).get("src", "")).endswith(".webp"):
            continue

        base_version = str(entry.get("releaseVersion") or work.get("publication", {}).get("activeRelease") or "")
        if not base_version:
            raise ValueError(f"{work_id} has no base release version")
        base_release = load_json(release_path(work_id, base_version))

        cover_pipeline = base_release.get("coverPipeline") if isinstance(base_release.get("coverPipeline"), dict) else {}
        source_release_version = str(cover_pipeline.get("sourceReleaseVersion") or base_version).strip()
        if cover_pipeline.get("embeddedCover") and source_release_version != base_version:
            source_url = str(entry.get("sourceEpub") or "").strip()
            expected_source_hash = str(entry.get("sourceEpubSha256") or "").strip()
            if not source_url.startswith("https://www.gutenberg.org/"):
                raise ValueError(f"{work_id} has no trusted original Gutenberg EPUB URL for cover refresh")
            if not re.fullmatch(r"[a-f0-9]{64}", expected_source_hash, re.I):
                raise ValueError(f"{work_id} has no trusted original EPUB hash for cover refresh")
            source_epub = request_bytes(source_url, timeout=180)
            actual_source_hash = sha256_bytes(source_epub)
            if actual_source_hash.casefold() != expected_source_hash.casefold():
                raise ValueError(
                    f"Original EPUB hash mismatch for {work_id}: expected {expected_source_hash}, got {actual_source_hash}"
                )
            current_artifact = ((base_release.get("artifacts") or {}).get("epub") or {})
            filename = str(current_artifact.get("filename") or f"{work_id}.epub")
            source_artifact = {"filename": filename, "sha256": expected_source_hash}
            print(f"[cover] refresh {work_id} from original source release {source_release_version}", flush=True)
        else:
            source_epub, source_artifact = download_release_artifact(base_release)
            filename = str(source_artifact["filename"])

        jpeg, _ = update_cover_assets(work_id, entry, work, force=True)
        enhanced = embed_cover(source_epub, jpeg)
        digest = sha256_bytes(enhanced)
        new_version = f"{source_release_version}-cover-v1"
        r2_key = f"works/{work_id}/editions/{new_version}/{filename}"

        new_release = copy.deepcopy(base_release)
        new_release["version"] = new_version
        new_release["releasedAt"] = utc_now()
        new_release["artifacts"]["epub"] = {
            "url": MEDIA_ORIGIN + r2_key,
            "filename": filename,
            "mimeType": "application/epub+zip",
            "sizeBytes": len(enhanced),
            "sha256": digest,
        }
        new_release["coverPipeline"] = {
            "promptVersion": COVER_PROMPT_VERSION,
            "model": COVER_MODEL,
            "sourceReleaseVersion": source_release_version,
            "sourceArtifactSha256": str(source_artifact["sha256"]),
            "embeddedCover": True,
        }
        dump_json(release_path(work_id, new_version), new_release)

        refreshed_work = load_json(work_path(work_id))
        refreshed_work["publication"]["lastUpdated"] = date.today().isoformat()
        refreshed_work["publication"]["version"] = new_version
        refreshed_work["publication"]["activeRelease"] = new_version
        refreshed_work["publication"]["editionLabel"] = "THIEPN Library public-domain edition (Project Gutenberg source)"
        dump_json(work_path(work_id), refreshed_work)

        stage_dir = BACKFILL_STAGING_ROOT / work_id
        stage_dir.mkdir(parents=True, exist_ok=True)
        local_path = stage_dir / filename
        local_path.write_bytes(enhanced)
        staged.append(
            {
                "workId": work_id,
                "version": new_version,
                "title": entry.get("title"),
                "localPath": str(local_path.relative_to(ROOT)),
                "r2Key": r2_key,
                "sizeBytes": len(enhanced),
                "sha256": digest,
            }
        )
        entry["cover"]["releaseVersion"] = new_version
        entry["cover"]["artifactSha256"] = digest
        processed_ids.append(work_id)
        print(f"[cover] backfilled {work_id} -> {new_version}", flush=True)

    dump_json(LEDGER_PATH, ledger)
    dump_json(BACKFILL_STAGING_ROOT / "artifacts.json", staged)
    make_contact_sheet(processed_ids)
    set_github_output("processed_count", str(len(staged)))
    set_github_output("work_ids", ",".join(processed_ids))
    print(f"[cover] backfill complete: {len(staged)} cover(s)", flush=True)
    return len(staged)


def make_contact_sheet(work_ids: list[str]) -> None:
    if not work_ids:
        return
    thumb_w, thumb_h = 240, 360
    label_h = 54
    cols = 5
    rows = (len(work_ids) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), (30, 30, 28))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(resolve_font(bold=False), size=17)
    for index, work_id in enumerate(work_ids):
        path = COVERS_ROOT / f"{work_id}.webp"
        with Image.open(path) as image:
            thumb = ImageOps.fit(image.convert("RGB"), (thumb_w, thumb_h), method=Image.Resampling.LANCZOS)
        x = (index % cols) * thumb_w
        y = (index // cols) * (thumb_h + label_h)
        sheet.paste(thumb, (x, y))
        draw.text((x + 10, y + thumb_h + 12), work_id, font=font, fill=(230, 226, 214))
    out = BACKFILL_STAGING_ROOT / "contact-sheet.jpg"
    sheet.save(out, format="JPEG", quality=88, optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate THIEPN Library covers and embed them into public-domain EPUB releases.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--new-staging", action="store_true", help="Enhance newly ingested .public-domain-staging EPUBs in place.")
    mode.add_argument("--backfill", action="store_true", help="Create new immutable cover-enhanced releases for existing public-domain works.")
    parser.add_argument("--limit", type=int, default=100, help="Maximum existing books to backfill.")
    parser.add_argument("--force", action="store_true", help="Regenerate covers even when the current prompt version is already present.")
    args = parser.parse_args()

    if args.new_staging:
        process_new_staging(force=args.force)
    else:
        process_backfill(limit=max(1, min(args.limit, 200)), force=args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
