"""Nonpublishing metadata writer for an already validated, *ephemeral* tagged PDF.

Changing PDF metadata invalidates its previous exact-byte veraPDF result.
This script NEVER writes a release artifact or registers an edition.
"""
import json
from pathlib import Path
import sys
import pikepdf
from pikepdf import String

def apply_metadata(pdf, data):
    assert data.get("mode") == "NONPUBLISHING_REHEARSAL_ONLY"
    assert data.get("publication") == "NO_GO"
    title, author, rights = (data.get(k) for k in ("title", "creator", "rights"))
    assert all(isinstance(s,str) and s.strip() for s in (title,author,rights))
    assert "UNPUBLISHED" not in author.upper()
    pdf.docinfo["/Title"] = String(title)
    pdf.docinfo["/Author"] = String(author)
    with pdf.open_metadata(set_pikepdf_as_editor=False, strict=True) as meta:
        meta["dc:title"] = title
        meta["dc:creator"] = [author]
        meta["dc:rights"] = rights
        # Do not assert fresh PDF/UA conformance: independent veraPDF must retest bytes.

def selftest():
    from tempfile import TemporaryDirectory
    data={"mode":"NONPUBLISHING_REHEARSAL_ONLY","publication":"NO_GO",
          "title":"How to Love God","creator":"Test & Co.","rights":"© Test Holder"}
    with TemporaryDirectory(prefix="book1-pdf-metadata-") as d:
        dest=Path(d)/"sample.pdf"
        with pikepdf.new() as pdf:
            pdf.add_blank_page(page_size=(420,595))
            apply_metadata(pdf,data)
            pdf.save(dest)
        with pikepdf.open(dest) as pdf:
            assert str(pdf.docinfo["/Title"]) == data["title"]
            assert str(pdf.docinfo["/Author"]) == data["creator"]
            with pdf.open_metadata() as meta:
                assert meta["dc:title"] == data["title"]
                assert meta["dc:creator"] == [data["creator"]]
                assert meta["dc:rights"] == data["rights"]
    print(json.dumps({"status":"SYNTHETIC_PDF_INFO_XMP_MAPPING_PASS",
                      "realFinalPDF":"NOT_GENERATED","release":"NO_GO"}))

def prepare(args):
    if len(args)!=3:
        raise SystemExit("Expected exact private input, output, normalized JSON paths")
    source,out,metadata=map(Path,args)
    assert source.name=="how-to-love-god-PDFUA-FINAL-QA.pdf"
    assert out.name=="how-to-love-god-FINAL-METADATA-REHEARSAL-QA.pdf"
    assert metadata.name=="how-to-love-god-FINAL-METADATA-REHEARSAL.json"
    assert source.parent==out.parent==metadata.parent
    assert source.is_file() and metadata.is_file() and not out.exists()
    data=json.loads(metadata.read_text("utf8"))
    import hashlib
    expected=data.get("inputProofSha256",{}).get("pdf")
    assert isinstance(expected,str) and len(expected)==64, "Normalized PDF source digest absent"
    assert hashlib.sha256(source.read_bytes()).hexdigest()==expected, "QA proof PDF changed after authority review"
    with pikepdf.open(source) as pdf:
        assert len(pdf.pages)==245
        assert pdf.Root.get("/StructTreeRoot") is not None
        apply_metadata(pdf,data)
        pdf.save(out,compress_streams=True)
    with pikepdf.open(out) as pdf:
        assert len(pdf.pages)==245
        assert str(pdf.docinfo.get("/Author"))==data["creator"]
        with pdf.open_metadata() as meta:
            assert meta["dc:creator"]==[data["creator"]]
            assert meta["dc:rights"]==data["rights"]
    print(json.dumps({"status":"QA_REHEARSAL_METADATA_WRITTEN_NEEDS_INDEPENDENT_VERAPDF",
                      "pages":245,"release":"NO_GO"}))

if __name__=="__main__":
    if sys.argv[1:]==["--self-test"]:selftest()
    elif len(sys.argv)==5 and sys.argv[1]=="--prepare":prepare(sys.argv[2:])
    else:raise SystemExit("Modes: --self-test or --prepare INPUT OUTPUT NORMALIZED_JSON")
