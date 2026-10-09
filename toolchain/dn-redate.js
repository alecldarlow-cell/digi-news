#!/usr/bin/env node
/* ==========================================================================
   DIGI NEWS — dn-redate.js
   Moves a built piece to a new publication date.

   WHY THIS EXISTS
     A redate touches four places — dn:date, the masthead kicker, the footer
     "Figures to" line, and the filename — and must NOT touch a fifth: the
     source retrieval dates, which record when sources were actually read.
     This was done by hand at least seven times.

   WHY IT WARNS INSTEAD OF JUST DOING IT
     On the US tariffs piece the redate was not purely cosmetic: a rangeStrip
     bar ended at the build date, so its decimal-year end value had to be
     recomputed (2026.5644 -> 2026.5671) and its caption rewritten from "two
     days wide" to "three days wide". A script that silently did the four
     mechanical edits would have shipped a chart that disagreed with its own
     axis. So this flags anything that looks date-dependent and asks.

   USAGE
     node dn-redate.js 2026-07-29-slug.html 2026-07-30
     node dn-redate.js piece.html 2026-07-30 --bump      # also v1.0 -> v1.1
     node dn-redate.js piece.html 2026-07-30 --force     # proceed past warnings

   For a piece still in a build directory, prefer editing meta.json and
   re-running dn-build.py — that regenerates all four automatically.
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const file = process.argv[2];
const newDate = process.argv[3];
const bump = process.argv.includes('--bump');
const force = process.argv.includes('--force');

if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(newDate || '')) {
  console.error('usage: node dn-redate.js <piece.html> <YYYY-MM-DD> [--bump] [--force]');
  process.exit(2);
}

let s = fs.readFileSync(file, 'utf8');
const before = s;

const cur = (s.match(/<meta name="dn:date"\s+content="(\d{4}-\d{2}-\d{2})"/) || [])[1];
if (!cur) { console.error('dn-redate: no dn:date meta found'); process.exit(2); }
if (cur === newDate) { console.log('dn-redate: already dated ' + newDate + ' — nothing to do'); process.exit(0); }

const [y, mo, d] = newDate.split('-').map(Number);
const human = d + ' ' + MON[mo - 1] + ' ' + y;
const kick = d + ' ' + MON[mo - 1].toUpperCase() + ' ' + y;

const edits = [];
function sub(re, to, label) {
  const m = s.match(re);
  if (!m) { edits.push(['MISS', label, '(pattern not found)']); return; }
  s = s.replace(re, to);
  edits.push(['OK', label, m[0].slice(0, 60)]);
}

// 1. dn:date
sub(/(<meta name="dn:date"\s+content=")\d{4}-\d{2}-\d{2}(")/, '$1' + newDate + '$2', 'dn:date meta');

// 2. masthead kicker — the date line inside .kick, after the <br>
sub(/(<div class="kick">[^<]*<br>)\s*\d{1,2}\s+[A-Z]{3}\s+\d{4}/, '$1' + kick, 'masthead kicker');

// 3. footer "Figures to" — the ONLY body date that moves
sub(/(Figures to\s+)\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}/, '$1' + human, 'footer "Figures to"');

// 4. version bump, if asked
if (bump) {
  const vm = s.match(/(&middot;\s*v)(\d+)\.(\d+)(\s*&middot;)/);
  if (vm) sub(/(&middot;\s*v)(\d+)\.(\d+)(\s*&middot;)/,
    (m, a, maj, min, z) => a + maj + '.' + (Number(min) + 1) + z, 'version line');
}

/* ---- what this script deliberately does NOT touch ---- */
const retained = (before.match(/retrieved\s+\d{1,2}\s+[A-Za-z]{3}/gi) || []).length;

/* ---- date-dependency scan: anything that may need recomputing by hand ---- */
const warn = [];
const y0 = Number(cur.slice(0, 4)), decOld = null;

// decimal-year values close to the old date (rangeStrip "compiled to today" bars)
const oldFrac = (() => {
  const [Y, M, D] = cur.split('-').map(Number);
  const start = Date.UTC(Y, 0, 1), end = Date.UTC(Y + 1, 0, 1);
  return Y + (Date.UTC(Y, M - 1, D) - start) / (end - start);
})();
const decs = s.match(/\b\d{4}\.\d{3,}\b/g) || [];
decs.forEach(v => {
  if (Math.abs(Number(v) - oldFrac) < 0.01) {
    warn.push('decimal-year value ' + v + ' sits within days of the OLD date — ' +
      'if a chart bar ends "today", recompute it and check the caption.');
  }
});

// captions that count days/weeks from the build date
const spans = s.match(/\b(one|two|three|four|five|six|seven|\d+)\s+(day|days|week|weeks)\s+(wide|long|of data|so far)/gi) || [];
spans.forEach(t => warn.push('caption span "' + t + '" may be measured to the build date — recheck.'));

// the old human date appearing anywhere other than a retrieval note
const oldHuman = new RegExp('\\b' + Number(cur.slice(8, 10)) + '\\s+' + MON[Number(cur.slice(5, 7)) - 1] + '\\s+' + cur.slice(0, 4) + '\\b', 'g');
let om;
while ((om = oldHuman.exec(s))) {
  const ctx = s.slice(Math.max(0, om.index - 60), om.index + 40).replace(/\s+/g, ' ');
  if (!/retriev|accessed|last updated|published/i.test(ctx)) {
    warn.push('old date still present outside a retrieval note: "…' + ctx.slice(-70) + '…"');
  }
}

console.log('DN redate — ' + path.basename(file) + '   ' + cur + ' -> ' + newDate);
edits.forEach(([st, label, was]) => console.log('  ' + (st === 'OK' ? '✓' : '✗') + ' ' + label.padEnd(22) + (st === 'OK' ? 'updated' : was)));
console.log('  · ' + retained + ' source retrieval date(s) left unchanged (correct — they record access, not publication).');

if (warn.length) {
  console.log('\n  DATE-DEPENDENT CONTENT — check by hand:');
  warn.forEach(w => console.log('     ! ' + w));
}

if (warn.length && !force) {
  console.log('\n  NOT WRITTEN. Review the items above, then re-run with --force.');
  process.exit(1);
}

const dir = path.dirname(file);
const base = path.basename(file);
const renamed = base.replace(/^\d{4}-\d{2}-\d{2}/, newDate);
const dest = path.join(dir, renamed);
fs.writeFileSync(dest, s);
if (dest !== file) { fs.unlinkSync(file); console.log('  renamed -> ' + renamed); }

console.log('\n  re-run both gates:');
console.log('     node dn-lint.js ' + renamed + ' --width 360 --date ' + newDate);
console.log('     node dn-probe.js ' + renamed);
