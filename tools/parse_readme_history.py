#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 README 的「更新历史」段落生成 cloud/notice-history.json 种子数据。

README 是历史更新内容的人工维护源；本脚本只在新增历史版本时跑一次，
产出物 cloud/notice-history.json 由 gen_manifest.py 读取并入清单。

用法：python3 tools/parse_readme_history.py [--readme README.md] [--out cloud/notice-history.json]
"""
import argparse
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORBIDDEN = ('作弊码', '作 弊 码')

# 与已知打包记录对齐的版本码（其余按 README 顺序递减分配）
KNOWN_VC = {'2.5.17': 49, '2.5.16': 48, '2.5.15': 47, '2.5.14': 46, '2.5.13': 45}


def _has_forbidden(t):
    return any(f in t for f in FORBIDDEN)


def clean(items, allow_split=False):
    """过滤公告条目：凡提及「作弊码」的整条屏蔽。

    标题类条目（用 ' + ' 连接的并列特性）允许拆段：丢掉含禁词的段，
    保留其余段，避免整版更新内容因为一个词全部消失。
    """
    out = []
    for t in items:
        t = (t or '').strip()
        if not t:
            continue
        if not _has_forbidden(t):
            out.append(t)
            continue
        if allow_split and ' + ' in t:
            keep = [p.strip() for p in t.split(' + ') if p.strip() and not _has_forbidden(p)]
            keep = [p for p in keep if len(p) >= 2]
            if keep:
                out.append(' + '.join(keep))
        # 其它情况整条屏蔽
    return out


def parse(readme_text):
    lines = readme_text.split('\n')
    # 定位「更新历史」段落
    start = None
    for i, ln in enumerate(lines):
        if ln.strip().startswith('## ') and '更新历史' in ln:
            start = i + 1
            break
    if start is None:
        raise SystemExit('README 里找不到「更新历史」段落')
    end = len(lines)
    for i in range(start, len(lines)):
        if lines[i].strip() == '</details>':
            end = i
            break

    entries = []   # [{'versionName':..,'add':[..],'fix':[..]}]
    cur = None
    for i in range(start, end):
        ln = lines[i].rstrip()
        s = ln.strip()
        # ### v2.5.15 · 标题
        m = re.match(r'^###\s+v([0-9][0-9A-Za-z.\-–—]*)\s*(?:·\s*(.*))?$', s)
        if m:
            vn = m.group(1).strip()
            title = (m.group(2) or '').strip()
            cur = {'versionName': vn, 'add': [], 'fix': []}
            if title:
                cur['add'].append(('__TITLE__', title))
            entries.append(cur)
            continue
        # **v2.4.4** · 一句话
        m = re.match(r'^\*\*v([0-9][0-9A-Za-z.\-–—]*)\*\*\s*[·:：]\s*(.+)$', s)
        if m:
            vn = m.group(1).strip()
            entries.append({'versionName': vn, 'add': [m.group(2).strip()], 'fix': []})
            cur = None
            continue
        # - bullet
        if cur is not None and s.startswith('- '):
            cur['add'].append(s[2:].strip())
            continue
    # 过滤 + 去空
    out = []
    for e in entries:
        # 标题条允许拆段（丢弃含禁词的并列项），正文条整条屏蔽
        add = []
        for t in e['add']:
            if isinstance(t, tuple):
                add.extend(clean([t[1]], allow_split=True))
            else:
                add.extend(clean([t]))
        fix = clean(e['fix'])
        if not add and not fix:
            continue
        out.append({'versionName': e['versionName'], 'add': add, 'fix': fix})

    # 版本码：已知锚点优先，其余按出现顺序（新→旧）在锚点下方递减
    next_vc = 46
    for e in out:
        vn = e['versionName']
        if vn in KNOWN_VC:
            e['versionCode'] = KNOWN_VC[vn]
            next_vc = min(next_vc, KNOWN_VC[vn] - 1)
    for e in out:
        if 'versionCode' in e:
            continue
        e['versionCode'] = next_vc
        next_vc -= 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--readme', default=os.path.join(ROOT, 'README.md'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'cloud', 'notice-history.json'))
    a = ap.parse_args()

    with open(a.readme, encoding='utf-8') as f:
        text = f.read()
    hist = parse(text)

    # 合并已有种子里的条目（保留手工补充的 fix/date）
    old = {}
    if os.path.exists(a.out):
        try:
            with open(a.out, encoding='utf-8') as f:
                for h in json.load(f):
                    if h.get('versionName'):
                        old[h['versionName']] = h
        except Exception:
            old = {}
    for e in hist:
        o = old.get(e['versionName'])
        if o:
            if not e['add'] and o.get('add'):
                e['add'] = o['add']
            if not e['fix'] and o.get('fix'):
                e['fix'] = o['fix']
            if o.get('date'):
                e['date'] = o['date']

    hist.sort(key=lambda x: x.get('versionCode', 0), reverse=True)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(hist, f, ensure_ascii=False, indent=2)
    print('wrote %s (%d 条历史公告)' % (a.out, len(hist)))
    for h in hist[:8]:
        print('  v%s (vc=%s) +%d -%d' % (h['versionName'], h['versionCode'], len(h['add']), len(h['fix'])))


if __name__ == '__main__':
    main()
