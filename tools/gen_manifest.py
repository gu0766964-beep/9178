#!/usr/bin/env python3
# 无尽割草 · 云端版本清单生成器
#
# 用法:
#   python3 tools/gen_manifest.py --root app/assets --out cloud/manifest.json --version 41
#
# 从 APK assets 目录扫描全部游戏资源，算 md5，输出 cloud/manifest.json
# 用于 cloud.js 做版本检测 + 文件热更。版本 code 从旧 manifest 自动 +1，
# 除非用 --version 参数显式指定。

import os
import sys
import json
import hashlib
import argparse
import glob

ROOT = None
OUT = 'cloud/manifest.json'
VERSION_CODE = 0
VERSION_NAME = ''
CDN = 'https://gitee.com/mow-survivor/survivor_raw/main/cloud/patch/'


def md5_file(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def scan(root):
    """把全部文件以相对路径为 key 扫描出来（只扫游戏资源，非资源不关心的不扫）"""
    out = {}
    for dp, _, names in os.walk(root):
        for n in names:
            p = os.path.join(dp, n)
            rel = os.path.relpath(p, root)
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
    p.add_argument('--versionName', default='2.5.0')
    p.add_argument('--cdn', default=CDN)
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
        VERSION_NAME = old.get('versionName', '2.5.0')
    if not VERSION_CODE:
        VERSION_CODE = 1

    files = scan(ROOT)

    manifest = {
        'versionCode': VERSION_CODE,
        'versionName': VERSION_NAME,
        'cdn': CDN,
        'files': files,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print('wrote %s (versionCode=%d, files=%d)' % (OUT, VERSION_CODE, len(files)))
    return manifest


if __name__ == '__main__':
    gen()
