# DN session protocol

The build standards are in the project instructions and the rubric. This file is
only about **what to read, when, and how much** — the context discipline.

The reason it matters: in an agentic build every tool call re-processes the
accumulated context. A token spent at turn 3 is carried through the fifty turns
that follow; a token spent at turn 45 is carried through five. The expensive reads
are therefore the *early* ones, and the two biggest — the binding documents and the
house template — both happen in the first ten turns of every build.

---

## Startup: read almost nothing

| Artefact | When to read it |
|---|---|
| Project instructions | already in context — free |
| `DN-API.md` | once, at the top of a build |
| House template | **never** — `dn-build.py` splices it; `DN-API.md` documents it |
| Standards rubric v3 | **only on a contested call** — when a judgement is genuinely in dispute |
| Prepublish checklist v3 | **at the gate step, not at startup** |
| Reporter addendum | never as a read — its one rule (`dn:statlabel`) is in the instructions and gated by the linter |
| `toolchain/README.md` | only when bootstrapping without the Project (unattended runs) |

The rubric, checklist and addendum are still binding. They are not still *readable
per build*. The operative constraints are already restated in the project
instructions; the source documents carry rationale, worked examples and edge-case
adjudication that a routine build does not consult. Read them when something is
actually contested, and say that you did.

Bootstrap in one call. The toolchain lives in the repo's `toolchain/` folder, so a
fresh clone is all a session needs — inside the Project or out of it. The clone is
sparse: only `toolchain/` is checked out, not the 200+ MB `reports/` back catalogue.

```bash
mkdir -p ~/b && cd ~/b \
  && git clone -q --depth 1 --filter=blob:none --sparse \
       https://github.com/alecldarlow-cell/digi-news.git repo \
  && git -C repo sparse-checkout set toolchain \
  && cp repo/toolchain/dn-*.js repo/toolchain/dn-build.py repo/toolchain/DN-API.md \
       repo/toolchain/digi-news-house-template-v3-3-3.html . \
  && npm install jsdom --silent && mkdir -p piece
```

The rubric, checklist and addendum stay in `~/b/repo/toolchain/` — read them from
there on demand, never at startup.

Pull back-catalogue context **only** when it is actually needed — checking whether
a story has run, or rebuilding a shipped piece. Not by default. One file:
`git -C ~/b/repo show HEAD:reports/<file>.html > <file>.html`. The whole folder:
`git -C ~/b/repo sparse-checkout add reports`.

---

## Research: bound the big fetches

The single largest line item on a research-heavy build, and the one place where
saving tokens can cost you sourcing.

- **Bounded fetch first.** Pass a token limit and read the extract. Re-fetch
  targeted sections only if the figure you need isn't there.
- **Re-fetch when the extract falls short — actually do it.** The Reuters DNR piece
  needed the full PDF because the executive summary genuinely lacked the 46-market
  2021 comparison. The rule only works if the fallback is used rather than written
  around. Never infer a figure the extract didn't give you.
- The sandbox network allowlist covers GitHub, npm and PyPI only. A source PDF
  cannot be pulled down and grepped locally; bounded fetching is the only lever.
- Search before fetching a cold URL — fetch reliability is much better for URLs
  that have already appeared in a search result.

---

## Build order

The gate moves to the front. Geometry failures are decidable from the chart spec
alone, so there is no reason to discover them after the prose is written.

```
1  verify.js        compute every derived figure, lock the outputs
2  SPINE CHECKPOINT one line to the desk: confirmed, or changed to X because Y
3  piece/init.js    author the exhibits
4  dn-preflight.js  geometry + silent-failure check, before any prose
5  piece/body.html  author the prose against exhibits already known to fit
   piece/footer.html
   piece/meta.json
6  dn-build.py      assemble
7  dn-lint.js + dn-probe.js
8  visual check on the rendered piece
9  copy to outputs, present_files
```

**Step 2 is not optional.** On five pieces the pitch premise failed verification and
the story was rebuilt around what survived — correct behaviour, but twice the desk
learned about it only after the file was built and gated. One sentence at step 2
costs a sentence; the same news at step 7 costs a rebuild.

**Step 8 is not optional either.** Both gates are structural. The undersea-cable
sankey passed lint and geometry cleanly while implying a parent-child relationship
the data did not support — an editorial error wearing a rendering costume, caught
only by looking at it.

**And step 8 cannot be done in the sandbox.** The network allowlist blocks the
Chromium download Playwright needs, so there is no real render available here.
Everything the toolchain can do — including `dn-harness.js` — runs in jsdom, which
models no font metrics, no ascent, no layout and no paint. A whole class of defect
is therefore invisible to every check available in-session: glyphs clipping at a
viewBox edge, dead white space between a chart and its caption, marks rendering the
wrong colour, labels overlapping.

So the honest form of step 8 is: **run the structural checks, then tell the desk
plainly that the visual check is outstanding and what specifically to look at.**
Do not report a harness-rendered accessibility table as a visual check — it is not
one, and describing it as one is how three defects reached publication. Name the
exhibits, name the failure modes worth checking, and hand it over.

---

## Context hygiene during the build

- **Never read the assembled HTML back into context.** After `dn-build.py` runs, the
  file is touched only by scripts. Authored parts live in `piece/` and are edited
  there, then rebuilt — never patched in place in the output.
- **Always pipe gate output through `tail`.** Full lint output is ~25 lines of
  passes you do not need to re-read.
- **Chain shell steps.** One call running build + lint + probe costs a fraction of
  three calls, because each call re-sends everything before it.
- **Do not echo authored copy back** in the reply. The desk reads the rendered file.

---

## Post-delivery work goes in a fresh chat

The largest single saving available, and a workflow change rather than a tooling one.

At least four pieces had substantive revision rounds after filing — a lay-reader
rewrite, a third exhibit, an added causal paragraph, a follow-up literature
discussion. Every turn of those re-processed the entire build that preceded them:
the research, the source fetches, the splices, the gate runs.

Filing the piece, then opening a new chat and uploading the HTML, costs one upload
and drops the carried context to near zero. On a second-round revision it avoids
something like a third of the original build's cost.

The same applies in reverse: discovery and commission are already separate chats.
Keep them that way.

---

## The two dates

`meta.json` carries two, and they mean different things.

| Field | Meaning | Drives |
|---|---|---|
| `date` | **publication** | filename, masthead kicker, `dn:date`, feed sort order |
| `built` | **data currency** | the footer "Figures to" line. Defaults to `date` |

For a same-day piece, omit `built`. For a future-dated piece set `built` to the day
the figures were actually compiled, and the footer will say so.

Publication may lead compilation. It may never trail it: `dn-build.py` refuses to
write if `built` is later than `date`, and the linter errors on the same condition.
A piece cannot claim figures more current than the day it was written.

A lag of more than 14 days draws a note from the linter — not a failure, but a prompt
to re-check anything fast-moving. A genomics paper does not go stale in a fortnight;
CPI, polling, market data and live conflict counts do.

## Redating

Prefer editing `piece/meta.json` and re-running `dn-build.py` — it regenerates the
masthead kicker, the `<title>`, the footer line, the version stamp and the filename
from one field.

For a piece that has already shipped, `dn-redate.js` does the four mechanical edits,
leaves source retrieval dates alone, and refuses to write if it finds date-dependent
content — a decimal-year value sitting on the old build date, a caption counting
days to "today", or the old date appearing outside a retrieval note. That last class
is real: a redate once required recomputing a rangeStrip end value and rewriting its
caption from "two days wide" to "three days wide".
