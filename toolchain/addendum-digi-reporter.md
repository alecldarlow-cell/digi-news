# Addendum — digi.reporter project instructions

Paste this into the digi.reporter project instructions, and add the one meta
line to the **house template**'s `dn:*` block. After that, no article ever needs
a follow-up edit to appear correctly on the front page.

---

## The tile kicker (`dn:statlabel`)

Every report's front-page card shows its **first hero stat** as a tile: the
figure large, the unit small, and a short label underneath. The label is the
piece's only chance to say *what the number counts* — a bare `93%` on a card is
a number looking for a noun.

Add one line to the `dn:*` block in the head, written at the same time as the
hero stat:

```html
<meta name="dn:headline"   content="…">
<meta name="dn:standfirst" content="…">
<meta name="dn:topic"      content="Science">
<meta name="dn:date"       content="YYYY-MM-DD">
<meta name="dn:kind"       content="report">
<meta name="dn:read"       content="~5 min">
<meta name="dn:statlabel"  content="ignitions">
```

**The rule: 14 characters, lower case, a noun.** The feed uppercases it in CSS,
so the piece never decides how it looks — only what it says.

It is a **kicker, not a caption.** The two are different jobs and the difference
is the whole point:

| | |
|---|---|
| Caption (under the chart, in the piece) | `Times NIF has reached fusion ignition, Dec 2022–Jun 2026` |
| Kicker (on the card, 96px wide) | `ignitions` |

Write the kicker so the tile reads as one phrase: `11 IGNITIONS`,
`93% OF PATIENTS`, `415TWh DATA CENTRES`, `2× PER STEP UP`.

If the figure already carries its own noun, or nothing short is true, **leave
the meta out.** The tile renders fine as a bare figure. A wrong or vague kicker
is worse than none, because it reads as though it were checked.

**Omitting it is safe, not free.** The builder falls back to the hero stat's
on-page caption, which is almost always a full sentence and will be dropped for
length — you'll get no label and a note in the Actions log naming the file. So
the fallback fails quietly and correctly, but it never produces a good kicker.
Write the line.

## Why 14

The tile is 96px on a phone. The label sets at ~10px — the floor at which it
still passes contrast and remains readable. That's about 14 characters. Over
that, the builder **drops the label rather than clipping it**: `TIMES NIF HAS
REAC…` tells a reader less than a bare `11` does.

## While you're in the template

- **Hero stats must be measured, per §3.** Unchanged — the builder still refuses
  projected figures, dash placeholders and zeroed score slots. The kicker
  doesn't relax that; it only names what got through.
- **Footnote markers flatten into extracted text.** The builder strips tags, so a
  `<sup>` reference inside a caption or standfirst comes through as a stray
  digit (`…Jun 2026 1`). It's harmless for the kicker now that captions are
  dropped for length, but check any `dn:standfirst` you write by hand isn't
  ending in an orphan number.
- **Use the canonical `dn:topic`.** `Money & well-being`, `Technology` and
  `Artificial intelligence` all still get aliased to a canonical chip with a
  warning on every build. Setting the canonical label at source (`Economy`,
  `AI`) keeps the log readable — and the log is the only place the front page
  tells you something's wrong.
