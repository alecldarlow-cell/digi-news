#!/usr/bin/env node
/* ==========================================================================
   DIGI NEWS — dn-lint.js
   Executable pre-publish gate. Turns the mechanically-checkable items of the
   pre-publish checklist into hard checks against the rendered piece.
   --------------------------------------------------------------------------
   USAGE
     node dn-lint.js path/to/piece.html
     node dn-lint.js path/to/piece.html --width 360 --date 2026-06-29

   What it checks (each tagged to a checklist section):
     - Citation integrity, both directions: every inline cite resolves to a
       footer source id, and every footer source is cited at least once. §1a
     - Every footer source carries a T1/T2/T3 tier badge.                §1a/§12
     - No external dependency except Google Fonts.                       §10
     - Footer housekeeping: Method, Sources, Corrections, version line,
       and a parseable "Figures to <date>" matching the build date.     §12
     - Accessibility, per rendered chart: <svg> + non-empty aria-label,
       SVG <title>, and a visually-hidden data <table>; no empty labels. §8
     - Charts render with no thrown errors, and still render at 360px.   §8/§10
     - DN feed meta block present, self-consistent, and agreeing with the
       <h1>, the footer date, and the filename convention.                §13
     - No leftover house-template placeholder text.                      (hygiene)
     - Page <title> is not still the template's "House Template".        (hygiene)
     - Zero console / uncaught errors during render.                     §10

   What it deliberately does NOT claim to check (kept honest):
     - True rendered font-px legibility at 360px (jsdom has no layout). The
       harness confirms charts render at 360 without error; actual label
       legibility stays a manual visual check. A declared-token check on the
       axis font-size is reported as INFO, not a pass/fail gate.
     - Whether a figure is *correct* — that is the job of the compute step,
       not the linter. This gate checks structure, not arithmetic.

   Exit code is non-zero if any ERROR is found.
   ========================================================================== */

const path = require('path');
const { loadPiece } = require('./dn-harness');

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return (i > -1 && process.argv[i + 1]) ? process.argv[i + 1] : def;
}

const file = process.argv[2];
if (!file || file.startsWith('--')) {
  console.error('usage: node dn-lint.js path/to/piece.html [--width 360] [--date YYYY-MM-DD]');
  process.exit(2);
}
const width = parseInt(arg('--width', '360'), 10);
const buildDate = arg('--date', new Date().toISOString().slice(0, 10));

const results = []; // {level:'ERROR'|'WARN'|'INFO'|'OK', section, msg}
function add(level, section, msg) { results.push({ level: level, section: section, msg: msg }); }

const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };

(async function main() {
  let piece;
  try {
    piece = await loadPiece(path.resolve(file), { width: width });
  } catch (e) {
    console.error('FATAL: could not load piece:', e && e.message || e);
    process.exit(2);
  }
  const { document, html } = piece;
  const bodyText = (document.body && document.body.textContent || '').replace(/\s+/g, ' ');

  /* ---- 1. Render errors (§10) ---- */
  if (piece.errors.length === 0) add('OK', '§10', 'No console or uncaught errors during render.');
  piece.errors.forEach(function (e) { add('ERROR', '§10', 'Render error (' + e.type + '): ' + e.message); });

  /* ---- 2. Charts present + a11y structure (§8) ---- */
  const charts = piece.charts();
  if (charts.length === 0) add('WARN', '§8', 'No DN charts (.dn-fig) found — expected at least one exhibit.');
  charts.forEach(function (c, i) {
    const id = c.id || ('#' + (i + 1));
    if (!c.hasSvg) { add('ERROR', '§8', 'Chart ' + id + ': no <svg> rendered.'); return; }
    if (c.svgChildren === 0) add('ERROR', '§8', 'Chart ' + id + ': <svg> is empty (render produced nothing).');
    if (!c.ariaLabel.trim()) add('ERROR', '§8', 'Chart ' + id + ': missing/empty aria-label.');
    if (!c.hasTitle) add('ERROR', '§8', 'Chart ' + id + ': missing SVG <title>.');
    if (!c.hasDataTable) add('ERROR', '§8', 'Chart ' + id + ': missing visually-hidden data <table>.');
    else if (c.tableRows === 0) add('WARN', '§8', 'Chart ' + id + ': data table has no rows.');
    if (c.emptyTextCount > 0) add('WARN', '§8', 'Chart ' + id + ': ' + c.emptyTextCount + ' empty <text> label(s).');
  });
  // re-render narrow to confirm charts survive 360px without throwing
  const errBefore = piece.errors.length;
  piece.render(360);
  const narrowCharts = piece.charts();
  const brokeNarrow = narrowCharts.filter(function (c) { return !c.hasSvg || c.svgChildren === 0; }).length;
  if (piece.errors.length > errBefore) add('ERROR', '§8', 'Chart(s) threw on re-render at 360px.');
  else if (brokeNarrow > 0) add('ERROR', '§8', brokeNarrow + ' chart(s) produced empty SVG at 360px.');
  else if (charts.length) add('OK', '§8', 'All ' + charts.length + ' chart(s) carry aria-label + title + data table, and render at 360px.');

  /* ---- 3. Citation integrity, both directions (§1a) ---- */
  const citeAnchors = Array.prototype.slice.call(document.querySelectorAll('sup.cite a[href^="#"], a.cite[href^="#"], sup.cite a[href*="#s"]'));
  const citedIds = {};
  citeAnchors.forEach(function (a) {
    const href = a.getAttribute('href') || '';
    const id = href.replace(/^.*#/, '');
    if (!id) return;
    citedIds[id] = (citedIds[id] || 0) + 1;
    if (!document.getElementById(id)) add('ERROR', '§1a', 'Citation [' + (a.textContent.trim() || id) + '] points to #' + id + ' but no such source exists.');
  });
  // footer sources: <li id="s..">
  const sourceLis = Array.prototype.slice.call(document.querySelectorAll('li[id^="s"]'))
    .filter(function (li) { return /^s\d+/i.test(li.id) || /^s\w+/.test(li.id); });
  if (sourceLis.length === 0) add('WARN', '§12', 'No numbered footer sources (li[id^="s"]) found.');
  sourceLis.forEach(function (li) {
    if (!citedIds[li.id]) add('WARN', '§1a', 'Source #' + li.id + ' is listed but never cited inline (orphan source).');
    const badge = li.querySelector('.tier, .t1, .t2, .t3');
    const hasTier = badge && /\bT?[123]\b/i.test(badge.textContent);
    if (!hasTier) add('ERROR', '§1a', 'Source #' + li.id + ' has no T1/T2/T3 tier badge.');
  });
  if (citeAnchors.length && sourceLis.length) {
    const danglingErr = results.some(function (r) { return r.section === '§1a' && r.level === 'ERROR'; });
    if (!danglingErr) add('OK', '§1a', citeAnchors.length + ' inline citation(s) all resolve; ' + sourceLis.length + ' source(s) all tier-badged.');
  }

  /* ---- 4. External-dependency scan (§10) ---- */
  const ALLOW = /^(https?:)?\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)(\/|$)/i;
  const externals = [];
  Array.prototype.slice.call(document.querySelectorAll('[src],[href]')).forEach(function (el) {
    const url = el.getAttribute('src') || el.getAttribute('href') || '';
    if (/^https?:\/\//i.test(url) && !ALLOW.test(url)) {
      // ignore in-page footnote/source anchors and mailto
      if (el.tagName === 'A') return;
      externals.push(el.tagName.toLowerCase() + ' → ' + url);
    }
  });
  // url() in inline styles / style blocks
  const styleText = Array.prototype.slice.call(document.querySelectorAll('style')).map(function (s) { return s.textContent; }).join('\n');
  (styleText.match(/url\((https?:[^)]+)\)/gi) || []).forEach(function (u) {
    if (!ALLOW.test(u.replace(/^url\(|\)$/g, ''))) externals.push('css ' + u);
  });
  if (externals.length === 0) add('OK', '§10', 'Self-contained: no external dependency beyond Google Fonts.');
  else externals.forEach(function (x) { add('ERROR', '§10', 'Disallowed external dependency: ' + x); });

  /* ---- 5. Footer housekeeping (§12) ---- */
  function present(label, re, level) {
    if (re.test(bodyText)) add('OK', '§12', label + ' present.');
    else add(level || 'ERROR', '§12', label + ' missing.');
  }
  present('Method block', /\bMethod\b/);
  present('Sources block', /\bSources\b/);
  present('Corrections line', /\bCorrections\b/);
  present('Version line', /(\bv\d+(\.\d+)?\b)|(\bVersion\s+\d+(\.\d+)?\b)/i);

  let figuresISO = '';
  const figMatch = bodyText.match(/Figures to\s+([0-9]{1,2}\s+[A-Za-z]{3,9}\.?\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (!figMatch) {
    add('ERROR', '§12', '"Figures to <date>" line missing or unparseable.');
  } else {
    const raw = figMatch[1];
    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) d = new Date(raw + 'T00:00:00Z');
    else {
      const m = raw.match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/);
      if (m) d = new Date(Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1]));
    }
    if (d) figuresISO = d.toISOString().slice(0, 10);
    /* "Figures to" is a claim about DATA CURRENCY; dn:date is the publication
       date. They are allowed to differ, in one direction only. Figures compiled
       BEFORE publication is normal (and is what future-dating looks like).
       Figures dated AFTER publication is incoherent — the piece would be
       claiming currency it cannot have had when it was written. */
    const want = new Date(buildDate + 'T00:00:00Z');
    if (!d) {
      add('WARN', '§12', '"Figures to ' + raw + '" could not be parsed as a date.');
    } else if (d.getTime() === want.getTime()) {
      add('OK', '§12', '"Figures to ' + raw + '" matches the publication date.');
    } else if (d.getTime() > want.getTime()) {
      add('ERROR', '§12', '"Figures to ' + raw + '" is LATER than the publication date (' +
        buildDate + '). A piece cannot carry figures more current than the day it was written.');
    } else {
      const days = Math.round((want - d) / 86400000);
      add('OK', '§12', '"Figures to ' + raw + '" is ' + days + ' day(s) before publication (' +
        buildDate + ') — future-dated piece, data currency stated honestly.' +
        (days > 14 ? ' NOTE: >14 days is a long lag; re-check any fast-moving series.' : ''));
    }
  }

  /* ---- 5b. DN feed meta + filename convention (§13) ----
     The published site builds its front-page cards from these. A piece without
     them still reaches the feed (the builder falls back to the <h1>/.topic),
     but the fallback is dumber than the desk, so the block is required. */
  function dnMeta(name) {
    const el = document.querySelector('meta[name="' + name + '"]');
    return el ? (el.getAttribute('content') || '').trim() : '';
  }
  const metaDate = dnMeta('dn:date');
  const REQUIRED_META = ['dn:headline', 'dn:standfirst', 'dn:topic', 'dn:date', 'dn:kind'];
  const missingMeta = REQUIRED_META.filter(function (k) { return !dnMeta(k); });
  if (missingMeta.length) {
    missingMeta.forEach(function (k) { add('ERROR', '§13', 'Feed meta missing: <meta name="' + k + '">.'); });
  } else {
    add('OK', '§13', 'Feed meta block present (headline, standfirst, topic, date, kind).');
  }
  REQUIRED_META.forEach(function (k) {
    if (/\bREPLACE\b/i.test(dnMeta(k)) || /\[TK\]/.test(dnMeta(k))) add('ERROR', '§13', 'Feed meta ' + k + ' is still an unfilled placeholder.');
  });
  if (!dnMeta('dn:read')) add('INFO', '§13', 'No <meta name="dn:read"> — the card will omit the reading time.');

  const TOPICS = ['UK politics', 'Economy', 'Immigration', 'AI', 'Science', 'Medicine', 'Society', 'World'];
  const topicVal = dnMeta('dn:topic');
  if (topicVal) {
    if (TOPICS.some(function (t) { return t.toLowerCase() === topicVal.toLowerCase(); })) {
      add('OK', '§13', 'dn:topic "' + topicVal + '" is in the front-page vocabulary.');
    } else {
      add('WARN', '§13', 'dn:topic "' + topicVal + '" is not in the vocabulary [' + TOPICS.join(', ') +
        '] — it will get its own chip. Use a canonical label unless this is genuinely a new beat.');
    }
  }

  const kind = dnMeta('dn:kind').toLowerCase();
  if (kind && ['report', 'puzzle'].indexOf(kind) === -1) {
    add('ERROR', '§13', 'dn:kind is "' + kind + '" — must be "report" or "puzzle".');
  }

  /* ---- 5c. First hero stat must parse into a front-page card tile (§13, §3) ----
     Replicates the heroStat() reader in tools/build-feed.js EXACTLY. The builder
     concatenates everything inside the first .n div, strips tags, and rejects the
     stat if the result is >8 chars, has no digit, contains a dash, or is a zeroed
     placeholder. On rejection the card silently falls back to a generic tile.
     A word unit in <small> (e.g. 2.25<small>births</small> -> "2.25births" = 10)
     is the classic trip. Reports only — puzzles draw their tile from the grid. */
  if (kind !== 'puzzle') {
    var stripT = function (s) { return String(s || '').replace(/<[^>]*>/g, ''); };
    var hsBlock = html.match(/<div class="herostats"[\s\S]{0,4000}?<\/div>\s*<\/div>/i);
    if (!hsBlock) {
      add('WARN', '§13', 'No .herostats block found — the front-page card tile will fall back to a generic tile.');
    } else {
      var nMatch = hsBlock[0].match(/<div class="n"[^>]*>([\s\S]*?)<\/div>/i);
      var nTxt = nMatch ? stripT(nMatch[1]).replace(/\s+/g, '') : '';
      var reason = null;
      if (!nMatch)                              reason = 'no .n figure div found';
      else if (!nTxt)                           reason = 'first hero stat is empty';
      else if (nTxt.length > 8)                 reason = 'first hero stat "' + nTxt + '" is ' + nTxt.length + ' chars after tags are stripped (builder limit is 8) — move any word unit out of the first .n into dn:statlabel; keep only a symbol unit (%, x, £) in .n';
      else if (!/[0-9]/.test(nTxt))            reason = 'first hero stat "' + nTxt + '" has no digit';
      else if (/[—–-]/.test(nTxt))   reason = 'first hero stat "' + nTxt + '" contains a dash — reads as an unscored placeholder';
      else if (/^(0|00|0,000)$/.test(nTxt))    reason = 'first hero stat "' + nTxt + '" is a zeroed placeholder';
      if (reason) {
        add('ERROR', '§13', 'Front-page card tile will not build: ' + reason + '. The card falls back to a generic tile.');
      } else {
        add('OK', '§13', 'First hero stat "' + nTxt + '" parses into a front-page card tile.');
        var slRaw = dnMeta('dn:statlabel');
        if (slRaw && slRaw.length > 14) {
          add('WARN', '§13', 'dn:statlabel "' + slRaw + '" is ' + slRaw.length + ' chars; the tile fits 14, so the builder will drop the label and show a bare figure.');
        } else if (!slRaw) {
          add('INFO', '§13', 'No dn:statlabel — the tile label falls back to the hero-stat caption, which usually gets dropped for length (and can carry a stray citation digit). Add dn:statlabel (<=14 chars) to give the tile a clean kicker.');
        }
      }
    }
  }

  if (metaDate && !/^\d{4}-\d{2}-\d{2}$/.test(metaDate)) {
    add('ERROR', '§13', 'dn:date "' + metaDate + '" is not YYYY-MM-DD.');
  } else if (metaDate && figuresISO && figuresISO > metaDate) {
    add('ERROR', '§13', 'The footer "Figures to" date (' + figuresISO + ') is later than dn:date (' +
      metaDate + '). Publication may lead data compilation, never the reverse.');
  } else if (metaDate && figuresISO && figuresISO < metaDate) {
    add('OK', '§13', 'dn:date (' + metaDate + ') leads "Figures to" (' + figuresISO +
      ') — future-dated piece; filename and kicker follow dn:date, data currency follows "Figures to".');
  } else if (metaDate && figuresISO) {
    add('OK', '§13', 'dn:date matches the footer "Figures to" date.');
  }

  const h1El = document.querySelector('h1');
  const norm = function (t) {
    return String(t || '').replace(/\s+/g, ' ').replace(/[‘’']/g, "'")
      .replace(/[“”]/g, '"').replace(/[—–]/g, '-').trim().toLowerCase();
  };
  if (h1El && dnMeta('dn:headline') && norm(h1El.textContent) !== norm(dnMeta('dn:headline'))) {
    add('WARN', '§13', 'dn:headline does not match the <h1> verbatim — the card and the page will disagree.');
  } else if (h1El && dnMeta('dn:headline')) {
    add('OK', '§13', 'dn:headline matches the <h1>.');
  }

  const base = path.basename(file);
  const fnMatch = base.match(/^(\d{4}-\d{2}-\d{2})-([a-z0-9]+)-([a-z0-9-]+)\.html$/);
  if (!fnMatch) {
    add('WARN', '§13', 'Filename "' + base + '" is not YYYY-MM-DD-topic-slug.html — the site sorts and routes on this.');
  } else {
    if (metaDate && fnMatch[1] !== metaDate) {
      add('ERROR', '§13', 'Filename date (' + fnMatch[1] + ') contradicts dn:date (' + metaDate + ').');
    } else {
      add('OK', '§13', 'Filename follows the publish convention and agrees with dn:date.');
    }
  }

  /* ---- 6. Placeholder leftovers + stale template title (hygiene) ---- */
  // Reader-visible placeholders block; leftover template comments only warn.
  const VISIBLE = [
    'House Template', 'Illustrative placeholder', 'Sample ranked comparison',
    'Sample trend with projection', 'Strongest good-faith version', 'One line on a strand',
    'Row one', 'Row two', 'Thread one', 'Thread two', 'Cat A', 'Peer A',
    'Lorem ipsum', 'placeholder values', 'sample annotation'
  ];
  const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const found = VISIBLE.filter(function (p) { return htmlNoComments.indexOf(p) > -1; });
  if (found.length === 0) add('OK', 'hygiene', 'No reader-visible house-template placeholder text left.');
  else found.forEach(function (p) { add('ERROR', 'hygiene', 'Reader-visible template placeholder: "' + p + '".'); });

  const comments = html.match(/<!--[\s\S]*?-->/g) || [];
  const commentCruft = comments.some(function (c) { return /\bREPLACE\b/.test(c) || /\[TK\]/.test(c); });
  if (commentCruft) add('WARN', 'hygiene', 'Leftover template section comments still carry a placeholder sentinel — tidy up (reader-invisible, non-blocking).');

  const pageTitle = (document.querySelector('title') || {}).textContent || '';
  if (/House Template/i.test(pageTitle)) add('ERROR', 'hygiene', 'Page <title> still says "House Template" — set the piece title.');

  /* ---- 7. Hero stats not placeholders (hygiene) ---- */
  const heroNums = Array.prototype.slice.call(document.querySelectorAll('.herostats .hs .n, .hs .n, .herostat .n'));
  const placeholderHero = heroNums.filter(function (n) { return /^(00|0,000|—|–|—)?$/.test(n.textContent.trim()); });
  if (heroNums.length && placeholderHero.length) add('WARN', 'hygiene', placeholderHero.length + ' hero stat(s) look like placeholders ("00"/"0,000"/dash).');

  /* ---- 8. INFO: declared axis font-size token (not a gate) ---- */
  const axMatch = styleText.match(/\.dn-ax[^{]*\{[^}]*font-size:\s*([0-9.]+)px/i);
  if (axMatch) {
    const px = parseFloat(axMatch[1]);
    add('INFO', '§8', 'Declared axis label font-size token: ' + px + 'px (≥11px target; rendered legibility at 360px still needs a visual check).');
  }


  /* ---- 9. Zero-anchored primitives receiving negative values (§8) ----
     DN.bars and DN.columns both scale with niceScale(0, max). A negative datum
     is drawn at or behind the axis and simply vanishes — no warning at any
     layer, and the a11y table still lists it, so the chart and its own data
     table disagree. Caught here by reading the init source, since by render
     time the value is already gone. */
  const initSrc = Array.prototype.slice.call(document.querySelectorAll('script'))
    .map(function (n) { return n.textContent || ''; })
    .filter(function (t) { return /DN\.(line|bars|columns|slope|scatter|rangeStrip|sankey)\s*\(/.test(t) && !/Digi News visualization library/.test(t); })
    .join('\n');
  if (initSrc) {
    const zaRe = /DN\.(bars|columns)\s*\(/g;
    let zm, zaHits = 0;
    while ((zm = zaRe.exec(initSrc))) {
      const end = initSrc.indexOf('});', zm.index);
      const seg = initSrc.slice(zm.index, end > -1 ? end + 3 : initSrc.length);
      const negs = (seg.match(/(?:value|:)\s*-\s*[\d.]+/g) || []);
      if (negs.length) {
        zaHits++;
        add('ERROR', '§8', 'DN.' + zm[1] + ' is zero-anchored but is passed ' + negs.length +
          ' negative value(s) — they render as nothing while still appearing in the ' +
          'accessibility table. Plot the absolute magnitude with direction in the label, ' +
          'or use rangeStrip to span the two endpoints.');
      }
    }
    if (!zaHits) add('OK', '§8', 'No negative values handed to a zero-anchored primitive.');

    const strX = (initSrc.match(/\{\s*x\s*:\s*["'][^"']*["']/g) || []);
    if (strX.length) {
      add('ERROR', '§8', strX.length + ' string x-value(s) in a line/scatter series — x must be ' +
        'numeric or coordinates collapse to NaN. Put display formatting in x.fmt.');
    }
  }

  /* ---- 10. Narrative length against the declared tier (§ length tiers) ----
     Word count was previously recomputed with a bespoke selector helper in each
     session. Tiers per the rubric: short 400-700, medium 900-1300, long
     1800-2500. Reported as a WARN, never a block — the desk overrides this
     deliberately and should be able to. */
  if (kind !== 'puzzle') {
    const NARR = 'h1, .standfirst, .section p, .section li, .callout, .unknowns p, .caveat, .positions p, .more li';
    const words = Array.prototype.slice.call(document.querySelectorAll(NARR))
      .map(function (n) { return (n.textContent || '').replace(/\[\d+\]/g, ' '); })
      .join(' ').trim().split(/\s+/).filter(Boolean).length;
    const readMeta = dnMeta('dn:read') || '';
    const TIERS = { short: [400, 700], medium: [900, 1300], long: [1800, 2500] };
    let tier = null;
    const mins = (readMeta.match(/(\d+)\s*min/) || [])[1];
    if (mins) tier = (+mins <= 4) ? 'short' : (+mins <= 7 ? 'medium' : 'long');
    if (!tier) {
      add('INFO', 'length', 'Narrative body is ' + words + ' words (no tier inferable from dn:read "' + readMeta + '").');
    } else {
      const band = TIERS[tier];
      if (words < band[0] * 0.85 || words > band[1] * 1.15) {
        add('WARN', 'length', 'Narrative body is ' + words + ' words; dn:read "' + readMeta +
          '" implies the ' + tier + ' tier (' + band[0] + '-' + band[1] + '). Retier or trim.');
      } else {
        add('OK', 'length', 'Narrative body is ' + words + ' words — within the ' + tier + ' tier.');
      }
    }
  }

  /* ---- 11. Mandatory honesty slots (§ uncertainty) ----
     The rubric requires both a "What we don't know" section and a caveat card
     on every report. Neither was mechanically enforced, and a piece has shipped
     with the caveat missing while both gates read green. */
  if (kind !== 'puzzle') {
    const hasUnknowns = !!document.querySelector('.unknowns') ||
      /what we don'?t know/i.test(bodyText);
    const hasCaveat = !!document.querySelector('.caveat');
    if (!hasUnknowns) add('ERROR', 'honesty', 'No "What we don\'t know" section — mandatory on every report.');
    else add('OK', 'honesty', '"What we don\'t know" section present.');
    if (!hasCaveat) add('WARN', 'honesty', 'No .caveat card found — the rubric requires the strongest objection to the piece\'s own conclusion to be carried on the page.');
    else add('OK', 'honesty', 'Caveat card present.');
  }

  /* ---- 12. Presentation contracts (§8, §13) ----
     Every check here corresponds to a defect that shipped past a green gate.
     They are cheap, structural, and catch the failure class jsdom cannot see
     by rendering: component slot arity, dead spec fields, and host styling. */

  // 12a. Hero-stat grid arity. .herostats is grid-template-columns:repeat(3,1fr)
  // with .hs:last-child spanning full width under 540px. Four items produce a
  // ragged fourth row; two leave a visible empty cell. Exactly three.
  if (kind !== 'puzzle') {
    const hsWrap = document.querySelector('.herostats');
    if (hsWrap) {
      const hsN = hsWrap.querySelectorAll('.hs').length;
      if (hsN !== 3) {
        add('ERROR', '§13', 'The .herostats grid holds ' + hsN + ' .hs item(s); the CSS contract is ' +
          'exactly 3 (repeat(3,1fr) with .hs:last-child spanning below 540px). ' +
          (hsN > 3 ? 'The extra tile wraps to a ragged row.' : 'The missing tile leaves an empty cell.'));
      } else {
        add('OK', '§13', 'Hero-stat grid carries exactly 3 tiles.');
      }
    }
  }

  if (initSrc) {
    // 12b. Spec fields the library does not consume. These fail silently: the
    // field is ignored, so a projection renders identically to measured data —
    // an assumption-firewall breach that reads green on every gate.
    const DEAD = [
      ['hatched', 'rangeStrip has no `hatched` field. Use projectFrom:<value> on a single ' +
        'event spanning the whole range; the library splits it into solid and hatched at that point.'],
      ['dashed', 'DN.line has no `dashed` field. Use projectFrom:<value> on the series; ' +
        'the segment beyond it renders dashed.']
    ];
    let deadHits = 0;
    DEAD.forEach(function (d) {
      const re = new RegExp('\\b' + d[0] + '\\s*:\\s*(true|false)', 'g');
      const n = (initSrc.match(re) || []).length;
      if (n) {
        deadHits++;
        add('ERROR', '§8', n + ' use(s) of the dead spec field `' + d[0] + '` — it is not read by ' +
          'the library, so the projection renders as measured data. ' + d[1]);
      }
    });

    // 12c. DN.colors is a semantic token object, not an array. Integer indexing
    // yields undefined, which becomes fill="undefined" and paints black.
    const colIdx = (initSrc.match(/DN\.colors\s*\[\s*\d+\s*\]/g) || []);
    if (colIdx.length) {
      deadHits++;
      add('ERROR', '§8', colIdx.length + ' integer index(es) into DN.colors — it is a semantic token ' +
        'object ({ink, subject, muted, ...}), not an array, so this yields undefined and the mark ' +
        'renders black. Use DN.palette[n] for categorical colours, or a named token (DN.colors.subject).');
    }
    if (!deadHits) add('OK', '§8', 'No dead or mis-typed spec fields in the chart init.');

    // 12d. Host styling. Charts size themselves from their viewBox aspect ratio
    // (width:100%; height:auto). A min-height on the host cannot make a chart
    // taller — it adds dead white space below it. The one primitive that needs
    // the headroom is sankey, whose small nodes suppress value labels under 26px.
    const hostType = {};
    const dnRe = /DN\.(line|bars|columns|slope|scatter|rangeStrip|sankey)\s*\(\s*["']#([A-Za-z0-9_-]+)["']/g;
    let hm;
    while ((hm = dnRe.exec(initSrc))) hostType[hm[2]] = hm[1];
    let mhHits = 0;
    Object.keys(hostType).forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      const style = el.getAttribute('style') || '';
      if (/min-height/i.test(style) && hostType[id] !== 'sankey') {
        mhHits++;
        add('WARN', '§8', 'Chart host #' + id + ' (DN.' + hostType[id] + ') carries a min-height. ' +
          'Only sankey needs forced headroom; every other primitive sizes itself from its viewBox, ' +
          'so this renders as dead white space between the chart and its caption.');
      }
    });
    if (!mhHits) add('OK', '§8', 'No stray min-height on a self-sizing chart host.');

    // 12e. The v3.3.2 bars workaround. Fixed upstream in v3.3.3 (mT is now
    // unconditionally 22); a transparent reference line is now inert clutter.
    if (/refColor\s*:\s*["']transparent["']/.test(initSrc)) {
      add('INFO', '§8', 'A transparent refValue is present — this was the v3.3.2 workaround for ' +
        'clipped bars axis labels. Fixed in template v3.3.3; the refValue/refColor pair can be removed.');
    }
  }

  piece.close();
  report();
})();

function report() {
  const order = { ERROR: 0, WARN: 1, INFO: 2, OK: 3 };
  results.sort(function (a, b) { return order[a.level] - order[b.level]; });
  const n = function (lvl) { return results.filter(function (r) { return r.level === lvl; }).length; };
  const sym = { ERROR: '✗', WARN: '!', INFO: 'i', OK: '✓' };

  console.log('\n  DIGI NEWS — pre-publish lint\n  ' + '─'.repeat(48));
  ['ERROR', 'WARN', 'INFO', 'OK'].forEach(function (lvl) {
    results.filter(function (r) { return r.level === lvl; }).forEach(function (r) {
      console.log('  ' + sym[lvl] + ' [' + lvl.padEnd(5) + '] ' + (r.section + '').padEnd(8) + r.msg);
    });
  });
  console.log('  ' + '─'.repeat(48));
  console.log('  ' + n('ERROR') + ' error(s), ' + n('WARN') + ' warning(s), ' + n('OK') + ' passed.');
  if (n('ERROR') > 0) { console.log('  RESULT: BLOCKED — fix the errors above or cut the claim.\n'); process.exit(1); }
  if (n('WARN') > 0) { console.log('  RESULT: PASS WITH WARNINGS — review each before shipping.\n'); process.exit(0); }
  console.log('  RESULT: CLEAR — all mechanical gates passed.\n'); process.exit(0);
}
