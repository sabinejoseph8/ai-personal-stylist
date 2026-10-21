#!/usr/bin/env python3
"""Build the AI Personal Stylist Memory site from the plan files in docs/.

    python3 tools/memory-site/build.py           # dist/memory-site.html, the page to publish
    python3 tools/memory-site/build.py --test    # also dist/test.html, for a local check

The page holds no plan ticks. Ticks live in the artifact's db collection
"tasks", one document per task id (p0a-01 and so on), so Claude can check
tasks off without republishing. Only the Python standard library is used.
"""
import html
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DOCS = ROOT / "docs"
DIST = HERE / "dist"

TABS = [
    # key, file, long label, short label
    ("product", "product-spec.md", "Product Spec", "Product"),
    ("design", "design.md", "Design Spec", "Design"),
    ("tech", "tech-spec.md", "Tech Spec", "Tech"),
    ("plan", "progress.md", "Plan", "Plan"),
]
FILE_TAB = {f: k for k, f, _, _ in TABS}
OWNER = "Sabine"
DIAGRAM_FONT = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
LIMITS = {"R": 72, "S": 20}

# ---------------------------------------------------------------- parsing

LIST_RE = re.compile(r"^(\s*)([-*]|\d+\.)\s+(.*)$")
META_RE = re.compile(r"^\*\*([^*]+?):\*\*\s*(.*)$")
SEP_RE = re.compile(r"^:?-{3,}:?$")
LABEL_RE = re.compile(r"^\*\*([^*]+?)\*\*:?\s*(.*)$")
BOLD_ONLY_RE = re.compile(r"^\*\*[^*]+\*\*$")


def split_row(line):
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def parse_list(lines, i):
    root = []
    path = []  # (indent, item) from the top level down to the latest item
    blank = False
    n = len(lines)
    while i < n:
        line = lines[i]
        if not line.strip():
            j = i + 1
            while j < n and not lines[j].strip():
                j += 1
            if j < n and lines[j].startswith("  ") and path:
                blank = True
                i = j
                continue
            break
        m = LIST_RE.match(line)
        if m:
            indent = len(m.group(1))
            text = m.group(3)
            checked = None
            cm = re.match(r"^\[( |x|X)\]\s+(.*)$", text)
            if cm:
                checked = cm.group(1).lower() == "x"
                text = cm.group(2)
            item = {"text": text, "checked": checked, "children": [], "paras": [],
                    "ordered": m.group(2)[0].isdigit()}
            while path and path[-1][0] >= indent:
                path.pop()
            if path:
                path[-1][1]["children"].append(item)
            else:
                root.append(item)
            path.append((indent, item))
            blank = False
            i += 1
            continue
        if line.startswith(" ") and path:
            k = len(line) - len(line.lstrip())
            owner = path[0][1]
            for ind, it in reversed(path):
                if ind < k:
                    owner = it
                    break
            txt = line.strip()
            if blank or owner is not path[-1][1]:
                owner["paras"].append(txt)
            else:
                owner["text"] += " " + txt
            blank = False
            i += 1
            continue
        break
    return root, i


def parse_blocks(lines):
    blocks = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if not line.strip() or line.strip() == "---":
            i += 1
            continue
        if line.startswith("```"):
            lang = line[3:].strip()
            j = i + 1
            buf = []
            while j < n and not lines[j].startswith("```"):
                buf.append(lines[j])
                j += 1
            blocks.append(("code", lang, "\n".join(buf)))
            i = j + 1
            continue
        if line.lstrip().startswith("|"):
            rows = []
            while i < n and lines[i].lstrip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            header = rows[0]
            body = [r for r in rows[1:] if not all(SEP_RE.match(c) for c in r if c)]
            blocks.append(("table", header, body))
            continue
        m = LIST_RE.match(line)
        if m and not m.group(1):
            items, i = parse_list(lines, i)
            blocks.append(("list", items))
            continue
        buf = [line.strip()]
        i += 1
        while (i < n and lines[i].strip() and not lines[i].startswith("```")
               and not lines[i].lstrip().startswith("|") and not LIST_RE.match(lines[i])
               and lines[i].strip() != "---"):
            buf.append(lines[i].strip())
            i += 1
        blocks.append(("p", " ".join(buf)))
    return blocks


def parse_doc(text):
    lines = text.split("\n")
    doc = {"title": "", "meta": [], "pre": [], "sections": []}
    i = 0
    while i < len(lines) and not lines[i].startswith("# "):
        i += 1
    if i < len(lines):
        doc["title"] = lines[i][2:].strip()
        i += 1
    while i < len(lines) and not lines[i].strip():
        i += 1
    while i < len(lines) and META_RE.match(lines[i]):
        m = META_RE.match(lines[i])
        doc["meta"].append((m.group(1).strip(), m.group(2).strip()))
        i += 1
    state = {"sec": None, "sub": None, "buf": []}

    def flush():
        blocks = parse_blocks(state["buf"])
        if state["sub"] is not None:
            state["sub"]["blocks"] = blocks
        elif state["sec"] is not None:
            state["sec"]["blocks"] = blocks
        else:
            doc["pre"] = blocks
        state["buf"] = []

    for line in lines[i:]:
        if line.startswith("## "):
            flush()
            state["sec"] = {"title": line[3:].strip(), "blocks": [], "subs": []}
            state["sub"] = None
            doc["sections"].append(state["sec"])
        elif line.startswith("### ") and state["sec"] is not None:
            flush()
            state["sub"] = {"title": line[4:].strip(), "blocks": []}
            state["sec"]["subs"].append(state["sub"])
        else:
            state["buf"].append(line)
    flush()
    return doc


# ---------------------------------------------------------------- inline markdown

REF_RE = re.compile(r"\b([RS])(\d{1,2})\b")
FILE_RE = re.compile(r"\b(?:docs/)?(product-spec|design|tech-spec|progress)\.md\b")


def esc(s):
    return html.escape(s, quote=False)


def attr(s):
    return html.escape(s, quote=True)


def link_refs(s):
    def rep(m):
        kind, num = m.group(1), int(m.group(2))
        if 1 <= num <= LIMITS[kind]:
            return '<a class="ref" href="#%s%d">%s%d</a>' % (kind, num, kind, num)
        return m.group(0)
    s = REF_RE.sub(rep, s)
    s = FILE_RE.sub(lambda m: '<a href="#%s">%s</a>' % (FILE_TAB[m.group(1) + ".md"], m.group(0)), s)
    return s


def inline(text, refs=True):
    out = []
    for part in re.split(r"(`[^`]+`)", text):
        if len(part) > 1 and part.startswith("`") and part.endswith("`"):
            out.append("<code>" + esc(part[1:-1]) + "</code>")
            continue
        s = esc(part)
        if refs:
            s = link_refs(s)
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])", r"<em>\1</em>", s)
        s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', s)
        out.append(s)
    return "".join(out)


def plain(text):
    s = re.sub(r"`([^`]+)`", r"\1", text)
    s = s.replace("**", "")
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
    return s


# ---------------------------------------------------------------- generic rendering

def li_inner(it):
    s = inline(it["text"])
    if it["children"]:
        s += render_list(it["children"])
    for p in it["paras"]:
        s += "<p>" + inline(p) + "</p>"
    return s


def render_list(items, cls=""):
    if not items:
        return ""
    tag = "ol" if items[0]["ordered"] else "ul"
    c = ' class="%s"' % cls if cls else ""
    return "<%s%s>%s</%s>" % (tag, c, "".join("<li>" + li_inner(it) + "</li>" for it in items), tag)


def iconlist(items, kind=""):
    cls = ("iconlist " + kind).strip()
    return '<ul class="%s">%s</ul>' % (cls, "".join("<li><div>" + li_inner(it) + "</div></li>" for it in items))


def render_table(header, rows):
    th = "".join("<th>%s</th>" % inline(h) for h in header)
    trs = "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r) for r in rows)
    return '<div class="table-wrap"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (th, trs)


def render_code(text):
    return '<div class="scroll"><pre class="code">%s</pre></div>' % esc(text)


def render_blocks(blocks):
    out = []
    for b in blocks:
        if b[0] == "p":
            out.append("<p>%s</p>" % inline(b[1]))
        elif b[0] == "list":
            out.append(render_list(b[1]))
        elif b[0] == "table":
            out.append(render_table(b[1], b[2]))
        elif b[0] == "code":
            out.append(render_code(b[2]))
    return "".join(out)


def generic(blocks):
    if not blocks:
        return ""
    return '<div class="card">%s</div>' % render_blocks(blocks)


def lead(blocks):
    return "".join('<p class="lead">%s</p>' % inline(b[1]) for b in blocks if b[0] == "p")


def first_list(blocks):
    for b in blocks:
        if b[0] == "list":
            return b[1]
    return []


def first_table(blocks):
    for b in blocks:
        if b[0] == "table":
            return b
    return None


# ---------------------------------------------------------------- sections and the header

NUM_RE = re.compile(r"^(\d+(?:\.\d+)*)\.?\s+(.*)$")


def split_num(title):
    m = NUM_RE.match(title)
    return (m.group(1), m.group(2)) if m else ("", title)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", plain(s).lower()).strip("-") or "section"


class Ctx:
    def __init__(self, tab):
        self.tab = tab
        self.toc = []
        self.ids = set()

    def uid(self, base):
        b, k = base, 2
        while b in self.ids:
            b = "%s-%d" % (base, k)
            k += 1
        self.ids.add(b)
        return b


def section(ctx, title, inner, cls=""):
    num, name = split_num(title)
    sid = ctx.uid("%s-%s" % (ctx.tab, slug(name)))
    ctx.toc.append((sid, plain(name), 1))
    n = '<span class="num">%s</span>' % esc(num) if num else ""
    return '<section class="sec %s" id="%s"><h2>%s<span>%s</span></h2>%s</section>' % (
        cls, sid, n, inline(name, refs=False), inner)


def subsection(ctx, title, inner, toc=False):
    num, name = split_num(title)
    sid = ctx.uid("%s-%s" % (ctx.tab, slug(name)))
    if toc:
        ctx.toc.append((sid, plain(name), 2))
    n = '<span class="num">%s</span>' % esc(num) if num else ""
    return '<div class="sub" id="%s"><h3>%s<span>%s</span></h3>%s</div>' % (sid, n, inline(name, refs=False), inner)


def status_of(meta):
    for k, v in meta:
        if k.lower() == "status":
            m = re.match(r"^(\w+),\s*version\s*([\d.]+)(?:\s*\(([^)]*)\))?", v)
            if m:
                return m.group(1), m.group(2), m.group(3) or ""
            return v, "", ""
    return "", "", ""


def status_chip(state, version, extra_cls=""):
    low = state.lower()
    cls = "ok" if low == "agreed" else ("draft" if low == "draft" else "")
    label = ("%s %s" % (state, version)).strip()
    return '<span class="chip pill %s %s"><span class="dot"></span>%s</span>' % (cls, extra_cls, esc(label))


def preamble(blocks):
    out = []
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if (b[0] == "p" and BOLD_ONLY_RE.match(b[1].strip()) and i + 1 < len(blocks)
                and blocks[i + 1][0] == "list"):
            out.append('<div class="callout info"><div class="title">%s</div>%s</div>' % (
                esc(b[1].strip()[2:-2]), render_list(blocks[i + 1][1])))
            i += 2
            continue
        out.append(render_blocks([b]))
        i += 1
    return "".join(out)


def dochead(filename, doc, extra=""):
    title = doc["title"].split(":", 1)[-1].strip()
    state, version, _ = status_of(doc["meta"])
    chip = status_chip(state, version) if state else ""
    rows = ["<dt>Owner</dt><dd>%s</dd>" % esc(OWNER)]
    for k, v in doc["meta"]:
        if k.lower() != "status":
            rows.append("<dt>%s</dt><dd>%s</dd>" % (esc(k), inline(v)))
    return ('<header class="dochead"><div class="file">docs/%s</div>'
            '<div class="head-meta"><h1>%s</h1>%s</div><dl class="meta">%s</dl>%s</header>') % (
        filename, esc(title), chip, "".join(rows), extra)


def toc_html(ctx):
    rail = []
    for sid, name, level in ctx.toc:
        style = ' style="padding-left:22px;font-size:13px"' if level == 2 else ""
        rail.append('<li><a href="#%s"%s>%s</a></li>' % (sid, style, esc(name)))
    chips = "".join('<a class="chip ink" href="#%s">%s</a>' % (sid, esc(name)) for sid, name, level in ctx.toc if level == 1)
    return ('<nav class="rail" aria-label="On this page"><h2>On this page</h2><ol>%s</ol></nav>' % "".join(rail),
            '<nav class="toc-chips" aria-label="Jump to a section">%s</nav>' % chips)


# ---------------------------------------------------------------- shared section patterns

def label_cards(blocks, cls="grid wide"):
    out = []
    for b in blocks:
        if b[0] != "list":
            out.append(lead([b]) if b[0] == "p" else render_blocks([b]))
            continue
        cards = []
        for it in b[1]:
            m = LABEL_RE.match(it["text"])
            kids = render_list(it["children"]) if it["children"] else ""
            if m:
                label = m.group(1).rstrip(":").rstrip(".")
                cards.append('<div class="card"><h3>%s</h3><p>%s</p>%s</div>' % (inline(label), inline(m.group(2)), kids))
            else:
                cards.append('<div class="card"><p>%s</p>%s</div>' % (inline(it["text"]), kids))
        out.append('<div class="%s">%s</div>' % (cls, "".join(cards)))
    return "".join(out)


def numbered_card(blocks):
    out = []
    for b in blocks:
        if b[0] == "list":
            lis = "".join("<li><div>%s</div></li>" % li_inner(it) for it in b[1])
            out.append('<div class="card"><ol class="numrows">%s</ol></div>' % lis)
        else:
            out.append(lead([b]) if b[0] == "p" else render_blocks([b]))
    return "".join(out)


def iconlist_card(blocks, kind=""):
    out = []
    for b in blocks:
        if b[0] == "list":
            out.append(iconlist(b[1], kind))
        else:
            out.append(render_blocks([b]))
    return '<div class="card">%s</div>' % "".join(out)


def decisions(blocks):
    out = []
    for b in blocks:
        if b[0] != "table":
            out.append(lead([b]) if b[0] == "p" else render_blocks([b]))
            continue
        rows = []
        for r in b[2]:
            date, dec = r[0], r[1]
            src = r[2] if len(r) > 2 else ""
            cls = "ok" if re.search(r"agreed|your decision", src, re.I) else ""
            src_html = '<div><span class="chip %s">%s</span></div>' % (cls, inline(src)) if src else ""
            rows.append('<div class="row split"><div><span class="chip">%s</span></div>'
                        '<div class="stack tight"><div>%s</div>%s</div></div>' % (inline(date), inline(dec), src_html))
        out.append('<div class="card"><div class="rows">%s</div></div>' % "".join(rows))
    return "".join(out)


def questions(blocks):
    out = []
    for b in blocks:
        if b[0] != "table":
            out.append(lead([b]) if b[0] == "p" else render_blocks([b]))
            continue
        cards = []
        for r in b[2]:
            cards.append('<div class="card"><div><span class="chip">%s</span></div><p><strong>%s</strong></p>'
                         '<div class="expected"><span class="k">Default</span><span>%s</span></div></div>' % (
                             inline(r[0]), inline(r[1]), inline(r[2] if len(r) > 2 else "")))
        out.append('<div class="grid wide">%s</div>' % "".join(cards))
    return "".join(out)


def changelog(blocks):
    out = []
    for b in blocks:
        if b[0] == "list":
            out.append('<ol class="timeline">%s</ol>' % "".join("<li>%s</li>" % li_inner(it) for it in b[1]))
        else:
            out.append(render_blocks([b]))
    return '<div class="card">%s</div>' % "".join(out)


# ---------------------------------------------------------------- product spec

REQ_RE = re.compile(r"^\*\*R(\d+)\s+(.+?)\*\*\s*(.*)$")
TRAIL_REFS = re.compile(r"\s*\(([^()]*)\)\s*$")


def product_overview(sec):
    paras = [b[1] for b in sec["blocks"] if b[0] == "p"]
    out, cards = [], []
    for idx, p in enumerate(paras):
        m = LABEL_RE.match(p)
        label, body = (m.group(1).rstrip("."), m.group(2)) if m else ("", p)
        if idx == 0:
            out.append('<div class="notebook"><div class="label">%s</div><p>%s</p></div>' % (esc(label), inline(body)))
        else:
            cards.append('<div class="card"><div class="kicker">%s</div><p>%s</p></div>' % (inline(label), inline(body)))
    out.append('<div class="grid wide">%s</div>' % "".join(cards))
    return "".join(out)


def key_terms(sec):
    cards = []
    for it in first_list(sec["blocks"]):
        m = re.match(r"^\*\*([^*]+?):?\*\*:?\s*(.*)$", it["text"])
        term, body = (m.group(1), m.group(2)) if m else ("", it["text"])
        cards.append('<div class="card"><h3>%s</h3><p>%s</p></div>' % (inline(term), inline(body)))
    return '<div class="grid">%s</div>' % "".join(cards)


def users_section(sec):
    out = []
    blocks = sec["blocks"]
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if b[0] == "table":
            header, rows = b[1], b[2]
            cards = []
            for r in rows:
                dl = "".join("<dt>%s</dt><dd>%s</dd>" % (inline(header[j]), inline(r[j])) for j in range(1, len(header)))
                cards.append('<div class="card"><h3>%s</h3><dl class="deflist">%s</dl></div>' % (inline(r[0]), dl))
            out.append('<div class="grid wide">%s</div>' % "".join(cards))
        elif b[0] == "p" and i + 1 < len(blocks) and blocks[i + 1][0] == "list":
            out.append('<div class="callout"><div class="title">%s</div>%s</div>' % (inline(b[1]), iconlist(blocks[i + 1][1])))
            i += 1
        else:
            out.append(render_blocks([b]))
        i += 1
    return "".join(out)


def stories(sec):
    cards = []
    blocks = sec["blocks"]
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if b[0] == "p" and i + 1 < len(blocks) and blocks[i + 1][0] == "list":
            title = re.sub(r"^\*\*|\*\*$", "", b[1].strip())
            title = re.sub(r"^[A-Z]\.\s+", "", title)
            lis = []
            for it in blocks[i + 1][1]:
                m = re.match(r"^(As an? [^,]+,)\s*(.*)$", it["text"])
                if m:
                    lis.append('<li><span class="as">%s</span> %s</li>' % (esc(m.group(1)), inline(m.group(2))))
                else:
                    lis.append("<li>%s</li>" % inline(it["text"]))
            cards.append('<div class="card story-card"><h3>%s</h3><ul>%s</ul></div>' % (inline(title), "".join(lis)))
            i += 2
            continue
        i += 1
    return '<div class="masonry">%s</div>' % "".join(cards)


def requirements(ctx, sec):
    tools = ('<div class="req-tools"><input id="req-filter" type="search" autocomplete="off" '
             'placeholder="Filter, for example camera, budget or R13" aria-label="Filter requirements">'
             '<span class="count" id="req-count" aria-live="polite"></span></div>')
    groups = []
    for sub in sec["subs"]:
        rows = []
        for it in first_list(sub["blocks"]):
            m = REQ_RE.match(it["text"])
            if not m:
                continue
            num, title, rest = m.group(1), m.group(2).rstrip("."), m.group(3)
            refs = ""
            rm = TRAIL_REFS.search(rest)
            if rm:
                refs, rest = rm.group(1), rest[:rm.start()]
            body = "<p>%s</p>" % inline(rest) if rest else ""
            if it["children"]:
                body += render_list(it["children"])
            for p in it["paras"]:
                pm = TRAIL_REFS.search(p)
                if pm and not refs:
                    refs, p = pm.group(1), p[:pm.start()]
                body += "<p>%s</p>" % inline(p)
            default = '<span class="chip draft">Default</span>' if refs.strip().lower() == "default" else ""
            refs_html = '<div class="refs">Source: %s</div>' % inline(refs) if refs and not default else ""
            search = " ".join([("r%s" % num), title, rest, refs] + [c["text"] for c in it["children"]] + it["paras"])
            rows.append('<article class="req" id="R%s" data-search="%s"><a class="rchip" href="#R%s">R%s</a>'
                        '<div class="rbody"><div class="rtitle">%s %s</div>%s%s</div></article>' % (
                            num, attr(plain(search).lower()), num, num, inline(title, refs=False), default, body, refs_html))
        gid = ctx.uid("product-req-" + slug(sub["title"]))
        groups.append('<div class="req-group" id="%s"><h3>%s</h3><div class="req-list">%s</div></div>' % (
            gid, inline(sub["title"], refs=False), "".join(rows)))
    empty = '<div class="empty" id="req-empty" hidden>No requirement matches that filter.</div>'
    return lead(sec["blocks"]) + tools + "".join(groups) + empty


def pairs(blocks):
    out = []
    for b in blocks:
        if b[0] != "table":
            out.append(render_blocks([b]))
            continue
        head = '<div class="pair head"><div>%s</div><div></div><div>%s</div></div>' % (inline(b[1][0]), inline(b[1][1]))
        rows = "".join('<div class="pair"><div class="from">%s</div><div class="arrow" aria-hidden="true">&rarr;</div>'
                       '<div>%s</div></div>' % (inline(r[0]), inline(r[1])) for r in b[2])
        out.append('<div class="card">%s%s</div>' % (head, rows))
    return "".join(out)


def success_checks(sec):
    out = []
    for b in sec["blocks"]:
        if b[0] == "table":
            cards = []
            for r in b[2]:
                sid = r[0].strip()
                cards.append('<article class="card check" id="%s"><div class="top"><span class="chip ok">%s</span></div>'
                             '<p class="do">%s</p><div class="expected"><span class="k">Expect</span><span>%s</span></div></article>' % (
                                 attr(sid), esc(sid), inline(r[1]), inline(r[2])))
            out.append('<div class="grid two">%s</div>' % "".join(cards))
        elif b[0] == "p":
            out.append(lead([b]))
        else:
            out.append(render_blocks([b]))
    return "".join(out)


def render_product(doc, ctx):
    parts = [dochead("product-spec.md", doc, preamble(doc["pre"]))]
    for sec in doc["sections"]:
        name = split_num(sec["title"])[1].lower()
        if name == "overview":
            inner = product_overview(sec)
        elif name == "key terms":
            inner = key_terms(sec)
        elif name == "goals":
            inner = numbered_card(sec["blocks"])
        elif name == "users":
            inner = users_section(sec)
        elif name == "user stories":
            inner = stories(sec)
        elif name == "functional requirements":
            inner = requirements(ctx, sec)
        elif name.startswith("layout"):
            inner = label_cards(sec["blocks"])
        elif name.startswith("out of scope"):
            inner = iconlist_card(sec["blocks"], "no")
        elif name.startswith("future features"):
            inner = pairs(sec["blocks"])
        elif name == "success criteria":
            inner = success_checks(sec)
        elif name == "decisions":
            inner = decisions(sec["blocks"])
        elif name == "open questions":
            inner = questions(sec["blocks"])
        elif name == "change log":
            inner = changelog(sec["blocks"])
        else:
            inner = generic(sec["blocks"])
        parts.append(section(ctx, sec["title"], inner))
    return "".join(parts)


# ---------------------------------------------------------------- design spec

def text_on(hexv):
    h = hexv.lstrip("#")
    if len(h) != 6:
        return "#1F2A44"
    def lin(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(h[k:k + 2], 16) for k in (0, 2, 4))
    lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return "#1F2A44" if lum > 0.35 else "#FFFFFF"


def idea(sec):
    p = next((b[1] for b in sec["blocks"] if b[0] == "p"), "")
    m = LABEL_RE.match(p)
    head, rest = (m.group(1), m.group(2)) if m else ("", p)
    return '<div class="notebook"><div class="label">The idea</div><p>%s</p><p class="plain">%s</p></div>' % (
        inline(head), inline(rest))


def principles(sec):
    cards = []
    for it in first_list(sec["blocks"]):
        m = LABEL_RE.match(it["text"])
        title, body = (m.group(1).rstrip("."), m.group(2)) if m else ("", it["text"])
        cards.append('<div class="card"><h3>%s</h3><p class="muted">%s</p></div>' % (inline(title), inline(body)))
    return '<div class="grid">%s</div>' % "".join(cards)


def in_use_strip():
    return ('<div class="stack tight"><div class="kicker">In use</div><div class="pv" aria-hidden="true"><div class="row-inline">'
            '<span class="pchip ok">Confirmed</span><span class="pchip hl">To confirm</span><span class="pchip">Saved preference</span>'
            '<span class="pchip">This session only</span><span class="pbtn">Save look</span><span class="pbtn sec">Cancel</span>'
            '</div><div class="banner bad">Voice disconnected. Reconnecting, attempt 2 of 3.</div></div></div>')


def rules_or(blocks, i):
    b = blocks[i]
    if (b[0] == "p" and b[1].strip().rstrip(":").lower() == "rules" and i + 1 < len(blocks)
            and blocks[i + 1][0] == "list"):
        return '<div class="callout"><div class="title">Rules</div>%s</div>' % iconlist(blocks[i + 1][1])
    return None


def palette(sub):
    out = []
    blocks = sub["blocks"]
    i = 0
    while i < len(blocks):
        b = blocks[i]
        rules = rules_or(blocks, i)
        if rules:
            out.append(rules)
            i += 2
            continue
        if b[0] == "table":
            cards = []
            for r in b[2]:
                name, hexv, use, contrast = (r + ["", "", "", ""])[:4]
                hx = plain(hexv).strip()
                cards.append(
                    '<div class="card swatch"><div class="block" style="background:%s"><span style="color:%s">Aa</span></div>'
                    '<div class="body"><div class="name">%s</div>'
                    '<button type="button" class="copy" data-copy="%s" aria-label="Copy %s"><span class="hex">%s</span><span class="label">Copy</span></button>'
                    '<div class="use">%s</div><div class="contrast">%s</div></div></div>' % (
                        attr(hx), text_on(hx), inline(name), attr(hx), attr(hx), esc(hx), inline(use),
                        ("Contrast: " + inline(contrast)) if contrast and contrast[0].isdigit() else inline(contrast)))
            out.append('<div class="grid">%s</div>' % "".join(cards))
            out.append(in_use_strip())
        else:
            out.append(lead([b]) if b[0] == "p" else render_blocks([b]))
        i += 1
    return "".join(out)


TYPE_SAMPLES = {
    "Display": "Say what you need.",
    "Title": "Saved looks",
    "Notebook title": "My Styling Notes",
    "Heading": "Garden ceremony",
    "Note value": "Outdoor wedding, up to $500",
    "Subheading": "End this session?",
    "Body": "Tell the stylist what you like or dislike about this look.",
    "Label": "Budget",
    "Small": "$312 to buy, owned items not included",
}


def parse_pair(s):
    nums = re.findall(r"\d+", s)
    return (nums[0], nums[1]) if len(nums) >= 2 else ("16", "24")


def typography(sub):
    out = []
    blocks = sub["blocks"]
    i = 0
    while i < len(blocks):
        b = blocks[i]
        rules = rules_or(blocks, i)
        if rules:
            out.append(rules)
            i += 2
            continue
        if b[0] == "list":
            cards = []
            for it in b[1]:
                m = LABEL_RE.match(it["text"])
                fam = m.group(1) if m else ""
                font = "var(--font-display)" if "Newsreader" in fam else "var(--font-ui)"
                cards.append('<div class="card"><div style="font-family:%s;font-size:30px;line-height:1.1">%s</div><p>%s</p></div>' % (
                    font, esc(fam), inline(m.group(2) if m else it["text"])))
            out.append('<div class="grid two">%s</div>' % "".join(cards))
        elif b[0] == "table":
            rows = []
            for r in b[2]:
                style, fontw, phone, desk, use = (r + [""] * 5)[:5]
                font = "var(--font-display)" if "Newsreader" in fontw else "var(--font-ui)"
                wm = re.search(r"(\d{3})", fontw)
                weight = wm.group(1) if wm else "400"
                ital = "italic" if "italic" in fontw.lower() else "normal"
                pf, pl = parse_pair(phone)
                df, dl = parse_pair(desk)
                css = "font-family:%s;font-weight:%s;font-style:%s;--fs-p:%spx;--lh-p:%spx;--fs-d:%spx;--lh-d:%spx" % (
                    font, weight, ital, pf, pl, df, dl)
                sample = TYPE_SAMPLES.get(plain(style), plain(style))
                rows.append('<div class="type-row"><div class="spec"><b>%s</b><span>%s</span><span>Phone %s, desktop %s</span></div>'
                            '<div class="stack tight"><div class="type-sample" style="%s">%s</div><div class="use">%s</div></div></div>' % (
                                inline(style), inline(fontw), esc(phone), esc(desk), attr(css), esc(sample), inline(use)))
            out.append('<div class="card">%s</div>' % "".join(rows))
        else:
            out.append(lead([b]) if b[0] == "p" else render_blocks([b]))
        i += 1
    return "".join(out)


def spacing(sub):
    scale_html, rest = "", []
    for it in first_list(sub["blocks"]):
        m = re.search(r"Scale:\s*([\d,\s]+)", it["text"])
        if m and not scale_html:
            vals = [int(x) for x in re.findall(r"\d+", m.group(1))]
            steps = "".join('<div class="step"><div class="sq" style="width:%dpx;height:%dpx"></div><span>%d</span></div>' % (v, v, v) for v in vals)
            scale_html = '<div class="card"><h3>Spacing scale</h3><p class="muted">%s</p><div class="scale">%s</div></div>' % (inline(it["text"]), steps)
        else:
            rest.append(it)
    return scale_html + ('<div class="card">%s</div>' % iconlist(rest) if rest else "")


def radius_css(v):
    low = v.lower()
    if "fully" in low:
        return "999px"
    if "circle" in low:
        return "50%"
    m = re.search(r"(\d+)\s*px", low)
    if not m:
        return "0"
    if "top corners" in low:
        return "%spx %spx 0 0" % (m.group(1), m.group(1))
    return m.group(1) + "px"


def radius(sub):
    t = first_table(sub["blocks"])
    tiles = []
    for r in (t[2] if t else []):
        rad = radius_css(plain(r[1]))
        size = "width:54px;height:54px;" if rad == "50%" else ""
        tiles.append('<div class="card tile"><div class="box" style="%sborder-radius:%s"></div><strong>%s</strong><span class="val">%s</span></div>' % (
            size, rad, inline(r[0]), inline(r[1])))
    return lead(sub["blocks"]) + '<div class="tiles">%s</div>' % "".join(tiles)


def shadows(sub):
    t = first_table(sub["blocks"])
    cards = []
    for r in (t[2] if t else []):
        val = plain(r[1])
        style = "box-shadow:%s" % val if val[:1].isdigit() else "border:1px solid var(--app-hair)"
        cards.append('<div class="card"><div class="well"><div class="box" style="%s"></div></div><strong>%s</strong><span class="muted small">%s</span><code>%s</code></div>' % (
            attr(style), inline(r[0]), inline(r[2] if len(r) > 2 else ""), esc(val)))
    tail = [b for b in sub["blocks"] if b[0] == "p"]
    return lead([b for b in sub["blocks"] if b[0] == "p"][:1]) + '<div class="grid">%s</div>' % "".join(cards) + lead(tail[1:])


def motion(sub):
    out = []
    for b in sub["blocks"]:
        if b[0] == "table":
            tiles = []
            for r in b[2]:
                ms = re.findall(r"\d+", r[1])
                pct = min(100, round(int(ms[0]) / 500 * 100)) if ms else 0
                tiles.append('<div class="card tile"><strong>%s</strong><span class="val">%s</span><div class="mbar" style="width:100%%"><i style="--pct:%d"></i></div><span class="muted small">%s</span></div>' % (
                    inline(r[0]), inline(r[1]), pct, inline(r[2] if len(r) > 2 else "")))
            out.append('<div class="tiles">%s</div>' % "".join(tiles))
        elif b[0] == "list":
            out.append('<div class="card">%s</div>' % iconlist(b[1]))
        else:
            out.append(render_blocks([b]))
    return "".join(out)


def icons(sub):
    out = []
    for b in sub["blocks"]:
        if b[0] == "table":
            cells = "".join('<div class="card mini"><strong>%s</strong><span class="muted">%s</span></div>' % (inline(r[0]), inline(r[1])) for r in b[2])
            out.append('<div class="grid">%s</div>' % cells)
        elif b[0] == "list":
            out.append('<div class="card">%s</div>' % iconlist(b[1]))
        else:
            out.append(render_blocks([b]))
    return "".join(out)


def visual_language(ctx, sec):
    out = [lead(sec["blocks"])]
    for sub in sec["subs"]:
        name = split_num(sub["title"])[1].lower()
        if name == "color palette":
            inner = palette(sub)
        elif name == "typography":
            inner = typography(sub)
        elif name == "spacing":
            inner = spacing(sub)
        elif name == "corner radius":
            inner = radius(sub)
        elif name == "shadows":
            inner = shadows(sub)
        elif name == "motion":
            inner = motion(sub)
        elif name == "icons":
            inner = icons(sub)
        else:
            inner = iconlist_card(sub["blocks"])
        out.append(subsection(ctx, sub["title"], inner, toc=True))
    return "".join(out)


ICON = {
    "mic": '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    "cam": '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/></svg>',
    "more": '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>',
    "end": '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6L6 18"/></svg>',
}


def ctrl(icon, label):
    return '<div class="ctrl"><span class="circle">%s</span>%s</div>' % (ICON[icon], label)


PREVIEWS = {
    "Stylist stage": '<div class="frame"><span class="state"><span class="pchip ok">Listening</span></span></div>',
    "Voice controls": '<div class="row-inline" style="justify-content:space-around">%s%s%s%s</div>' % (
        ctrl("mic", "Mute"), ctrl("cam", "Camera"), ctrl("more", "More"), ctrl("end", "End")),
    "No transcript": '<div class="row-inline"><span class="pchip ok">Speaking</span><span class="g" style="font-size:12px">No captions or message box. The stylist talks, and jots notes.</span></div>',
    "Quick replies and sample phrases": '<div class="row-inline"><span class="pchip">Dress</span><span class="pchip">Pantsuit</span><span class="pchip">Not sure yet</span></div>',
    "Pinned bar": '<div class="pcard" style="flex-direction:row;align-items:center;gap:8px;flex-wrap:wrap"><span class="circle" style="width:30px;height:30px"></span>'
                  '<span class="pchip ok">Listening</span><span class="g" style="margin-left:auto;font-size:12px">6 notes, 1 to confirm</span></div>',
    "Camera view": '<div class="frame" style="aspect-ratio:4/3"><span class="state"><span class="pchip"><span class="dotred"></span>Camera on</span></span></div>'
                   '<div class="row-inline"><span>Navy wool blazer?</span><span class="pbtn">Capture</span><span class="g" style="font-size:12px">Video isn\'t saved.</span></div>',
    "Notebook": '<div class="page"><div class="serif" style="font-style:italic;line-height:28px">My Styling Notes</div>'
                '<div class="g" style="font-size:12px;line-height:28px">Notes appear here as you talk. Tap a note to confirm or remove it, or say a correction.</div>'
                '<div class="nval jot"><span>Outdoor wedding, November</span><span class="pchip ok">Confirmed</span></div></div>',
    "Jotted note": '<div class="page">'
                   '<div class="nval jot"><span>Outdoor wedding, November</span><span class="pchip ok">Confirmed</span></div>'
                   '<div class="nval jot"><span class="pencil">Ceremony on grass</span><span class="pchip hl">To confirm</span></div>'
                   '<div class="nval jot"><span>Budget: up to $350</span><span class="pchip ok">Confirmed</span></div></div>',
    "Status chip": '<div class="row-inline"><span class="pchip hl">To confirm</span><span class="pchip ok">Confirmed</span>'
                   '<span class="pchip">Saved preference</span><span class="pchip">This session only</span>'
                   '<span class="pchip">Checking</span><span class="pchip ok">Checked</span><span class="pchip hl">Needs a new check</span></div>',
    "Note actions": '<div class="page"><div class="nval jot"><span class="pencil">Maid of honor</span><span class="pchip hl">To confirm</span></div>'
                    '<div class="row-inline" style="padding:2px 0 4px"><span class="pbtn">Confirm</span><span class="pbtn sec">Remove</span></div></div>',
    "Pasted photo": '<div class="row-inline" style="align-items:flex-start;gap:14px"><span class="photo"></span><div class="stack" style="gap:4px">'
                    '<b>Navy wool blazer</b><span class="g">From your camera</span><span class="pchip ok">You own this</span></div></div>',
    "Item details review": '<div class="pcard"><div class="row-inline">Type: Blazer <span class="pchip ok">Confirmed</span></div>'
                           '<div class="row-inline">Color: Navy <span class="pchip hl">To confirm</span></div>'
                           '<div class="row-inline"><span class="pbtn">It\'s mine</span><span class="pbtn sec">Inspiration</span></div></div>',
    "Feedback jotted under a look": '<div class="page"><div class="nlabel">Look 1</div>'
                                    '<div class="nval jot"><span>Keep the dress and bag</span><span class="pchip ok">Confirmed</span></div>'
                                    '<div class="nval jot"><span class="pencil">Lower heels, this look only</span><span class="pchip hl">To confirm</span></div></div>',
    "Saved preferences and session exceptions": '<div class="pcard"><div class="row-inline">Never: high heels <span class="pchip">Saved preference</span></div>'
                                                '<div class="banner info">High heels allowed for this session. <span class="pchip">This session only</span></div></div>',
    "Look panel": '<div class="pcard"><span class="g">Look 1 of 3</span><span class="serif">Garden ceremony</span>'
                  '<div class="thumbs"><span class="thumb">Dress</span><span class="thumb">Shoes</span><span class="thumb">Bag</span></div>'
                  '<span>$312 to buy, owned items not included</span><span class="pchip ok" style="width:fit-content">Checked against your preferences</span></div>',
    "Item tile": '<div class="pcard" style="max-width:220px"><span class="thumb" style="aspect-ratio:4/3">Photo</span><b>Emerald satin dress</b>'
                 '<span class="pchip" style="width:fit-content">Sample product, $180</span><div class="row-inline"><span class="pchip ok">Keeping</span><span class="pchip">Change</span><span class="pchip">Swap</span></div></div>',
    "Change summary": '<div class="banner info">Changed: high heels to block-heel sandals. Kept: dress and bag. New total: $298, $52 under your limit.</div>',
    "Compare and undo": '<div class="thumbs" style="grid-template-columns:repeat(2,minmax(0,1fr))"><span class="thumb">Current</span><span class="thumb">Earlier</span></div>'
                        '<div class="row-inline"><span class="pchip hl">Different shoes</span><span class="pbtn sec">Undo feedback</span></div>',
    "Preference check status": '<div class="row-inline"><span class="pchip">Checking your preferences</span><span class="pchip ok">Checked against your preferences</span></div>'
                               '<div class="banner bad">Your profile says Never: high heels. Allow high heels for this session?</div>'
                               '<div class="row-inline"><span class="pbtn">Allow for this session</span><span class="pbtn sec">Keep my preference</span></div>',
    "Demo bag": '<div class="banner info">Demo only: these sample products can\'t be bought.</div><div class="row-inline"><span>Total $312</span><span class="pbtn" style="opacity:.55">Checkout</span></div>',
    "Wardrobe": '<div class="row-inline"><span class="pchip ok">All</span><span class="pchip">Tops</span><span class="pchip">Shoes</span></div>'
                '<div class="thumbs"><span class="thumb">Blazer</span><span class="thumb">Jeans</span><span class="thumb">Loafers</span></div>',
    "Saved looks": '<div class="pcard"><span class="serif">Garden ceremony</span><span class="g">Saved 18 Oct</span><div class="row-inline"><span class="pbtn sec">Open</span><span class="pbtn sec">Remove</span></div></div>',
    "Permission card": '<div class="pcard"><b>Use your microphone?</b><span class="g">The stylist needs it to hear you.</span>'
                       '<div class="row-inline"><span class="pbtn">Allow</span><span class="pbtn sec">Not now</span></div></div>',
    "Dialogs, banners and toasts": '<div class="banner ok">Look saved.</div><div class="banner bad">Voice disconnected. Reconnecting, attempt 2 of 3.</div>'
                                   '<div class="row-inline"><span class="pbtn red">Delete all data</span><span class="pbtn sec">Cancel</span></div>',
    "Behind the scenes panel": '<div class="pcard" style="font-size:13px"><span>Captured Budget: up to $500, from your voice, high certainty.</span>'
                               '<span>Check passed: Look 2 meets Never: high heels.</span><span class="g">Check blocked a candidate: 9 cm heels. Shoes replaced.</span></div>',
    "App bar and menu": '<div class="pcard" style="flex-direction:row;justify-content:space-between;align-items:center"><span class="serif">AI Personal Stylist</span><span class="pbtn sec">Menu</span></div>',
}


def component_card(name, items):
    m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", name)
    base, note = (m.group(1), m.group(2)) if m else (name, "")
    chip = '<span class="chip">%s</span>' % inline(note) if note else ""
    pv = PREVIEWS.get(base, "")
    pv_html = '<div class="pv" aria-hidden="true">%s</div>' % pv if pv else ""
    return '<div class="card comp"><div class="comp-head"><h4>%s</h4>%s</div>%s%s</div>' % (inline(base), chip, pv_html, render_list(items))


def components(ctx, sec):
    out = [lead(sec["blocks"])]
    for sub in sec["subs"]:
        cards = []
        blocks = sub["blocks"]
        i = 0
        while i < len(blocks):
            b = blocks[i]
            if b[0] == "p" and BOLD_ONLY_RE.match(b[1].strip()):
                items = blocks[i + 1][1] if i + 1 < len(blocks) and blocks[i + 1][0] == "list" else []
                cards.append(component_card(b[1].strip()[2:-2], items))
                i += 2 if items else 1
                continue
            i += 1
        out.append(subsection(ctx, sub["title"], '<div class="masonry">%s</div>' % "".join(cards)))
    return "".join(out)


def screens(ctx, sec):
    out = [lead(sec["blocks"])]
    for sub in sec["subs"]:
        parts, text = [], []
        for b in sub["blocks"]:
            if b[0] == "code":
                if text:
                    parts.append('<div class="card">%s</div>' % render_blocks(text))
                    text = []
                parts.append(render_code(b[2]))
            else:
                text.append(b)
        if text:
            parts.append('<div class="card">%s</div>' % render_blocks(text))
        out.append(subsection(ctx, sub["title"], "".join(parts)))
    return "".join(out)


def render_design(doc, ctx):
    parts = [dochead("design.md", doc, preamble(doc["pre"]))]
    for sec in doc["sections"]:
        name = split_num(sec["title"])[1].lower()
        if name == "the idea in one line":
            inner = idea(sec)
        elif name == "design principles":
            inner = principles(sec)
        elif name == "visual design language":
            # sections before subsections in the TOC
            sid_title = sec["title"]
            inner = None
        elif name == "components":
            inner = components(ctx, sec)
        elif name == "screens and layouts":
            inner = screens(ctx, sec)
        elif name.startswith("accessibility"):
            inner = iconlist_card(sec["blocks"])
        elif name == "open design questions":
            inner = questions(sec["blocks"])
        elif name == "change log":
            inner = changelog(sec["blocks"])
        else:
            inner = generic(sec["blocks"])
        if inner is None:
            # register the section first so its subsections follow it in the rail
            num, nm = split_num(sid_title)
            sid = ctx.uid("design-" + slug(nm))
            ctx.toc.append((sid, plain(nm), 1))
            body = visual_language(ctx, sec)
            n = '<span class="num">%s</span>' % esc(num) if num else ""
            parts.append('<section class="sec" id="%s"><h2>%s<span>%s</span></h2>%s</section>' % (sid, n, inline(nm, refs=False), body))
        else:
            parts.append(section(ctx, sec["title"], inner))
    return "".join(parts)


# ---------------------------------------------------------------- tech spec diagrams

MERMAID_INIT = {
    "theme": "base",
    "themeVariables": {
        "fontFamily": DIAGRAM_FONT,
        "fontSize": "14px",
        "primaryColor": "#FFFFFF",
        "primaryTextColor": "#1F2A44",
        "primaryBorderColor": "#7A818B",
        "secondaryColor": "#E3F1EA",
        "tertiaryColor": "#ECEEEC",
        "lineColor": "#575E6A",
        "textColor": "#1F2A44",
        "mainBkg": "#FFFFFF",
        "nodeBorder": "#7A818B",
        "clusterBkg": "#ECEEEC",
        "edgeLabelBackground": "#FFFFFF",
        "actorBkg": "#E3F1EA",
        "actorBorder": "#0B6B4F",
        "actorTextColor": "#1F2A44",
        "actorLineColor": "#7A818B",
        "signalColor": "#1F2A44",
        "signalTextColor": "#1F2A44",
        "labelBoxBkgColor": "#E3F1EA",
        "labelBoxBorderColor": "#0B6B4F",
        "noteBkgColor": "#FFE38A",
        "noteTextColor": "#1F2A44",
        "noteBorderColor": "#C9A100",
        "attributeBackgroundColorOdd": "#FFFFFF",
        "attributeBackgroundColorEven": "#F4F6F5",
        "rowOdd": "#FFFFFF",
        "rowEven": "#F4F6F5",
    },
    "flowchart": {"useMaxWidth": True, "htmlLabels": True, "curve": "basis", "nodeSpacing": 36, "rankSpacing": 46},
    "sequence": {"useMaxWidth": True, "mirrorActors": False, "actorMargin": 36, "messageMargin": 30},
    "er": {"useMaxWidth": True},
}

ARCH = """flowchart TB
  B["Shopper's browser<br/>screens and the live call"]
  C["Conversation connector<br/>one interface, two engines"]
  T["Tavus<br/>video stylist"]
  G["OpenAI GPT-Live<br/>voice only"]
  S["Our server<br/>Vercel functions"]
  K["Stylist core<br/>notes, looks, checker, versions"]
  A["Claude<br/>AI jobs"]
  D["Supabase<br/>sign-in, data, photos"]
  P["Sample catalog<br/>catalog connector"]
  B --> C
  C --> T
  C --> G
  B -->|signed-in requests| S
  S --> K
  K --> A
  K --> D
  K --> P
  S -.->|starts calls, sets limits| T
  S -.->|sets up voice calls| G"""

SEQ = """sequenceDiagram
  participant P as Shopper
  participant T as Tavus
  participant B as Browser
  participant S as Our server
  participant C as Claude
  P->>T: Speaks
  T-->>B: Live words, while speaking
  B->>S: New words, about once a second
  S->>C: Read notes from the words
  C-->>S: Typed note updates
  S-->>B: Notes, next question, versions
  B->>T: Context: confirmed notes, next question
  T-->>P: The stylist answers out loud"""

LOOKS = """flowchart TB
  I["Inputs<br/>notes, item, wardrobe, feedback, preferences"]
  F["Filter in code<br/>department, categories, rules, sizes, budget"]
  L["Claude composes<br/>up to 5 candidate looks"]
  T["Totals in code<br/>owned items left out"]
  P{"Preference<br/>check"}
  G["Publishing gate<br/>exact look, current versions"]
  V["On screen<br/>the stylist presents it"]
  R["Try another candidate<br/>up to 3 times"]
  N["No match<br/>explain the unmet requirement"]
  I --> F --> L --> T --> P
  P -->|pass| G --> V
  P -->|fail| R
  R -->|retry| L
  R -->|after 3 tries| N"""

LIFECYCLE = """flowchart TB
  A["Try the demo<br/>guest sign-in, profile row"]
  B["A session<br/>notes, feedback, photos, looks"]
  C["Session ends<br/>unsaved session data deleted"]
  D["Kept by the shopper<br/>saved looks, wardrobe, bag, preferences"]
  E["Daily job<br/>deletes guests unused for 7 days"]
  F["Delete all data<br/>rows, photos and sign-in removed"]
  A --> B
  B --> C
  B -->|Save look, Save to wardrobe| D
  D --> E
  A -.->|any time| F"""

ER = [
    ("Guest", """erDiagram
  profiles ||--o{ saved_preferences : "has"
  profiles ||--|| consents : "records"
  profiles ||--o{ wardrobe_items : "owns"
  profiles {
    uuid user_id PK
    text departments
    jsonb sizes
    jsonb default_budget
    timestamptz last_active_at
  }
  saved_preferences {
    uuid id PK
    uuid user_id FK
    text kind
    jsonb rule
    int version
  }
  consents {
    uuid user_id PK
    bool wardrobe_photos
    bool remember_preferences
    bool camera_explained
  }
  wardrobe_items {
    uuid id PK
    uuid user_id FK
    text photo_path
    text category
    jsonb details
  }"""),
    ("Session", """erDiagram
  sessions ||--o{ session_notes : "holds"
  sessions ||--o{ session_feedback : "holds"
  sessions ||--o{ session_exceptions : "allows"
  sessions {
    uuid id PK
    uuid user_id FK
    text engine
    text status
    int notes_version
  }
  session_notes {
    uuid id PK
    uuid session_id FK
    text note
    text kind
    jsonb details
    text status
    int version
    bool removed
  }
  session_feedback {
    uuid id PK
    uuid session_id FK
    uuid look_id FK
    text kind
    text scope
  }
  session_exceptions {
    uuid id PK
    uuid session_id FK
    uuid preference_id FK
    timestamptz confirmed_at
  }"""),
    ("Looks", """erDiagram
  sessions ||--o{ session_assets : "uses"
  sessions ||--o{ looks : "builds"
  looks ||--o{ check_results : "checked by"
  session_assets {
    uuid id PK
    uuid session_id FK
    text photo_path
    text ownership
    int version
  }
  looks {
    uuid id PK
    uuid session_id FK
    jsonb items
    int total_cents
    text status
  }
  check_results {
    uuid id PK
    uuid look_id FK
    jsonb versions_checked
    text verdict
    jsonb reasons
  }"""),
    ("Bag and catalog", """erDiagram
  profiles ||--o{ saved_looks : "keeps"
  profiles ||--o{ bag_items : "holds"
  catalog_products ||--o{ bag_items : "added as"
  profiles ||--o{ usage : "counts"
  saved_looks {
    uuid id PK
    uuid user_id FK
    jsonb look
    timestamptz saved_at
  }
  bag_items {
    uuid id PK
    uuid user_id FK
    text product_id FK
    text size
  }
  catalog_products {
    text id PK
    text category
    int price_cents
    jsonb attributes
    bool can_be_bought
  }
  usage {
    uuid user_id FK
    date day
    int video_seconds
    int ai_cost_cents
  }"""),
]


def mermaid_pre(src):
    directive = "%%{init: " + json.dumps(MERMAID_INIT) + "}%%\n"
    return '<pre class="mermaid">%s</pre>' % esc(directive + src)


def mermaid_fig(src, caption, wide=False, dmin=600):
    cls = "fig wide" if wide else "fig"
    style = ' style="--dmin:%dpx"' % dmin if wide else ""
    return ('<figure class="%s"%s><div class="panel-d"><div class="scroll">%s</div></div>'
            '<figcaption>%s</figcaption><span class="swipe">Swipe sideways to see the whole diagram.</span></figure>') % (
        cls, style, mermaid_pre(src), inline(caption))


def stepper(blocks):
    out = []
    for b in blocks:
        if b[0] == "list":
            out.append('<ol class="stepper">%s</ol>' % "".join("<li>%s</li>" % li_inner(it) for it in b[1]))
        elif b[0] == "p":
            out.append("<p>%s</p>" % inline(b[1]))
        else:
            out.append(render_blocks([b]))
    return '<div class="card">%s</div>' % "".join(out)


def table_cards(blocks, kicker_first=False):
    out = []
    for b in blocks:
        if b[0] != "table":
            out.append(lead([b]) if b[0] == "p" else render_blocks([b]))
            continue
        header, rows = b[1], b[2]
        cards = []
        for r in rows:
            if kicker_first:
                head = '<div class="kicker">%s</div><h3>%s</h3>' % (inline(r[0]), inline(r[1]))
                rest = r[2:]
                rest_h = header[2:]
            else:
                head = "<h3>%s</h3>" % inline(r[0])
                rest = r[1:]
                rest_h = header[1:]
            if len(rest) == 1:
                body = "<p>%s</p>" % inline(rest[0])
            else:
                body = '<dl class="deflist">%s</dl>' % "".join("<dt>%s</dt><dd>%s</dd>" % (inline(h), inline(c)) for h, c in zip(rest_h, rest))
            cards.append('<div class="card">%s%s</div>' % (head, body))
        out.append('<div class="grid wide">%s</div>' % "".join(cards))
    return "".join(out)


def tech_arch(ctx, sec):
    out = []
    for b in sec["blocks"]:
        if b[0] == "p":
            m = LABEL_RE.match(b[1])
            if m:
                out.append('<div class="callout ok"><div class="title">%s</div><p>%s</p></div>' % (inline(m.group(1).rstrip(".")), inline(m.group(2))))
            else:
                out.append("<p>%s</p>" % inline(b[1]))
        elif b[0] == "code":
            out.append(mermaid_fig(ARCH, "The main parts and how they connect. Dashed lines are set-up calls from our server.", wide=True, dmin=640))
    for sub in sec["subs"]:
        name = split_num(sub["title"])[1].lower()
        if name == "main parts":
            inner = table_cards(sub["blocks"])
        elif name.startswith("how a spoken turn"):
            inner = mermaid_fig(SEQ, "One spoken turn in video mode, from words to inked notes.", wide=True, dmin=620) + stepper(sub["blocks"])
        elif name.startswith("how a look"):
            inner = mermaid_fig(LOOKS, "Every look passes the preference check before anyone sees it.", wide=True, dmin=560) + stepper(sub["blocks"])
        else:
            parts = []
            for b in sub["blocks"]:
                parts.append(render_code(b[2]) if b[0] == "code" else (lead([b]) if b[0] == "p" else render_blocks([b])))
            inner = "".join(parts)
        out.append(subsection(ctx, sub["title"], inner))
    return "".join(out)


def tech_choices(sec):
    return table_cards(sec["blocks"], kicker_first=True)


def tech_data(ctx, sec):
    out = []
    t = first_table(sec["blocks"])
    intro = [b for b in sec["blocks"] if b[0] == "p"]
    if intro:
        out.append(lead(intro[:1]))
    out.append(mermaid_fig(LIFECYCLE, "What is kept, and for how long.", wide=True, dmin=560))
    buttons = "".join('<button type="button" aria-pressed="%s">%s</button>' % ("true" if k == 0 else "false", esc(name)) for k, (name, _) in enumerate(ER))
    panes = "".join('<div class="pane%s" aria-hidden="%s"%s>%s</div>' % (
        " is-on" if k == 0 else "", "false" if k == 0 else "true", "" if k == 0 else " inert",
        mermaid_fig(src, "%s tables. Field names and types are indicative; the table below lists what each one holds." % name, wide=True, dmin=600))
        for k, (name, src) in enumerate(ER))
    out.append('<div class="switcher"><div class="switch-seg" role="group" aria-label="Choose a data model diagram">%s</div><div class="panes">%s</div></div>' % (buttons, panes))
    if t:
        cards = []
        for r in t[2]:
            name, holds, fields, kept = (r + [""] * 4)[:4]
            cards.append('<div class="card"><div><code>%s</code></div><p>%s</p><dl class="deflist"><dt>Key fields</dt><dd>%s</dd><dt>Kept for</dt><dd>%s</dd></dl></div>' % (
                esc(plain(name)), inline(holds), inline(fields), inline(kept)))
        out.append('<div class="grid wide">%s</div>' % "".join(cards))
    for b in intro[1:]:
        out.append('<div class="callout warn"><p>%s</p></div>' % inline(b[1]))
    return "".join(out)


def endpoint_rows(table):
    rows = []
    for r in table[2]:
        ep, use = r[0], r[1] if len(r) > 1 else ""
        bits = []
        has_method = re.search(r"\b(GET|POST|PATCH|PUT|DELETE)\b", ep)
        if not has_method:
            bits.append('<span class="method get">Several</span>')
        for s in [x.strip() for x in plain(ep).split(",") if x.strip()]:
            m = re.match(r"^(GET|POST|PATCH|PUT|DELETE)\s+(\S+)$", s)
            if m:
                cls = {"GET": "get", "DELETE": "del"}.get(m.group(1), "")
                bits.append('<span class="method %s">%s</span><code>%s</code>' % (cls, m.group(1), esc(m.group(2))))
            else:
                bits.append("<code>%s</code>" % esc(s))
        rows.append('<div class="ep"><div class="path">%s</div><div>%s</div></div>' % ("".join(bits), inline(use)))
    return '<div class="card"><div class="rows">%s</div></div>' % "".join(rows)


def tech_interfaces(ctx, sec):
    out = [lead(sec["blocks"])]
    for sub in sec["subs"]:
        name = split_num(sub["title"])[1].lower()
        if name == "server endpoints":
            t = first_table(sub["blocks"])
            inner = lead(sub["blocks"]) + (endpoint_rows(t) if t else "")
        elif name == "conversation connector":
            inner = lead(sub["blocks"]) + label_cards([b for b in sub["blocks"] if b[0] == "list"])
        elif name == "ai connector jobs":
            parts = []
            seen_table = False
            for b in sub["blocks"]:
                if b[0] == "table":
                    parts.append(table_cards([b]))
                    seen_table = True
                elif b[0] == "p":
                    parts.append('<div class="callout info"><p>%s</p></div>' % inline(b[1]) if seen_table else lead([b]))
                else:
                    parts.append(render_blocks([b]))
            inner = "".join(parts)
        else:
            inner = lead(sub["blocks"]) + generic([b for b in sub["blocks"] if b[0] != "p"])
        out.append(subsection(ctx, sub["title"], inner))
    return "".join(out)


def tech_security(ctx, sec):
    cards = []
    for sub in sec["subs"]:
        lis = []
        for it in first_list(sub["blocks"]):
            key = re.search(r"\bnever\b|\bonly\b", it["text"], re.I)
            lis.append('<li%s>%s</li>' % (' class="key-li"' if key else "", li_inner(it)))
        sid = ctx.uid("tech-" + slug(sub["title"]))
        cards.append('<div class="card" id="%s"><h3>%s</h3><ul>%s</ul></div>' % (sid, inline(sub["title"], refs=False), "".join(lis)))
    return lead(sec["blocks"]) + '<div class="masonry">%s</div>' % "".join(cards)


def tech_cost(sec):
    out = []
    tables = [b for b in sec["blocks"] if b[0] == "table"]
    for b in sec["blocks"]:
        if b[0] == "table" and tables and b is tables[-1] and plain(b[1][0]).lower().startswith("budget"):
            header, rows = b[1], b[2]
            cards = []
            for r in rows:
                chosen = "(chosen)" in r[0]
                name = r[0].replace("(chosen)", "").strip()
                chip = '<span class="chip ok">Chosen</span>' if chosen else ""
                dl = "".join("<dt>%s</dt><dd>%s</dd>" % (inline(h), inline(c)) for h, c in zip(header[1:], r[1:]))
                cls = "card chosen" if chosen else "card"
                cards.append('<div class="%s"><div class="comp-head"><h3>%s</h3>%s</div><dl class="deflist">%s</dl></div>' % (cls, inline(name), chip, dl))
            out.append('<div class="grid wide">%s</div>' % "".join(cards))
        elif b[0] == "table":
            out.append(render_table(b[1], b[2]))
        elif b[0] == "p":
            out.append("<p>%s</p>" % inline(b[1]))
        else:
            out.append(render_blocks([b]))
    return '<div class="stack">%s</div>' % "".join(out)


def tech_risks(sec):
    out = []
    for b in sec["blocks"]:
        if b[0] == "p":
            out.append(lead([b]))
        elif b[0] == "table":
            rows = b[2]
            def key(r):
                ph = r[4].strip() if len(r) > 4 else ""
                return (int(ph) if ph.isdigit() else 99, int(r[0]) if r[0].strip().isdigit() else 0)
            rows = sorted(rows, key=key)
            phases = []
            for r in rows:
                ph = r[4].strip()
                if ph not in phases:
                    phases.append(ph)
            label = lambda ph: ("Phase " + ph) if ph.isdigit() else "All phases"
            btns = ['<button type="button" data-value="all" aria-pressed="true">Every risk</button>']
            btns += ['<button type="button" data-value="%s" aria-pressed="false">%s</button>' % (attr(ph), esc(label(ph))) for ph in phases]
            cards = []
            for r in rows:
                num, risk, why, how, ph = (r + [""] * 5)[:5]
                cards.append('<article class="card risk" data-filter-value="%s"><div class="top"><span class="rn">Risk %s</span><span class="chip ok">%s</span></div>'
                             '<h4>%s</h4><p class="why">%s</p><div class="callout info"><span class="kicker">How to handle it</span><span>%s</span></div></article>' % (
                                 attr(ph.strip()), esc(num), esc(label(ph.strip())), inline(risk), inline(why), inline(how)))
            out.append('<div class="filters" data-target="risk-list" role="group" aria-label="Filter risks by phase">%s</div>'
                       '<div class="grid two" id="risk-list">%s</div>' % ("".join(btns), "".join(cards)))
    return "".join(out)


def tech_decisions(ctx, sec):
    out = [lead(sec["blocks"])]
    for sub in sec["subs"]:
        name = split_num(sub["title"])[1].lower()
        inner = decisions(sub["blocks"]) if name == "decisions" else questions(sub["blocks"])
        out.append(subsection(ctx, sub["title"], inner))
    return "".join(out)


def render_tech(doc, ctx):
    parts = [dochead("tech-spec.md", doc, preamble(doc["pre"]))]
    for sec in doc["sections"]:
        name = split_num(sec["title"])[1].lower()
        if name == "architecture overview":
            inner = tech_arch(ctx, sec)
        elif name == "technology choices":
            inner = tech_choices(sec)
        elif name == "data model":
            inner = tech_data(ctx, sec)
        elif name == "interfaces between parts":
            inner = tech_interfaces(ctx, sec)
        elif name == "system patterns":
            inner = numbered_card(sec["blocks"])
        elif name == "security":
            inner = tech_security(ctx, sec)
        elif name.startswith("hosting") or name.startswith("testing"):
            inner = label_cards(sec["blocks"])
        elif name == "cost estimate":
            inner = tech_cost(sec)
        elif name.startswith("critical risks"):
            inner = tech_risks(sec)
        elif name.startswith("decisions"):
            inner = tech_decisions(ctx, sec)
        elif name == "change log":
            inner = changelog(sec["blocks"])
        else:
            inner = generic(sec["blocks"])
        parts.append(section(ctx, sec["title"], inner))
    return "".join(parts)


# ---------------------------------------------------------------- plan

def split_group_blocks(blocks):
    tasks, rest = [], []
    hit = False
    for b in blocks:
        if not hit and b[0] == "p" and BOLD_ONLY_RE.match(b[1].strip()):
            hit = True
        (rest if hit else tasks).append(b)
    return tasks, rest


def manual_checks(title, table):
    cards = []
    for k, r in enumerate(table[2], 1):
        cards.append('<li class="card check"><div class="top"><span class="chip">Step %d</span></div><p class="do">%s</p>'
                     '<div class="expected"><span class="k">Expected</span><span>%s</span></div></li>' % (k, inline(r[0]), inline(r[1] if len(r) > 1 else "")))
    return '<div class="stack"><h3 class="tail-h">%s</h3><ol class="grid two plain-list">%s</ol></div>' % (inline(title), "".join(cards))


def gate_cards(title, table):
    header = table[1]
    cards = []
    for r in table[2]:
        dl = "".join("<dt>%s</dt><dd>%s</dd>" % (inline(h), inline(c)) for h, c in zip(header[1:], r[1:]))
        cards.append('<div class="card gate"><p class="q">%s</p><dl class="pass">%s</dl></div>' % (inline(r[0]), dl))
    return '<div class="stack"><h3 class="tail-h">%s</h3><div class="grid two">%s</div></div>' % (inline(title), "".join(cards))


def plan_tail(blocks):
    out = []
    i = 0
    while i < len(blocks):
        b = blocks[i]
        nxt = blocks[i + 1] if i + 1 < len(blocks) else None
        if b[0] == "p" and BOLD_ONLY_RE.match(b[1].strip()) and nxt is not None:
            title = b[1].strip()[2:-2]
            if nxt[0] == "list":
                out.append('<div class="card"><h3>%s</h3>%s</div>' % (inline(title), iconlist(nxt[1])))
                i += 2
                continue
            if nxt[0] == "table":
                low = title.lower()
                if low.startswith("manual"):
                    out.append(manual_checks(title, nxt))
                elif "gate" in low:
                    out.append(gate_cards(title, nxt))
                else:
                    out.append('<div class="stack"><h3 class="tail-h">%s</h3>%s</div>' % (inline(title), render_table(nxt[1], nxt[2])))
                i += 2
                continue
        out.append(render_blocks([b]))
        i += 1
    return "".join(out)


def plan_phase(ctx, sec, num, title):
    sid = "plan-phase-%s" % num
    ctx.ids.add(sid)
    ctx.toc.append((sid, "Phase %s: %s" % (num, plain(title)), 1))
    goal = ""
    for b in sec["blocks"]:
        if b[0] == "p":
            m = re.match(r"^\*\*Goal:\*\*\s*(.*)$", b[1])
            if m:
                goal = m.group(1)
    groups, tail = [], []
    for gi, sub in enumerate(sec["subs"]):
        task_blocks, rest = split_group_blocks(sub["blocks"])
        tail.extend(rest)
        gm = re.match(r"^(\d+[a-z])\.\s*(.*)$", sub["title"])
        gid, gname = (gm.group(1), gm.group(2)) if gm else ("%s%s" % (num, chr(97 + gi)), sub["title"])
        items = [it for b in task_blocks if b[0] == "list" for it in b[1]]
        lis = []
        for ti, it in enumerate(items, 1):
            tid = "p%s-%02d" % (gid, ti)
            text = it["text"]
            you = ""
            ym = re.match(r"^\*\*You:\*\*\s*(.*)$", text)
            if ym:
                text = ym.group(1)
                you = '<span class="you">You</span> '
            done = bool(it["checked"])
            lis.append(
                '<li class="task%s" id="%s" data-id="%s" data-md-done="%s" data-text="%s">'
                '<input type="checkbox" disabled%s aria-label="%s">'
                '<div class="tbody"><div class="tline"><span class="ttext">%s%s</span><span class="tid">%s</span></div>'
                '<span class="twhen" hidden></span><div class="tnote" hidden></div></div></li>' % (
                    " is-done" if done else "", tid, tid, "1" if done else "0", attr(plain(it["text"])),
                    " checked" if done else "", attr("Mark done: " + plain(text)[:80]), you, inline(text), tid))
        ctx.ids.add("plan-" + gid)
        groups.append('<div class="card group" id="plan-%s"><div class="group-head"><h3><span class="gid">%s</span>%s</h3></div><ul class="tasks">%s</ul></div>' % (
            gid, gid, inline(gname, refs=False), "".join(lis)))
    head = ('<div class="card goal"><p>%s</p><span class="chip" data-phase-status="%s" data-state="Not started">Not started</span></div>' % (inline(goal), num))
    return ('<section class="sec phase" id="%s" data-phase="%s" data-title="%s"><h2><span class="num">Phase %s</span><span>%s</span></h2>%s%s%s</section>' % (
        sid, num, attr("Phase %s: %s" % (num, plain(title))), num, inline(title, refs=False), head, "".join(groups), plan_tail(tail)))


def plan_summary(ctx, sec, phases):
    sid = ctx.uid("plan-summary")
    ctx.toc.append((sid, "Summary", 1))
    facts, how, table = [], None, None
    blocks = sec["blocks"]
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if b[0] == "list" and not facts:
            for it in b[1]:
                m = LABEL_RE.match(it["text"])
                if m:
                    facts.append((m.group(1).rstrip(":"), m.group(2)))
        elif b[0] == "p" and BOLD_ONLY_RE.match(b[1].strip()) and i + 1 < len(blocks) and blocks[i + 1][0] == "list":
            how = (b[1].strip()[2:-2], blocks[i + 1][1])
            i += 1
        elif b[0] == "table":
            table = b
        i += 1
    circ = 2 * 3.14159265 * 54
    ring = ('<div class="ring"><svg viewBox="0 0 128 128" aria-hidden="true"><circle class="track" cx="64" cy="64" r="54"></circle>'
            '<circle class="val" id="hero-ring" cx="64" cy="64" r="54" stroke-dasharray="%.2f" stroke-dashoffset="%.2f"></circle></svg>'
            '<div class="pct" id="hero-pct">0%%<small>done</small></div></div>') % (circ, circ)
    fact_rows = "".join("<dt>%s</dt><dd>%s</dd>" % (esc(k), inline(v)) for k, v in facts)
    hero = ('<div class="card hero">%s<div class="facts"><div class="kicker">Now</div><a class="now" id="hero-phase" href="#plan-phase-0">Phase 0</a>'
            '<div class="bar" aria-hidden="true"><i id="hero-bar"></i></div><div class="muted small" id="hero-count">0 tasks done</div>'
            '<div class="stack tight"><div class="kicker">Next open task</div><a id="hero-next" href="#plan-phase-0">Loading</a></div>'
            '<div class="tick-status" id="tick-status" data-live="0" aria-live="polite"><span class="dot"></span><span class="txt">Showing the plan as written.</span></div>'
            '<dl class="deflist">%s</dl></div></div>') % (ring, fact_rows)
    how_html = '<div class="callout info"><div class="title">%s</div>%s</div>' % (esc(how[0]), render_list(how[1])) if how else ""
    cards = []
    if table:
        for r in table[2]:
            ph, goal, groups_txt = r[0].strip(), r[1], r[2] if len(r) > 2 else ""
            title = phases.get(ph, "Phase " + ph)
            cards.append('<div class="card phase-card"><div class="top"><span class="kicker">Phase %s</span>'
                         '<span class="chip" data-phase-status="%s" data-state="Not started">Not started</span></div>'
                         '<a href="#plan-phase-%s"><h4>%s</h4></a><p class="muted small">%s</p>'
                         '<div class="bar" aria-hidden="true"><i data-phase-bar="%s"></i></div>'
                         '<div class="count"><span data-phase-count="%s">0 tasks</span>, groups %s</div></div>' % (
                             esc(ph), esc(ph), esc(ph), esc(title), inline(goal), esc(ph), esc(ph), inline(groups_txt)))
    grid = '<div class="grid">%s</div>' % "".join(cards)
    return '<section class="sec" id="%s"><h2><span>Summary</span></h2>%s%s%s</section>' % (sid, hero, grid, how_html)


def render_plan(doc, ctx):
    phases = {}
    for sec in doc["sections"]:
        m = re.match(r"^Phase (\d+):\s*(.*)$", sec["title"])
        if m:
            phases[m.group(1)] = m.group(2)
    head = ('<header class="dochead"><div class="file">docs/progress.md</div><div class="head-meta"><h1>Progress</h1></div>'
            '<dl class="meta"><dt>Owner</dt><dd>%s</dd><dt>Ticks</dt><dd>Saved on this page, so Claude can check tasks off without a rebuild</dd></dl></header>') % esc(OWNER)
    parts = [head]
    for sec in doc["sections"]:
        if sec["title"].lower() == "summary":
            parts.append(plan_summary(ctx, sec, phases))
            continue
        m = re.match(r"^Phase (\d+):\s*(.*)$", sec["title"])
        if m:
            parts.append(plan_phase(ctx, sec, m.group(1), m.group(2)))
        else:
            parts.append(section(ctx, sec["title"], iconlist_card(sec["blocks"]) if first_list(sec["blocks"]) else generic(sec["blocks"])))
    return "".join(parts)


# ---------------------------------------------------------------- page

MOCK = """<script>
(function () {
  var store = new Map([["p0a-01", {done: true, done_at: "2026-10-18T09:00:00Z", text: "Mock tick", by: "claude", note: "Local test tick from the mock store."}]]);
  var listeners = [];
  function snap() {
    var docs = [];
    store.forEach(function (v, k) { docs.push({id: k, exists: true, data: function () { return v; }, metadata: {fromCache: false, hasPendingWrites: false}}); });
    return {docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: {fromCache: false, hasPendingWrites: false}};
  }
  function emit() { var s = snap(); listeners.forEach(function (f) { f(s); }); }
  var coll = {
    limit: function () { return coll; },
    onSnapshot: function (next) { listeners.push(next); setTimeout(function () { next(snap()); }, 30); return function () {}; },
    doc: function (id) { return {
      set: function (d) { store.set(id, d); emit(); return Promise.resolve(); },
      update: function (d) { store.set(id, Object.assign({}, store.get(id), d)); emit(); return Promise.resolve(); }
    }; }
  };
  var db = {collection: function () { return coll; }};
  var user = {canEdit: function () { return Promise.resolve(true); }, id: function () { return Promise.resolve("u_test"); }};
  window.claude = {use: function (name) { return new Promise(function (res) { setTimeout(function () { res(name === "db" ? db : (name === "user" ? user : null)); }, 60); }); }};
})();
</script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
<script>mermaid.initialize({startOnLoad: false}); window.addEventListener("load", function () { mermaid.run({querySelector: "pre.mermaid"}); });</script>
"""

SKELETON_RESET = ("<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
                  "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>")


def build(test=False):
    docs = {k: parse_doc((DOCS / f).read_text(encoding="utf-8")) for k, f, _, _ in TABS}
    reqs = re.findall(r"\*\*R(\d+) ", (DOCS / "product-spec.md").read_text(encoding="utf-8"))
    checks = re.findall(r"^\| S(\d+) \|", (DOCS / "product-spec.md").read_text(encoding="utf-8"), re.M)
    LIMITS["R"] = max(int(x) for x in reqs) if reqs else 0
    LIMITS["S"] = max(int(x) for x in checks) if checks else 0

    ctxs = {k: Ctx(k) for k, _, _, _ in TABS}
    bodies = {
        "product": render_product(docs["product"], ctxs["product"]),
        "design": render_design(docs["design"], ctxs["design"]),
        "tech": render_tech(docs["tech"], ctxs["tech"]),
        "plan": render_plan(docs["plan"], ctxs["plan"]),
    }

    # header: project name, core value line, status pills
    overview = next(s for s in docs["product"]["sections"] if split_num(s["title"])[1].lower() == "overview")
    first = next(b[1] for b in overview["blocks"] if b[0] == "p")
    value = LABEL_RE.match(first).group(2) if LABEL_RE.match(first) else first
    value = re.split(r"(?<=\.)\s", value, maxsplit=1)[0]
    pills, agreed, dates = [], 0, []
    for key, fname, label, _ in TABS[:3]:
        state, version, date = status_of(docs[key]["meta"])
        if state.lower() == "agreed":
            agreed += 1
        for k, v in docs[key]["meta"]:
            if k.lower() == "last updated":
                dates.append(v)
        pills.append('<a class="chip pill %s" href="#%s"><span class="dot"></span>%s %s %s</a>' % (
            "ok" if state.lower() == "agreed" else "draft", key, esc(label), esc(state.lower()), esc(version)))
    summary_line = "All three specs agreed" if agreed == 3 else "%d of 3 specs agreed" % agreed
    updated = dates[0] if dates else ""
    header = ('<header class="site-head"><div class="wrap"><div class="eyebrow">Project Memory</div>'
              '<h1 class="site-title">AI Personal Stylist</h1><p class="site-value">%s</p>'
              '<div class="head-meta"><span class="chip pill %s"><span class="dot"></span>%s</span>%s'
              '<span class="by">Owner %s. Updated %s.</span></div></div></header>') % (
        inline(value), "ok" if agreed == 3 else "draft", esc(summary_line), "".join(pills), esc(OWNER), esc(updated))

    tabbar = ['<nav class="tabbar" aria-label="Documents"><div class="wrap"><div class="seg" role="tablist">']
    for k, (key, fname, long_label, short) in enumerate(TABS):
        tabbar.append('<a class="tab" role="tab" id="tab-%s" href="#%s" data-tab="%s" aria-controls="panel-%s" aria-selected="%s" tabindex="%d">'
                      '<span class="long">%s</span><span class="short">%s</span></a>' % (
                          key, key, key, key, "true" if k == 0 else "false", 0 if k == 0 else -1, esc(long_label), esc(short)))
    tabbar.append("</div></div></nav>")

    panels = ['<div class="panels">']
    for k, (key, fname, long_label, short) in enumerate(TABS):
        rail, chips = toc_html(ctxs[key])
        on = k == 0
        panels.append('<div class="panel%s" id="panel-%s" role="tabpanel" aria-labelledby="tab-%s" aria-hidden="%s"%s>'
                      '<div class="wrap layout">%s<article class="main">%s%s</article></div></div>' % (
                          " is-active" if on else "", key, key, "false" if on else "true", "" if on else " inert",
                          rail, chips, bodies[key]))
    panels.append("</div>")

    foot = ('<footer class="site-foot"><div class="wrap"><span>Built from docs/product-spec.md, docs/design.md, docs/tech-spec.md and docs/progress.md.</span>'
            '<span>Rebuild with <code>python3 tools/memory-site/build.py</code> after the docs change. docs/mvp.md and interview-notes.md stay in the repository.</span></div></footer>')

    css = (HERE / "site.css").read_text(encoding="utf-8")
    js = (HERE / "site.js").read_text(encoding="utf-8")
    fonts = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
             '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&amp;family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&amp;display=swap">')
    top = '<title>AI Personal Stylist Memory</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + fonts + "\n<style>\n" + css + "\n</style>\n"
    body = header + "".join(tabbar) + "".join(panels) + foot
    script = "<script>\n" + js + "\n</script>\n"

    DIST.mkdir(parents=True, exist_ok=True)
    (DIST / "memory-site.html").write_text(top + body + "\n" + script, encoding="utf-8")
    if test:
        doc = ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
               + SKELETON_RESET + "</head><body>" + top + body + MOCK + script + "</body></html>")
        (DIST / "test.html").write_text(doc, encoding="utf-8")
    counts = {k: len(ctxs[k].toc) for k in ctxs}
    tasks = len(re.findall(r'<li class="task', bodies["plan"]))
    print("built %s (%d KB); sections per tab %s; %d plan tasks" % (
        DIST / "memory-site.html", (DIST / "memory-site.html").stat().st_size // 1024, counts, tasks))


if __name__ == "__main__":
    build(test="--test" in sys.argv)
