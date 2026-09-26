/* ==========================================================================
   DIGI — reader activity (dn-track.js)
   --------------------------------------------------------------------------
   Anonymous, first-party usage events for Digi News, Puzzles and Games,
   sent to the `digi` Supabase project (London, eu-west-2) through one
   write-only function, log_events. The page can add events; it can never
   read anything back.

   What is sent: an event name, the page's path, a random browser ID, a
   random visit ID, and a few small details (see `props` in each call).
   What is never sent: names, emails, IP addresses, answers, keystrokes.

   Opt-out: the "Don't record my visits" button in any footer, or a browser
   Global Privacy Control / Do Not Track signal. When opted out nothing is
   stored or sent.

   For puzzles and games:  digi.track('game_end', {score: 4200, seconds: 312})
   The page never depends on this script: every failure is silent.
   ========================================================================== */
(function () {
  'use strict';

  var URL_ = 'https://gnehttjheoyutrfsvslq.supabase.co/rest/v1/rpc/log_events';
  var KEY  = 'sb_publishable_dEMntRNiElpGHn3Hd5Ef1Q_HvLa2wTB';   // public by design
  var IDLE = 30 * 60 * 1000;          // a visit ends after 30 minutes idle
  var MAX_BATCH = 25;                 // matches the database's cap

  /* ---------- storage (every access guarded) ---------- */
  function get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k){ try { localStorage.removeItem(k); } catch (e) {} }

  function uuid(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); (window.crypto || {}).getRandomValues
      ? crypto.getRandomValues(b) : b.forEach(function(_, i){ b[i] = Math.random()*256|0; });
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function(x){ return (x+256).toString(16).slice(1); }).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }

  function signalOptOut(){
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  }
  function optedOut(){ return get('digi.optout') === '1' || signalOptOut(); }

  /* ---------- identity: random, per browser / per visit ---------- */
  function ids(){
    var a = get('digi.aid');
    if (!a) { a = uuid(); set('digi.aid', a); }
    var s = get('digi.sid'), last = +get('digi.last') || 0, now = Date.now();
    if (!s || now - last > IDLE) { s = uuid(); set('digi.sid', s); }
    set('digi.last', String(now));
    return { a: a, s: s };
  }

  /* ---------- where are we ---------- */
  function meta(n){ var m = document.querySelector('meta[name="'+n+'"]'); return m ? m.content : ''; }
  var KIND_TO_SECTION = { report: 'news', puzzle: 'puzzles', game: 'games' };
  var SECTION = document.documentElement.dataset.section ||
                KIND_TO_SECTION[meta('dn:kind')] || 'site';
  // "reports/2026-09-26-arcade-lighthouse-keeper.html", "puzzles.html", …
  function pathOf(href){
    try {
      var p = new URL(href, location.href).pathname.split('/').filter(Boolean);
      if (!p.length || !/\./.test(p[p.length-1])) p.push('index.html');
      return p.slice(-2)[0] === 'reports' ? p.slice(-2).join('/') : p[p.length-1];
    } catch (e) { return ''; }
  }
  var PATH = pathOf(location.href);

  /* ---------- queue + send ---------- */
  var queue = [];
  function track(ev, props, path){
    if (optedOut()) return;
    var id = ids();
    queue.push({ a: id.a, s: id.s, sec: SECTION, ev: String(ev), p: path || PATH,
                 x: (props && typeof props === 'object') ? props : {} });
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
  document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  /* ---------- automatic events ---------- */
  function band(w){ return w < 480 ? 'phone' : w < 1024 ? 'tablet' : 'desktop'; }
  function refDomain(){
    try { var r = new URL(document.referrer); return r.host === location.host ? '' : r.host; }
    catch (e) { return ''; }
  }
  track('page_view', { ref: refDomain(), screen: band(window.innerWidth) });
  flush();   // send the view now, so a quick bounce still counts

  // Front pages: which card was opened, from where in the list.
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
    flush();   // the page is about to change
  });

  // Articles: how far down the piece the reader got.
  if (SECTION === 'news' && meta('dn:kind') === 'report') {
    var marks = [25, 50, 75, 100], hit = {};
    var onScroll = function(){
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var pct = h > 0 ? (window.scrollY / h) * 100 : 100;
      marks.forEach(function(m){ if (pct >= m - 1 && !hit[m]) { hit[m] = 1; track('read_depth', { pct: m }); } });
      if (hit[100]) window.removeEventListener('scroll', onScroll);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
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
