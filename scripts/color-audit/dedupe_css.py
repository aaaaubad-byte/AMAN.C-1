#!/usr/bin/env python3
"""Last-wins CSS dedupe that edits text in place (keeps formatting).
For an identical (media-context, selector, property, !important) key, earlier declarations are dead
(same specificity, later wins), so they are removed. Result is cascade-equivalent.
Usage: dedupe_css.py <in.css> <out.css>   (prints removed declarations)"""
import re, sys

src = open(sys.argv[1], encoding="utf-8").read()
n = len(src)

def skip_ws_comments(i):
    while i < n:
        if src[i].isspace(): i += 1
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2); i = n if j < 0 else j + 2
        else: break
    return i

def find_block_end(i):
    """i = index of '{'; returns index after matching '}' (strings/comments aware)."""
    depth = 0
    while i < n:
        c = src[i]
        if c in "\"'":
            q = c; i += 1
            while i < n and src[i] != q:
                i += 2 if src[i] == "\\" else 1
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2); i = n if j < 0 else j + 1
        elif c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0: return i + 1
        i += 1
    return n

nodes = []  # flat list of rules: dict(sel, media, decls[(prop,val,imp,s,e)], rs, re_)
at_blocks = []  # (start, end, body_start, body_end) for @media wrappers

def parse(i, end, media):
    while True:
        i = skip_ws_comments(i)
        if i >= end: return
        if src[i] == "@":
            # at-rule
            j = i
            while j < end and src[j] not in "{;": j += 1
            if j >= end or src[j] == ";":
                i = j + 1; continue
            head = src[i:j].strip()
            be = find_block_end(j)
            if head.startswith(("@media", "@supports")):
                at_blocks.append((i, be, j + 1, be - 1))
                parse(j + 1, be - 1, media + " " + re.sub(r"\s+", " ", head))
            i = be; continue
        j = src.find("{", i)
        if j < 0 or j >= end: return
        sel = re.sub(r"\s+", " ", re.sub(r"/\*.*?\*/", "", src[i:j], flags=re.S)).strip()
        be = find_block_end(j)
        body_s, body_e = j + 1, be - 1
        decls = []
        k = body_s; depth = 0; start = body_s; q = None
        pos = body_s
        while pos <= body_e:
            c = src[pos] if pos < body_e else ";"
            if q:
                if c == "\\": pos += 1
                elif c == q: q = None
            elif c in "\"'": q = c
            elif src.startswith("/*", pos):
                e2 = src.find("*/", pos + 2); pos = e2 + 1 if e2 > 0 else body_e
            elif c == "(": depth += 1
            elif c == ")": depth -= 1
            elif c == ";" and depth == 0:
                chunk = src[start:pos]
                m = re.match(r"\s*([-\w]+)\s*:\s*(.*?)\s*$", chunk, flags=re.S)
                if m:
                    val = m.group(2)
                    imp = bool(re.search(r"!\s*important\s*$", val))
                    decls.append((m.group(1).lower(), val, imp, start, pos + 1 if pos < body_e else pos))
                start = pos + 1
            pos += 1
        nodes.append(dict(sel=sel, media=media.strip(), decls=decls, bs=body_s, be=body_e, rs=i, re=be))
        i = be

parse(0, n, "")

last = {}
for idx, nd in enumerate(nodes):
    for d in nd["decls"]:
        last[(nd["media"], nd["sel"], d[0], d[2])] = (idx, d[3])

removals = []  # (start, end)
report = []
for idx, nd in enumerate(nodes):
    for d in nd["decls"]:
        key = (nd["media"], nd["sel"], d[0], d[2])
        if last[key] != (idx, d[3]):
            removals.append((d[3], d[4]))
            report.append(f"{nd['media'] or '-'} | {nd['sel'][:70]} | {d[0]}:{d[1][:50]}")

removals.sort(reverse=True)
out = src
for s, e in removals:
    out = out[:s] + out[e:]

# drop now-empty rules, then empty @media wrappers (repeat until stable)
def strip_empty(text):
    changed = True
    while changed:
        changed = False
        # rule with whitespace/comments-only body
        m = re.search(r"(?m)^[ \t]*[^{}@/\n][^{}]*\{\s*\}[ \t]*\n?", text)
        if m:
            text = text[:m.start()] + text[m.end():]; changed = True; continue
        m = re.search(r"(?s)@media[^{]*\{\s*\}\s*\n?", text)
        if m:
            text = text[:m.start()] + text[m.end():]; changed = True
    return text

before_len = len(out)
out = strip_empty(out)
open(sys.argv[2], "w", encoding="utf-8").write(out)
print(f"removed {len(removals)} dead declarations; file {n} -> {len(out)} bytes")
open(sys.argv[2] + ".report.txt", "w", encoding="utf-8").write("\n".join(report))
