# DIGI NEWS — Standards & Methodology Rubric (v3)

The binding reference for every Digi News piece. When a judgement call arises, this document governs. v2 keeps every v1 standard and adds the rules in **bold-marked additions** (citation traceability, the assumption firewall, accessibility, corrections, survey reporting, and the chart toolkit).

---

## 1. Source hierarchy
Use the highest tier available for each claim; a claim is only as strong as its weakest load-bearing source.

- **Tier 1 — Primary & official.** Peer-reviewed research; national statistics agencies (ONS, Eurostat, BLS, etc.); central banks and regulators; official records, registers and legislation; court judgments; audited accounts; original datasets.
- **Tier 2 — Established institutions.** Reputable research institutes, think tanks with transparent methods, international bodies (IMF, OECD, WHO, UN), professional bodies, libraries/archives (e.g. House of Commons Library).
- **Tier 3 — Quality press, for events and attribution.** Established news organisations with corrections policies — for *what happened and who said what*, not for analysis presented as fact.
- **Do not use** as load-bearing sources: opinion/comment columns, advocacy or single-issue campaign sites, anonymous blogs, social posts, content farms, or outlets without editorial accountability. They may be *named and attributed* ("X argued that…"), never cited as established fact.

**Verification.** Any surprising, pivotal, or counter-intuitive figure must be corroborated by a second independent Tier 1/2 source. Where sources conflict, present the range and name the disagreement rather than picking silently.

### 1a. Citation traceability *(new in v2)*
Every load-bearing claim carries an **inline numbered citation** at the point of claim, resolving to a numbered entry in the footer Sources block. Each source entry is tagged with its **tier badge — T1 / T2 / T3** — so evidentiary strength is visible without leaving the sentence. Grouped, un-numbered source lists are no longer sufficient. A claim whose only support is a Tier 3 outlet must be written as attribution ("the *FT* reports…"), not as bare fact.

---

## 2. Numbers discipline
- Compute every derived statistic **in code**; never estimate by eye. Re-run and re-check before publishing — the printed figure must equal the computed figure (a frequent failure is a hand-rounded number drifting from the data).
- Re-check totals, rates, and growth figures; watch for unit, base-year, nominal-vs-real, and per-capita errors.
- State units and the as-of date. Use tabular figures in exhibits.
- Label projections, assumptions, and scenarios explicitly; show the counterfactual where one materially changes the reading.
- Never truncate or invert a chart axis to exaggerate; if a non-zero baseline is used, say so in the caption. (The chart toolkit defaults to honest zero-baselined value axes.)

### 2a. Choose measures that don't mislead
Interrogate the obvious metric before using it: check for floor/ceiling effects, base-rate effects, small-denominator noise, and window/edge artifacts. Pick the clearest honest measure, explain how it was built in plain terms, and show the assumptions.

---

## 3. The assumption firewall *(new in v2 — P0)*
Projections, scenarios, and modelled "what-ifs" are useful but must be quarantined from anything that carries authority:

- **Never load-bearing for the headline, standfirst, or any hero stat.** Hero figures and the headline state *measured* facts only. Lead with the recorded figure; introduce the scenario afterwards.
- **Structurally separate** in the data: a projected series, segment, or value is a distinct field (e.g. `projectFrom`), never silently spliced into measured data.
- **Visually unmistakable.** Projection renders dashed (lines) or hatched (spans/areas); scenario ranges render as a shaded band. The caption names it a scenario and states its basis.
- A projection may *support* a narrative ("on current trends, X could reach…") but the reader must never have to guess where measurement ends and assumption begins.

---

## 4. Fact vs interpretation
Keep them visibly separate. Verifiable facts read plainly and carry a citation. Analysis is introduced as analysis ("This suggests…", "One reading is…"). Never let interpretation borrow the authority of a cited fact.

### 4a. Attribution discipline *(new in v2)*
Causal and evaluative claims must be **attributed or marked as analysis** — never asserted as near-fact. Phrases like "most observers point to…" or an unsourced list of "causes" are not permitted as standalone fact: either cite who finds the cause and on what evidence, or frame it explicitly as the desk's reading and note its uncertainty.

---

## 5. Contested-topic protocol
Apply **only when a question is genuinely disputed among credible sources** — do not manufacture false balance on settled matters.
- Give the **strongest, good-faith version** of each major position (steelman, not strawman), each with its own sourcing.
- Split **empirical disputes** (what is true — evidence can sometimes resolve these) from **value disputes** (what we should prefer — evidence cannot). Label which kind each card is.
- **Verdict rule:** state an empirical bottom-line only where the weight of reliable evidence clearly points. On value questions, lay out the positions and stop. Always note the strongest objection to whatever conclusion is drawn.

### 5a. Headline-overclaim guard *(new in v2)*
The headline and standfirst may not claim more certainty than the evidence supports, and may not rest on a projection (see §3). A "record", "first", or "highest ever" in a headline must be true of the *measured* data as printed — not true only once a scenario is assumed. If the striking claim depends on an assumption, the headline states the measured fact and the body explains the scenario.

---

## 6. Uncertainty disclosure
Say plainly when data is thin, lagged, modelled, or when causation is unestablished (e.g. "this is a correlation; no study yet isolates cause"). Every piece carries a short **"What we don't know"** note unless there is genuinely nothing material to disclose; a caveat card states the single strongest objection to the main reading. False confidence is the failure mode to avoid.

### 6a. Survey, poll & sample reporting *(new in v2)*
Whenever a survey or poll is cited, state **sample size, margin of error (or credible interval), fielding dates, and the polling organisation**. Do not report a lead or change that is within the margin of error as if it were real movement. Online opt-in panels are flagged as such.

---

## 7. Imagery standards (per type)
Imagery is allowed where it genuinely aids understanding; each type has its own bar.
- **Charts / data exhibits.** Real, sourced data only. Honest axes; units labelled; source in the caption. The default and preferred visual. Build with the house chart toolkit (see §10) so axes, palette, and accessibility are consistent.
- **Maps / diagrams.** Built from data or official boundaries; cite the source. No decorative distortion.
- **Photographs.** Only clearly licensed, public-domain, or wire/official images with visible credit. Never reproduce copyrighted images. Never misrepresent the event. If no clean image exists, fall back to typographic/data treatment.
- **AI-generated visuals.** Only as clearly **labelled illustration**, never as evidence, and never depicting real people or events as if real.
- **In all cases:** no image that could mislead about scale, time, place, or identity.

---

## 8. Accessibility floor *(new in v2)*
Every piece must clear this bar:
- Each chart has an `aria-label` (and the toolkit also emits an SVG `<title>`/`<desc>` and a visually-hidden data **table** mirroring the chart, so the figures are machine-readable and auditable).
- Colour is never the sole carrier of meaning: pair it with labels, position, or a legend. The categorical palette is colourblind-safe (Okabe-Ito); the subject accent (cobalt) is reserved for the subject.
- Charts are legible on a phone: the toolkit renders at **1 SVG unit = 1 CSS pixel** and re-renders on resize, so label type does not shrink below ~11px on small screens. Do not ship a chart whose labels are sub-legible at 360px wide.
- **No label may clip off the canvas or overlap another label.** The v3.3 toolkit measures every structural label before drawing it: left gutters are sized to the widest label, over-long category/row labels wrap then ellipsise (the full text is preserved in the data table and an SVG `<title>`), axis ticks thin when they would collide, and edge ticks are clamped on-canvas. This is a backstop, not a licence to over-write: keep authored labels within ~22 characters at 360px. Free annotations (`notes`, reference-line labels, brackets) are author-placed and are *not* auto-fitted beyond an anti-clip clamp — the geometry gate flags any that still overlap, and the author resolves them. Verify with `dn-probe.js` (see §10 / checklist) at 360px and 680px before shipping.
- `prefers-reduced-motion` is respected; text keeps adequate contrast; layout is responsive in portrait.

---

## 9. Length tiers
Targets, not hard limits — the story sets the final length.
- **Short (default).** ~400–700 words. One hero exhibit (optionally one supporting). A single clear point.
- **Medium.** ~900–1,300 words. 2–3 exhibits. A small spine — *what's happening → why → so what*.
- **Long.** ~1,800–2,500 words. 4+ exhibits. Full treatment — *context → causes → comparison → consequences → reference* — including a reference appendix table and a **"Go deeper"** tail listing what was deliberately left out.

Include the "Go deeper / Read more" tail only when material was consciously omitted to hold length.

---

## 10. The chart toolkit *(new in v2)*
Exhibits are built with the embedded **DN** library in the house template — self-contained SVG, no external dependencies. It provides `line`, `bars`, `columns`, `slope`, `scatter`, and `rangeStrip` (time-span barcode/Gantt — the signature exhibit primitive), plus a number formatter and the shared palette. It bakes in honest scales, the projection/scenario rendering of §3, the legend rule of §8, and the accessible data table of §8. Build bespoke exhibits *with* these helpers rather than reinventing chart code, so every piece inherits the same standards. One **signature exhibit** per piece, built for the specific story, is the goal.

---

## 11. Copyright limits
Paraphrase by default. Any direct quote under 15 words and at most one per source. Never reproduce song lyrics, poems, or substantial passages; never reproduce copyrighted images. Summarise in original wording; do not mirror a source's structure or phrasing.

---

## 12. Standing footer
Every piece ends with:
- **Method** — how key measures were built, windows, assumptions, projection basis.
- **Sources** — numbered, grouped by what they support, **highest tier first, each with its T1/T2/T3 badge** and (where possible) a link and retrieval date; inline citations resolve here.
- **Corrections** *(new in v2)* — "None" until one is needed; material corrections logged with date.
- **Version & as-of** *(new in v2)* — a version line and **Figures to [date]**.

---

*v3 (from v2): added the chart label-safety standard to §8 — no label clips or overlaps; the v3.3 DN toolkit measures and fits labels, and `dn-probe.js` enforces it as an automated geometry gate. No other standards changed.*
