#!/usr/bin/env python3
"""
Simple wiki link & anchor validator for docs/wiki
Run from repo root: python3 docs/wiki/validate_wiki_links.py
"""
import os
import re
import sys
from pathlib import Path
import urllib.parse

BASE = Path(__file__).parent

md_files = [p for p in sorted(BASE.iterdir()) if p.suffix == '.md']

link_re = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
heading_re = re.compile(r"^#{1,6}\s+(.*)$")

def make_anchors(text):
    text = text.strip()
    s = text.lower()
    # variant set
    anchors = set()

    # helper: remove all chars except alnum, space, hyphen
    def strip_keep_space(t):
        t = t.replace('&', '')
        return ''.join(ch for ch in t if ch.isalnum() or ch == ' ' or ch == '-')

    # helper: replace dashes (en/em) with hyphen then strip
    def replace_dash_then_strip(t):
        t = t.replace('\u2013', '-').replace('\u2014', '-')
        t = t.replace('&', '')
        return ''.join(ch for ch in t if ch.isalnum() or ch == ' ' or ch == '-')

    # variant A: remove punctuation, collapse spaces -> hyphens
    a = strip_keep_space(s)
    a = re.sub(r"\s+", '-', a.strip())
    a = a.strip('-')
    anchors.add(a)

    # variant B: replace en/em dash with hyphen first (preserve adjacent hyphens)
    b = replace_dash_then_strip(s)
    b = re.sub(r"\s+", '-', b.strip())
    b = b.strip('-')
    anchors.add(b)

    # variant C: replace any non-alnum with hyphen, keep consecutive hyphens
    c = re.sub(r"[^a-z0-9]", '-', s)
    c = c.strip('-')
    anchors.add(c)

    # variant D: collapse multiple hyphens in C to single
    d = re.sub(r"-+", '-', c)
    anchors.add(d)

    return anchors

# read files and build heading anchors
file_headings = {}
for p in md_files:
    text = p.read_text(encoding='utf-8')
    headings = []
    for line in text.splitlines():
        m = heading_re.match(line)
        if m:
            heading_text = m.group(1).strip()
            headings.append(heading_text)
    anchors = set()
    for h in headings:
        anchors.update(make_anchors(h))
    file_headings[p.name] = {
        'headings': headings,
        'anchors': anchors,
        'text': text,
    }

# scan links
missing_files = []
missing_anchors = []
external_links = []
all_links = []

for p in md_files:
    text = file_headings[p.name]['text']
    for m in link_re.finditer(text):
        label, dest = m.group(1), m.group(2)
        all_links.append((p.name, label, dest))
        # ignore external
        if dest.startswith('http://') or dest.startswith('https://') or dest.startswith('mailto:') or dest.startswith('//'):
            external_links.append((p.name, label, dest))
            continue
        # anchor-only (same-file)
        if dest.startswith('#'):
            anchor = dest.lstrip('#')
            anchor = urllib.parse.unquote(anchor)
            if anchor not in file_headings[p.name]['anchors']:
                missing_anchors.append((p.name, p.name, anchor))
            continue
        # split file and anchor
        if '#' in dest:
            fname, anchor = dest.split('#', 1)
            anchor = urllib.parse.unquote(anchor)
        else:
            fname, anchor = dest, None
        # normalize path
        target = os.path.normpath(os.path.join(str(BASE), fname))
        target_name = os.path.basename(target)
        if not os.path.exists(target):
            missing_files.append((p.name, fname))
            continue
        if anchor:
            if anchor not in file_headings[target_name]['anchors']:
                missing_anchors.append((p.name, target_name, anchor))

# inbound link counts
inbound = {p.name:0 for p in md_files}
for src, label, dest in all_links:
    if dest.startswith('http') or dest.startswith('//') or dest.startswith('mailto:'):
        continue
    if dest.startswith('#'):
        inbound[src] += 0
        continue
    fname = dest.split('#',1)[0]
    target = os.path.normpath(os.path.join(str(BASE), fname))
    if os.path.exists(target):
        inbound[os.path.basename(target)] += 1

# orphan pages (no inbound except Home.md)
orphans = [name for name,count in inbound.items() if count==0 and name.lower()!='home.md']

# print report
print('Wiki Link Validation Report')
print('Files scanned:', len(md_files))
print('Total links found:', len(all_links))
print('External links (ignored):', len(external_links))
print('Missing files:', len(missing_files))
print('Missing anchors:', len(missing_anchors))
print()
if missing_files:
    print('Missing files:')
    for src, fname in missing_files:
        print(f' - {src} → {fname}')
    print()
if missing_anchors:
    print('Missing anchors:')
    for src, target, anchor in missing_anchors:
        print(f' - {src} → {target}#{anchor}')
    print()
print('Orphan pages (no inbound links):')
for o in sorted(orphans):
    print(' -', o)

# exit code
if missing_files or missing_anchors:
    sys.exit(2)
else:
    sys.exit(0)
