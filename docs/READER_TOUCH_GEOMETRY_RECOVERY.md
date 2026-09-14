# Reader touch geometry recovery

This recovery documents the production deployment repair for Deploy Library run `34751544799` after public-domain batch #105 merged at `4ed22f90875440ea8cac65be502fb7f00c76df2b`.

The retained RR6 evidence showed that EPUB.js can render a paginated iframe several CSS page widths wide and translate it behind the visible reader viewport. Touch `clientX` is already expressed in CSS pixels, so multiplying it by an iframe-width ratio can double-transform the coordinate and misclassify visible right, center, and left tap zones.

The repair keeps touch classification in one CSS coordinate space. It first resolves section-relative coordinates through the translated frame offset, accepts a visible-viewport-local representation when a mobile engine normalizes `clientX`, and otherwise falls back to the existing guarded iframe-local/screen-coordinate paths. Publication controls remain excluded from reader gestures and compatibility-click deduplication remains unchanged.

No publication, copyright, provenance, security, release, accessibility, ergonomics, or deployment gate is relaxed by this recovery. The exact final pull-request head must pass every applicable qualification workflow before merge, and the resulting `main` SHA must pass the complete Deploy Library pipeline and exact live production identity verification before batch #105 is considered published.
