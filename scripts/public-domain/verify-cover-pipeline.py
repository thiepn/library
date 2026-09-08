#!/usr/bin/env python3
from __future__ import annotations

import io
import xml.etree.ElementTree as ET
import zipfile

from PIL import Image, ImageDraw

import cover_pipeline as pipeline


def synthetic_art() -> bytes:
    image = Image.new("RGB", (1024, 1536), (74, 80, 88))
    draw = ImageDraw.Draw(image)
    for y in range(1536):
        shade = 50 + (y * 80 // 1535)
        draw.line((0, y, 1024, y), fill=(shade, min(150, shade + 20), min(170, shade + 35)))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def synthetic_epub() -> bytes:
    container = b'''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>'''
    opf = b'''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:test</dc:identifier>
    <dc:title>Test Book</dc:title>
  </metadata>
  <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="chapter"/></spine>
</package>'''
    chapter = b'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><p>Test.</p></body></html>'''
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("mimetype", b"application/epub+zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
        archive.writestr("EPUB/package.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
        archive.writestr("EPUB/chapter.xhtml", chapter, compress_type=zipfile.ZIP_DEFLATED)
    return output.getvalue()


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def verify_render() -> None:
    jpeg, webp = pipeline.render_cover(
        synthetic_art(),
        "A Deliberately Long Classic Book Title for Cover Typography Testing",
        "Example Author",
    )
    for payload, expected_format in ((jpeg, "JPEG"), (webp, "WEBP")):
        with Image.open(io.BytesIO(payload)) as image:
            assert image.size == (1024, 1536)
            assert image.format == expected_format


def verify_epub_embedding() -> None:
    jpeg, _ = pipeline.render_cover(synthetic_art(), "Test Book", "Example Author")
    enhanced = pipeline.embed_cover(synthetic_epub(), jpeg)
    with zipfile.ZipFile(io.BytesIO(enhanced), "r") as archive:
        infos = archive.infolist()
        assert infos[0].filename == "mimetype"
        assert infos[0].compress_type == zipfile.ZIP_STORED
        assert archive.read("mimetype") == b"application/epub+zip"
        assert "EPUB/images/thiepn-cover.jpg" in archive.namelist()
        assert "EPUB/thiepn-cover.xhtml" in archive.namelist()

        root = ET.fromstring(archive.read("EPUB/package.opf"))
        manifest_items = [node for node in root.iter() if local_name(node.tag) == "item"]
        cover_items = [node for node in manifest_items if "cover-image" in node.attrib.get("properties", "").split()]
        assert len(cover_items) == 1
        cover_id = cover_items[0].attrib["id"]
        assert cover_items[0].attrib["href"] == "images/thiepn-cover.jpg"

        page_items = [node for node in manifest_items if node.attrib.get("href") == "thiepn-cover.xhtml"]
        assert len(page_items) == 1
        page_id = page_items[0].attrib["id"]
        spine_refs = [node for node in root.iter() if local_name(node.tag) == "itemref"]
        assert any(node.attrib.get("idref") == page_id for node in spine_refs)
        assert cover_id != page_id


def main() -> int:
    verify_render()
    verify_epub_embedding()
    print("PUBLIC_DOMAIN_COVER_PIPELINE_REGRESSION_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
