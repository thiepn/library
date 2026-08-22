# L17 — First Real Publication: AI for the Kingdom

## Implemented publication payload

- Work ID: `ai-for-the-kingdom`
- Library release: `1.0.0-rc4`
- 8 native Part opening pages
- 41 numbered chapters
- Conclusion — Go
- 4 front-matter reader entries
- Glossary, bibliography and index as native reader entries
- EPUB endnotes converted to chapter-local Markdown footnotes
- Screen-first PDF registered as the PDF edition
- EPUB registered as the ebook edition
- WebP catalog cover generated from the approved Phase 38/39 cover master
- SHA-256 and byte size recorded for immutable binary assets

## Fidelity certification

The 42 main reading units (41 numbered chapters plus Conclusion — Go) were compared against the frozen EPUB source after removing only reader metadata such as stable heading IDs. Result: **PASS** with 1.000 minimum and 1.000 average normalized token fidelity. All 57 EPUB endnote references are represented by 57 chapter-local Markdown footnote definitions.

## Publication identity

The public author/byline remains intentionally absent because it has not been supplied. L17 does not infer it from account/profile data. The library release remains `1.0.0-rc4` rather than being silently promoted to final `1.0.0`.

## Repository recovery constraint

The GitHub `thiepn/library` repository currently contains only its bootstrap README. The previously generated cumulative L14 source ZIP exists in the ChatGPT Library, but this runtime cannot materialize its raw bytes. Therefore L17 is packaged strictly against the recovered L2/L10/L14 content contracts and must be merged with the cumulative Library application source before deployment.

## GitHub staging rule

The branch `l17/ai-for-the-kingdom-publication` contains the Work/release metadata and a native chapter proof. The complete validated 57-file publication tree is carried by `AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip`; do not manually retype the remaining source through the GitHub API. Import that package atomically once the cumulative Library application source is restored, then run the normal content/publication validation and deployment pipeline.
