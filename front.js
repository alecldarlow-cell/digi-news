/* ==========================================================================
   DIGI — shared front-page script for Digi News, Digi Puzzles and Digi Games.
   --------------------------------------------------------------------------
   Reads feed.json (built by .github/workflows/build-feed.yml on every push and
   nightly) and renders a reverse-chronological, topic-filterable card list of
   the section's own kind: report (News), puzzle (Puzzles) or game (Games).
   If feed.json is missing it falls back to the GitHub API folder listings and
   labels the result provisional.

   You should never need to edit this file to publish. Upload a piece to
   /reports, /puzzles or /games and it appears on the right page.
   ========================================================================== */
(function(){
  'use strict';

  /* ---------- config ------------------------------------------------------
     Only used by the fallback listing (when feed.json isn't there yet).
     Leave blank to auto-detect from the GitHub Pages URL.                   */
  var CONFIG = { owner:'', repo:'', branch:'main' };

  /* ---------- section ------------------------------------------------------
     Each page declares its desk on <html data-section="…">. The section picks
     which kind of item from feed.json it shows and which folder the fallback
     listing reads. One script, three pages.                                   */
  var SECTIONS = {
    news:    { kind:'report', dir:'reports', noun:['piece','pieces'],
               empty:'No pieces published yet.' },
    puzzles: { kind:'puzzle', dir:'puzzles', noun:['puzzle','puzzles'],
               empty:'No puzzles published yet.' },
    games:   { kind:'game',   dir:'games',   noun:['game','games'],
               empty:'No games yet — the first ones are on their way.' }
  };
  var SEC = SECTIONS[document.documentElement.dataset.section] || SECTIONS.news;

  var state = { items:[], kind:SEC.kind, topic:'all', q:'', provisional:false, built:'' };

  var $feed   = document.getElementById('feed');
  var $chips  = document.getElementById('chips');
  var $count  = document.getElementById('count');
  var $status = document.getElementById('status');
  var $built  = document.getElementById('built');

  /* ---------- helpers ---------- */
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function relTime(iso){
    if(!/^\d{4}-\d{2}-\d{2}/.test(iso||'')) return '';
    var d = new Date(iso.length>10 ? iso : iso+'T09:00:00Z');
    if(isNaN(d)) return '';
    var mins = Math.round((Date.now()-d.getTime())/60000);
    if(mins < 1)    return 'just now';
    if(mins < 60)   return mins+'m ago';
    if(mins < 1440) return Math.round(mins/60)+'h ago';
    if(mins < 10080)return Math.round(mins/1440)+'d ago';
    return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  }

  function detectRepo(){
    if(CONFIG.owner && CONFIG.repo) return CONFIG;
    var host = location.hostname;                     // alec.github.io
    var seg  = location.pathname.split('/').filter(Boolean);
    if(!/\.github\.io$/i.test(host)) return null;     // custom domain: fill CONFIG in by hand
    var owner = host.replace(/\.github\.io$/i,'');
    var repo  = seg.length ? seg[0] : host;           // project site vs user site
    return { owner:owner, repo:repo, branch:CONFIG.branch };
  }

  function titleCase(slug){
    var small = {a:1,an:1,and:1,the:1,of:1,to:1,in:1,on:1,vs:1,for:1,at:1,by:1};
    return slug.split('-').filter(Boolean).map(function(w,i){
      return (i>0 && small[w]) ? w : w.charAt(0).toUpperCase()+w.slice(1);
    }).join(' ');
  }

  /* ---------- load ---------- */
  function loadFeed(){
    return fetch('feed.json?t='+Date.now(), {cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error('no feed'); return r.json(); })
      .then(function(j){
        state.items = j.items || [];
        state.built = j.built || '';
        return true;
      });
  }

  // Fallback: read the folder listings straight from the GitHub API.
  function loadFallback(){
    var cfg = detectRepo();
    if(!cfg) return Promise.reject(new Error('cannot detect repo'));
    var base = 'https://api.github.com/repos/'+cfg.owner+'/'+cfg.repo+'/contents/';
    // Puzzles also live in /reports (filenames carry the type), so the fallback
    // reads every folder and lets the kind filter below do the sorting.
    return Promise.all(['reports','puzzles','games'].map(function(dir){
      return fetch(base+dir+'?ref='+cfg.branch)
        .then(function(r){ return r.ok ? r.json() : []; })
        .then(function(list){
          return (Array.isArray(list)?list:[])
            .filter(function(f){ return f.type==='file' && /\.html?$/i.test(f.name); })
            .map(function(f){
              var m = f.name.replace(/\.html?$/i,'').match(/^(\d{4}-\d{2}-\d{2})-([a-z0-9]+)-(.+)$/i);
              return {
                path: dir+'/'+f.name,
                kind: dir==='games' ? 'game'
                    : (dir==='puzzles' || /-(logic|crossword|word)-/i.test(f.name)) ? 'puzzle' : 'report',
                topic: m ? titleCase(m[2]) : (dir==='puzzles'?'Puzzle':'Data'),
                headline: m ? titleCase(m[3]) : titleCase(f.name.replace(/\.html?$/i,'')),
                standfirst: '',
                date: m ? m[1] : '',
                read:'', thumb:''
              };
            });
        })
        .catch(function(){ return []; });
    })).then(function(groups){
      state.items = groups[0].concat(groups[1], groups[2]).sort(function(a,b){
        return (b.date||'').localeCompare(a.date||'') || a.path.localeCompare(b.path);
      });
      state.provisional = true;
      return true;
    });
  }

  /* ---------- render ---------- */
  function topics(){
    var seen = {}, out = [];
    state.items.forEach(function(it){
      if(it.kind!==state.kind) return;
      var t = it.topic||'';
      if(t && !seen[t]){ seen[t]=1; out.push(t); }
    });
    return out.sort();
  }

  function renderChips(){
    var list = topics();
    if(state.topic!=='all' && list.indexOf(state.topic)===-1) state.topic='all';
    var html = ['<button class="chip" data-topic="all" aria-pressed="'+(state.topic==='all')+'">All topics</button>'];
    list.forEach(function(t){
      html.push('<button class="chip" data-topic="'+esc(t)+'" aria-pressed="'+(state.topic===t)+'">'+esc(t)+'</button>');
    });
    $chips.innerHTML = html.join('');
    $chips.hidden = list.length < 2;   // a lone chip filters nothing
  }

  function visible(){
    var q = state.q.trim().toLowerCase();
    return state.items.filter(function(it){
      if(it.kind!==state.kind) return false;
      if(state.topic!=='all' && it.topic!==state.topic) return false;
      if(q && (it.headline+' '+it.standfirst+' '+it.topic).toLowerCase().indexOf(q)===-1) return false;
      return true;
    });
  }

  // The figure sizes the tile by its own length — the unit is set separately and
  // must not count, or "93%" would shrink to fit a character it doesn't own.
  function statTile(it){
    var n = Math.min(String(it.stat).length, 6);
    var lab = it.statLabel || '';
    return '<div class="thumb stat'+(lab?' haslabel':'')+'" data-len="'+n+'" aria-hidden="true">'
         +   '<span class="fig">'+esc(it.stat)
         +     (it.statUnit ? '<span class="unit">'+esc(it.statUnit)+'</span>' : '')
         +   '</span>'
         +   (lab ? '<span class="lab">'+esc(lab)+'</span>' : '')
         + '</div>';
  }

  // mask is 25 chars (5x5 Mini/Doku) or 36 chars (6x6 Sweep/Path) from feed.json:
  // # block, L pre-locked, o the free opening (Sweep), . to fill. The marigold
  // marks where play starts — the free opening if the type has one, otherwise
  // the first fillable cell — so the tile is a still of the game rather than a
  // picture of one. Sweep tiles were all identical until 'o' was carried through.
  function puzzleTile(mask){
    // 16 = Link's 4x4 of chips; 25 = 5x5 Mini/Doku; 36 = 6x6 Sweep/Path.
    var n = mask.length===36 ? 36 : mask.length===16 ? 16 : 25;
    var shape = n===36 ? ' six' : n===16 ? ' four' : '';
    var op = mask.indexOf('o');
    // Link has no start square — every chip is equally live — so no marigold cell.
    var act = n===16 ? -1 : (op >= 0 ? op : mask.indexOf('.')), cells = '';
    for(var i=0;i<n;i++){
      var cls = mask[i]==='#' ? 'b' : mask[i]==='L' ? 'l' : (i===act ? 'a' : '');
      cells += cls ? '<i class="'+cls+'"></i>' : '<i></i>';
    }
    return '<div class="thumb puzzle" aria-hidden="true"><div class="pgrid'+shape+'">'+cells+'</div></div>';
  }

  function card(it){
    var when = relTime(it.date);
    var thumb;
    if(it.thumb){
      thumb = '<img class="thumb" src="'+esc(it.thumb)+'" alt="" loading="lazy">';
    } else if(it.kind==='puzzle' && typeof it.mask==='string' && (it.mask.length===16 || it.mask.length===25 || it.mask.length===36)){
      thumb = puzzleTile(it.mask);
    } else if(it.stat){
      thumb = statTile(it);
    } else {
      thumb = '<div class="thumb glyph" aria-hidden="true">'+(it.kind==='report'?'Chart':'Play')+'</div>';
    }
    return '<li><a class="card" href="'+esc(it.path)+'">'
      + thumb
      + '<div>'
      +   '<h2 class="hl">'+esc(it.headline)+'</h2>'
      +   (it.standfirst ? '<p class="sf">'+esc(it.standfirst)+'</p>' : '')
      +   '<p class="meta"><span class="t">'+esc(it.topic)+'</span>'
      +     (when ? '<span class="dot">·</span><span>'+esc(when)+'</span>' : '')
      +     (it.read ? '<span class="dot">·</span><span>'+esc(it.read)+'</span>' : '')
      +   '</p>'
      + '</div></a></li>';
  }

  function render(){
    renderChips();
    var v = visible();
    $feed.innerHTML = v.length
      ? v.map(card).join('')
      : '<li class="empty">'+esc(state.items.some(function(it){ return it.kind===state.kind; })
          ? 'Nothing matches that filter yet.' : SEC.empty)+'</li>';
    $count.textContent = v.length
      ? v.length + ' ' + SEC.noun[v.length===1?0:1] + (state.q?' matching':'')
      : '';
    $built.textContent = state.built
      ? 'Index rebuilt ' + new Date(state.built).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})
      : '';
  }

  /* ---------- events ---------- */
  $chips.addEventListener('click', function(e){
    var b = e.target.closest('.chip'); if(!b) return;
    state.topic = b.dataset.topic;
    render();
  });

  // search toggle: the icon opens the field and focuses it; it closes on a
  // second tap or Escape, clearing any query so the list isn't left filtered
  // by text the reader can no longer see.
  var $q = document.getElementById('q'), $sbtn = document.getElementById('sbtn'),
      $srow = document.getElementById('searchrow');
  function setSearch(open){
    $srow.hidden = !open;
    $sbtn.setAttribute('aria-expanded', String(open));
    if(open){ $q.focus(); }
    else if($q.value){ $q.value=''; state.q=''; render(); }
  }
  $sbtn.addEventListener('click', function(){ setSearch($srow.hidden); });
  $q.addEventListener('keydown', function(e){
    if(e.key==='Escape'){ setSearch(false); $sbtn.focus(); }
  });

  var t;
  $q.addEventListener('input', function(e){
    clearTimeout(t); var val = e.target.value;
    t = setTimeout(function(){ state.q = val; render(); }, 120);
  });

  /* ---------- boot ---------- */
  loadFeed()
    .catch(function(){ return loadFallback(); })
    .then(function(){
      if(state.provisional){
        $status.innerHTML = '<div class="note"><b>Provisional listing.</b> feed.json hasn\'t been '
          + 'built yet, so headlines here are derived from filenames. They will sharpen as soon as '
          + 'the Build feed action has run once.</div>';
      }
      render();
    })
    .catch(function(err){
      $feed.innerHTML = '';
      $status.innerHTML = '<div class="note"><b>Couldn\'t load the index.</b> '
        + 'If this is a custom domain, set <code>CONFIG.owner</code> and <code>CONFIG.repo</code> '
        + 'at the top of the script in index.html. ('+esc(err.message)+')</div>';
    });

})();
