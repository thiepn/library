# Library

A static-first digital publishing library for long-form books, essays, research editions, and courses.

## Product surface

- Editorial catalog and publication pages
- Clean web reader with chapter navigation
- Reader typography controls and light/dark appearance
- Local saved-library state and reading progress
- Chapter notes stored locally in the browser
- Full-text search index
- PDF edition viewer and EPUB download support
- Offline-capable PWA shell
- Deterministic, versioned JSON content contracts
- GitHub Pages deployment under `/library/`

The public site is designed to live at `https://thiepn.dev/library/`.

## Development

```bash
npm install
npm run dev
```

Production validation:

```bash
npm run check
```

## Publishing a work

A publication is data, not hard-coded UI. Add:

1. a catalog entry in `public/content/catalog.json`;
2. a versioned work manifest under `public/content/works/<slug>/manifest.json`;
3. ordered chapter JSON documents referenced by that manifest;
4. optional PDF/EPUB files referenced by `formats`;
5. search entries in `public/content/search-index.json`.

`npm run validate:content` rejects duplicate IDs/slugs, broken chapter references, missing edition files, manifest mismatches, and invalid search references before deployment.

## Current state

The application shell and publishing infrastructure are implemented. The catalog intentionally contains no placeholder publications. The next release operation is the first real publication import.
