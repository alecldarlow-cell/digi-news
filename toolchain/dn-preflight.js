#!/usr/bin/env node
/* ==========================================================================
   DIGI NEWS — dn-preflight.js
   The geometry gate, moved to the front of the build.

   WHY THIS EXISTS
     dn-probe.js can only run on a finished piece, so every label failure was
     found after the prose was written and spliced — a clipped rangeStrip row,
     a verbose x.fmt colliding at 680px, a bars label eaten by the gutter cap.
     Each cost a rebuild. All of them are decidable from the chart spec alone.

     This script builds a throwaway page containing the real DN library and the
     author's init.js, then runs the SAME geometry() probe the gate uses. It is
     not a second model of the layout — it is the layout, rendered early. There
     is no drift risk, because there is no duplicated arithmetic.

   It also runs three static checks the renderer fails silently on:
     · negative values handed to a zero-anchored primitive (bars / columns)
     · non-numeric x values in line / scatter (collapse to NaN coordinates)
     · x.fmt output long enough to crowd the axis it also feeds

   USAGE
     node dn-preflight.js piece/init.js
     node dn-preflight.js piece/init.js --widths 360,680,980 --keep

   EXIT  0 clean · 1 geometry or static failure · 2 could not run
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { loadPiece } = require('./dn-harness');

function parseArgs(argv) {
  const a = { init: null, widths: [360, 680], keep: false, template: null };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--keep') a.keep = true;
    else if (t === '--widths') a.widths = argv[++i].split(',').map(Number).filter(Boolean);
    else if (t === '--template') a.template = argv[++i];
    else if (!a.init) a.init = t;
  }
  return a;
}

function findTemplate(explicit) {
  if (explicit) return explicit;
  const here = fs.readdirSync(process.cwd());
  const cands = here.filter(f => /^digi-news-house-template.*\.html$/.test(f)).sort();
  if (!cands.length) return null;
  return cands[cands.length - 1];               // highest version suffix wins
}

/* ---- static checks: things the renderer swallows without complaint ---- */
function staticChecks(src) {
  const issues = [];

  // 1. Negative values into a zero-anchored primitive. bars() and columns()
  //    both scale with niceScale(0, max); a negative datum renders at or behind
  //    the axis and simply disappears. There is no warning at any layer.
  const zeroAnchored = /DN\.(bars|columns)\s*\(/g;
  let m;
  while ((m = zeroAnchored.exec(src))) {
    const seg = src.slice(m.index, src.indexOf('});', m.index) + 3);
    const negs = seg.match(/value\s*:\s*-\s*[\d.]+|:\s*-\s*[\d.]+\s*[,}]/g) || [];
    if (negs.length) {
      issues.push('DN.' + m[1] + ' is zero-anchored but receives ' + negs.length +
        ' negative value(s) — they will render as nothing. Use a diverging ' +
        'presentation (e.g. rangeStrip spanning the two endpoints) or plot the ' +
        'absolute change with direction carried in the label.');
    }
  }

  // 2. Non-numeric x in line/scatter. lin() does arithmetic on the domain; a
  //    string x produces NaN and the path silently collapses.
  const xySeries = /DN\.(line|scatter)\s*\(/g;
  while ((m = xySeries.exec(src))) {
    const seg = src.slice(m.index, src.indexOf('});', m.index) + 3);
    const strX = seg.match(/x\s*:\s*["'][^"']*["']/g) || [];
    if (strX.length) {
      issues.push('DN.' + m[1] + ' receives ' + strX.length + ' string x-value(s) (' +
        strX.slice(0, 2).join(', ') + ') — x must be numeric. Put display ' +
        'formatting in x.fmt instead.');
    }
  }

  // 3. x.fmt feeds the axis ticks AND the hidden a11y table. A verbose format
  //    is the single most common cause of a 680px tick collision.
  const fmtStrings = src.match(/fmt\s*:\s*function[^}]*}/g) || [];
  fmtStrings.forEach(f => {
    const lits = f.match(/["'][^"']{9,}["']/g) || [];
    if (lits.length) {
      issues.push('An x.fmt returns a long literal (' + lits[0].slice(0, 24) +
        '...). x.fmt feeds axis ticks and the accessibility table together; ' +
        'keep ticks terse and carry full precision in each event label.');
    }
  });

  // 4. Spec fields the library does not consume. The renderer ignores them
  //    silently, so a projection draws identically to measured data — the
  //    assumption firewall breached with every gate reading green.
  const hatched = (src.match(/\bhatched\s*:\s*(true|false)/g) || []).length;
  if (hatched) {
    issues.push(hatched + ' use(s) of `hatched:` — rangeStrip has no such field. ' +
      'Use projectFrom:<value> on one event spanning the whole range; the library ' +
      'splits it into solid and hatched segments at that point.');
  }
  const dashed = (src.match(/\bdashed\s*:\s*(true|false)/g) || []).length;
  if (dashed) {
    issues.push(dashed + ' use(s) of `dashed:` — DN.line has no such field. ' +
      'Use projectFrom:<value> on the series; the segment beyond it renders dashed.');
  }

  // 5. DN.colors is a semantic token object, not an array. Integer indexing
  //    returns undefined, which becomes fill="undefined" and paints black.
  const colIdx = (src.match(/DN\.colors\s*\[\s*\d+\s*\]/g) || []).length;
  if (colIdx) {
    issues.push(colIdx + ' integer index(es) into DN.colors — it is a token object ' +
      '({ink, subject, muted, proj, ...}), not an array. Use DN.palette[n] for ' +
      'categorical colours, or a named token such as DN.colors.subject.');
  }

  return issues;
}

(async function () {
  const args = parseArgs(process.argv);
  if (!args.init) {
    console.error('usage: node dn-preflight.js <init.js> [--widths 360,680] [--keep]');
    process.exit(2);
  }
  const src = fs.readFileSync(args.init, 'utf8');

  const tplName = findTemplate(args.template);
  if (!tplName || !fs.existsSync(tplName)) {
    console.error('dn-preflight: no house template found in ' + process.cwd() +
      ' (pass --template)'); process.exit(2);
  }
  const tpl = fs.readFileSync(tplName, 'utf8').split('\n');

  // Pull the DN library block verbatim — first <script>..</script> pair.
  const opens = [], closes = [];
  tpl.forEach((l, i) => {
    if (l.trim() === '<script>') opens.push(i);
    if (l.trim() === '</script>') closes.push(i);
  });
  if (opens.length < 1 || closes.length < 1) {
    console.error('dn-preflight: could not locate the DN library block'); process.exit(2);
  }
  const lib = tpl.slice(opens[0], closes[0] + 1).join('\n');
  const styleStart = tpl.findIndex(l => l.trim().startsWith('<style'));
  const styleEnd = tpl.findIndex(l => l.trim() === '</style>');
  const style = (styleStart > -1 && styleEnd > styleStart)
    ? tpl.slice(styleStart, styleEnd + 1).join('\n') : '';

  // Host divs for every selector the init actually targets.
  const ids = Array.from(new Set(
    (src.match(/DN\.\w+\s*\(\s*["']#([\w-]+)["']/g) || [])
      .map(s => s.replace(/.*#/, '').replace(/["'].*/, ''))
  ));
  if (!ids.length) {
    console.error('dn-preflight: no DN.*("#id", ...) calls found in ' + args.init);
    process.exit(2);
  }

  const stub = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>preflight</title>${style}</head><body><div class="wrap">
${ids.map(i => `<figure class="fig"><div id="${i}"></div></figure>`).join('\n')}
</div>
${lib}
<script>
(function(){
${src}
})();
</script>
</body></html>`;

  const tmp = path.join(process.cwd(), '.dn-preflight.tmp.html');
  fs.writeFileSync(tmp, stub);

  console.log('DN preflight — ' + args.init);
  console.log('  exhibits: ' + ids.join(', ') + '   (template: ' + tplName + ')');

  let ok = true;

  const stat = staticChecks(src);
  if (stat.length) {
    ok = false;
    stat.forEach(s => console.log('     STATIC  ' + s));
  } else {
    console.log('  static: clean (no zero-anchor negatives, no string x, no verbose x.fmt)');
  }

  for (const width of args.widths) {
    let piece;
    try {
      piece = await loadPiece(tmp, { width });
    } catch (e) {
      console.log('     LOAD    ' + width + 'px: ' + (e && e.message));
      ok = false;
      continue;
    }
    const renderErrors = piece.errors.filter(e =>
      !/fonts|Could not load|network|ECONNREFUSED|resource/i.test(e.message || ''));
    const g = piece.geometry();
    const bad = g.clips.length || g.overlaps.length || renderErrors.length;
    console.log('  ' + width + 'px: ' + (bad
      ? g.clips.length + ' clip, ' + g.overlaps.length + ' overlap, ' + renderErrors.length + ' render-error'
      : 'clean') + (g.truncations.length ? '  (' + g.truncations.length + ' truncated)' : ''));
    g.clips.forEach(c => console.log('     CLIP    [' + c.chart + '] "' + c.text.slice(0, 40) +
      '" ' + (c.axis || 'x') + '-box=[' + c.box[0] + ',' + c.box[1] + '] canvas=0..' + c.vb));
    g.overlaps.forEach(o => console.log('     OVERLAP [' + o.chart + '] "' + o.a.slice(0, 24) +
      '" / "' + o.b.slice(0, 24) + '"'));
    renderErrors.forEach(e => console.log('     RENDER  ' + (e.message || '').slice(0, 120)));
    g.truncations.forEach(t => console.log('     note: truncated in [' + t.chart + '] "' +
      t.text.slice(0, 40) + '" (full text preserved in the a11y table)'));
    if (bad) ok = false;
    piece.close();
  }

  if (!args.keep) { try { fs.unlinkSync(tmp); } catch (e) { } }
  console.log(ok ? 'PREFLIGHT: PASS — safe to author prose against these exhibits.'
    : 'PREFLIGHT: FAIL — fix the spec now, before any prose is written.');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('dn-preflight error:', (e && e.stack) || e); process.exit(2); });
