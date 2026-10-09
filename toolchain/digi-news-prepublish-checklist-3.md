# DIGI NEWS — Pre-Publish Checklist  (v3)

A piece does not ship until every box is checked. Each item maps to a rubric section (§). If a box can't be ticked, fix the piece or cut the claim — don't wave it through.

## Numbers
- [ ] Every printed figure was **computed in code** and the printed value equals the computed value (no hand-rounding drift). §2
- [ ] Units, base year, real-vs-nominal, and per-capita basis checked; no unit/denominator errors. §2
- [ ] Each pivotal or surprising figure is **corroborated by a second independent T1/T2 source**. §1
- [ ] The chosen measure was interrogated for floor/ceiling, base-rate, small-denominator, and edge artifacts. §2a

## Assumption firewall
- [ ] No projection or scenario is the headline, standfirst, or a hero stat. §3, §5a
- [ ] Projected data is a separate field, rendered dashed/hatched, and the band/scenario is captioned as such. §3
- [ ] Any "record / first / highest" in the headline is true of the **measured** data as printed, not only under an assumption. §5a

## Sourcing & attribution
- [ ] Every load-bearing claim has an **inline numbered citation** resolving to the footer. §1a
- [ ] Each source carries a **T1/T2/T3 badge**; nothing load-bearing rests on opinion/advocacy/low-reliability sources. §1, §1a
- [ ] Causal/evaluative claims are attributed or explicitly marked as analysis — no unsourced "causes" or "most observers". §4, §4a
- [ ] Fact and interpretation are visibly separated throughout. §4

## Contested topics
- [ ] Positions cards used **only** where credible sources genuinely disagree (no manufactured balance). §5
- [ ] Both sides steelmanned, each sourced; empirical vs value disputes labelled. §5
- [ ] A verdict is stated only where evidence clearly points; value questions are left open; the strongest objection is noted. §5

## Uncertainty
- [ ] A **"What we don't know"** note is present (or its omission is justified). §6
- [ ] A caveat card states the single strongest objection to the main reading. §6
- [ ] Any survey/poll reports **sample size, margin of error, fielding dates, and pollster**; within-MoE gaps not framed as real movement. §6a

## Charts & imagery
- [ ] Exhibits built with the **DN toolkit**; axes honest (zero baseline unless flagged); units in caption. §2, §7, §10
- [ ] Colour is not the only carrier of meaning; categorical series use the CVD-safe palette + legend; accent reserved for the subject. §8
- [ ] Images are licensed/public-domain/wire with credit; AI visuals labelled as illustration; nothing misrepresents scale/time/place/identity. §7
- [ ] One bespoke **signature exhibit** carries the piece. §10
- [ ] **No chart label clips off-canvas or overlaps another label** at 360px or 680px — verified by the geometry gate (see Automated gate). Any `data-dn-fit="trunc"` truncation is intentional and the full text is in the data table. §8

## Accessibility
- [ ] Every chart has an `aria-label`, an SVG title/desc, and a visually-hidden **data table**. §8
- [ ] Charts legible at 360px wide (label type ≥ ~11px); `prefers-reduced-motion` respected; portrait-responsive. §8

## Footer & housekeeping
- [ ] **Method** explains measures, windows, assumptions, and projection basis. §12
- [ ] **Sources** numbered, highest tier first, badged, linked with retrieval dates where possible. §12
- [ ] **Corrections** line present ("None" until needed). §12
- [ ] **Version line + "Figures to [date]"** present and correct; version uses the canonical form `v<major>.<minor>` (e.g. `v1.2`). §12
- [ ] Length matches the tier; "Go deeper" tail included only if material was deliberately omitted. §9

## Publication & feed (§13)
The piece is published by uploading the file to the site repo — the front page builds its card from the file itself, so the metadata *is* part of the deliverable.
- [ ] Filename is **`YYYY-MM-DD-topic-slug.html`** (lowercase, hyphens, no spaces); the date is the day the piece is produced. §13
- [ ] **DN feed meta block** present in `<head>`: `dn:headline`, `dn:standfirst`, `dn:topic`, `dn:date`, `dn:kind`, `dn:read`. §13
- [ ] `dn:headline` is the `<h1>` **verbatim**; `dn:standfirst` is plain text (no tags). §13
- [ ] `dn:date` equals the filename date **and** the footer's "Figures to" date — all three agree. §13
- [ ] `dn:kind` is `report` (articles), `puzzle` (puzzles and interactive tools) or `game` (Digi Games; topics `Arcade` · `Strategy` · `Quiz`). §13
- [ ] `dn:topic` is from the **controlled vocabulary** — `UK politics` · `Economy` · `Immigration` · `AI` · `Science` · `Medicine` · `Society` · `World`. One beat, one label; adding to the list is a deliberate decision, not a typo. §13
- [ ] The **first hero stat** is short (≤8 characters *after tags are stripped*) and reads sensibly alone — the front-page card tile shows it verbatim. Keep any unit in the first `.n` to a **symbol** (`%`, `×`, `£`); a **word unit** in `<small>` (e.g. `2.25<small>births</small>` → `2.25births`, 10 chars) blows the limit and the card silently falls back to a generic tile. Put word units in `dn:statlabel` instead. It is a measured figure by §3, so no projection can leak onto the front page. *(Now enforced by the linter.)* §3, §13
- [ ] **`dn:statlabel`** set (≤14 chars, lower case, a noun) unless the first figure already carries its own noun. §13
- [ ] Delivered ready to upload: correct filename, no renaming required by the desk. §13

## Final read
- [ ] Headline and standfirst claim no more certainty than the evidence supports. §5a
- [ ] Neutral, active, BBC register; no loaded language; contested claims attributed. §4, §4a
- [ ] One self-contained HTML file; renders offline (only Google Fonts external); no console errors. §10

## Automated gate
Two automated gates run before shipping. The linter mechanically enforces the citation, accessibility, self-containment, footer, and feed-meta items above. It checks structure, not arithmetic — figures are still verified in the compute step.
- [ ] `npm install jsdom` (once per environment), then `node dn-lint.js path/to/piece.html --date <build-date>` returns **CLEAR**, or **PASS WITH WARNINGS** with every warning reviewed and justified. §1a, §8, §10, §12, §13
- [ ] Lint the file **under its final publish name** — §13 cross-checks the filename date against `dn:date`, so linting a temp name hides a real error.
- [ ] **Geometry gate:** `node dn-probe.js path/to/piece.html` returns **GATE: PASS** (defaults to 360px and 680px). It renders every DN chart at each width and fails on any label that clips off-canvas or overlaps another. Truncation notes are informational, not failures. Fix any CLIP/OVERLAP — shorten the label, reposition a free annotation, or split the exhibit — before shipping. §8
  - Structural labels (ticks, category/row, y-axis, end-labels, values, points) are fitted automatically by the v3.3 toolkit; a failure here usually means a free annotation (`notes`, reference label, bracket) needs the author's hand.
