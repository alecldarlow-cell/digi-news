#!/usr/bin/env node
/* ==========================================================================
   DIGI NEWS — dn-probe.js
   Label-geometry gate. Loads a finished DN piece, renders it at each test
   width, and FAILS (exit 1) if any painted chart label clips off-canvas or
   overlaps another label. Intentional truncations (data-dn-fit="trunc") are
   listed as notes but do NOT fail the gate.

   USAGE
     node dn-probe.js piece.html                 # widths 360 and 680
     node dn-probe.js piece.html --widths 360,680,980
     node dn-probe.js piece.html --json

   Run this on every piece before it is handed over — same gate as dn-lint.js.
   ========================================================================== */
const { loadPiece } = require('./dn-harness');

function parseArgs(argv) {
  var a = { file: null, widths: [360, 680], json: false };
  for (var i = 2; i < argv.length; i++) {
    var t = argv[i];
    if (t === '--json') a.json = true;
    else if (t === '--widths') { a.widths = argv[++i].split(',').map(function (x) { return parseInt(x, 10); }).filter(Boolean); }
    else if (!a.file) a.file = t;
  }
  return a;
}

(async function () {
  var args = parseArgs(process.argv);
  if (!args.file) { console.error('usage: node dn-probe.js <piece.html> [--widths 360,680] [--json]'); process.exit(2); }

  var report = { file: args.file, widths: {}, ok: true };

  // one load per width keeps each render fully deterministic
  for (var w = 0; w < args.widths.length; w++) {
    var width = args.widths[w];
    var piece = await loadPiece(args.file, { width: width });
    var renderErrors = piece.errors.filter(function (e) {
      return !/fonts|Could not load|network|ECONNREFUSED|resource/i.test(e.message || '');
    });
    var g = piece.geometry();
    report.widths[width] = { clips: g.clips, overlaps: g.overlaps, truncations: g.truncations, renderErrors: renderErrors };
    if (g.clips.length || g.overlaps.length || renderErrors.length) report.ok = false;
    piece.close();
  }

  if (args.json) { console.log(JSON.stringify(report, null, 2)); process.exit(report.ok ? 0 : 1); }

  console.log('DN geometry gate — ' + args.file);
  Object.keys(report.widths).forEach(function (width) {
    var r = report.widths[width];
    var head = '  ' + width + 'px: ' + (r.clips.length || r.overlaps.length || r.renderErrors.length
      ? (r.clips.length + ' clip, ' + r.overlaps.length + ' overlap, ' + r.renderErrors.length + ' render-error')
      : 'clean') + (r.truncations.length ? '  (' + r.truncations.length + ' truncated label' + (r.truncations.length > 1 ? 's' : '') + ')' : '');
    console.log(head);
    r.clips.forEach(function (c) { console.log('     CLIP    [' + c.chart + '] "' + c.text.slice(0, 40) + '"  ' + (c.axis || 'x') + '-box=[' + c.box[0] + ',' + c.box[1] + '] canvas=0..' + c.vb); });
    r.overlaps.forEach(function (o) { console.log('     OVERLAP [' + o.chart + '] "' + o.a.slice(0, 24) + '" / "' + o.b.slice(0, 24) + '"'); });
    r.renderErrors.forEach(function (e) { console.log('     RENDER  ' + (e.type || '') + ' ' + (e.message || '').slice(0, 120)); });
    r.truncations.forEach(function (t) { console.log('     note: truncated in [' + t.chart + '] shows "' + t.text.slice(0, 40) + '" (full text in a11y table + tooltip)'); });
  });
  console.log(report.ok ? 'GATE: PASS' : 'GATE: FAIL');
  process.exit(report.ok ? 0 : 1);
})().catch(function (e) { console.error('dn-probe error:', e && e.stack || e); process.exit(2); });
