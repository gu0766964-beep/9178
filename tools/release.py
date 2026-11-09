#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一键发版：把「改完游戏」变成「新版本已下发」。

做了什么（顺序即真实执行顺序）：
  1. 确认 app/assets 有改动（--force 可跳过）
  2. 生成本版公告（--add/--fix 优先；否则用最近一次提交说明/改动文件自动归纳）
  3. 版本号 +1，写云端清单 cloud/manifest.json 与 APK 内置公告 game/notice-data.js
  4. 打完整 APK（dist/survivor-<版本>.apk）
  5. 回填 APK 大小与 sha256
  6. git commit（代码 + 清单 + 内置公告）并 push
  7. 创建 GitHub Release 并上传 APK（下载地址在打包前已预写进公告，装包即可见）
  8. 校验云端清单可访问

用法：
  python3 tools/release.py                       # 全自动，公告取自最近提交
  python3 tools/release.py --add "新增 X" --fix "修复 Y"
  python3 tools/release.py --dry-run             # 只打印计划，不动仓库/网络
  python3 tools/release.py --resume              # Release 已建好但 APK 没传完，只补传
"""
import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'cloud', 'manifest.json')
NOTICE_JS = os.path.join(ROOT, 'app', 'assets', 'game', 'notice-data.js')
TOOLS = os.path.join(ROOT, 'tools')
ASSETS = os.path.join(ROOT, 'app', 'assets')
CDN_MANIFEST = 'https://raw.githubusercontent.com/gu0766964-beep/9178/main/cloud/manifest.json'
PY = sys.executable or 'python3'


def sh(cmd, cwd=ROOT, check=True):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise SystemExit('命令失败: %s\n%s\n%s' % (' '.join(cmd), p.stdout, p.stderr))
    return p


def git(*args, check=True):
    return sh(['git'] + list(args), check=check).stdout.strip()


def repo_info():
    url = git('config', '--get', 'remote.origin.url')
    m = re.match(r'https://([^:@/]+)(?::([^@/]+))?@github\.com/([^/]+)/([^/]+?)(?:\.git)?$', url)
    if m:
        user, token, owner, repo = m.group(1), m.group(2), m.group(3), m.group(4)
    else:
        m = re.match(r'https://github\.com/([^/]+)/([^/]+?)(?:\.git)?$', url)
        if not m:
            raise SystemExit('无法解析 remote.origin.url: %s' % url)
        token, owner, repo = os.environ.get('GITHUB_TOKEN', ''), m.group(1), m.group(2)
    token = token or os.environ.get('GITHUB_TOKEN', '')
    if not token:
        raise SystemExit('找不到 GitHub Token（remote 未内嵌，且未设置 GITHUB_TOKEN）')
    return owner, repo, token


def api(method, path, token, body=None, base='https://api.github.com'):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    req.add_header('Authorization', 'Bearer ' + token)
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('X-GitHub-Api-Version', '2022-11-28')
    req.add_header('User-Agent', 'mow-survivor-release')
    if data:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode('utf-8') or '{}')
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')[:500]
        if e.code == 404:
            return None
        raise SystemExit('GitHub API %s %s -> %s\n%s' % (method, path, e.code, detail))


def pending_changes():
    """相对 origin/main 的待推送改动：[(path, 'M'|'A'|'D')]。"""
    changes = []
    out = git('diff', '--name-status', 'origin/main', check=False)
    for line in out.splitlines():
        parts = line.split('\t')
        if len(parts) < 2:
            continue
        st = parts[0][:1]
        if st == 'R' and len(parts) >= 3:
            changes.append((parts[1], 'D'))
            changes.append((parts[2], 'A'))
        elif st == 'C' and len(parts) >= 3:
            changes.append((parts[2], 'A'))
        else:
            changes.append((parts[1], 'D' if st == 'D' else 'M'))
    for f in git('ls-files', '--others', '--exclude-standard', check=False).splitlines():
        if f.strip():
            changes.append((f.strip(), 'A'))
    return changes


def commit_via_api(owner, repo, token, base_sha, changes, msg):
    """github.com:443 不通时，用 Git Data API 把改动直接提交到 main。"""
    entries = []
    for path, st in changes:
        full = os.path.join(ROOT, path)
        if st == 'D' or not os.path.exists(full):
            entries.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': None})
            print('  删除 ' + path)
            continue
        with open(full, 'rb') as f:
            content = base64.b64encode(f.read()).decode('ascii')
        blob = api('POST', '/repos/%s/%s/git/blobs' % (owner, repo), token,
                   {'content': content, 'encoding': 'base64'})
        entries.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        print('  上传 %s (%d KB)' % (path, len(content) * 3 // 4 // 1024))
    base = api('GET', '/repos/%s/%s/git/commits/%s' % (owner, repo, base_sha), token)
    tree = api('POST', '/repos/%s/%s/git/trees' % (owner, repo), token,
               {'base_tree': base['tree']['sha'], 'tree': entries})
    commit = api('POST', '/repos/%s/%s/git/commits' % (owner, repo), token,
                 {'message': msg, 'tree': tree['sha'], 'parents': [base_sha]})
    api('PATCH', '/repos/%s/%s/git/refs/heads/main' % (owner, repo), token,
        {'sha': commit['sha'], 'force': False})
    return commit['sha']


def tag_via_api(owner, repo, token, tag, commit_sha, msg):
    t = api('POST', '/repos/%s/%s/git/tags' % (owner, repo), token,
            {'tag': tag, 'message': msg, 'object': commit_sha, 'type': 'commit'})
    ref = api('GET', '/repos/%s/%s/git/ref/tags/%s' % (owner, repo, tag), token)
    if ref:
        api('PATCH', '/repos/%s/%s/git/refs/tags/%s' % (owner, repo, tag), token,
            {'sha': t['sha'], 'force': True})
    else:
        api('POST', '/repos/%s/%s/git/refs' % (owner, repo), token,
            {'ref': 'refs/tags/' + tag, 'sha': t['sha']})


def upload_asset(owner, repo, release_id, token, apk_path):
    """流式上传 APK（160MB 级，避免整个读进内存）。"""
    name = os.path.basename(apk_path)
    size = os.path.getsize(apk_path)
    url = '/repos/%s/%s/releases/%s/assets?name=%s' % (owner, repo, release_id, urllib.parse.quote(name))
    req = urllib.request.Request('https://uploads.github.com' + url, method='POST')
    req.add_header('Authorization', 'Bearer ' + token)
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'mow-survivor-release')
    req.add_header('Content-Type', 'application/vnd.android.package-archive')
    req.add_header('Content-Length', str(size))
    print('上传 %s (%.1f MB) ...' % (name, size / 1048576.0))

    class Reader:
        def __init__(self, f, total):
            self.f, self.total, self.sent = f, total, 0
            self.last = 0

        def read(self, n=-1):
            chunk = self.f.read(n)
            self.sent += len(chunk)
            pct = int(self.sent * 100 / max(1, self.total))
            if pct >= self.last + 10:
                self.last = pct - (pct % 10)
                print('  %d%%' % pct, flush=True)
            return chunk

    with open(apk_path, 'rb') as f:
        req.data = None
        try:
            import http.client
            conn = http.client.HTTPSConnection('uploads.github.com', timeout=1800)
            conn.putrequest('POST', url)
            for k, v in req.header_items():
                conn.putheader(k, v)
            conn.endheaders()
            r = Reader(f, size)
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                conn.send(chunk)
            resp = conn.getresponse()
            raw = resp.read().decode('utf-8', 'replace')
            conn.close()
        except Exception as e:
            raise SystemExit('上传失败: %s' % e)
    if resp.status not in (200, 201):
        raise SystemExit('上传失败 HTTP %s: %s' % (resp.status, raw[:400]))
    data = json.loads(raw)
    print('上传完成: %s (%d bytes)' % (data.get('name'), data.get('size') or 0))
    return data


def changed_asset_files():
    """当前 app/assets 下相对仓库根的文件改动列表（只保留仍存在的文件）。"""
    out = git('status', '--porcelain', '--', 'app/assets', check=False)
    files = []
    for line in out.splitlines():
        if not line.strip():
            continue
        rest = line[2:].strip()
        if ' -> ' in rest:          # 重命名条目取新路径
            rest = rest.split(' -> ')[-1].strip()
        if rest and os.path.exists(os.path.join(ROOT, rest)):
            files.append(rest)
    return files


def files_summary():
    files = changed_asset_files()
    if not files:
        return []
    groups = []
    names = [os.path.basename(f) for f in files]
    if any(f.endswith('index.html') for f in files):
        groups.append('界面与公告面板更新')
    js = [n for n in names if n.endswith('.js') and n != 'index.html']
    if js:
        groups.append('游戏逻辑更新（%s）' % '、'.join(sorted(set(js))[:4]))
    if any('/music/' in f for f in files):
        groups.append('音乐资源更新')
    if any('/bg/' in f for f in files):
        groups.append('背景资源更新')
    if not groups:
        groups.append('资源更新（%d 个文件）' % len(files))
    return groups


def collect_notes(explicit_add, explicit_fix):
    if explicit_add or explicit_fix:
        return explicit_add, explicit_fix
    dirty = bool(changed_asset_files())
    notes = files_summary() if dirty else []
    if not notes:
        subject = git('log', '-1', '--pretty=%s', check=False)
        body = git('log', '-1', '--pretty=%b', check=False)
        if subject:
            notes.append(subject.strip())
        for ln in body.splitlines():
            ln = ln.strip().lstrip('-*').strip()
            if ln and len(ln) > 2:
                notes.append(ln)
    if not notes:
        notes = ['稳定性与性能优化']
    return notes, []


def read_manifest():
    with open(MANIFEST, encoding='utf-8') as f:
        return json.load(f)


def run_tool(name, *args):
    print('  $ python3 tools/%s %s' % (name, ' '.join(args)))
    p = sh([PY, os.path.join(TOOLS, name)] + list(args))
    for line in (p.stdout or '').splitlines():
        print('    ' + line)
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--add', action='append', default=[])
    ap.add_argument('--fix', action='append', default=[])
    ap.add_argument('--version-name', default=None)
    ap.add_argument('--force', action='store_true', help='没有资源改动也发版')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--skip-build', action='store_true', help='复用 dist 里已有的 APK')
    ap.add_argument('--resume', action='store_true', help='只补传 APK 到已存在的 Release')
    ap.add_argument('--no-bump', action='store_true', help='保持当前版本号（补发/重打包同一版）')
    args = ap.parse_args()

    owner, repo, token = repo_info()
    old = read_manifest()
    old_vc, old_vn = int(old.get('versionCode') or 0), str(old.get('versionName') or '0.0.0')
    vc = old_vc if args.no_bump else old_vc + 1
    if args.version_name:
        vn = args.version_name
    elif args.no_bump:
        vn = old_vn
    else:
        parts = old_vn.split('.')
        try:
            parts[-1] = str(int(parts[-1]) + 1)
        except ValueError:
            parts.append(str(vc))
        vn = '.'.join(parts)
    tag = 'v' + vn
    apk_name = 'survivor-%s.apk' % vn
    apk_path = os.path.join(ROOT, 'dist', apk_name)
    apk_url = 'https://github.com/%s/%s/releases/download/%s/%s' % (owner, repo, tag, apk_name)

    print('仓库: %s/%s' % (owner, repo))
    print('版本: v%s (versionCode %d)   标签: %s' % (vn, vc, tag))
    print('安装包: dist/%s' % apk_name)
    print('下载地址: %s' % apk_url)

    # ---- 1. 变更检测 ----
    changed = changed_asset_files()
    if not changed and not args.force and not args.resume:
        print('\n[跳过] app/assets 没有改动。确实要发版请加 --force')
        return 0
    if changed:
        print('\n资源改动 %d 个:' % len(changed))
        for f in changed[:12]:
            print('  ' + f)
        if len(changed) > 12:
            print('  ... 共 %d 个' % len(changed))

    # ---- 2. 公告 ----
    add, fix = collect_notes(args.add, args.fix)
    print('\n本版公告 %d 新增 / %d 修复:' % (len(add), len(fix)))
    for t in add:
        print('  + ' + t)
    for t in fix:
        print('  - ' + t)

    if args.resume:
        return do_resume(owner, repo, token, tag, apk_path)

    if args.dry_run:
        print('\n[dry-run] 不写文件、不提交、不上传。')
        return 0

    # ---- 3. 清单 + 内置公告 ----
    print('\n[3/8] 生成清单与内置公告')
    gen_args = ['--version-code', str(vc), '--version-name', vn, '--apk-url', apk_url]
    for t in add:
        gen_args += ['--add', t]
    for t in fix:
        gen_args += ['--fix', t]
    run_tool('gen_manifest.py', *gen_args)

    # ---- 4. 打完整包 ----
    if args.skip_build and os.path.exists(apk_path):
        print('\n[4/8] 复用已有 APK: %s' % apk_path)
    else:
        print('\n[4/8] 打包完整 APK')
        run_tool('build_apk.py')
    if not os.path.exists(apk_path):
        raise SystemExit('APK 未生成: ' + apk_path)

    # ---- 5. 回填大小/sha256（内置公告不含这两项，APK 无需重打） ----
    print('\n[5/8] 回填 APK 元信息')
    run_tool('gen_manifest.py', '--no-bump', '--apk', apk_path)

    # ---- 6. 提交并推送 ----
    print('\n[6/8] 提交并推送')
    git('add', '-A')
    msg = 'release: v%s\n\n%s' % (vn, '\n'.join('- ' + t for t in (add + fix)))
    p = subprocess.run(['git', 'commit', '-m', msg], cwd=ROOT, capture_output=True, text=True)
    if p.returncode != 0:
        print('  ' + (p.stdout or p.stderr).strip()[:300])
    pushed = True
    try:
        git('push', 'origin', 'HEAD:main')
    except SystemExit:
        pushed = False
    if pushed:
        git('tag', '-f', tag)
        try:
            git('push', '-f', 'origin', tag)
        except SystemExit:
            pushed = False
    if not pushed:
        print('  git push 失败（github.com:443 不可达），改用 Git Data API 提交')
        ref = api('GET', '/repos/%s/%s/git/ref/heads/main' % (owner, repo), token)
        base_sha = ref['object']['sha']
        changes = pending_changes()
        if not changes:
            print('  [警告] 没有待推送改动，仅更新 tag')
            commit_sha = base_sha
        else:
            print('  待推送 %d 个文件' % len(changes))
            commit_sha = commit_via_api(owner, repo, token, base_sha, changes, msg)
        tag_via_api(owner, repo, token, tag, commit_sha, 'release: v%s' % vn)
        print('  已通过 API 提交: %s' % commit_sha[:12])

    # ---- 7. Release + 上传 APK ----
    print('\n[7/8] 创建 Release 并上传 APK')
    rel = api('GET', '/repos/%s/%s/releases/tags/%s' % (owner, repo, tag), token)
    body = '### v%s\n\n' % vn + '\n'.join('- ' + t for t in add)
    if fix:
        body += '\n\n**修复**\n\n' + '\n'.join('- ' + t for t in fix)
    if rel is None:
        rel = api('POST', '/repos/%s/%s/releases' % (owner, repo), token, {
            'tag_name': tag, 'name': 'v' + vn, 'body': body,
            'draft': False, 'prerelease': False,
        })
    else:
        print('  Release %s 已存在，复用' % tag)
    # 同名 asset 先删（重发时避免 422）
    for a in (rel.get('assets') or []):
        if a.get('name') == apk_name:
            print('  删除旧 asset: %s' % apk_name)
            api('DELETE', '/repos/%s/%s/releases/assets/%s' % (owner, repo, a['id']), token)
    asset = upload_asset(owner, repo, rel['id'], token, apk_path)

    # ---- 8. 校验 ----
    print('\n[8/8] 校验云端清单')
    for _ in range(10):
        try:
            req = urllib.request.Request(CDN_MANIFEST + '?t=%d' % int(time.time()), method='GET')
            req.add_header('User-Agent', 'mow-survivor-release')
            with urllib.request.urlopen(req, timeout=20) as r:
                j = json.loads(r.read().decode('utf-8'))
            if int(j.get('versionCode') or 0) == vc:
                print('  云端清单已是 v%s' % j.get('versionName'))
                break
        except Exception as e:
            print('  等待 CDN 生效... (%s)' % e)
        time.sleep(6)
    else:
        print('  提示: raw.githubusercontent 有缓存，稍后会自动生效')

    print('\n发版完成')
    print('  版本: v%s (%d)' % (vn, vc))
    print('  安装包: %s' % (asset.get('browser_download_url') or apk_url))
    print('  清单: %s' % CDN_MANIFEST)
    return 0


def do_resume(owner, repo, token, tag, apk_path):
    """Release 已建、APK 没传完时，只补传。"""
    if not os.path.exists(apk_path):
        raise SystemExit('找不到 APK: ' + apk_path)
    rel = api('GET', '/repos/%s/%s/releases/tags/%s' % (owner, repo, tag), token)
    if rel is None:
        raise SystemExit('Release %s 不存在，请先正常发版（不要加 --resume）' % tag)
    apk_name = os.path.basename(apk_path)
    for a in (rel.get('assets') or []):
        if a.get('name') == apk_name:
            print('删除旧 asset: %s' % apk_name)
            api('DELETE', '/repos/%s/%s/releases/assets/%s' % (owner, repo, a['id']), token)
    upload_asset(owner, repo, rel['id'], token, apk_path)
    print('补传完成')
    return 0


if __name__ == '__main__':
    sys.exit(main())
