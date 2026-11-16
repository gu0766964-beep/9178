#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一键发版（不依赖本地 git 仓库，纯 GitHub REST API）。

背景：本机 `github.com:443` 经常不可达（`git clone/push` 会超时），但
`api.github.com` 一直通。所以这里不跑 git，全部走 Git Data API：
本地文件算 blob sha1 → 与云端 tree 对比 → 只上传变化的 blob → 建树 → 提交 → 移引用。

和 tools/release.py 的区别：
  - release.py 需要本地 git 仓库与 origin/main（`git diff`、`git push`）
  - 本脚本零 git 依赖，可直接在解压出来的源码目录里跑

用法：
  export GITHUB_TOKEN=TOKEN
  python3 tools/auto_release.py --add "新增 X" --fix "修复 Y"
  python3 tools/auto_release.py --dry-run          # 只对比与打印计划，不写不改
  python3 tools/auto_release.py --skip-build       # 复用 dist/ 里已有的同版本 APK
  python3 tools/auto_release.py --no-bump          # 同版本重发

GITHUB_TOKEN 权限需包含 contents: write（经典 PAT 勾 repo；细粒度勾
Contents 读写 + Releases 读写）。
"""
import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OWNER = 'gu0766964-beep'
REPO = '9178'
BRANCH = 'main'
API = 'https://api.github.com'
MANIFEST = os.path.join(ROOT, 'cloud', 'manifest.json')
PY = sys.executable or 'python3'

# 与 .gitignore 对齐：这些东西永远不进仓库
SKIP_DIRS = {'.git', 'node_modules', '__pycache__', 'dist', 'build'}
SKIP_EXT = ('.apk', '.idsig', '.keystore', '.jks', '.pyc', '.class', '.dex', '.zip')
SKIP_NAMES = {'.env'}


def log(msg):
    print(msg, flush=True)


TOKEN_FILES = [
    os.path.expanduser('~/.config/mow/token'),
    os.path.join(os.path.dirname(ROOT), '.gh_token'),
    '/root/游戏开发/.gh_token',
]


def load_token():
    """按优先级找 GitHub token：环境变量 → token 文件。

    文件里只放一行 token（ghp_… 或 github_pat_…），权限建议 600。
    支持 `export GITHUB_TOKEN=…`、`GITHUB_TOKEN=…\n`、纯 token 三种写法。
    """
    for env in ('GITHUB_TOKEN', 'GH_TOKEN'):
        v = (os.environ.get(env) or '').strip()
        if v:
            return v, 'env:' + env
    for path in TOKEN_FILES:
        try:
            with open(path, encoding='utf-8') as f:
                for line in f:
                    line = line.strip().strip('"').strip("'")
                    if line.startswith('export '):
                        line = line[7:].strip()
                    if '=' in line and not line.startswith('gh'):
                        line = line.split('=', 1)[1].strip().strip('"').strip("'")
                    if line and not line.startswith('#'):
                        return line, 'file:' + path
        except (OSError, UnicodeDecodeError):
            continue
    return '', 'none'


# ---------------------------------------------------------------- HTTP


def api(method, path, token=None, body=None, base=API, raw=False, timeout=120):
    url = base + path
    data = None
    headers = {'Accept': 'application/vnd.github+json',
               'User-Agent': 'mow-auto-release',
               'X-GitHub-Api-Version': '2022-11-28'}
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = r.read()
            if raw:
                return payload
            return json.loads(payload.decode('utf-8') or '{}')
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')[:600]
        if e.code == 404:
            return None
        raise SystemExit('GitHub API %s %s -> HTTP %s\n%s' % (method, path, e.code, detail))
    except urllib.error.URLError as e:
        raise SystemExit('连不上 api.github.com: %s' % e)


# ---------------------------------------------------------------- blob / tree


def blob_sha(data):
    h = hashlib.sha1()
    h.update(b'blob %d\0' % len(data))
    h.update(data)
    return h.hexdigest()


def scan_local():
    """本地待发布文件 {相对路径: (blob_sha, 字节数)}。"""
    out = {}
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith('.')]
        for fn in files:
            if fn in SKIP_NAMES or fn.lower().endswith(SKIP_EXT):
                continue
            if fn.startswith('.') and fn not in ('.gitignore',):
                continue
            p = os.path.join(base, fn)
            rel = os.path.relpath(p, ROOT).replace(os.sep, '/')
            try:
                with open(p, 'rb') as f:
                    data = f.read()
            except OSError:
                continue
            out[rel] = (blob_sha(data), len(data))
    return out


def remote_tree():
    """云端 main 当前的文件 {相对路径: blob_sha}，以及 tree sha。"""
    ref = api('GET', '/repos/%s/%s/git/ref/heads/%s' % (OWNER, REPO, BRANCH))
    if not ref:
        raise SystemExit('拿不到分支 %s 的引用' % BRANCH)
    commit_sha = ref['object']['sha']
    commit = api('GET', '/repos/%s/%s/git/commits/%s' % (OWNER, REPO, commit_sha))
    tree_sha = commit['tree']['sha']
    tree = api('GET', '/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, tree_sha))
    files = {}
    for e in tree.get('tree', []):
        if e['type'] == 'blob':
            files[e['path']] = e['sha']
    return commit_sha, tree_sha, files, bool(tree.get('truncated'))


def diff_tree(local, remote):
    added, modified, deleted = [], [], []
    for rel, (sha, size) in sorted(local.items()):
        if rel not in remote:
            added.append((rel, size))
        elif remote[rel] != sha:
            modified.append((rel, size))
    for rel in sorted(remote):
        if rel not in local:
            deleted.append(rel)
    return added, modified, deleted


# ---------------------------------------------------------------- 发布流程


def upload_blob(token, path):
    with open(os.path.join(ROOT, path), 'rb') as f:
        data = f.read()
    body = {'content': base64.b64encode(data).decode('ascii'), 'encoding': 'base64'}
    res = api('POST', '/repos/%s/%s/git/blobs' % (OWNER, REPO), token, body, timeout=600)
    return res['sha'], len(data)


def upload_asset(upload_url, token, apk_path, attempts=5):
    name = os.path.basename(apk_path)
    size = os.path.getsize(apk_path)
    base = upload_url.split('{')[0]
    url = '%s?name=%s' % (base, urllib.parse.quote(name))
    last = None
    for i in range(attempts):
        try:
            with open(apk_path, 'rb') as f:
                data = f.read()
            req = urllib.request.Request(url, data=data, method='POST')
            req.add_header('Authorization', 'Bearer ' + token)
            req.add_header('Content-Type', 'application/vnd.android.package-archive')
            req.add_header('Content-Length', str(size))
            req.add_header('Accept', 'application/vnd.github+json')
            req.add_header('User-Agent', 'mow-auto-release')
            with urllib.request.urlopen(req, timeout=1800) as r:
                return json.loads(r.read().decode('utf-8'))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            last = e
            detail = ''
            if isinstance(e, urllib.error.HTTPError):
                detail = e.read().decode('utf-8', 'replace')[:300]
            log('  上传失败（第 %d/%d 次）：%s %s' % (i + 1, attempts, e, detail))
            time.sleep(3 * (i + 1))
    raise SystemExit('APK 上传失败：%s' % last)


def read_manifest():
    with open(MANIFEST, encoding='utf-8') as f:
        return json.load(f)


def run_tool(name, *args):
    cmd = [PY, os.path.join(ROOT, 'tools', name)] + list(args)
    log('$ ' + ' '.join(cmd))
    p = subprocess.run(cmd, cwd=ROOT)
    if p.returncode != 0:
        raise SystemExit('%s 失败（退出码 %d）' % (name, p.returncode))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--add', action='append', default=[])
    ap.add_argument('--fix', action='append', default=[])
    ap.add_argument('--version-name', default=None)
    ap.add_argument('--version-code', type=int, default=None)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--skip-build', action='store_true')
    ap.add_argument('--no-bump', action='store_true')
    ap.add_argument('--force', action='store_true', help='没有资源改动也发版')
    args = ap.parse_args()

    token, token_src = load_token()
    if not token and not args.dry_run:
        raise SystemExit(
            '没有找到 GitHub Token。三种给法，任选一种：\n'
            '  1) export GITHUB_TOKEN=TOKEN\n'
            '  2) echo TOKEN > ~/.config/mow/token && chmod 600 ~/.config/mow/token\n'
            '  3) echo TOKEN > /root/游戏开发/.gh_token && chmod 600 /root/游戏开发/.gh_token\n'
            '权限需要 contents: write（经典 PAT 勾 repo；细粒度勾 Contents + Releases 读写）。\n'
            'token 文件不会被提交：已列入 SKIP_NAMES / 位于仓库外。\n'
            '（--dry-run 只读云端，不需要 token）')
    if token and not args.dry_run:
        log('凭证    : %s（%s…%s）' % (token_src, token[:4], token[-4:]))

    old = read_manifest()
    old_vc = int(old.get('versionCode') or 0)
    old_vn = str(old.get('versionName') or '0.0.0')
    if args.no_bump:
        vc, vn = old_vc, old_vn
    else:
        vc = args.version_code or (old_vc + 1)
        if args.version_name:
            vn = args.version_name
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
    apk_url = 'https://github.com/%s/%s/releases/download/%s/%s' % (OWNER, REPO, tag, apk_name)

    log('仓库    : %s/%s @ %s' % (OWNER, REPO, BRANCH))
    log('版本    : v%s (versionCode %d)' % (vn, vc))
    log('安装包  : dist/%s' % apk_name)
    log('下载地址: %s' % apk_url)

    # ---- 对比云端 ----
    commit_sha, tree_sha, remote_files, truncated = remote_tree()
    if truncated:
        log('[警告] 云端 tree 被截断，对比结果可能不完整')
    local_files = scan_local()
    added, modified, deleted = diff_tree(local_files, remote_files)
    log('\n云端 HEAD: %s' % commit_sha[:12])
    log('本地 %d 个文件 / 云端 %d 个文件' % (len(local_files), len(remote_files)))
    log('变更：新增 %d / 修改 %d / 删除 %d' % (len(added), len(modified), len(deleted)))
    for rel, size in added[:20]:
        log('  A %-60s %8d' % (rel, size))
    for rel, size in modified[:20]:
        log('  M %-60s %8d' % (rel, size))
    for rel in deleted[:20]:
        log('  D %s' % rel)
    if len(added) + len(modified) + len(deleted) > 60:
        log('  ... 共 %d 项改动' % (len(added) + len(modified) + len(deleted)))

    if not (added or modified or deleted) and not args.force:
        log('\n[跳过] 与云端完全一致，没有改动。真要重发请加 --force')
        return 0

    if args.dry_run:
        log('\n[dry-run] 不生成清单、不打包、不提交、不上传。')
        return 0

    # ---- 清单 + 打包 ----
    if args.no_bump:
        log('\n[1/6] 跳过清单生成（--no-bump：沿用现有版本与公告，只在下一步回填 APK 元信息）')
    else:
        log('\n[1/6] 生成清单与内置公告')
        gen = ['--version-code', str(vc), '--version-name', vn, '--apk-url', apk_url]
        for t in args.add:
            gen += ['--add', t]
        for t in args.fix:
            gen += ['--fix', t]
        run_tool('gen_manifest.py', *gen)

    log('\n[2/6] 打包 APK')
    if args.skip_build and os.path.exists(apk_path):
        log('  复用已有 APK: %s' % apk_path)
    else:
        run_tool('build_apk.py')
    if not os.path.exists(apk_path):
        raise SystemExit('没找到 %s' % apk_path)

    log('\n[3/6] 回填 APK 大小与 sha256')
    run_tool('gen_manifest.py', '--no-bump', '--apk', apk_path)
    with open(apk_path, 'rb') as f:
        apk_sha = hashlib.sha256(f.read()).hexdigest()
    log('  sha256 = %s' % apk_sha)

    # ---- 提交到 main ----
    log('\n[4/6] 提交到 %s（Git Data API）' % BRANCH)
    local_files = scan_local()
    added, modified, deleted = diff_tree(local_files, remote_files)
    todo = [rel for rel, _ in added] + [rel for rel, _ in modified]
    log('  需要上传 %d 个 blob' % len(todo))
    entries = []
    uploaded = 0
    for rel in todo:
        sha, size = upload_blob(token, rel)
        local_sha = local_files[rel][0]
        if sha != local_sha:
            raise SystemExit('blob sha 不一致：%s（本地 %s / 云端 %s）' % (rel, local_sha, sha))
        entries.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': sha})
        uploaded += size
        log('    + %-58s %8d' % (rel, size))
    for rel in deleted:
        entries.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': None})
        log('    - %s' % rel)
    log('  共上传 %.1f MB' % (uploaded / 1048576.0))

    new_tree = api('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO), token,
                   {'base_tree': tree_sha, 'tree': entries}, timeout=300)
    msg = 'release: v%s' % vn
    notes = args.add + args.fix
    if notes:
        msg += '\n\n' + '\n'.join('- ' + t for t in notes)
    new_commit = api('POST', '/repos/%s/%s/git/commits' % (OWNER, REPO), token,
                     {'message': msg, 'tree': new_tree['sha'], 'parents': [commit_sha]})
    api('PATCH', '/repos/%s/%s/git/refs/heads/%s' % (OWNER, REPO, BRANCH), token,
        {'sha': new_commit['sha'], 'force': False})
    log('  已提交 %s' % new_commit['sha'][:12])

    # ---- Release + 上传 APK ----
    log('\n[5/6] 创建 Release 并上传 APK')
    body = '### v%s\n\n' % vn
    body += '\n'.join('- ' + t for t in args.add) if args.add else '- 版本更新'
    if args.fix:
        body += '\n\n**修复**\n\n' + '\n'.join('- ' + t for t in args.fix)
    rel = api('GET', '/repos/%s/%s/releases/tags/%s' % (OWNER, REPO, tag), token)
    if rel is None:
        rel = api('POST', '/repos/%s/%s/releases' % (OWNER, REPO), token, {
            'tag_name': tag, 'name': 'v' + vn, 'body': body,
            'draft': False, 'prerelease': False,
        })
        log('  已建 Release %s' % tag)
    else:
        log('  Release %s 已存在，复用' % tag)
    for a in (rel.get('assets') or []):
        if a.get('name') == apk_name:
            log('  删除同名旧 asset')
            api('DELETE', '/repos/%s/%s/releases/assets/%s' % (OWNER, REPO, a['id']), token)
    asset = upload_asset(rel['upload_url'], token, apk_path)
    log('  已上传 %s (%.1f MB)' % (asset.get('name'), (asset.get('size') or 0) / 1048576.0))

    # ---- 校验 ----
    log('\n[6/6] 校验云端')
    raw = 'https://raw.githubusercontent.com/%s/%s/%s/cloud/manifest.json' % (OWNER, REPO, BRANCH)
    log('  热更新入口（游戏启动 1.5s 后拉这个）：%s' % raw)
    local_m = read_manifest()
    want_id = local_m.get('noticeId')
    want_add = (local_m.get('notice') or {}).get('add') or []
    want_fix = (local_m.get('notice') or {}).get('fix') or []
    log('  本版云端公告：noticeId=%s / 新增 %d 条 / 修复 %d 条'
        % (want_id, len(want_add), len(want_fix)))
    for t in want_add:
        log('    + ' + t)
    for t in want_fix:
        log('    - ' + t)
    ok = False
    for i in range(24):
        try:
            with urllib.request.urlopen(raw + '?t=%d' % int(time.time()), timeout=30) as r:
                got = json.loads(r.read().decode('utf-8'))
            got_id = got.get('noticeId')
            got_add = (got.get('notice') or {}).get('add') or []
            if (int(got.get('versionCode') or 0) == vc
                    and got.get('apkSha256') == apk_sha
                    and got_id == want_id
                    and got_add == want_add):
                log('  云端清单已生效：v%s (%d)' % (got.get('versionName'), got.get('versionCode')))
                log('  云公告已下发：noticeId=%s（游戏端会在下次启动弹出）' % got_id)
                log('  apkUrl  : %s' % got.get('apkUrl'))
                log('  apkSize : %s' % got.get('apkSize'))
                log('  apkSha  : %s' % got.get('apkSha256'))
                ok = True
                break
            log('  等待 CDN 刷新（第 %d/24 次）：云端 v%s / noticeId=%s'
                % (i + 1, got.get('versionName'), got_id))
        except Exception as e:
            log('  等待 CDN 刷新（第 %d/24 次）：%s' % (i + 1, e))
        time.sleep(5)
    if not ok:
        log('  [警告] CDN 还没刷到新清单，通常 1~2 分钟后再看一次 raw.githubusercontent.com')
        return 1

    log('\n完成：v%s 已发布' % vn)
    log('  安装包  : %s' % apk_url)
    log('  Releases: https://github.com/%s/%s/releases' % (OWNER, REPO))
    return 0


if __name__ == '__main__':
    sys.exit(main())
