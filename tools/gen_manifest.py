#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成公告清单 cloud/manifest.json + APK 内置公告 app/assets/game/notice-data.js

架构（全冷更新 + 只有公告可热更新）：
  - 游戏本体（脚本/音乐/背景/视频/页面）全部写死在 APK 里，每次更新下发完整安装包；
  - 公告（版本号、更新内容、修复项、历史版本）单独走清单：
      * 冷更新：notice-data.js 随 APK 打包，离线也能看历史公告；
      * 热更新：启动时拉 cloud/manifest.json，比 APK 内置版本新就弹公告并刷新历史。

用法：
  python3 tools/gen_manifest.py --version-name 2.5.18 --apk-url https://... --add "..." --fix "..."
  版本号默认在旧清单基础上 +1；也可以显式 --version-code N。
"""
import argparse
import datetime
import hashlib
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MANIFEST = os.path.join(ROOT, 'cloud', 'manifest.json')
DEFAULT_SEED = os.path.join(ROOT, 'cloud', 'notice-history.json')
NOTICE_JS = os.path.join(ROOT, 'app', 'assets', 'game', 'notice-data.js')
ASSETS = os.path.join(ROOT, 'app', 'assets')

FORBIDDEN = ('作弊码', '作 弊 码')
HISTORY_MAX = 200          # 历史公告保留条数（远大于实际版本数，等于全量保留）
SKIP_HASH = {'game/notice-data.js'}


def _has_forbidden(t):
    return any(f in t for f in FORBIDDEN)


def notice_filter(items, allow_split=False):
    """凡提及「作弊码」的条目一律屏蔽不显示。

    正文条目含禁词 -> 整条删除；标题类条目（' + ' 并列）允许拆段，
    丢掉含禁词的段、保留其余，避免整版更新记录因一个词全部消失。
    """
    out = []
    for raw in items or []:
        t = (raw or '').strip()
        if not t:
            continue
        if not _has_forbidden(t):
            out.append(t)
            continue
        if allow_split and ' + ' in t:
            keep = [p.strip() for p in t.split(' + ')]
            keep = [p for p in keep if p and not _has_forbidden(p) and len(p) >= 2]
            if keep:
                out.append(' + '.join(keep))
    return out


def load_json(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def scan_assets_hash(root):
    """对 app/assets 全部文件算一份汇总指纹，供发版脚本判断「是否需要发新版」。"""
    items = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith('_') and d != '.git')
        for fn in sorted(filenames):
            if fn.startswith('_') or fn.endswith('.map'):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace(os.sep, '/')
            if rel in SKIP_HASH:
                continue
            h = hashlib.md5()
            with open(full, 'rb') as f:
                for chunk in iter(lambda: f.read(1 << 20), b''):
                    h.update(chunk)
            items.append(rel + ':' + h.hexdigest())
    digest = hashlib.md5('\n'.join(items).encode('utf-8')).hexdigest()
    return digest, len(items)


def merge_history(seed, old_history, new_entry):
    """新版本条目 + 种子历史 + 旧清单历史，按 versionCode 去重降序。"""
    by_vc = {}
    for src in (old_history or []):
        if isinstance(src, dict) and src.get('versionCode') is not None:
            by_vc[int(src['versionCode'])] = src
    for src in (seed or []):
        if isinstance(src, dict) and src.get('versionCode') is not None:
            by_vc.setdefault(int(src['versionCode']), src)
    if new_entry:
        by_vc[int(new_entry['versionCode'])] = new_entry
    out = [by_vc[k] for k in sorted(by_vc, reverse=True)]
    # 禁词二次清洗（防止手工编辑过的种子/旧清单带进来）
    clean = []
    for e in out:
        add = notice_filter(e.get('add'), allow_split=True)
        fix = notice_filter(e.get('fix'))
        if not add and not fix:
            continue
        clean.append({
            'versionCode': int(e['versionCode']),
            'versionName': str(e.get('versionName', '')),
            'date': e.get('date', ''),
            'add': add,
            'fix': fix,
        })
    return clean[:HISTORY_MAX]


def build_notice_js(data):
    return (
        '/* 由 tools/gen_manifest.py 自动生成，请勿手改。\n'
        '   作用：把公告与历史版本内置进 APK（冷更新），随安装包一起下发。*/\n'
        'window.__MOW_NOTICE__ = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n'
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', default=DEFAULT_MANIFEST)
    ap.add_argument('--seed', default=DEFAULT_SEED)
    ap.add_argument('--version-code', type=int, default=None, help='版本号；默认旧清单 +1')
    ap.add_argument('--version-name', default=None, help='版本名；默认在旧版本名末段 +1')
    ap.add_argument('--apk-url', default=None)
    ap.add_argument('--apk', default=None, help='APK 文件路径，用于记录 size/sha256')
    ap.add_argument('--date', default=None, help='发布日期 YYYY-MM-DD，默认今天')
    ap.add_argument('--add', action='append', default=[], help='本版新增/改动，可多次传入')
    ap.add_argument('--fix', action='append', default=[], help='本版修复，可多次传入')
    ap.add_argument('--no-bump', action='store_true', help='不新增版本条目，只刷新历史与内置公告')
    a = ap.parse_args()

    old = load_json(a.manifest, {})
    old_vc = int(old.get('versionCode') or 0)
    old_vn = str(old.get('versionName') or '0.0.0')

    if a.version_code is not None:
        vc = a.version_code
    elif a.no_bump:
        vc = old_vc
    else:
        vc = old_vc + 1
    if a.version_name:
        vn = a.version_name
    elif a.no_bump:
        vn = old_vn
    else:
        parts = old_vn.split('.')
        try:
            parts[-1] = str(int(parts[-1]) + 1)
        except ValueError:
            parts.append(str(vc))
        vn = '.'.join(parts)

    apk_url = a.apk_url or old.get('apkUrl') or ''
    apk_size = int(old.get('apkSize') or 0)
    apk_sha = str(old.get('apkSha256') or '')
    if a.apk and os.path.exists(a.apk):
        apk_size = os.path.getsize(a.apk)
        h = hashlib.sha256()
        with open(a.apk, 'rb') as f:
            for chunk in iter(lambda: f.read(1 << 20), b''):
                h.update(chunk)
        apk_sha = h.hexdigest()

    add = notice_filter(a.add, allow_split=True)
    fix = notice_filter(a.fix)
    if not add and not fix and not a.no_bump:
        # 没写公告时沿用旧清单当前公告，保证公告面板不为空
        add = notice_filter(old.get('notice', {}).get('add'), allow_split=True)
        fix = notice_filter(old.get('notice', {}).get('fix'))

    date = a.date or datetime.date.today().isoformat()
    seed = load_json(a.seed, [])
    new_entry = None
    if not a.no_bump and (add or fix):
        new_entry = {
            'versionCode': vc,
            'versionName': vn,
            'date': date,
            'add': add,
            'fix': fix,
        }
    history = merge_history(seed, old.get('history'), new_entry)

    assets_hash, assets_count = scan_assets_hash(ASSETS)

    manifest = {
        'schema': 2,
        'versionCode': vc,
        'versionName': vn,
        'date': date,
        'apkUrl': apk_url,
        'apkSize': apk_size,
        'apkSha256': apk_sha,
        'assetsHash': assets_hash,
        'assetsCount': assets_count,
        'notice': {'add': add, 'fix': fix},
        'history': history,
    }
    os.makedirs(os.path.dirname(a.manifest), exist_ok=True)
    with open(a.manifest, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')

    embedded = {
        'versionCode': vc,
        'versionName': vn,
        'date': date,
        'apkUrl': apk_url,
        'notice': {'add': add, 'fix': fix},
        'history': history,
    }
    os.makedirs(os.path.dirname(NOTICE_JS), exist_ok=True)
    with open(NOTICE_JS, 'w', encoding='utf-8') as f:
        f.write(build_notice_js(embedded))

    print('清单已更新: %s' % a.manifest)
    print('  版本: v%s (versionCode=%d)  日期: %s' % (vn, vc, date))
    print('  公告: 新增 %d 条 / 修复 %d 条；历史共 %d 个版本' % (len(add), len(fix), len(history)))
    print('  资源: %d 个文件，指纹 %s' % (assets_count, assets_hash[:12]))
    print('  apkUrl: %s' % (apk_url or '(未设置)'))
    print('内置公告: %s' % NOTICE_JS)


if __name__ == '__main__':
    main()
