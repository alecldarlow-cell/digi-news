#!/usr/bin/env node
/* Digi Puzzles — completed puzzles reopen completed.

   Borders already remembers a finished puzzle (digi-borders-v1 → done[id]).
   This brings the other five types into line: when a puzzle ends, its
   result is written to localStorage under one key per type, and when the
   same puzzle is opened again the board is redrawn in its finished state
   (no modal, no confetti, no second puzzle_end event — the result box never
   gains "on", which is what dn-track.js listens for).

     type          key              record
     Mini          digi-mini-v1     done[id] = {s, d}
     Doku          digi-doku-v1     done[id] = {s, d}
     Sweep         digi-sweep-v1    done[id] = {o: win|loss|gave, s, b?, d}
     Path          digi-path-v1     done[id] = {t, d}
     Link          digi-link-v1     done[id] = {o: win|loss, t, m, r, g, d}

   The first result for an id is kept; Reset / Play again still gives a fresh
   board, and a replay never overwrites the record.

   Patching rule (house guard): every edit is a literal find/replace whose
   anchor must occur exactly once, or the file is refused and left untouched.
   Idempotent: a file already carrying the marker is skipped.

   Usage:  node tools/add-done-state.js            patch reports/ in place
           node tools/add-done-state.js --check    exit 1 if any puzzle lacks it
           node tools/add-done-state.js --dry      report only
           node tools/add-done-state.js file.html  patch named files only
*/
const fs = require('fs');
const path = require('path');

const MARK = 'digi-done-v1';

/* Three July prototype Doku shells predate the shared shell and have none of
   its anchors. They are archive-only; leave them as they are. */
const LEGACY = new Set([
  '2026-07-13-logic-doku-0001.html',
  '2026-07-14-logic-doku-0002.html',
  '2026-07-16-logic-doku-0003.html',
]);

const helpers = key => `/* ---- ${MARK}: a finished puzzle reopens finished (${key} → done[id]) ---- */
const DONE_KEY="${key}";
function doneGet(id){try{const s=JSON.parse(localStorage.getItem(DONE_KEY)||"null");return (s&&s.v===1&&s.done&&s.done[id])||null;}catch(e){return null;}}
function donePut(id,rec){try{let s=JSON.parse(localStorage.getItem(DONE_KEY)||"null");if(!s||s.v!==1||!s.done||typeof s.done!=="object")s={v:1,done:{}};if(s.done[id])return;rec.d=new Date().toISOString().slice(0,10);s.done[id]=rec;localStorage.setItem(DONE_KEY,JSON.stringify(s));}catch(e){}}
let doneTried=false;`;

const secs = 'Math.max(0,Math.min(359999,Math.floor(+rec.s)||0))';
const mmss = v => `(/^\\d{1,4}:\\d{2}$/.test(String(${v}))?String(${v}):null)`;

const TYPES = {
  /* ------------------------------------------------------------------ Mini */
  mini: {
    match: /-crossword-mini-\d+\.html$/,
    key: 'digi-mini-v1',
    edits: key => [
      ['  solved=true; stopTimer();\n',
       '  solved=true; stopTimer();\n  if(P.id===SAMPLE.id)donePut(P.id,{s:seconds});\n'],
      ['\nload(SAMPLE);\n',
       `\n${helpers(key)}
function restoreDone(){
  if(doneTried)return; doneTried=true;
  if(!P||P.id!==SAMPLE.id)return;
  const rec=doneGet(P.id); if(!rec)return;
  for(const [r,c] of allCells()){entries[r][c]=P.grid[r][c];checked[r][c]="good";}
  solved=true; stopTimer(); seconds=${secs}; renderTime();
  paint();
  $("#msg").innerHTML=\`Solved in <b>\${$("#timer").textContent}</b>. Nice.\`;
  document.body.classList.add("win");
}
load(SAMPLE);
restoreDone();
`],
    ],
  },
  /* ------------------------------------------------------------------ Doku */
  doku: {
    match: /-logic-doku-\d+\.html$/,
    key: 'digi-doku-v1',
    edits: key => [
      ['  solved=true;stopTimer();\n',
       '  solved=true;stopTimer();\n  if(P.id===SAMPLE.id)donePut(P.id,{s:seconds});\n'],
      ['\nload(SAMPLE);\n',
       `\n${helpers(key)}
function restoreDone(){
  if(doneTried)return; doneTried=true;
  if(!P||P.id!==SAMPLE.id)return;
  const rec=doneGet(P.id); if(!rec)return;
  for(const t of tiles)t.at=null;
  for(const [r,c] of fillables(P.grid))if(!isLock(r,c))entries[r][c]="";
  for(const [r,c] of fillables(P.grid)){
    if(isLock(r,c))continue;
    const t=tiles.find(t=>!t.at&&t.ch===P.grid[r][c]);
    if(!t)return load(curSrc);            // bank can't rebuild it: leave a fresh board
    t.at=[r,c]; entries[r][c]=t.id;
  }
  selTile=null; solved=true; stopTimer(); seconds=${secs}; renderTime();
  paint();
  $$("#grid .cell").forEach(cell=>{const r=+cell.dataset.r,c=+cell.dataset.c;if(P.grid[r][c]!=="#")cell.classList.add("good");});
  $("#msg").innerHTML=\`Solved in <b>\${$("#timer").textContent}</b>. Nice.\`;
  document.body.classList.add("win");
}
load(SAMPLE);
restoreDone();
`],
    ],
  },
  /* ----------------------------------------------------------------- Sweep */
  sweep: {
    match: /-logic-sweep\.html$/,
    key: 'digi-sweep-v1',
    edits: key => [
      ['over=true; won=true; stopTimer();',
       'over=true; won=true; stopTimer(); donePut(P.id,{o:"win",s:seconds});'],
      ['over=true; won=false; boomed.add(i); stopTimer();',
       'over=true; won=false; boomed.add(i); stopTimer(); donePut(P.id,{o:"loss",s:seconds,b:i});'],
      ['startTimer(); over=true; stopTimer();',
       'startTimer(); over=true; stopTimer(); donePut(P.id,{o:"gave",s:seconds});'],
      ['  if(!ranked)$("#msg").textContent="Today\'s result is already in — this is a replay, and nothing is recorded.";\n}',
       '  if(!ranked)$("#msg").textContent="Today\'s result is already in — this is a replay, and nothing is recorded.";\n  restoreDone();\n}'],
      ['\nload(SAMPLE);\n',
       `\n${helpers(key)}
function restoreDone(){
  if(doneTried)return; doneTried=true;
  if(!P||P.id!==SAMPLE.id)return;
  const rec=doneGet(P.id); if(!rec||!/^(win|loss|gave)$/.test(rec.o))return;
  if(rec.o==="loss"&&!MS.has(rec.b))return;
  startDug=true; over=true; won=rec.o==="win"; stopTimer(); seconds=${secs}; renderTime();
  revealed=new Set(); flagged=new Set(); boomed=new Set();
  for(let k=0;k<CELLS;k++){
    if(!MS.has(k))revealed.add(k);
    else if(rec.o==="loss"&&k===rec.b)boomed.add(k);
    else flagged.add(k);
  }
  if(!won)flagCheck=false;
  paint();
  if(won){$("#msg").innerHTML=\`Swept in <b>\${$("#timer").textContent}</b>.\`;document.body.classList.add("win");}
  else if(rec.o==="loss")$("#msg").innerHTML="That was a mine. The grid never needed a guess — the step was there.";
  else $("#msg").innerHTML="Revealed.";
}
load(SAMPLE);
`],
    ],
  },
  /* ------------------------------------------------------------------ Path */
  path: {
    match: /-logic-path-\d+\.html$/,
    key: 'digi-path-v1',
    edits: key => [
      ['  state.solved=true;\n  clearInterval(state.timerHandle);\n',
       '  state.solved=true;\n  clearInterval(state.timerHandle);\n  donePut(PUZZLE.id,{t:timerEl.textContent});\n'],
      ['\nbuildGrid();\n})();',
       `\n${helpers(key)}
function restoreDone(){
  if(doneTried)return; doneTried=true;
  const rec=doneGet(PUZZLE.id); if(!rec)return;
  const t=${mmss('rec.t')}||"0:00";
  state.cellValue=PUZZLE.solution.map(row=>row.slice());
  state.solved=true; state.history=[];
  clearInterval(state.timerHandle);
  timerEl.textContent=t; document.getElementById("statTime").textContent=t;
  paint();
  setMsg("Thread complete in "+t+".");
}
buildGrid();
restoreDone();
})();`],
    ],
  },
  /* ------------------------------------------------------------------ Link */
  link: {
    match: /-word-link-\d+\.html$/,
    key: 'digi-link-v1',
    edits: key => [
      ['async function finish(win){\n',
       'async function finish(win){\n  donePut(P.id,{o:win?"win":"loss",t:$("#timer").textContent,m:mistakes,r:solved.map(g=>g.rank),g:guesses});\n'],
      ['  refreshStreakUI(s);\n}\nasync function refreshStreakUI',
       '  refreshStreakUI(s);\n  restoreDone();\n}\nasync function refreshStreakUI'],
      ['\nstart();\ninitRanked();\n',
       `\n${helpers(key)}
function restoreDone(){
  if(doneTried)return; doneTried=true;
  const rec=doneGet(P.id); if(!rec||!/^(win|loss)$/.test(rec.o)||!Array.isArray(rec.r))return;
  const order=rec.r.map(k=>P.groups.find(g=>g.rank===k));
  if(order.length!==P.groups.length||order.some(g=>!g)||new Set(order).size!==order.length)return;
  const t=${mmss('rec.t')}||"00:00";
  solved=order; live=[]; sel.clear(); busy=false; newBand=null;
  mistakes=Math.max(0,Math.min(MAX_MISTAKES,Math.floor(+rec.m)||0));
  guesses=Array.isArray(rec.g)?rec.g.filter(x=>Array.isArray(x)&&x.every(v=>GLYPH[v])):[];
  over=true; won=rec.o==="win";
  clearInterval(tick); $("#timer").textContent=t;
  render();
  if(won)setMsg("Linked in "+t+(mistakes?" · "+mistakes+" mistake"+(mistakes>1?"s":""):" · perfect"));
  else setMsg("Out of mistakes — here's the rest");
}
start();
initRanked();
`],
    ],
  },
};

function typeOf(file) {
  for (const [name, t] of Object.entries(TYPES)) if (t.match.test(file)) return name;
  return null;
}

/* Apply every edit or none. Returns {ok, out, why}. */
function patch(html, typeName) {
  if (html.includes(MARK)) return { ok: true, out: html, skipped: true };
  const t = TYPES[typeName];
  let out = html;
  for (const [find, repl] of t.edits(t.key)) {
    const n = out.split(find).length - 1;
    if (n !== 1) return { ok: false, why: `anchor found ${n}× (need 1): ${JSON.stringify(find.slice(0, 60))}` };
    const before = out;
    out = out.replace(find, () => repl);
    if (out === before) return { ok: false, why: 'edit was a no-op' };
  }
  return { ok: true, out };
}

module.exports = { TYPES, MARK, LEGACY, typeOf, patch };

if (require.main === module) {
  const args = process.argv.slice(2);
  const CHECK = args.includes('--check'), DRY = args.includes('--dry');
  const named = args.filter(a => !a.startsWith('--'));
  const dir = path.join(process.cwd(), 'reports');
  const files = named.length ? named : fs.readdirSync(dir).map(f => path.join(dir, f));
  const tally = {}; const refused = [];
  for (const p of files) {
    const type = typeOf(path.basename(p));
    if (!type || LEGACY.has(path.basename(p))) continue;
    const html = fs.readFileSync(p, 'utf8');
    const r = patch(html, type);
    const k = tally[type] || (tally[type] = { patched: 0, already: 0, refused: 0 });
    if (!r.ok) { k.refused++; refused.push(path.basename(p) + ' — ' + r.why); continue; }
    if (r.skipped) { k.already++; continue; }
    k.patched++;
    if (!DRY && !CHECK) fs.writeFileSync(p, r.out);
  }
  for (const [t, k] of Object.entries(tally))
    console.log(`${t.padEnd(6)} ${CHECK ? 'missing' : DRY ? 'would patch' : 'patched'} ${k.patched}, already ${k.already}, refused ${k.refused}`);
  refused.slice(0, 40).forEach(x => console.log('  refused: ' + x));
  if (refused.length > 40) console.log(`  … ${refused.length - 40} more`);
  const missing = Object.values(tally).reduce((a, k) => a + k.patched + k.refused, 0);
  if (CHECK && missing) process.exit(1);
  if (refused.length && !CHECK) process.exit(2);
}
