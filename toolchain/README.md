# DN toolchain

Everything a Digi News build session needs, so a run outside the claude.ai Project
(scheduled, unattended, or a fresh sandbox) can bootstrap from this repo alone.
The Project's knowledge files are the editing copies; this folder mirrors them.

Node 18+ and Python 3. **jsdom is the only dependency.**

## Files

| File | What it is | When it's used |
|---|---|---|
| `digi-news-house-template-v3-3-3.html` | House template: chrome, CSS tokens and the embedded DN chart library. **Canonical.** | Never read; `dn-build.py` and `dn-preflight.js` splice from it |
| `dn-build.py` | Assembler. Splices `piece/` into the template; owns the masthead, `<title>`, Corrections, "Figures to", version line and filename | Build step 6 |
| `dn-preflight.js` | Geometry + silent-failure gate on `piece/init.js` alone, before prose is written | Build step 4 |
| `dn-lint.js` | Structural gate on the assembled file: sourcing, a11y, self-containment, footer, feed meta, tile, honesty slots, presentation contracts | Build step 7 |
| `dn-probe.js` | Geometry gate on the assembled file at 360px and 680px | Build step 7 |
| `dn-harness.js` | jsdom loader with the toolkit's polyfills. Required by the three gates; also usable for bespoke checks (`loadPiece()` → `charts()` / `render(w)` / `errors`; always `close()`) | Library |
| `dn-redate.js` | Moves an already-shipped piece to a new date; refuses on date-dependent content | Redates only |
| `DN-API.md` | Chart toolkit reference: primitives, spec fields, label budgets, silent failures, markup contracts. Replaces reading the template | Read once per build |
| `SESSION-PROTOCOL.md` | Build order, context discipline, bootstrap, the two dates, redating | Read first |
| `digi-news-standards-rubric-v3.md` | Binding editorial standards: source tiers, assumption firewall, accessibility floor, length tiers, footer | Only on a contested call |
| `digi-news-prepublish-checklist-3.md` | Pre-publish checklist mapped to rubric sections | At the gate step |
| `addendum-digi-reporter.md` | The `dn:statlabel` tile-kicker rule (also gated by the linter) | Only if a kicker call is unclear |
| `site-sections-and-tracking.md` | Site sections (`report`/`puzzle`/`game`), the tracker-line exception, admin | When publishing or rebuilding a shipped piece |

Not here, by design: the project instructions (they live in the claude.ai Project),
any per-piece `verify.js` (written fresh for each piece), and any secret.

## Bootstrap

Working directory `~/b`. Sparse clone, so only `toolchain/` is checked out:

```bash
mkdir -p ~/b && cd ~/b \
  && git clone -q --depth 1 --filter=blob:none --sparse \
       https://github.com/alecldarlow-cell/digi-news.git repo \
  && git -C repo sparse-checkout set toolchain \
  && cp repo/toolchain/dn-*.js repo/toolchain/dn-build.py repo/toolchain/DN-API.md \
       repo/toolchain/digi-news-house-template-v3-3-3.html . \
  && npm install jsdom --silent && mkdir -p piece
```

Standards docs stay in `~/b/repo/toolchain/` and are read from there on demand.
To pull a shipped piece for context or a rebuild:
`git -C ~/b/repo show HEAD:reports/<file>.html > <file>.html`.

## Build sequence

All commands run from `~/b`. Pipe gate output through `tail`.

1. **`verify.js`** — compute every derived figure in Node from the sourced inputs and
   print the locked outputs. Printed figures in the piece must equal these.
2. **Spine checkpoint** — one line to the desk: confirmed, or changed and why.
3. **`piece/init.js`** — chart init body, no `<script>` wrapper. Build from `DN-API.md`.
4. **Preflight** — `node dn-preflight.js piece/init.js` → must print `PREFLIGHT: PASS`.
5. **Prose** — `piece/body.html` (from `<div class="head">` to the last `</section>`),
   `piece/footer.html` (Method and Sources divs only), `piece/meta.json`:
   ```json
   { "headline": "…", "standfirst": "…", "topic": "Science", "date": "YYYY-MM-DD",
     "kind": "report", "read": "~4 min", "slug": "topic-slug", "version": "v1.0",
     "statlabel": "optional, <=14 chars", "built": "optional, data-currency date" }
   ```
6. **Assemble** — `python3 dn-build.py --piece piece` → writes `YYYY-MM-DD-slug.html`.
   Never patch the output; edit `piece/` and rebuild.
7. **Lint** — `node dn-lint.js <file>.html --width 360 --date <dn:date>` → `CLEAR`, or
   `PASS WITH WARNINGS` with each warning justified.
   **Probe** — `node dn-probe.js <file>.html` → `GATE: PASS`.
8. **Accessibility** — confirm lint's §8 lines (aria-label, SVG title, hidden data
   table on every chart, renders at 360px) and that colour is never the sole
   carrier. Then hand over the **visual check as outstanding**: every gate runs in
   jsdom, which has no fonts, layout or paint, so name the exhibits and the
   failure modes worth looking at in a real browser.

Chained, steps 6–7:

```bash
python3 dn-build.py --piece piece && F=$(ls -t 20*.html | head -1) \
  && node dn-lint.js "$F" --width 360 --date "${F:0:10}" | tail -8 \
  && node dn-probe.js "$F" | tail -4
```

## Publishing

Copy the file into `reports/` of a clone and push to `main`; the site's
`build-feed.yml` workflow injects the tracker line and rebuilds `feed.json`.
Push credentials are never stored in this repo — supply a token at run time
(for example from an environment secret written to `~/.dn/token`, mode 600) and
never echo it.
