#!/usr/bin/env python3
"""
DIGI NEWS — dn-build.py
Assembles a finished single-file piece from the house template plus authored parts.

WHY THIS EXISTS
  Before this script every build re-discovered the template's splice seams by
  grepping for marker strings and viewing the surrounding lines, then hand-wrote
  a one-off assembler. The seams are constant per template version, so that work
  was pure repetition — and the hand-written assemblers drifted (one restored a
  scrubbed token on rebuild; another forgot the .wrap container).

  This script also OWNS every date-derived string in the chrome: the masthead
  kicker, the <title>, the footer "Figures to" line, the version line and the
  output filename all come from meta.json. A redate is therefore a one-field
  edit plus a rebuild, not five hand edits across the file.

USAGE
  python3 dn-build.py --piece ./piece [--template tpl.html] [--outdir .]
  python3 dn-build.py --piece ./piece --seams-only     # print seams and exit

PIECE DIRECTORY
  meta.json    required. See REQUIRED_META below.
  body.html    required. From <div class="head"> to the end of the last
               <section>. NOT the masthead and NOT the footer — both generated.
  footer.html  required. The Method div and the Sources div only. The
               Corrections line and the Figures-to/version line are generated.
  init.js      required. Chart init body. No <script> wrapper — added here.

EXIT CODES
  0 built clean · 1 authoring error (tokens, missing field) · 2 bad seams
"""
import argparse, io, json, os, re, sys

REQUIRED_META = ["headline", "standfirst", "topic", "date", "kind", "read", "slug", "version"]
OPTIONAL_META = {"statlabel": "", "subarea": "", "kicker": "ANALYSIS", "built": ""}
TOPICS = ["UK politics", "Economy", "Immigration", "AI", "Science", "Medicine", "Society", "World"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Placeholder sentinels that must never survive into a built piece.
TOKENS = [r"\[TK\]", r"\bREPLACE\b", r"\[DD Mon YYYY\]", r"\[slug\]",
          r"SAMPLE DATA", r"House Template", r"Lorem ipsum"]


def die(msg, code=1):
    sys.stderr.write("dn-build: " + msg + "\n")
    sys.exit(code)


def esc_attr(s):
    return (str(s).replace("&", "&amp;").replace('"', "&quot;")
            .replace("<", "&lt;").replace(">", "&gt;"))


def find_seams(L):
    """Locate the template seams by content, then assert them. Content-based
    lookup survives minor template edits; the assertions catch a real break."""
    def only(pred, what):
        hits = [i + 1 for i, l in enumerate(L) if pred(l)]
        if not hits:
            die("seam not found: " + what, 2)
        return hits

    s = {}
    s["fonts"] = only(lambda l: l.startswith('<link rel="preconnect" href="https://fonts.googleapis.com"'), "font preconnect")[0]
    s["head_close"] = only(lambda l: l.strip() == "</head>", "</head>")[0]
    s["body_open"] = only(lambda l: l.strip() == "<body>", "<body>")[0]
    s["wrap_open"] = only(lambda l: l.strip() == '<div class="wrap">', '<div class="wrap">')[0]
    scripts = only(lambda l: l.strip() == "<script>", "<script>")
    closes = only(lambda l: l.strip() == "</script>", "</script>")
    if len(scripts) < 2 or len(closes) < 2:
        die("expected two <script> blocks (DN library + demo init)", 2)
    s["lib_open"], s["init_open"] = scripts[0], scripts[1]
    s["lib_close"], s["init_close"] = closes[0], closes[1]
    s["wrap_close"] = s["lib_open"] - 2          # the </div> closing .wrap
    s["body_close"] = only(lambda l: l.strip() == "</body>", "</body>")[0]

    # --- assertions: a broken seam must stop the build, not corrupt the file ---
    assert L[0].startswith("<!DOCTYPE html>"), "line 1 is not the doctype"
    assert L[s["wrap_close"] - 1].strip() == "</div>", \
        "line %d should close .wrap, found: %r" % (s["wrap_close"], L[s["wrap_close"] - 1])
    assert s["body_open"] < s["wrap_open"] < s["lib_open"] < s["lib_close"] \
        < s["init_open"] < s["init_close"] < s["body_close"], "seams out of order"
    assert "DN — Digi News visualization library" in "\n".join(L[s["lib_open"]:s["lib_open"] + 4]), \
        "the first <script> is not the DN library"
    return s


def build(args):
    tpl_path = args.template
    L = io.open(tpl_path, encoding="utf-8").read().split("\n")
    s = find_seams(L)

    if args.seams_only:
        for k in sorted(s, key=lambda k: s[k]):
            print("%-12s %d" % (k, s[k]))
        return 0

    P = args.piece
    meta = json.load(io.open(os.path.join(P, "meta.json"), encoding="utf-8"))
    for k, v in OPTIONAL_META.items():
        meta.setdefault(k, v)
    missing = [k for k in REQUIRED_META if not str(meta.get(k, "")).strip()]
    if missing:
        die("meta.json missing required field(s): " + ", ".join(missing))

    if not re.match(r"^\d{4}-\d{2}-\d{2}$", meta["date"]):
        die('meta.date "%s" is not YYYY-MM-DD' % meta["date"])
    # `date` is PUBLICATION (filename, kicker, dn:date).
    # `built` is DATA CURRENCY (the footer "Figures to" line). Defaults to date.
    if not meta["built"]:
        meta["built"] = meta["date"]
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", meta["built"]):
        die('meta.built "%s" is not YYYY-MM-DD' % meta["built"])
    if meta["built"] > meta["date"]:
        die('meta.built (%s) is later than meta.date (%s). A piece cannot carry '
            'figures more current than the day it was written.' % (meta["built"], meta["date"]))
    if meta["kind"] not in ("report", "puzzle", "game"):
        die('meta.kind must be "report", "puzzle" or "game"')
    if meta["kind"] == "report" and meta["topic"] not in TOPICS:
        die('meta.topic "%s" is not in the controlled vocabulary: %s'
            % (meta["topic"], " | ".join(TOPICS)))
    if not re.match(r"^v\d+\.\d+$", meta["version"]):
        die('meta.version "%s" is not the canonical v<major>.<minor>' % meta["version"])
    if meta["statlabel"] and (len(meta["statlabel"]) > 14 or meta["statlabel"] != meta["statlabel"].lower()):
        die('meta.statlabel "%s" must be <=14 chars and lower case' % meta["statlabel"])

    y, mo, d = (int(x) for x in meta["date"].split("-"))
    human = "%d %s %d" % (d, MONTHS[mo - 1], y)          # 30 Jul 2026
    by, bmo, bd = (int(x) for x in meta["built"].split("-"))
    built_human = "%d %s %d" % (bd, MONTHS[bmo - 1], by)  # the "Figures to" date
    kicker = "%s<br>%d %s %d" % (meta["kicker"].upper(), d, MONTHS[mo - 1].upper(), y)

    def part(name):
        p = os.path.join(P, name)
        if not os.path.exists(p):
            die("missing piece part: " + p)
        return io.open(p, encoding="utf-8").read().rstrip("\n")

    body, footer_inner, init = part("body.html"), part("footer.html"), part("init.js")

    # ---- head: doctype/charset/viewport, generated meta, then fonts..</head> ----
    head_open = L[0:s["fonts"] - 1]
    head_open = [l for l in head_open if not l.lstrip().startswith("<!--")] or head_open[:6]
    head_open = L[0:6]                                  # doctype through viewport, verbatim

    meta_block = [
        '<!-- ==== DN FEED META (the site front page reads these) ==== -->',
        '<meta name="dn:headline"   content="%s">' % esc_attr(meta["headline"]),
        '<meta name="dn:standfirst" content="%s">' % esc_attr(meta["standfirst"]),
        '<meta name="dn:topic"      content="%s">' % esc_attr(meta["topic"]),
        '<meta name="dn:date"       content="%s">' % meta["date"],
        '<meta name="dn:kind"       content="%s">' % meta["kind"],
        '<meta name="dn:read"       content="%s">' % esc_attr(meta["read"]),
    ]
    if meta["statlabel"]:
        meta_block.append('<meta name="dn:statlabel"  content="%s">' % esc_attr(meta["statlabel"]))
    meta_block.append("")

    head_tail = L[s["fonts"] - 1:s["head_close"]]
    head_tail = [re.sub(r"<title>.*?</title>",
                        "<title>%s — Digi News</title>" % esc_attr(meta["headline"]), l)
                 for l in head_tail]
    if not any("<title>" in l for l in head_tail):
        head_tail.insert(0, "<title>%s — Digi News</title>" % esc_attr(meta["headline"]))

    masthead = [
        '  <header class="mast">',
        '    <div class="mono">DN</div>',
        '    <div class="word">Digi<b>News</b></div>',
        '    <div class="kick">%s</div>' % kicker,
        '  </header>',
        '',
    ]

    foot = [
        '  <div class="foot">',
        footer_inner,
        '    <div class="fm"><b>Corrections.</b> None. Material corrections will be logged here with date.</div>',
        '    <div><b>Figures to %s.</b> <span class="ver">Digi News &middot; %s &middot; %s.</span></div>'
        % (built_human, meta["version"], meta["slug"]),
        '  </div>',
    ]

    dn_library = L[s["lib_open"] - 1:s["lib_close"]]     # verbatim, never touched

    out = (head_open + meta_block + head_tail
           + ["<body>", '<div class="wrap">', ""]
           + masthead + [body, ""] + foot
           + ["", "</div>", ""]
           + dn_library
           + ["", "<script>", "(function(){", init, "})();", "</script>", ""]
           + ["</body>", "</html>", ""])
    text = "\n".join(out)

    # ---- token sweep: nothing placeholder may survive, comments included ----
    bad = []
    for pat in TOKENS:
        for m in re.finditer(pat, text):
            ln = text[:m.start()].count("\n") + 1
            bad.append("line %d: %s" % (ln, m.group(0)))
    if bad:
        die("placeholder tokens survived assembly:\n  " + "\n  ".join(bad[:20]))

    name = "%s-%s.html" % (meta["date"], meta["slug"])
    dest = os.path.join(args.outdir, name)
    io.open(dest, "w", encoding="utf-8").write(text)
    print("built %s  (%d lines, %d bytes)" % (dest, text.count("\n") + 1, len(text.encode("utf-8"))))
    print("next:  node dn-preflight.js %s/init.js" % P)
    print("       node dn-lint.js %s --width 360 --date %s" % (name, meta["date"]))
    print("       node dn-probe.js %s" % name)
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--piece", default="./piece")
    ap.add_argument("--template", default="./digi-news-house-template-v3-3-3.html")
    ap.add_argument("--outdir", default=".")
    ap.add_argument("--seams-only", action="store_true")
    sys.exit(build(ap.parse_args()))
