# Digi site: sections, reader tracking and admin (set up 26 Sep 2026)

Reference for any session that builds or publishes to the digi-news repo. Where this conflicts with older notes on the front page or dn:kind, this is current.

## Three sections
- `index.html` = Digi News (kind `report`, blue #1C46C2), `puzzles.html` = Digi Puzzles (kind `puzzle`, green #0E7A4B), `games.html` = Digi Games (kind `game`, purple #6A2BC9).
- Shared layout lives in `front.css` and `front.js` at the repo root; each page only sets `data-section` on `<html>`.
- A file's section comes from its `dn:kind` meta, not its folder. Everything (reports, puzzles, games) still lives in `reports/`.
- `dn:kind` now accepts `report | puzzle | game`. Game topics: `Arcade`, `Strategy`, `Quiz`.

## Reader tracking
- `dn-track.js` (repo root) records anonymous events into the `digi` Supabase project (London, eu-west-2) via one write-only function `public.log_events`.
- The nightly/push workflow `build-feed.yml` runs `tools/inject-tracker.js` first, which adds `<script src="../dn-track.js" defer></script>` before `</body>` of every file in `reports/` that lacks it. Do NOT add it by hand; do NOT remove it from live files.
- Rubric exception agreed by Alec: the tracker line is the one permitted non-self-contained dependency. It is optional at runtime. If dn-lint flags it on a rebuilt shipped piece, strip the line before the gates; the workflow re-adds it on upload.
- Automatic: page_view, page_exit (time on page, depth), card_click, read_depth, exhibit_view (figure.exhibit), source_click, puzzle_start / puzzle_end (all puzzle types, detected from the #winModal / #modal result box and #winTitle).
- Games must call the tracker themselves: `window.digi&&digi.track('game_start',{game:'<slug>',...})` when a round starts and `digi.track('game_end',{game:'<slug>',win:true|false,...})` when it ends. Lighthouse Keeper already does.
- Opt-out: footer "Don't record my visits" switch and `privacy.html`; GPC / Do Not Track respected.

## Admin
- `admin.html` (linked in front-page footers): email magic-link sign-in; data only for emails in `insights.admins` (the two admin addresses; not listed here because this repo is public).
- Figures come from `public.admin_dashboard(p_from, p_to)`; reporting views live in the private `insights` schema. `insights.excluded_readers` removes Alec's own test browsers from all figures.
- Retention: raw events 13 months, then rolled into `public.daily_stats` by the nightly `digi-roll-up-old-events` cron job.
- Plan doc: "Digi reader data plan" (Claude Docs).
