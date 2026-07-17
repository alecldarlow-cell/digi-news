#!/usr/bin/env node
/* ==========================================================================
   DIGI NEWS — tools/build-feed.js
   Rebuilds feed.json from the files in /reports and /puzzles. The front page
   renders its cards from that file, so publishing is: upload an HTML file.
   --------------------------------------------------------------------------
   Each piece carries its own metadata in <head>:
     dn:headline  dn:standfirst  dn:topic  dn:date  dn:kind  dn:read
   Anything missing is inferred from the <h1>, the standfirst, the .topic
   line, or the filename. Missing metadata is reported to the Actions log but
   never fails the build — a piece always makes it to the feed.

   PUBLICATION DATE FILTER (added v1.1)
   -----------------------------------
   Pieces may be committed ahead of their release day. A piece enters the
   feed only once its dn:date has arrived in Europe/London — the desk's
   timezone, fixed here so that neither the runner's UTC clock nor British
   Summer Time can drift the boundary. Forward-dated files sit in the repo,
   out of the feed, until their day; the nightly cron in
   .github/workflows/build-feed.yml rebuilds without a push.

   The filter is build-time, not client-side: future items never reach
   feed.json, so their headlines are not readable in the page source. The
   files themselves remain live at their own URLs — a filtered feed hides the
   card, not the document.
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIRS = [
  { dir: 'reports', kind: 'report' },
  { dir: 'puzzles', kind: 'puzzle' }
];

/* -- Publication cut-off ------------------------------------------------- */
const TZ = 'Europe/London';
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date()); // -> 'YYYY-MM-DD'
// Escape hatch: FEED_INCLUDE_FUTURE=1 node tools/build-feed.js  (preview only —
// never set this in the workflow, or the feed ships tomorrow's cards today.)
const INCLUDE_FUTURE = process.env.FEED_INCLUDE_FUTURE === '1';

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '\u2014', ndash: '\u2013', middot: '\u00b7', hellip: '\u2026',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  pound: '\u00a3', euro: '\u20ac', deg: '\u00b0', times: '\u00d7'
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
    '<meta[^>]*name=["\']' + name + '["\'][^>]*>',
    'i'
  );
  const tag = html.match(re);
  if (!tag) return '';
  const c = tag[0].match(/content=["']([\s\S]*?)["']/i);
  return c ? decode(c[1]).trim() : '';
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

    const topic =
      meta(head, 'dn:topic') ||
      firstMatch(html, /<div class="topic"[^>]*>([\s\S]*?)<\/div>/i).split('\u00b7')[0].trim() ||
      fn.topic ||
      (kind === 'puzzle' ? 'Puzzle' : 'Data');

    const date = meta(head, 'dn:date') || fn.date || mtimeDate(path.join(abs, file));

    const missing = [];
    if (!meta(head, 'dn:headline')) missing.push('dn:headline');
    if (!meta(head, 'dn:topic')) missing.push('dn:topic');
    if (!meta(head, 'dn:date')) missing.push('dn:date');
    if (missing.length) warnings.push(`${rel} — inferred: ${missing.join(', ')}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) warnings.push(`${rel} — no usable date; card will sort last`);

    /* Hold anything dated after today. Only well-formed dates can be judged
       future; an unusable date is a data problem, already warned above, and
       is published rather than silently swallowed. */
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date > TODAY && !INCLUDE_FUTURE) {
      held.push({ rel, date });
      continue;
    }

    items.push({
      path: rel,
      kind: (meta(head, 'dn:kind') || kind).toLowerCase(),
      topic,
      headline,
      standfirst: standfirst.length > 240 ? standfirst.slice(0, 237).trimEnd() + '\u2026' : standfirst,
      date,
      read: meta(head, 'dn:read') || '',
      thumb: meta(head, 'dn:thumb') || ''
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
