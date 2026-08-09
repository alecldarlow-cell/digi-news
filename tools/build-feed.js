#!/usr/bin/env node
/* Digi News — feed builder.
   Scans /reports and /puzzles for .html files, reads the dn:* meta block from
   each head, and writes feed.json at the repo root. Run by GitHub Actions on
   every push; needs no dependencies. Node 18+.

   Per-file metadata (in the <head> of each piece):
     <meta name="dn:headline"   content="…">
     <meta name="dn:standfirst" content="…">
     <meta name="dn:topic"      content="…">
     <meta name="dn:date"       content="YYYY-MM-DD">
     <meta name="dn:kind"       content="report|puzzle">
     <meta name="dn:read"       content="~8 min">      (optional)
     <meta name="dn:thumb"      content="url">          (optional)
     <meta name="dn:statlabel"  content="of patients">  (optional — overrides the
       caption read off the piece's own hero stat; keep it to ~16 characters)

   Anything missing is inferred from <title>/<h1>/.topic/.standfirst or from the
   filename (YYYY-MM-DD-topic-slug.html). Missing metadata is reported to the
   Actions log but never fails the build — a piece always makes it to the feed.

   Pieces may be committed ahead of their release day: anything whose dn:date is
   later than today in Europe/London is held out of feed.json until that date
   arrives. See the publication cut-off block below. The nightly cron in
   .github/workflows/build-feed.yml releases held pieces without a push.
*/
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIRS = [
  { dir: 'reports', kind: 'report' },
  { dir: 'puzzles', kind: 'puzzle' }
];

// ---- publication cut-off ----------------------------------------------------
// Pieces may be committed ahead of their release day. A piece enters the feed
// only once its dn:date has arrived in Europe/London — the desk's timezone,
// fixed here so that neither the runner's UTC clock nor British Summer Time can
// drift the boundary. Forward-dated files sit in the repo, out of the feed,
// until their day; the nightly cron in build-feed.yml releases them without a
// push. The filter is build-time, so a held headline never reaches feed.json
// and cannot be read out of the page source — but the file stays live at its
// own URL. A filtered feed hides the card, not the document.
const TZ = 'Europe/London';
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date()); // -> 'YYYY-MM-DD'
// Preview only: FEED_INCLUDE_FUTURE=1 node tools/build-feed.js
// Never set this in the workflow, or the feed ships tomorrow's cards today.
const INCLUDE_FUTURE = process.env.FEED_INCLUDE_FUTURE === '1';

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '\u2014', ndash: '\u2013', middot: '\u00b7', hellip: '\u2026',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  pound: '\u00a3', euro: '\u20ac', deg: '\u00b0', times: '\u00d7',
  minus: '\u2212', plusmn: '\u00b1', divide: '\u00f7', asymp: '\u2248',
  ge: '\u2265', ne: '\u2260', prop: '\u221d', rarr: '\u2192',
  cent: '\u00a2', sect: '\u00a7', iacute: '\u00ed', ouml: '\u00f6'
};

function decode(s) {
  if (!s) return '';
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const k = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : m;
    });
}

const stripTags = s => decode(String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());

function meta(html, name) {
  // tolerant of attribute order and of single or double quotes
  const re = new RegExp(
    '<meta[^>]*name=["\']' + name.replace(':', ':') + '["\'][^>]*>',
    'i'
  );
  const tag = html.match(re);
  if (!tag) return '';
  // Match the closing quote to the OPENING one. A loose ["'] ends the capture at
  // the first apostrophe, so content="CRISPR's cure…" silently became "CRISPR".
  const c = tag[0].match(/content=(["'])([\s\S]*?)\1/i);
  return c ? decode(c[2]).trim() : '';
}

function firstMatch(html, re) {
  const m = html.match(re);
  return m ? stripTags(m[1]) : '';
}

function titleCase(slug) {
  const small = new Set(['a', 'an', 'and', 'the', 'of', 'to', 'in', 'on', 'vs', 'for', 'at', 'by']);
  return slug.split('-').filter(Boolean).map((w, i) =>
    (i > 0 && small.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}

function fromFilename(file) {
  // 2026-07-14-politics-net-migration-falls.html
  const base = file.replace(/\.html?$/i, '');
  const m = base.match(/^(\d{4}-\d{2}-\d{2})-([a-z0-9]+)-(.+)$/i);
  if (!m) return { date: '', topic: '', slug: base };
  return { date: m[1], topic: titleCase(m[2]), slug: m[3] };
}

function mtimeDate(p) {
  try { return new Date(fs.statSync(p).mtime).toISOString().slice(0, 10); }
  catch { return ''; }
}

// ---- controlled topic vocabulary -------------------------------------------
// The front-page chips are only useful if one beat has exactly one label.
// Canonical list; anything not in it is kept verbatim and reported, so a
// genuinely new beat is never silently mangled into the wrong bucket.
const TOPICS = ['UK politics', 'Economy', 'Immigration', 'AI', 'Science', 'Medicine', 'Society', 'World', 'Logic', 'Crossword', 'Word'];
const TOPIC_ALIASES = {
  'politics': 'UK politics', 'westminster': 'UK politics', 'uk politics': 'UK politics',
  'economics': 'Economy', 'economy': 'Economy', 'money': 'Economy', 'business': 'Economy',
  'money & well-being': 'Economy', 'money and well-being': 'Economy', 'pay': 'Economy',
  'migration': 'Immigration', 'immigration': 'Immigration',
  'artificial intelligence': 'AI', 'technology': 'AI', 'tech': 'AI', 'ai': 'AI',
  'science': 'Science', 'physics': 'Science', 'energy': 'Science',
  'medicine': 'Medicine', 'health': 'Medicine',
  'society': 'Society', 'world': 'World',
  // The three puzzle beats. They're real chips, not strays — without them every
  // puzzle logs a vocabulary warning on every build, which buries the notes
  // that actually need reading.
  'logic': 'Logic', 'lexidoku': 'Logic', 'doku': 'Logic',
  'crossword': 'Crossword', 'mini': 'Crossword',
  'word': 'Word', 'link': 'Word'
};

function canonTopic(raw, rel, warnings) {
  const t = String(raw || '').trim();
  if (!t) return '';
  const exact = TOPICS.find(c => c.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  const alias = TOPIC_ALIASES[t.toLowerCase()];
  if (alias) {
    warnings.push(`${rel} — topic "${t}" mapped to "${alias}" (set dn:topic to the canonical label)`);
    return alias;
  }
  warnings.push(`${rel} — topic "${t}" is not in the vocabulary [${TOPICS.join(', ')}] — kept verbatim; it will get its own chip`);
  return t;
}

// ---- hero stat --------------------------------------------------------------
// The card tile shows the piece's first hero stat. Hero stats are measured
// figures by house rule (§3), so nothing projected can reach a card.
//
// Returned in three parts, because the tile sets them at three sizes: the
// figure large (and sized to the box by its own length — so the unit must not
// inflate the count), the unit small, and the label small underneath. The label
// is the stat's existing on-page caption — the sibling of .n in the herostats
// block — so nothing new has to be authored. dn:statlabel overrides it.
function heroStat(html) {
  const block = html.match(/<div class="herostats"[\s\S]{0,4000}?<\/div>\s*<\/div>/i);
  const scope = block ? block[0] : html;
  const m = scope.match(/<div class="n"[^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]*>([\s\S]*?)<\/div>)?/i);
  if (!m) return null;
  const txt = stripTags(m[1]).replace(/\s+/g, '');
  if (!txt || txt.length > 8) return null;
  if (!/[0-9]/.test(txt)) return null;
  // Reject dash/zero placeholders — an interactive tool's score slot reads
  // "—/100" until the reader scores it, and that must never reach a card.
  if (/[\u2014\u2013-]/.test(txt)) return null;
  if (/^(0|00|0,000)$/.test(txt)) return null;
  // "93%" → 93 + %   "£1,284" → £1,284 + ''   "1,284×" → 1,284 + ×
  const parts = txt.match(/^([^0-9]*[0-9][0-9.,]*)(.*)$/);
  return {
    figure: parts ? parts[1] : txt,
    unit:   parts ? parts[2] : '',
    label:  stripTags(m[2] || '')
  };
}

// ---- puzzle grid mask -------------------------------------------------------
// A puzzle's card tile is a preview of its own grid, read straight out of the
// puzzle file's puzzle object — never hand-drawn, and never a spoiler: only the
// SHAPE travels (blocks and pre-locked cells), never a letter.
//   #  black square      L  pre-locked cell (LexiDoku)      .  to be filled
// Returns a 16-, 25- or 36-char string (4x4 Link, 5x5, 6x6), or '' if the
// object can't be read. Mask alphabet: '#' block, 'L' pre-locked, 'o' free opening, '.' fillable.
// the card falls back to the Play glyph rather than inventing a grid.
function puzzleMask(html, rel, warnings) {
  // Link is the one type with no grid: sixteen loose chips, four groups of four.
  // It gets a 16-char all-fillable mask so the card draws a 4x4 of chips — a
  // shape no other type has, which is the whole job of the tile. Nothing about
  // the grouping travels: a Link has no per-puzzle shape to leak, so every Link
  // tile is deliberately identical and identifies the TYPE, not the puzzle.
  // Checked before the grid probe so a Link never trips the no-grid warning.
  const lg = html.match(/\bgroups\s*:\s*\[[\s\S]*?\n\s*\],/);
  if (lg) {
    const members = lg[0].match(/\bmembers\s*:\s*\[[^\]]*\]/g) || [];
    const count = members.reduce((n, m) => n + (m.match(/"[^"]*"|'[^']*'/g) || []).length, 0);
    if (members.length === 4 && count === 16) return '.'.repeat(16);
    warnings.push(`${rel} — groups parsed as ${members.length} group(s) / ${count} tile(s), expected 4 and 16; card falls back to the Play tile`);
    return '';
  }

  const g = html.match(/\bgrid\s*:\s*(\[\s*\[[\s\S]*?\]\s*\])/);
  if (!g) { warnings.push(`${rel} — no grid found in the puzzle object; card falls back to the Play tile`); return ''; }

  const cells = g[1].match(/"[^"]*"|'[^']*'/g) || [];
  const dim = Math.round(Math.sqrt(cells.length));
  if (dim * dim !== cells.length || (dim !== 5 && dim !== 6)) {
    warnings.push(`${rel} — grid parsed as ${cells.length} cells, expected a 5x5 (25) or 6x6 (36) square; card falls back to the Play tile`);
    return '';
  }
  // '#' block (Mini), 'o' the free opening (Sweep), everything else fillable.
  // 'o' was specified with the type and never implemented: the old line folded
  // it into '.', so every Sweep tile rendered as an identical blank grid.
  const mask = cells.map(c => {
    const v = c.slice(1, -1).trim();
    return v === '#' ? '#' : v === 'o' ? 'o' : '.';
  });

  // Pre-locked cells: LexiDoku uses [row,col]; Path uses [row,col,value].
  // Both are 1-indexed and we only read the first two numbers (row, col).
  const lk = html.match(/\blocked\s*:\s*(\[\s*\[[\s\S]*?\]\s*\])/);
  if (lk) {
    const entries = lk[1].match(/\[\s*\d+\s*(?:,\s*\d+\s*)+\]/g) || [];
    for (const p of entries) {
      const nums = p.match(/\d+/g).map(Number);
      const [r, c] = nums;
      const i = (r - 1) * dim + (c - 1);
      if (i < 0 || i >= cells.length) { warnings.push(`${rel} — locked cell [${r},${c}] is off the grid; ignored`); continue; }
      if (mask[i] === '#') { warnings.push(`${rel} — locked cell [${r},${c}] is a black square; ignored`); continue; }
      mask[i] = 'L';
    }
  }
  return mask.join('');
}

const warnings = [];
const items = [];
const held = [];

for (const { dir, kind } of DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of fs.readdirSync(abs).sort()) {
    if (!/\.html?$/i.test(file)) continue;
    const rel = `${dir}/${file}`;
    const html = fs.readFileSync(path.join(abs, file), 'utf8');
    const head = html.slice(0, 20000);
    const fn = fromFilename(file);

    const headline =
      meta(head, 'dn:headline') ||
      firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      firstMatch(head, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/\s*[—–-]\s*Digi News\s*$/i, '').replace(/^\s*Digi News\s*[—–-]\s*/i, '') ||
      titleCase(fn.slug);

    const standfirst =
      meta(head, 'dn:standfirst') ||
      firstMatch(html, /<p class="stand(?:first)?"[^>]*>([\s\S]*?)<\/p>/i);

    const rawTopic =
      meta(head, 'dn:topic') ||
      firstMatch(html, /<div class="topic"[^>]*>([\s\S]*?)<\/div>/i).split('\u00b7')[0].trim() ||
      fn.topic ||
      (kind === 'puzzle' ? 'Puzzle' : 'Data');
    const topic = canonTopic(rawTopic, rel, warnings);

    const date = meta(head, 'dn:date') || fn.date || mtimeDate(path.join(abs, file));

    const missing = [];
    if (!meta(head, 'dn:headline')) missing.push('dn:headline');
    if (!meta(head, 'dn:topic')) missing.push('dn:topic');
    if (!meta(head, 'dn:date')) missing.push('dn:date');
    if (missing.length) warnings.push(`${rel} — inferred: ${missing.join(', ')}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) warnings.push(`${rel} — no usable date; card will sort last`);

    const kindVal = (meta(head, 'dn:kind') || kind).toLowerCase();

    // Puzzles have no measured hero stat — their number slots are score
    // placeholders — so their tile is drawn from the grid instead.
    const hs = (kindVal === 'puzzle') ? null : heroStat(html);
    const mask = (kindVal === 'puzzle') ? puzzleMask(html, rel, warnings) : '';

    // The tile's label is a KICKER, not a caption: ~14 characters, two words.
    // The piece's own hero-stat caption is written to sit under a big number in
    // an article, so it's usually a full sentence — and it can carry flattened
    // footnote markers. It's offered as a default, but anything over the limit is
    // DROPPED, never clipped: "TIMES NIF HAS REAC…" tells the reader less than a
    // bare number does. Set dn:statlabel to give the tile a short one.
    const MAX_LABEL = 14;
    const authored = meta(head, 'dn:statlabel');
    let statLabel = authored || (hs ? hs.label : '');
    if (statLabel.length > MAX_LABEL) {
      warnings.push(`${rel} — ${authored ? 'dn:statlabel' : 'hero-stat caption'} "${statLabel.slice(0, 40)}${statLabel.length > 40 ? '…' : ''}" is ${statLabel.length} chars; the tile fits ${MAX_LABEL}, so no label is shown${authored ? '' : ' (set dn:statlabel to give it one)'}`);
      statLabel = '';
    }

    // Hold anything dated after today. This sits AFTER the hero-stat and grid
    // extraction on purpose: a forward-dated piece is still parsed and still
    // logs its warnings, so a batch of 30 puzzles reports a broken grid or an
    // over-long stat label on the day it is uploaded — not on the morning it
    // publishes. Only a well-formed date can be judged future; an unusable one
    // is a data problem, already warned above, and is published rather than
    // silently swallowed.
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date > TODAY && !INCLUDE_FUTURE) {
      held.push({ rel, date });
      continue;
    }

    items.push({
      path: rel,
      kind: kindVal,
      topic,
      headline,
      standfirst: standfirst.length > 240 ? standfirst.slice(0, 237).trimEnd() + '\u2026' : standfirst,
      date,
      read: meta(head, 'dn:read') || (firstMatch(html, /<div class="dateline"[^>]*>([\s\S]*?)<\/div>/i).match(/~\s*\d+\s*min/i) || [''])[0].replace(/\s+/g, ' '),
      thumb: meta(head, 'dn:thumb') || '',
      // stat is now the FIGURE only — the tile sizes itself by its length, so a
      // trailing "%" or "×" must not count. unit and label are set separately.
      stat: hs ? hs.figure : '',
      statUnit: hs ? hs.unit : '',
      statLabel: hs ? statLabel : '',
      mask
    });
  }
}

items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.path.localeCompare(b.path));

const feed = { built: new Date().toISOString(), today: TODAY, timezone: TZ, count: items.length, items };
fs.writeFileSync(path.join(ROOT, 'feed.json'), JSON.stringify(feed, null, 2) + '\n');

console.log(`feed.json written — ${items.length} item(s) live; today = ${TODAY} (${TZ})`);
if (INCLUDE_FUTURE) console.log('  WARNING: FEED_INCLUDE_FUTURE=1 — forward-dated items were published.');
for (const w of warnings) console.log('  note: ' + w);
if (held.length) {
  held.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`  ${held.length} forward-dated item(s) held for a later build:`);
  for (const h of held) console.log(`    ${h.date}  ${h.rel}`);
  console.log(`  next release: ${held[0].date}`);
}
