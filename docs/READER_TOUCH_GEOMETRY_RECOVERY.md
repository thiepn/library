# Reader touch geometry recovery

This recovery documents the production deployment repair for Deploy Library run `34751544799` after public-domain batch #105 merged at `4ed22f90875440ea8cac65be502fb7f00c76df2b`.

The retained RR6 evidence showed that EPUB.js can render a paginated iframe several CSS page widths wide and translate it behind the visible reader viewport. Touch `clientX` can therefore arrive either in iframe-local translated coordinates or already in visible-reader CSS coordinates. The repair resolves normal iframe-local input back into the visible reader using the iframe and reader viewport rectangles, while accepting an already-visible `clientX` only when the geometry-derived coordinate falls outside the reader. Same-origin CSS frame geometry is authoritative when it yields a visible tap; `screenX` is only a final fallback because emulated and physical mobile engines can expose a different screen origin.

The retained cross-engine evidence also exposed a second boundary condition: a valid touch tap may be unhandled when the reader cannot advance farther, but the browser can still synthesize a compatibility `click` afterward. If that click survives, it is interpreted independently using iframe-local mouse coordinates and can turn an unintended second page. A qualifying non-interactive touch tap now owns and suppresses its immediate compatibility click whether or not the reader action changed location. Interactive controls, selections, swipes, standalone click-only input, keyboard input, and independent desktop clicks retain their existing behavior.

This recovery changes only reader touch-coordinate normalization and compatibility-click deduplication. It does not alter acquisition, copyright, provenance, cover, immutable release, R2, certification, accessibility, ergonomics, security, or deployment policy.

The exact final pull-request head must pass every applicable qualification workflow before merge, and the resulting `main` SHA must pass the complete Deploy Library pipeline and exact live production identity verification before batch #105 is considered published.
