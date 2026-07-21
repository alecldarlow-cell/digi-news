# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Digi News is a static, no-build data-journalism site. There is no server, no package.json, no build
step beyond a single Node script. Content is authored as self-contained HTML files (reports and
puzzles); a front page (`index.html`) reads a generated `feed.json` and renders a filterable card
list; a GitHub Action regenerates `feed.json` whenever content changes or nightly.

```
index.html          front page — fetches feed.json client-side, no framework
feed.json            generated index of every report/puzzle (DO NOT hand-edit — see below)
reports/             every published piece: data-journalism reports AND puzzles (see note below)
tools/build-feed.js  the only build step — scans reports/ (+ puzzles/) and writes feed.json
.github/workflows/build-feed.yml   runs tools/build-feed.js on push and nightly at 02:00 UTC
```

**Important quirk:** `tools/build-feed.js` and the HTML templates' own comments still refer to a
`puzzles/` directory, but no such directory currently exists — puzzles (crosswords, Doku, Path,
Sweep) are committed into `reports/` alongside data reports. The build script handles both
locations (`DIRS` in `build-feed.js`), so don't assume a piece's directory tells you its kind; the
`dn:kind` meta value (or the file's own puzzle-vs-report chrome) is the source of truth.

## Commands

There is no npm/build/test/lint tooling. The only script in the repo:

```bash
# Rebuild feed.json from whatever is in reports/ (+ puzzles/) — needs Node 18+, no deps
node tools/build-feed.js

# Preview forward-dated (embargoed) pieces without waiting for their release day
FEED_INCLUDE_FUTURE=1 node tools/build-feed.js
# Never set FEED_INCLUDE_FUTURE in the workflow — it would ship tomorrow's cards today.
```

Run this after adding/editing/removing any file in `reports/` so `feed.json` reflects it locally;
CI does the same thing automatically on push (and nightly, to release embargoed pieces without a
push) and commits the result with `chore: rebuild feed.json [skip ci]`. Never hand-edit
`feed.json` — it's fully derived and will be overwritten.

There is no test suite. Verify a change by opening `index.html` in a browser (or serving the repo
root statically) after running the build script, and by opening the individual piece's HTML file
directly — every piece must render standalone with no server.

## How a piece becomes a front-page card

1. A report or puzzle is a single self-contained HTML file dropped into `reports/` (styles, charts,
   and puzzle logic are inlined — no shared JS/CSS files to import).
2. Its `<head>` carries a **DN FEED META block** — the contract between the piece and the feed
   builder:
   ```html
   <meta name="dn:headline"   content="…">   <!-- verbatim h1 -->
   <meta name="dn:standfirst" content="…">
   <meta name="dn:topic"      content="…">   <!-- controlled vocabulary, see below -->
   <meta name="dn:date"       content="YYYY-MM-DD">
   <meta name="dn:kind"       content="report|puzzle">
   <meta name="dn:read"       content="~8 min">   <!-- optional -->
   <meta name="dn:thumb"      content="url">      <!-- optional -->
   <meta name="dn:statlabel"  content="…">        <!-- optional, ~16 chars max, overrides hero-stat caption -->
   ```
   Anything missing is inferred from `<title>`/`<h1>`/`.topic`/`.standfirst` or the filename
   (`YYYY-MM-DD-topic-slug.html`) — a piece never drops off the index for missing metadata, but
   fill it in; the fallback logs a warning in the Actions log and is "dumber than you."
3. `tools/build-feed.js` scans the directory, extracts that metadata plus a card thumbnail, sorts
   newest-first, and writes `feed.json`.
4. `index.html` fetches `feed.json` at load and renders cards client-side, with tab (report/puzzle),
   topic-chip, and text-search filtering. If `feed.json` is missing (e.g. Action hasn't run yet), it
   falls back to listing `reports/`/`puzzles/` live via the GitHub contents API and labels the
   result "provisional."

### Publication embargo

A piece can be committed ahead of its release day. `dn:date` is compared against "today" in
**Europe/London** (the desk's fixed timezone, so BST/UTC drift never moves the boundary) at
build time; anything dated later is held out of `feed.json` until that date, then released by the
nightly cron without needing a push. The file itself is still live at its own URL the whole time —
only the front-page card is withheld ("a filtered feed hides the card, not the document").

### Controlled topic vocabulary

`dn:topic` drives the front-page filter chips and is a controlled vocabulary — **one beat, one
label** — defined in `tools/build-feed.js` (`TOPICS` / `TOPIC_ALIASES`):

```
UK politics · Economy · Immigration · AI · Science · Medicine · Society · World · Logic · Crossword
```

Known synonyms (e.g. "Politics", "Westminster", "Tech", "Health") are silently mapped to the
canonical label with a build warning. An unrecognized topic is kept verbatim and gets its own chip
(with a warning) rather than being mangled — adding a genuinely new beat is a deliberate edit to
that list, not a typo.

### Hero stats and puzzle thumbnails

- **Reports**: the card thumbnail shows the piece's first "hero stat" (`.herostats .n`), read
  straight out of the rendered HTML. Hero stats must be **measured figures, never projections** —
  this is a hard house rule enforced by convention in every report's own template comments, not by
  the build script. The builder rejects placeholder/dash values (e.g. an unscored interactive
  slot showing "—/100") and figures over 8 characters.
- **Puzzles**: the card thumbnail is a same-shape preview of the puzzle's own grid (never a
  spoiler — only which cells are blocks (`#`) or pre-locked (`L`) travels, never a letter), parsed
  out of the puzzle's inline `grid`/`locked` JS object literals by regex. Supports 5×5 (Mini, Doku,
  Sweep) and 6×6 (Path) grids only.

## The report template ("DN HOUSE TEMPLATE", currently v3.2)

Every report is built by copying the previous report's HTML and replacing content — there is no
shared layout file. Each report's `<head>` contains a large HTML comment documenting the template
version and its own changelog; **read that comment block first** when editing or authoring a
report, since conventions have evolved (v1 → v3.2) and are only recorded there.

Key conventions baked into that template:

- **Embedded charting library, `DN.*`** (inlined per-file, no external deps): `DN.line`,
  `DN.bars`, `DN.columns`, `DN.slope`, `DN.scatter`, `DN.rangeStrip`, `DN.sankey`. All charts are
  real-pixel responsive (SVG unit = CSS px via `ResizeObserver`), use an Okabe-Ito (colourblind-safe)
  categorical palette, and emit a visually-hidden data `<table>` for screen readers/auditing.
  Reference each chart type's option shape in the template's "DN QUICK REFERENCE" comment.
- **Sourcing**: inline numbered citations with source-tier badges — `T1` (primary/official data),
  `T2` (secondary analysis/commentary), `T3` — so evidentiary strength is visible at the point of
  each claim. Every piece ends with a `Method` block (what exactly was measured/compared) and a
  `Sources` list (highest tier first).
- **Honesty structure**: a "What we don't know" box and caveat card are used whenever data is
  thin, lagged, modelled, or causation is unproven. `.positions` blocks (steelmanning both sides)
  are used only when a topic is genuinely contested. A "Go deeper" box is used only when material
  was deliberately cut to hold length.
- **Never let a projection/scenario be the headline or a hero stat.** Modelled/forecast figures
  must be visually cordoned (dashed/hatched treatment in charts) and clearly labelled as such —
  the measured figure leads.
- Footer carries `Method`, `Sources`, and `Corrections` (logged with a date, or "None"), plus a
  version line.
- Shared design tokens (CSS custom properties): ink `#15171C`, cobalt/accent `#1C46C2`,
  contrast-red `#E0312A` (charts only), on canvas `#FCFCFB` — kept consistent across `index.html`
  and every report/puzzle so a piece reads as part of the same publication.

When authoring a new report, copy an existing recent report file wholesale (to inherit the current
template version, chrome, and footer), then replace the DN FEED META block, headline/standfirst,
exhibits, and footer Method/Sources/Corrections — don't build the chrome from scratch.

## Puzzles

Puzzle files (`*-crossword-mini-*.html`, `*-logic-doku-*.html`, `*-logic-path-*.html`,
`*-logic-sweep-*.html`) follow their own self-contained template with an inline "puzzle object"
(`grid`, `locked`, `clues`, etc., as plain JS array/object literals — kept plain deliberately so the
feed builder can regex-parse them without a JS parser). Don't reformat this object in a way that
breaks that regex parsing (see `puzzleMask()` in `tools/build-feed.js`) — e.g. keep `grid:` and
`locked:` as literal array-of-arrays assignments.
