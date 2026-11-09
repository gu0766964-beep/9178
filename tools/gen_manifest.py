#!/usr/bin/env python3
# 无尽割草 · 云端版本清单生成器
#
# 用法:
#   python3 tools/gen_manifest.py --root app/assets --out cloud/manifest.json --version 41
#
# 从 APK assets 目录扫描全部游戏资源，算 md5，输出 cloud/manifest.json
# 用于 cloud.js 做版本检测 + 文件热更。版本 code 从旧 manifest 自动 +1，
# 除非用 --version 参数显式指定。
#
# 注意：音乐/视频等大媒体文件不上传云端，它们已内置在 APK 里。

import os
import sys
import json
import hashlib
import argparse

ROOT = None
OUT = 'cloud/manifest.json'
VERSION_CODE = 0
VERSION_NAME = ''
CDN = 'https://raw.githubusercontent.com/gu0766964-beep/9178/main/app/assets/'

def exclude_asset(rel_path):
    """不让大媒体文件上云：音乐/背景视频/音效。"""
    rel = rel_path.replace('\\', '/')
    if '/' in rel and rel.split('/')[1] in ('music', 'bg', 'audio'):
        return True
    for ext in ('.mp3', '.mp4', '.wav', '.ogg', '.wma', '.flac'):
        if rel_path.lower().endswith(ext):
            return True
    return False

def md5_file(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

def scan(root):
    """扫描 app/assets 下的游戏文件（排除音乐/视频等大媒体）。"""
    out = {}
    for dp, _, names in os.walk(root):
        for n in names:
            if n.startswith('_'):
                continue
            p = os.path.join(dp, n)
            rel = os.path.relpath(p, root)
            if exclude_asset(rel):
                continue
            out[rel] = {
                'size': os.path.getsize(p),
                'md5': md5_file(p),
                'url': CDN + rel,
            }
    return out

def gen():
    global ROOT, OUT, VERSION_CODE, VERSION_NAME, CDN
    p = argparse.ArgumentParser()
    p.add_argument('--root', default='app/assets')
    p.add_argument('--out', default='cloud/manifest.json')
    p.add_argument('--version', type=int, default=0)
    p.add_argument('--versionName', default='')
    p.add_argument('--cdn', default=CDN)
    p.add_argument('--apk-url', default='', help='新版 APK 下载地址（应用内检查更新后打开）')
    p.add_argument('--add', action='append', default=[], help='公告：本版新增内容（可多次传）')
    p.add_argument('--fix', action='append', default=[], help='公告：本版修复的问题（可多次传）')
    a = p.parse_args()

    ROOT = a.root
    OUT = a.out
    VERSION_CODE = a.version
    VERSION_NAME = a.versionName
    CDN = a.cdn

    old = None
    if os.path.exists(OUT):
        try:
            with open(OUT, 'r', encoding='utf-8') as f:
                old = json.load(f)
        except Exception:
            old = None

    if old and not VERSION_CODE:
        VERSION_CODE = old['versionCode'] + 1
    if not VERSION_NAME and old:
        VERSION_NAME = old.get('versionName', '')
    if not VERSION_CODE:
        VERSION_CODE = 1
    if not a.apk_url and old:
        a.apk_url = old.get('apkUrl', '')

    files = scan(ROOT)

    manifest = {
        'versionCode': VERSION_CODE,
        'versionName': VERSION_NAME,
        'cdn': CDN,
        'apkUrl': a.apk_url,
        'notice': {
            'add': a.add,
            'fix': a.fix,
        },
        'files': files,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print('wrote %s (versionCode=%d, files=%d)' % (OUT, VERSION_CODE, len(files)))
    return manifest

if __name__ == '__main__':
    gen()