# DN chart toolkit — working reference

For house template **v3.3.3**. Every field below was read off the library source
in this revision; every number was measured by rendering. Fields not listed are
not consumed.

**Read this instead of the template.** The library block is ~840 dense lines and
was being re-read every build to recover the same dozen facts. If something here
is contradicted by the template, the template wins and this file is stale — say
so and fix it.

> **Revision note (5 Aug 2026).** The previous edition documented three fields
> that do not exist (`line.dashed`, `rangeStrip.hatched`, integer indexing into
> `DN.colors`) and omitted several that do. Those errors caused rendering
> failures in four shipped pieces. All three are now also blocked at
> `dn-preflight.js`, so the doc is no longer the only line of defence.

---

## 1. The seven primitives

All are called `DN.<n>("#hostId", spec)`. Every one auto-emits `aria-label`
(title + summary), an SVG `<title>`, and a visually-hidden data table. You never
write those by hand — but `summary` is what the aria-label is built from, so an
empty summary is an accessibility failure the linter will catch.

| Primitive | Shape | Required spec fields |
|---|---|---|
| `DN.line` | trend over a numeric x | `series[{name, points[{x,y}]}]` |
| `DN.bars` | ranked horizontal comparison | `data[{label, value}]` |
| `DN.columns` | grouped/stacked vertical | `series[{name}]`, `groups[{label, values{}}]` |
| `DN.slope` | two-point before/after | `left`, `right`, `items[{label, from, to}]` |
| `DN.scatter` | two continuous variables | `points[{x, y}]` |
| `DN.rangeStrip` | time spans / event timeline | `events[]`, `mode` |
| `DN.sankey` | flow between stages | `nodes[{id,label}]`, `links[{source,target,value}]` |

Also exported: `DN.fmt(v, opts)`, `DN.colors`, `DN.palette`, `DN.niceScale`.

**`DN.colors` and `DN.palette` are different things.**

- `DN.palette` is the **array** — Okabe–Ito, colour-blind safe. Index it:
  `DN.palette[0]` … `DN.palette[7]`. This is what you want for categorical series.
  `#0072B2 #E69F00 #009E73 #CC79A7 #56B4E9 #D55E00 #9B870C #666666`
- `DN.colors` is a **semantic token object**, not an array:
  `ink · axis · hair · faint · paper · subject · muted · pos · neg · proj · band`.
  Use `DN.colors.subject`, never `DN.colors[0]` — the latter returns `undefined`,
  which becomes `fill="undefined"` and paints black.

---

## 2. Measured label budgets

Character counts at which the label starts to ellipsise. The renderer measures
width as `chars × fontPx × 0.52`, so these are **exact character counts, not
glyph-dependent** — a string of Ws and a string of i's budget identically.

| Primitive | 360px | 680px | Notes |
|---|---|---|---|
| `bars` label | **24** | 43 | *per line*; multi-word labels wrap to 2 lines (~48 total) |
| `rangeStrip` rows label | **21** | 43 | wraps to 2 lines, then ellipsises |
| `columns` group label | **26** | 53 | single line, ellipsised at the group width |
| `slope` left label | **13** | 20 | the tightest budget in the toolkit |
| `sankey` node label | **12** | 22 | hard cap `labCap`, not a measurement |

`rangeStrip` **barcode** mode rotates event labels vertically; the constraint
there is the strip height, roughly 12–14 characters at 360px.

Two things follow. First, **slope and sankey are the ones that bite** — 13 and 12
characters is barely two words. Second, the old "~22 chars everywhere" rule of
thumb was wrong in both directions. Use the table, or just run `dn-preflight.js`,
which renders the real thing.

`scatter` point labels are the one exception: they flip to the other side of the
marker if they would overrun the right edge, but they are **never truncated and
never collision-checked against each other**. Keep them to a handful of points.

---

## 3. The silent failures

These produce no error, no warning, and a chart that looks plausible.
`dn-preflight.js` catches 1–5; 6–8 need your eye or a real browser.

**1 — `bars` and `columns` are zero-anchored.** Both scale with `niceScale(0, max)`.
A negative value renders at or behind the axis and vanishes, *while still appearing
in the accessibility table* — so the chart and its own data table disagree. There is
no diverging bar primitive. For a fall, either plot the absolute magnitude with
direction in the label, or use `rangeStrip` spanning the two endpoints so bar length
equals the change.

**2 — `line` and `scatter` need numeric x.** The scale does arithmetic on the domain;
a string x gives NaN coordinates and the path collapses to nothing. Categorical
axes are not supported. Put display formatting in `x.fmt`.

**3 — `x.fmt` feeds two consumers at once.** It renders the axis ticks *and* the
Start/End columns of the hidden accessibility table. A verbose formatter
(`"16 Aug 2025"`) crowds the axis at 680px, where `thinTicks` keeps more ticks than
at 360px — this is why 680 fails while 360 passes. Keep `x.fmt` terse and carry full
precision in each event's `label`. Conversely, a formatter that rounds for display
introduces drift into the audit table.

**4 — dead spec fields are ignored in silence.** `hatched:` and `dashed:` are not
read by anything. Passing them does not throw; the projection simply renders as
solid, identical to measured data. That is an assumption-firewall breach with both
gates green. The projection mechanism is **`projectFrom`** on the series (line) or
the event (rangeStrip) — see §4.

**5 — `DN.colors[0]` is `undefined`.** See §1. Marks paint black, and a chart whose
colour encoding has collapsed still passes geometry.

**6 — the first hero stat is capped at 8 characters.** `tools/build-feed.js` strips
tags from the first `.n` and rejects the tile if the result exceeds 8 chars, has no
digit, or contains a dash — falling back silently to a generic card.
`2.25<small>births</small>` is 10 characters and fails. Keep a symbol unit
(`%`, `×`, `£`) inside `.n`; move any word unit into `dn:statlabel`. Gated by
`dn-lint.js`.

**7 — small marks suppress their own labels.** Two hard thresholds, both silent:

| Primitive | Threshold | What disappears |
|---|---|---|
| `rangeStrip` barcode | mark narrower than **24px** | the event label |
| `sankey` | node shorter than **26px** | the node's value figure |

A zero-width barcode event (`start === end`) therefore renders as an unlabelled
tick with colour as the sole carrier of meaning — an accessibility failure the
gates pass. For point events use `bars` with rank values instead. For sankey, give
the host `height: 420` or more at 360px so small nodes clear 26px.

**8 — the gates do not check topology, and they do not see type.** A sankey whose
columns imply a parent-child relationship the data doesn't support will pass lint
and geometry cleanly. Both gates are structural, and both run in jsdom, which does
not model font ascent, real text metrics or layout. **Look at the rendered piece in
a real browser.** Every presentation defect that has reached the desk was invisible
to both gates and obvious on sight.

---

## 4. Per-primitive spec fields

### DN.line
`title · summary · series · x · y · bands · refsY · notes · endLabels · height`

- `series: [{ name, points: [{x, y}], color, projectFrom, band, endLabel }]`
  - **`projectFrom: <x-value>`** splits the series at that x: solid up to it,
    dashed (`2 5`) beyond. This is the only projection mechanism. There is no
    `dashed` field. Projections still belong in a **separate series** from
    measured data where the two are distinct quantities.
  - `band: [{ x, lo, hi }]` draws a translucent uncertainty ribbon.
  - `endLabel` overrides the end-of-line label text when `endLabels` is on.
- `x: { min, max, fmt, ticks, title }`
  - **`ticks: [...]`** supplies the tick positions explicitly. Use it whenever the
    source publishes values at irregular intervals — the default `xticks()` will
    otherwise interpolate ticks for years the source never published, inviting the
    reader to read off points that do not exist.
  - `title` is the a11y table's first column header.
- `y: { max, zero, fmt, decimals, suffix, prefix, pct, compact, label, title }`
  - **`y.max` is consumed; `y.min` is not.** With `zero: false` the lower bound is
    always the data minimum. If you need a floor, pad the data or accept it.
- `refsY: [{ value, label, color }]` — horizontal reference lines.
- `notes: [{ x, y, text, sub, dx, dy, anchor }]` — free annotations in data space,
  clamped on-canvas.
- `endLabels: true` reserves right margin and labels each line at its last point.

### DN.bars
`title · summary · data · x · sort · max · rowH · gap · refValue · refLabel · refColor · labelTitle · valueTitle`

- `data: [{ label, value, color, highlight }]` — `highlight: true` paints the
  subject colour.
- **The value formatter is `spec.x`, not `spec.y`** — the value axis is horizontal.
  `x: { suffix: "%" }`, `x: { prefix: "£", compact: true }`, and so on.
- `sort` defaults to descending. `sort: "none"` preserves authored order;
  `"asc"` reverses.
- **`max` is advisory.** It is fed to `niceScale(0, max)`, which rounds up to the
  next clean tick interval: `max: 28` yields a 0–40 axis, `max: 150` yields 0–200
  at narrow widths. You cannot pin the axis exactly.
- `refValue` / `refLabel` / `refColor` draw a dashed vertical comparator. The
  reference label takes priority over any x-tick it would collide with.
- Height is derived: `22 + 8 + n·rowH + (n−1)·gap`. Multi-line labels grow `rowH`
  automatically. Do not set a `min-height` on the host — see §6.
- Gutter is `min(max(widest+16, 64), W × 0.46)` at <460px, `× 0.42` above.

> *v3.3.3 fixed the top margin here.* Previously it was 22px only when `refValue`
> was set, but the x-tick labels draw at `y = mT − 7` in every case, so without a
> `refValue` the baseline sat at y=1 and the glyphs clipped off-canvas in real
> browsers. jsdom does not reproduce that, so both gates passed it. The margin is
> now unconditionally 22px; charts are 14px taller. If a piece carries the old
> workaround (`refValue: 0` with `refColor: 'transparent'`), remove it.

### DN.columns
`title · summary · series · groups · mode · x · y · height`

- `mode: "grouped"` (default) or `"stacked"`.
- `groups: [{ label, values: { "<series name>": n } }]` — keys must match
  `series[].name` exactly; a mismatch silently reads as 0.
- `series: [{ name, color }]`. Value formatter is `spec.y`. `x.title` heads the
  a11y table's first column.
- Zero-anchored. See silent failure 1.

### DN.slope
`title · summary · left · right · items · y · height`

- `items: [{ label, from, to, highlight, color }]`. Left labels ellipsise at 13
  chars at 360px — the tightest budget in the toolkit.
- `left` / `right` are the column headings. Value formatter is `spec.y`.
- Labels on both sides are nudged apart vertically to avoid overlap, so a dense
  set compresses rather than colliding.
- The axis spans the data range, not zero. Two series on very different absolute
  scales produce near-flat slopes that carry no visual information — use `bars` on
  the change instead.

### DN.scatter
`title · summary · points · x · y · quadrant · height`

- `points: [{ x, y, label, color, r, group }]` — `group` drives the legend and
  auto-colours from the palette.
- `quadrant: { x, y }` draws crosshair dividers.
- `x.label` / `y.label` are axis captions; `x.title` / `y.title` head the a11y
  table columns.
- Point labels are not truncated or de-collided. See §2.

### DN.rangeStrip — the signature primitive
`title · summary · mode · events · categories · brackets · notes · x · barHeight`

- `mode: "barcode"` (default) — single strip, events as marks, labels rotated
  vertically inside the mark. `barHeight` sets the strip depth.
- `mode: "rows"` — one row per event, bar length = span, labels in a left gutter.
  Height is derived from the row count; there is no `height` field in this mode.
- `events: [{ label, start, end, category, color, projectFrom }]`
  - **`projectFrom: <value>`** splits one event into a solid segment up to that
    value and a hatched segment beyond it. There is no `hatched` field. This is
    how a measured-then-projected span is drawn honestly: **one** event spanning
    the whole range with `projectFrom` at the boundary, not two events.
  - `category` references `categories[].name`. In rows mode use `category`, not a
    per-event `color`, so the legend carries the encoding.
- `categories: [{ name, color }]` — drives the legend. Omit and there is no legend.
  Name the categories after **what the bar encodes**, not after the subject: a row
  labelled for the thing being measured rather than the gap being drawn misreads.
- `brackets: [{ x0, x1, label }]` and `notes: [{ x, text, sub }]` — barcode mode only.
- `x: { min, max, fmt }` — see silent failure 3. No `x.ticks` here; positions are
  always auto-generated.
- **Decimal years:** the built-in `yr` formatter is integer-only. For sub-year
  precision write a `fmtYM` converting the fraction to `"Mon YYYY"`, and compute
  the values in Node against a fixed epoch (`Date.UTC(Y,0,1)`) rather than by hand.
  Use `Math.floor((v − y) × 12 + 1e-9)` for the month — `Math.round` overshoots on
  floating-point values and drifts labels by a month.

### DN.sankey
`title · summary · nodes · links · value · nodeWidth · nodePad · linkOpacity · height · fromTitle · toTitle · valueTitle`

- `nodes: [{ id, label, color }]`, `links: [{ source, target, value, color }]`
  where source/target are node `id`s. Depth is computed by longest-path layering;
  there is no author-set `depth`. Assumes a DAG.
- Links with `value <= 0` are dropped silently.
- Node labels hard-capped at 12 chars (<460px) / 22 chars.
- Nodes shorter than 26px lose their value figure. Give the host
  `height: 420` or more at 360px when any node is small.
- One shared value→px scale across every column, so heights are comparable —
  do not defeat this by hand-setting colours to imply a different grouping.

---

## 5. Formatting

`DN.fmt(v, o)` and every `x`/`y`/`value` options object take the same shape:

```
{ fmt: fn,        // a function overrides everything else
  decimals: n,    // default: 0 for integers, up to 2 otherwise
  pct: true,      // multiplies by 100 and appends %
  compact: true,  // Intl compact notation (1.2K)
  plus: true,     // leading + on positives
  prefix: "£", suffix: "bn" }
```

`compact` applies to the axis **and** the hidden data table. If prose cites 3,262,
a compact axis reading "3.3K" leaves the accessibility table contradicting the
copy — set `compact` only where the rounded figure is the one the piece uses.

---

## 6. Markup and CSS contracts the linter enforces

Getting these wrong produces gate failures that look mysterious, or — worse —
layout defects that pass every gate.

- **Citations must be `<sup class="cite"><a href="#s1">1</a></sup>`.** A bare `<sup>`
  is not counted, so every source reads as an orphan and the gate warns on all of them.
- **Sources are `<li id="s1">` with a tier badge** `<span class="tier t1">T1</span>`.
  Missing badge is an error; a listed-but-uncited source is a warning.
- **Every source must be cited inline and every citation must resolve** — checked
  in both directions.
- **`dn:headline` must equal the `<h1>` verbatim** (normalised for quotes and dashes).
- **`.herostats` takes exactly three `.hs` children.** The grid is
  `repeat(3,1fr)` with `.hs:last-child` spanning full width below 540px. Four tiles
  wrap to a ragged row; two leave a visible empty cell. Gated.
- **Chart hosts size themselves. Never set `min-height` on one** — the SVG is
  `width:100%; height:auto` off its viewBox aspect ratio, so a min-height cannot
  make the chart taller, it only adds dead white space between the chart and its
  caption. The single exception is `sankey`, which needs forced headroom to clear
  the 26px node threshold. Gated as a warning.
- Required footer strings: `Method`, `Sources`, `Corrections`, a `v<major>.<minor>`
  version line, and `Figures to <date>`.
- Mandatory honesty slots: a `.unknowns` section and a `.caveat` card.

---

## 7. Template seams (v3.3.3)

```
1–6         doctype, charset, viewport
7–150       instructional comment block   (dropped by dn-build.py)
151–306     fonts, <style>, </head>
307         <body>
308         <div class="wrap">
309–492     demo body                      (replaced)
493         </div>
495–1336    DN library <script>            (kept verbatim — never edit)
1337–1472   demo init                      (replaced)
1473–1475   </body></html>
```

Do not hard-code these. `dn-build.py` locates them by content and asserts them, so a
template edit produces a loud failure instead of a corrupted file. The numbers above
are for orientation only and will drift with every template revision.
