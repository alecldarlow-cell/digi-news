/* ==========================================================================
   DIGI — reader activity (dn-track.js)  v2
   --------------------------------------------------------------------------
   Anonymous, first-party usage events for Digi News, Puzzles and Games,
   sent to the `digi` Supabase project (London, eu-west-2) through one
   write-only function, log_events. The page can add events; it can never
   read anything back.

   Identity: one random ID per browser (a "reader"), one per visit (30 min
   idle), and one per page load ("pv") so a page's events can be tied
   together. None is linked to a name, email or IP address.

   Automatic events
     all pages   page_view   {pv, topic, kind, new, ref, screen}
                 page_exit   {pv, secs, depth, [started, ended]}   each time the page is hidden (running totals)
     front pages card_click  {to, pos, topic, searched}
     articles    read_depth  {pv, pct: 25|50|75|100}
                 exhibit_view{pv, n}      a chart scrolled half into view
                 source_click{pv, domain} an outbound link
     puzzles     puzzle_start{pv, type}   first tap or key press
                 puzzle_end  {pv, type, outcome: solved|failed|revealed, secs, checks, reveals, hints}
   Games call digi.track('game_start' | 'game_end', {...}) themselves.

   Never sent: names, emails, IP addresses, answers, keystrokes.
   Opt-out: the "Don't record my visits" button in any footer, or a browser
   Global Privacy Control / Do Not Track signal.
   The page never depends on this script: every failure is silent.
   ========================================================================== */
(function () {
  'use strict';

  var URL_ = 'https://gnehttjheoyutrfsvslq.supabase.co/rest/v1/rpc/log_events';
  var KEY  = 'sb_publishable_dEMntRNiElpGHn3Hd5Ef1Q_HvLa2wTB';   // public by design
  var IDLE = 30 * 60 * 1000;
  var MAX_BATCH = 25;

  /* ---------- storage (every access guarded) ---------- */
  function get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k){ try { localStorage.removeItem(k); } catch (e) {} }

  function uuid(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16), i;
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (i = 0; i < 16; i++) b[i] = Math.random() * 256 | 0;
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = ''; for (i = 0; i < 16; i++) h += (b[i] + 256).toString(16).slice(1);
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }

  function signalOptOut(){
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  }
  function optedOut(){ return get('digi.optout') === '1' || signalOptOut(); }

  /* ---------- identity ---------- */
  var isNew = false;
  function ids(){
    var a = get('digi.aid');
    if (!a) { a = uuid(); set('digi.aid', a); isNew = true; }
    var s = get('digi.sid'), last = +get('digi.last') || 0, now = Date.now();
    if (!s || now - last > IDLE) { s = uuid(); set('digi.sid', s); }
    set('digi.last', String(now));
    return { a: a, s: s };
  }
  var PV = uuid().slice(0, 8);   // this page load

  /* ---------- where are we ---------- */
  function meta(n){ var m = document.querySelector('meta[name="'+n+'"]'); return m ? m.content : ''; }
  var KIND = meta('dn:kind');
  var KIND_TO_SECTION = { report: 'news', puzzle: 'puzzles', game: 'games' };
  var SECTION = document.documentElement.dataset.section || KIND_TO_SECTION[KIND] || 'site';
  function pathOf(href){
    try {
      var p = new URL(href, location.href).pathname.split('/').filter(Boolean);
      if (!p.length || !/\./.test(p[p.length-1])) p.push('index.html');
      return p.slice(-2)[0] === 'reports' ? p.slice(-2).join('/') : p[p.length-1];
    } catch (e) { return ''; }
  }
  var PATH = pathOf(location.href);
  var PTYPE = (PATH.match(/(crossword-mini|logic-doku|logic-path|logic-sweep|word-link|digi-doku|digi-path)/) || [])[1] || '';
  if (PTYPE === 'digi-doku') PTYPE = 'logic-doku';
  if (PTYPE === 'digi-path') PTYPE = 'logic-path';

  /* ---------- queue + send ---------- */
  var queue = [];
  function track(ev, props, path){
    if (optedOut()) return;
    var id = ids(), x = {};
    if (props && typeof props === 'object') for (var k in props) if (props.hasOwnProperty(k)) x[k] = props[k];
    if (!('pv' in x)) x.pv = PV;
    queue.push({ a: id.a, s: id.s, sec: SECTION, ev: String(ev), p: path || PATH, x: x });
    if (queue.length >= MAX_BATCH) flush();
  }
  function flush(){
    if (!queue.length) return;
    var batch = queue.splice(0, MAX_BATCH);
    try {
      fetch(URL_, {
        method: 'POST', keepalive: true, mode: 'cors',
        headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: batch })
      }).catch(function(){});
    } catch (e) {}
    if (queue.length) flush();
  }
  setInterval(flush, 10000);

  /* ---------- page view ---------- */
  function band(w){ return w < 480 ? 'phone' : w < 1024 ? 'tablet' : 'desktop'; }
  function refDomain(){
    try { var r = new URL(document.referrer); return r.host === location.host ? '' : r.host; }
    catch (e) { return ''; }
  }
  if (!optedOut()) ids();   // sets isNew before the first event
  track('page_view', { topic: meta('dn:topic'), kind: KIND, new: isNew,
                       ref: refDomain(), screen: band(window.innerWidth) });
  flush();

  /* ---------- time on page + depth, sent once when the page is first hidden ---------- */
  var visibleSince = document.visibilityState === 'visible' ? Date.now() : 0, activeMs = 0, maxDepth = 0, exited = 0;
  function depthNow(){
    var h = document.documentElement.scrollHeight - window.innerHeight;
    return Math.min(100, Math.round(h > 0 ? (window.scrollY / h) * 100 : 100));
  }
  window.addEventListener('scroll', function(){ var d = depthNow(); if (d > maxDepth) maxDepth = d; }, { passive: true });
  function exit(){
    if (visibleSince) { activeMs += Date.now() - visibleSince; visibleSince = 0; }
    // Sent every time the page is hidden, with running totals: a reader who
    // switches apps and comes back is counted once, using the largest values.
    if (activeMs - exited >= 1000 || !exited) {
      exited = activeMs || 1;
      var p = { secs: Math.round(activeMs / 1000), depth: Math.max(maxDepth, depthNow()) };
      if (PTYPE) { p.type = PTYPE; p.started = puz.started; p.ended = puz.ended; }
      track('page_exit', p);
    }
    flush();
  }
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'hidden') exit();
    else if (!visibleSince) visibleSince = Date.now();
  });
  window.addEventListener('pagehide', exit);

  /* ---------- front pages: which card ---------- */
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a.card');
    if (!a) return;
    var li = a.closest('li'), pos = li ? Array.prototype.indexOf.call(li.parentNode.children, li) + 1 : 0;
    var topic = document.querySelector('.chip[aria-pressed="true"]');
    var q = document.getElementById('q');
    track('card_click', {
      to: pathOf(a.href), pos: pos,
      topic: topic && topic.dataset.topic !== 'all' ? topic.dataset.topic : '',
      searched: !!(q && q.value)
    });
    flush();
  });

  /* ---------- articles: depth, charts seen, sources opened ---------- */
  if (SECTION === 'news' && KIND === 'report') {
    var marks = [25, 50, 75, 100], hit = {};
    var onScroll = function(){
      var pct = depthNow();
      marks.forEach(function(m){ if (pct >= m - 1 && !hit[m]) { hit[m] = 1; track('read_depth', { pct: m }); } });
      if (hit[100]) window.removeEventListener('scroll', onScroll);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    var watchExhibits = function(){
      var ex = document.querySelectorAll('figure.exhibit');
      if (!ex.length || !('IntersectionObserver' in window)) return;
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          if (en.isIntersecting) {
            track('exhibit_view', { n: Array.prototype.indexOf.call(ex, en.target) + 1 });
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.5 });
      Array.prototype.forEach.call(ex, function(el){ io.observe(el); });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchExhibits); else watchExhibits();

    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[href^="http"]');
      if (!a) return;
      try { var h = new URL(a.href).host; if (h && h !== location.host) track('source_click', { domain: h }); } catch (x) {}
    });
  }

  /* ---------- puzzles: start, finish, help used ----------
     Every puzzle type shows its result box (#winModal, or #modal for Path)
     by adding the class "on", and titles it with the outcome. So one
     observer covers all of them without touching the puzzle files.       */
  var puz = { started: false, ended: false, t0: 0, checks: 0, reveals: 0, hints: 0, revealedAll: false };
  var LOSS_TITLES = /^(boom\.?|so close\.?)$/i;
  function mmss(t){
    var m = String(t || '').match(/(\d+):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return m[3] ? (+m[1])*3600 + (+m[2])*60 + (+m[3]) : (+m[1])*60 + (+m[2]);
  }
  if (PTYPE) {
    var startPuzzle = function(e){
      if (puz.started) return;
      var t = e.target;
      if (t && t.closest && t.closest('a, .modal, footer, .foot')) return;
      puz.started = true; puz.t0 = Date.now();
      track('puzzle_start', { type: PTYPE });
    };
    document.addEventListener('pointerdown', startPuzzle, true);
    document.addEventListener('keydown', startPuzzle, true);

    document.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('button, [role="button"]');
      if (!b || !b.id) return;
      if (/^check/i.test(b.id)) puz.checks++;
      else if (b.id === 'revealAll') puz.revealedAll = true;
      else if (/^reveal/i.test(b.id)) puz.reveals++;
      else if (/^hint/i.test(b.id)) puz.hints++;
    }, true);

    var watchResult = function(){
      var box = document.getElementById('winModal') || document.getElementById('modal');
      if (!box || !('MutationObserver' in window)) return;
      new MutationObserver(function(){
        if (puz.ended || !box.classList.contains('on')) return;
        puz.ended = true;
        var title = (document.getElementById('winTitle') || {}).textContent || '';
        var shown = mmss((document.getElementById('winTime') || document.getElementById('statTime') || {}).textContent);
        var outcome = puz.revealedAll ? 'revealed' : LOSS_TITLES.test(title.trim()) ? 'failed' : 'solved';
        track('puzzle_end', {
          type: PTYPE, outcome: outcome,
          secs: shown != null ? shown : (puz.t0 ? Math.round((Date.now() - puz.t0) / 1000) : null),
          checks: puz.checks, reveals: puz.reveals, hints: puz.hints
        });
        flush();
      }).observe(box, { attributes: true, attributeFilter: ['class'] });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchResult); else watchResult();
  }

  /* ---------- opt-out button(s) ---------- */
  function paint(){
    document.querySelectorAll('[data-digi-optout]').forEach(function(b){
      var off = optedOut();
      b.textContent = off ? 'Not recording your visits · turn back on' : 'Don’t record my visits';
      b.setAttribute('aria-pressed', String(off));
      b.disabled = signalOptOut();
      if (signalOptOut()) b.textContent = 'Not recording (your browser asked us not to)';
    });
  }
  function setOptOut(on){
    if (on) { set('digi.optout', '1'); queue.length = 0; del('digi.aid'); del('digi.sid'); del('digi.last'); }
    else    { del('digi.optout'); }
    paint();
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-digi-optout]');
    if (b) setOptOut(!optedOut());
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint); else paint();

  window.digi = { track: track, flush: flush, optOut: setOptOut, isOptedOut: optedOut };
})();
