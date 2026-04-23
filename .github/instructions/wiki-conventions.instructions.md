---
description: "Wiki documentation conventions for the docs/wiki/ directory. Enforces Kebab-Case filenames, .md extension cross-page links, proper anchor generation, TOC structure, and code-rooted accuracy. Applied automatically when editing wiki files."
applyTo: "docs/wiki/**"
---

# Wiki Documentation Conventions

When editing files in `docs/wiki/`, follow these rules:

## Link Formats

- Cross-page: `[Page Name](Page-Name.md)` — always include `.md` extension, no path prefix
- Anchors: lowercase, hyphens for spaces, strip punctuation — `#section-name`
- Cross-page anchors: `[Section](Page-Name.md#section-name)`
- External: full URL — `[Site](https://example.com)`
- Images: raw GitHub CDN — `![alt](https://raw.githubusercontent.com/MountainManTechnology/Serendip.bot/main/...)`

## Structure

- Single `#` heading (page title) only once per file
- `##` for major sections, `###` for subsections
- Horizontal rules (`---`) between major sections
- Table of Contents after the intro paragraph
- "See Also" section at the bottom with cross-page links
- All code blocks must specify a language

## File Naming

- Kebab-Case: `API-Reference.md`, `Database-Schema.md`
- `Home.md` is the wiki entry point

## Accuracy

- Cross-reference source code before writing — read the actual files
- Use real code snippets, not fabricated examples
- Update `docs/wiki/.doc-map.json` if covering new source paths
- Update `Home.md` TOC when adding new pages
