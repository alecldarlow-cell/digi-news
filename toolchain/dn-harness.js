/* ==========================================================================
   DIGI NEWS — dn-harness.js
   Reusable headless render + layout-test harness for DN pieces.
   --------------------------------------------------------------------------
   Loads a finished single-file DN piece in jsdom with the polyfills the DN
   toolkit needs (matchMedia, ResizeObserver, requestAnimationFrame), forces a
   render at a chosen CSS width, and exposes the rendered charts for inspection.

   Why each polyfill exists (verified against house-template v3):
     - DN reads `window.matchMedia("(prefers-reduced-motion: reduce)")` at
       library-init time. jsdom does not implement matchMedia -> must stub it
       BEFORE page scripts parse, hence beforeParse().
     - DN sizing reads `host.clientWidth` (floored to 240). jsdom has no layout,
       so clientWidth is 0 and every chart would render at the 240 floor. We
       shadow clientWidth per host to test a specific viewport width.
     - DN's lifecycle uses `new ResizeObserver(go).observe(host)` to re-render
       on resize. jsdom has no ResizeObserver -> we install one that records
       its callbacks so the harness can fire a re-render at the target width.
     - requestAnimationFrame is made synchronous so a triggered re-render
       completes deterministically (no timer flushing needed).

   USAGE
     const { loadPiece } = require('./dn-harness');
     const piece = await loadPiece('/path/to/piece.html', { width: 360 });
     piece.errors            // array of {type, message} captured during render
     piece.charts()          // structured info for every DN chart
     piece.geometry(opts)    // {clips, overlaps, truncations, ok} at current width
     piece.render(880)       // re-render every chart at a new width
     piece.window, piece.document
     piece.close()

   loadPiece(file, opts):
     opts.width   initial render width in CSS px (default 360)
     opts.settle  ms to wait for DOMContentLoaded / setTimeout-wrapped init
                  blocks before returning (default 350)
   ========================================================================== */

const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

/* Label-width model — MUST match the DN toolkit's own model (LABEL_EM /
   LABEL_PX in the house template) so the gate certifies exactly what the
   toolkit fits. Per-char advance = font-size * EM. Font sizes mirror the
   .dn-* label classes. */
const LABEL_EM = 0.52;
const LABEL_FS = { 'dn-ax': 11, 'dn-axlabel': 11, 'dn-clabel': 12, 'dn-vlabel': 12.5, 'dn-endlab': 12, 'dn-anno': 11.5, 'dn-annosub': 10.5, 'dn-strip-name': 11 };
function labelFontPx(cls) { var ks = String(cls || '').split(/\s+/); for (var i = 0; i < ks.length; i++) if (LABEL_FS[ks[i]] != null) return LABEL_FS[ks[i]]; return 12; }

function installPolyfills(window) {
  // --- prefers-reduced-motion / any media query: read at DN init time ---
  if (!window.matchMedia) {
    window.matchMedia = function (q) {
      return {
        matches: false, media: String(q || ''), onchange: null,
        addListener: function () {}, removeListener: function () {},
        addEventListener: function () {}, removeEventListener: function () {},
        dispatchEvent: function () { return false; }
      };
    };
  }

  // --- ResizeObserver: record instances so the harness can fire re-renders ---
  window.__DN_RO__ = [];
  window.ResizeObserver = function (cb) {
    const rec = { cb: cb, els: [] };
    window.__DN_RO__.push(rec);
    this.observe = function (el) { if (rec.els.indexOf(el) < 0) rec.els.push(el); };
    this.unobserve = function (el) { const i = rec.els.indexOf(el); if (i >= 0) rec.els.splice(i, 1); };
    this.disconnect = function () { rec.els.length = 0; };
  };

  // --- synchronous rAF for deterministic re-render ---
  window.requestAnimationFrame = function (cb) { cb(0); return 0; };
  window.cancelAnimationFrame = function () {};

  // --- error backstop (in addition to the virtual console) ---
  window.__DN_ERRORS__ = [];
  window.onerror = function (msg) { window.__DN_ERRORS__.push({ type: 'window.onerror', message: String(msg) }); };
}

async function loadPiece(file, opts) {
  opts = opts || {};
  const width = opts.width || 360;
  const settle = opts.settle != null ? opts.settle : 350;
  const html = fs.readFileSync(file, 'utf8');

  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { errors.push({ type: 'uncaught', message: e && (e.message || String(e)) }); });
  vc.on('error', function () { errors.push({ type: 'console.error', message: Array.prototype.join.call(arguments, ' ') }); });

  // Note: external resources are intentionally NOT fetched. DN pieces are
  // self-contained (inline CSS/JS); the only external link is Google Fonts,
  // which is irrelevant to DOM/SVG structure and would otherwise add a
  // spurious network error in an offline sandbox. The dependency linter
  // checks the source text for disallowed externals separately.
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse: installPolyfills
  });

  const window = dom.window;
  const document = window.document;

  // let DOMContentLoaded / any setTimeout-wrapped init block run
  await new Promise(function (r) { setTimeout(r, settle); });

  function fireResize(w) {
    const hosts = document.querySelectorAll('.dn-fig');
    hosts.forEach(function (h) {
      try { Object.defineProperty(h, 'clientWidth', { configurable: true, get: function () { return w; } }); } catch (e) {}
    });
    (window.__DN_RO__ || []).forEach(function (rec) {
      try {
        rec.cb(rec.els.map(function (el) { return { target: el, contentRect: { width: w, height: 0 } }; }), null);
      } catch (e) { errors.push({ type: 'resize-render', message: String(e && e.message || e) }); }
    });
  }

  function render(w) { fireResize(w || width); }
  render(width); // force first deterministic render at target width

  function charts() {
    const figs = Array.prototype.slice.call(document.querySelectorAll('.dn-fig'));
    return figs.map(function (host) {
      const svg = host.querySelector('svg');
      const titleEl = svg && svg.querySelector('title');
      const descEl = svg && svg.querySelector('desc');
      const sr = host.querySelector('.dn-sr-only');
      const table = sr && sr.querySelector('table');
      const texts = svg ? Array.prototype.slice.call(svg.querySelectorAll('text')) : [];
      return {
        id: host.id || null,
        hasSvg: !!svg,
        svgChildren: svg ? svg.childNodes.length : 0,
        ariaLabel: svg ? (svg.getAttribute('aria-label') || '') : '',
        hasTitle: !!(titleEl && titleEl.textContent.trim()),
        hasDesc: !!(descEl && descEl.textContent.trim()),
        hasDataTable: !!table,
        tableRows: table ? table.querySelectorAll('tbody tr').length : 0,
        textCount: texts.length,
        emptyTextCount: texts.filter(function (t) { return !t.textContent.trim(); }).length
      };
    });
  }

  // merge window-level errors captured by the page backstop
  (window.__DN_ERRORS__ || []).forEach(function (e) { errors.push(e); });

  /* geometry(opts): tspan-aware label overflow + overlap probe. Returns
       { width, clips:[...], overlaps:[...], truncations:[...], ok }
     A "clip" is any painted text whose estimated box escapes the viewBox — on x
     for horizontal labels, and on either axis for rotated labels (rangeStrip
     barcode category names are painted with transform="rotate(-90 …)", so their
     advance runs along y; modelling them horizontally used to mis-flag long ones
     and miss a top-clip entirely). Horizontal labels overlap when they share a
     row (|dy| < rowEps) and their x-boxes intersect; any pair involving a rotated
     label is tested as a full 2-D box intersection. <title>/<desc> tooltip
     children are ignored (not painted).
     Truncations (data-dn-fit="trunc") are reported so intentional shortening is
     visible but does NOT fail the gate. */
  function geometry(opts) {
    opts = opts || {};
    var em = opts.em != null ? opts.em : LABEL_EM;
    var eps = opts.eps != null ? opts.eps : 0.5;
    var rowEps = opts.rowEps != null ? opts.rowEps : 3;
    var clips = [], overlaps = [], truncations = [];

    function visText(el) {
      var s = '';
      for (var i = 0; i < el.childNodes.length; i++) {
        var n = el.childNodes[i];
        if (n.nodeType === 3) s += n.textContent;
        else if (n.nodeName && n.nodeName.toLowerCase() === 'tspan') s += n.textContent;
      }
      return s;
    }
    function attr(el, k) { return el.getAttribute(k) || (el.parentNode && el.parentNode.getAttribute && el.parentNode.getAttribute(k)); }
    // Rotation applied to a painted label (e.g. rangeStrip barcode category
    // names use transform="rotate(-90 …)"). Read from the element or its parent.
    function rotAngle(el) {
      var tf = (el.getAttribute && el.getAttribute('transform')) ||
               (el.parentNode && el.parentNode.getAttribute && el.parentNode.getAttribute('transform')) || '';
      var m = /rotate\(\s*(-?\d+(?:\.\d+)?)/.exec(tf);
      return m ? parseFloat(m[1]) : 0;
    }

    Array.prototype.slice.call(document.querySelectorAll('.dn-fig')).forEach(function (host) {
      var svg = host.querySelector('svg'); if (!svg) return;
      var vb = (svg.getAttribute('viewBox') || '0 0 0 0').split(' ').map(Number), vw = vb[2], vh = vb[3];
      var id = host.id || '(no id)';
      // build one measurable unit per painted line
      var units = [];
      Array.prototype.slice.call(svg.querySelectorAll('text')).forEach(function (t) {
        if (t.getAttribute('data-dn-fit') === 'trunc') truncations.push({ chart: id, text: visText(t) });
        var spans = Array.prototype.slice.call(t.children).filter(function (c) { return c.tagName && c.tagName.toLowerCase() === 'tspan' && c.getAttribute('x') != null; });
        if (spans.length) spans.forEach(function (s) { if ((s.textContent || '').trim()) units.push({ el: s, str: s.textContent }); });
        else { var v = visText(t); if (v.trim()) units.push({ el: t, str: v }); }
      });
      var boxes = units.map(function (u) {
        var anchor = attr(u.el, 'text-anchor') || 'start';
        var x = parseFloat(u.el.getAttribute('x') || '0');
        var fs = labelFontPx(attr(u.el, 'class'));
        var w = u.str.length * fs * em;                 // advance along the text baseline
        var y = parseFloat(u.el.getAttribute('y') || (u.el.parentNode && u.el.parentNode.getAttribute && u.el.parentNode.getAttribute('y')) || '0');
        var deg = Math.round(rotAngle(u.el));
        var rot = (deg === 90 || deg === -90);
        var l, r, t, b;
        if (rot) {
          // Vertical text: the advance runs along y, not x. rotate(-90) sends the
          // baseline upward (decreasing y); rotate(90) downward. The horizontal
          // footprint is only about one glyph-height wide, centred on x.
          var dir = (deg === 90) ? 1 : -1;
          var y0, y1;
          if (anchor === 'middle') { y0 = y - w / 2; y1 = y + w / 2; }
          else if (anchor === 'end') { y1 = y; y0 = y - dir * w; }
          else { y0 = y; y1 = y + dir * w; }            // start (DN's barcode default)
          t = Math.min(y0, y1); b = Math.max(y0, y1);
          var hw = fs * 0.6; l = x - hw; r = x + hw;
        } else {
          if (anchor === 'end') { l = x - w; r = x; }
          else if (anchor === 'middle') { l = x - w / 2; r = x + w / 2; }
          else { l = x; r = x + w; }
          t = y - fs * 0.8; b = y + fs * 0.2;            // approx ascent/descent band
        }
        return { l: l, r: r, t: t, b: b, y: y, rot: rot, str: u.str };
      });
      boxes.forEach(function (bx) {
        if (bx.l < -eps || bx.r > vw + eps) clips.push({ chart: id, text: bx.str, axis: 'x', box: [Math.round(bx.l), Math.round(bx.r)], vb: vw });
        // vertical clip is only meaningful for rotated labels (horizontal labels
        // sit on authored baselines and their ascent band is an estimate).
        if (bx.rot && (bx.t < -eps || bx.b > vh + eps)) clips.push({ chart: id, text: bx.str, axis: 'y', box: [Math.round(bx.t), Math.round(bx.b)], vb: vh });
      });
      for (var i = 0; i < boxes.length; i++) for (var j = i + 1; j < boxes.length; j++) {
        var a = boxes[i], c = boxes[j];
        if (!a.rot && !c.rot) {
          // horizontal pair: unchanged same-row + x-overlap test
          if (Math.abs(a.y - c.y) < rowEps && a.l < c.r - eps && c.l < a.r - eps) overlaps.push({ chart: id, a: a.str, b: c.str });
        } else {
          // any rotated label involved: true 2-D box intersection
          if (a.l < c.r - eps && c.l < a.r - eps && a.t < c.b - eps && c.t < a.b - eps) overlaps.push({ chart: id, a: a.str, b: c.str });
        }
      }
    });
    return { width: Math.round((document.querySelector('.dn-fig') && document.querySelector('.dn-fig').clientWidth) || 0), clips: clips, overlaps: overlaps, truncations: truncations, ok: clips.length === 0 && overlaps.length === 0 };
  }

  return {
    dom: dom, window: window, document: document,
    html: html, file: file,
    errors: errors,
    render: render,
    charts: charts,
    geometry: geometry,
    close: function () { try { window.close(); } catch (e) {} }
  };
}

module.exports = { loadPiece: loadPiece };
