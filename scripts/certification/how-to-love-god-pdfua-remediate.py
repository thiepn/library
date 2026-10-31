"""Fix *only* reproduced PDF/UA-1 machine defects in a private ephemeral QA copy.

No manuscript, source figures, release, or canonical outputs are modified.
The original PDF and the repaired PDF both require independent veraPDF checks.
Role-map to /Span meets PDF 1.7's structural type vocabulary but does not
prove emphasis semantics equivalent for screen readers: HUMAN HOLD remains.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import fitz
import pikepdf
from pikepdf import Dictionary, Name, String, Array

ROOT = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "book1-format-qa"
SOURCE = ROOT / "how-to-love-god-UNPUBLISHED-QA.pdf"
TARGET = ROOT / "how-to-love-god-PDFUA-REMEDIATED-QA.pdf"
REPORT = ROOT / "pdfua-remediation.json"

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def visible_label(page: fitz.Page, rect_pdf) -> str:
    bounds = page.rect
    x0,y0,x1,y1 = (float(v) for v in rect_pdf)
    # PyMuPDF text positions are top-left; the proof pages are unrotated A5.
    if page.rotation != 0:
        raise RuntimeError("Rotated proof page not qualified for link extraction")
    r = fitz.Rect(x0-2.0, bounds.height-y1-2.0, x1+2.0, bounds.height-y0+2.0)
    words=page.get_text("words")
    selected=[]
    for w in words:
        wr=fitz.Rect(w[:4])
        overlap=wr & r
        if wr.is_empty or overlap.is_empty:
            continue
        if overlap.get_area()/max(wr.get_area(),0.01) >= 0.45:
            selected.append(w)
    selected.sort(key=lambda w:(w[5],w[6],w[7]))
    label=" ".join(str(w[4]) for w in selected)
    return " ".join(label.split())

def failed_list_objgens() -> set[tuple[int,int]]:
    """Read exact failing SELI object references from the genuine baseline report."""
    raw=json.loads((ROOT/"pdfua-raw.json").read_text())
    val=raw["report"]["jobs"][0]["validationResult"][0]
    assert "PDF/UA-1" in val["profileName"]
    offending=set()
    reported=0
    for rule in val["details"]["ruleSummaries"]:
        if str(rule.get("clause"))!="7.2" or rule.get("testNumber")!=20 or rule.get("status")!="failed":
            continue
        reported=rule["failedChecks"]
        for item in rule.get("checks",[]):
            match=re.search(r"\((\d+)\s+(\d+)\s+obj\s+SELI\s+LI\)",item.get("context",""))
            if match and item.get("status")=="failed":
                offending.add((int(match[1]),int(match[2])))
    assert reported==29 and len(offending)==29, (
        "Must receive complete exact-object veraPDF list failures",reported,len(offending))
    return offending

def normalize_list_body(pdf: pikepdf.Pdf, offending: set[tuple[int,int]]) -> int:
    """Only wrap list children on the 29 directly failed veraPDF LI objects."""
    st=pdf.Root.StructTreeRoot
    seen=set()
    fixed=set()
    def walk(node):
        if not hasattr(node,"get"):return
        if getattr(node,"is_indirect",False):
            key=node.objgen
            if key in seen:return
            seen.add(key)
        k=node.get("/K")
        if k is None:return
        kids=list(k) if isinstance(k,Array) else [k]
        if node.get("/S")==Name("/LI") and node.objgen in offending:
            labels=[kid for kid in kids if hasattr(kid,"get") and kid.get("/S")==Name("/Lbl")]
            bodykids=[kid for kid in kids if kid not in labels]
            if not bodykids or any(hasattr(kid,"get") and kid.get("/S")==Name("/LBody") for kid in bodykids):
                raise RuntimeError(f"Unexpected list structure for verified failing LI: {node.objgen}")
            payload=bodykids[0] if len(bodykids)==1 else Array(bodykids)
            lbody=pdf.make_indirect(Dictionary({
                "/Type":Name("/StructElem"),"/S":Name("/LBody"),"/P":node,"/K":payload
            }))
            for kid in bodykids:
                if hasattr(kid,"get") and kid.get("/S") is not None:
                    kid["/P"]=lbody
            node["/K"]=Array(labels+[lbody])
            fixed.add(node.objgen)
            kids=labels+[lbody]
        for child in kids:walk(child)
    root_k=st.get("/K")
    for node in (list(root_k) if isinstance(root_k,Array) else [root_k]):
        if node is not None:walk(node)
    assert fixed==offending, {"unrepaired":sorted(offending-fixed),"extra":sorted(fixed-offending)}
    return len(fixed)

def main() -> None:
    assert SOURCE.is_file() and SOURCE.stat().st_size>100000
    original=SOURCE.read_bytes()
    counts={"linkAnnotations":0,"linkContentsAdded":0,"linksUsingVisibleText":0,
            "linksUsingRealTarget":0,"rolesMapped":0,"listItemsRepaired":0,"missingLabels":[]}
    with fitz.open(stream=original,filetype="pdf") as original_view, pikepdf.open(SOURCE) as pdf:
        assert len(pdf.pages)==len(original_view)==245, "Unexpected number of proof pages"
        before_text=sha256("\n".join(p.get_text() for p in original_view).encode("utf8"))
        st=pdf.Root.get("/StructTreeRoot")
        assert st is not None, "Proof lacks structural tagging"
        rm=st.get("/RoleMap")
        if rm is None:
            rm=Dictionary()
            st["/RoleMap"]=rm
        for key in ("/Em", "/Strong"):
            if key in rm and rm[key] != Name("/Span"):
                raise RuntimeError(f"Existing non-standard role {key} maps to another type: {rm[key]}")
            rm[key]=Name("/Span")
            counts["rolesMapped"]+=1
        counts["listItemsRepaired"]=normalize_list_body(pdf,failed_list_objgens())
        assert counts["listItemsRepaired"]==29, counts
        vp=pdf.Root.get("/ViewerPreferences")
        if vp is None:
            vp=Dictionary()
            pdf.Root["/ViewerPreferences"]=vp
        vp["/DisplayDocTitle"]=True
        pdf.docinfo["/Title"]=String("How to Love God — unpublished PDF/UA QA proof")
        with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
            meta["dc:title"]="How to Love God — unpublished PDF/UA QA proof"
            meta["pdfuaid:part"]="1"
        for index,page in enumerate(pdf.pages):
            for annot in page.get("/Annots",[]):
                if annot.get("/Subtype") != Name("/Link"): continue
                counts["linkAnnotations"]+=1
                if str(annot.get("/Contents","")).strip():continue
                label=visible_label(original_view[index],annot.get("/Rect"))
                if label:
                    # Numeric note markers need a navigational context.
                    if re.fullmatch(r"[0-9]{1,3}\.[0-9]{1,3}",label):
                        label="Endnote "+label
                    counts["linksUsingVisibleText"]+=1
                else:
                    action=annot.get("/A")
                    target=action.get("/URI") if action is not None else None
                    if target:
                        label="External link: "+str(target)
                    elif annot.get("/Dest") is not None:
                        label="Internal navigation link to "+str(annot.get("/Dest"))[:160]
                    if label:
                        counts["linksUsingRealTarget"]+=1
                if not label:
                    counts["missingLabels"].append({"page":index+1,"rect":str(annot.get("/Rect"))})
                    continue
                annot["/Contents"]=String(label[:280])
                counts["linkContentsAdded"]+=1
        if counts["missingLabels"]:
            print(json.dumps(counts,indent=2))
            raise RuntimeError("Cannot invent accessible descriptions for links with no visible label or target")
        assert counts["rolesMapped"]==2
        assert counts["linkAnnotations"]>=73, counts
        assert counts["linkContentsAdded"]>=73, counts
        pdf.save(TARGET,compress_streams=True)
    with fitz.open(TARGET) as remediated:
        assert len(remediated)==245
        after_text=sha256("\n".join(p.get_text() for p in remediated).encode("utf8"))
        assert before_text==after_text, "Text extraction changed after PDF structural remediation"
    with pikepdf.open(TARGET) as proof:
        assert proof.Root.ViewerPreferences.DisplayDocTitle is True
        assert "/Metadata" in proof.Root
        assert proof.Root.StructTreeRoot.RoleMap["/Em"]==Name("/Span")
        assert proof.Root.StructTreeRoot.RoleMap["/Strong"]==Name("/Span")
        assert "/Metadata" in proof.Root
        assert b"pdfuaid" in proof.Root.Metadata.read_bytes()
        all_links=[a for p in proof.pages for a in p.get("/Annots",[]) if a.get("/Subtype")==Name("/Link")]
        assert len(all_links)==counts["linkAnnotations"]
        assert all(str(a.get("/Contents","")).strip() for a in all_links)
    report={"verdict":"PROOF_POSTPROCESS_PASS_REQUIRES_VERAPDF",
            "originalPdfSha256":sha256(original),"repairedPdfSha256":sha256(TARGET.read_bytes()),
            "pages":245,"textPreservedSha256":before_text,"changes":counts,
            "metadataXmp":True,"displayDocTitle":True,
            "limitations":["Mapping emphasis to PDF 1.7 Span may lose emphasis-specific assistive semantics",
                           "Annotation labels are extracted from visual text or original link targets, not human-approved",
                           "Must run independent veraPDF PDF/UA-1 after this step",
                           "Neither file is an approved publication or a release artifact"]}
    REPORT.write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))
if __name__=="__main__":
    main()
