#!/usr/bin/env node
/* Digi — add the reader-activity script to every piece.
   Run by .github/workflows/build-feed.yml before the feed is built, so every
   file uploaded to /reports, /puzzles or /games gets one line:

     <script src="../dn-track.js" defer></script>

   inserted just before its last </body> (or at the end if it has none).
   Idempotent: a file that already mentions dn-track.js is left alone, so
   running it again changes nothing. The line is optional at runtime — if the
   script can't load, the piece works exactly as before.

   Set DN_TRACK_DRY=1 to list what would change without writing.
*/
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIRS = ['reports', 'puzzles', 'games'];
const TAG = '<script src="../dn-track.js" defer></script>';
const DRY = process.env.DN_TRACK_DRY === '1';

let changed = 0, already = 0, scanned = 0;
for (const dir of DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of fs.readdirSync(abs)) {
    if (!/\.html?$/i.test(file)) continue;
    scanned++;
    const p = path.join(abs, file);
    const html = fs.readFileSync(p, 'utf8');
    if (html.includes('dn-track.js')) { already++; continue; }
    const i = html.toLowerCase().lastIndexOf('</body>');
    const out = i >= 0
      ? html.slice(0, i) + TAG + '\n' + html.slice(i)
      : html.replace(/\s*$/, '\n' + TAG + '\n');
    if (!DRY) fs.writeFileSync(p, out);
    changed++;
    if (DRY && changed <= 5) console.log('  would add to ' + dir + '/' + file);
  }
}
console.log(`dn-track: ${scanned} scanned, ${changed} ${DRY ? 'would be ' : ''}updated, ${already} already had it`);
