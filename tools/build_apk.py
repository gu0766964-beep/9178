#!/usr/bin/env python3
"""无 Gradle、在 aarch64 上手工打 Android APK。

流程：手写 AXML 清单 → javac 编译 Java → d8 生成 classes.dex →
zip 打包 assets/dex/清单 → apksigner 签名 → 校验。
"""
import glob
import os
import shutil
import struct
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SDK = '/root/projects/.sdk/android-sdk'
BUILD_TOOLS = os.path.join(SDK, 'build-tools', '34.0.0')
PLATFORM = os.path.join(SDK, 'platforms', 'android-34')
ANDROID_JAR = os.path.join(PLATFORM, 'android.jar')
BUILD = os.path.join(ROOT, 'build')
DIST = os.path.join(ROOT, 'dist')
ASSETS = os.path.join(ROOT, 'app', 'assets')
SRC = os.path.join(ROOT, 'android', 'src')
APP_NAME = 'survivor-2.5.14.apk'
PACKAGE = 'com.mow.survivor'
# 从 cloud/manifest.json 取版本（云端 versionCode/versionName）
import json
import os
try:
    m = json.load(open(os.path.join(ROOT, 'cloud', 'manifest.json'), encoding='utf-8'))
    VERSION_NAME = m['versionName']
    VERSION_CODE = m['versionCode']
    APP_NAME = 'survivor-%s.apk' % m['versionName']
except Exception:
    VERSION_NAME = '2.5.15'
    VERSION_CODE = 47
    APP_NAME = 'survivor-2.5.15.apk'
MIN_SDK = 24
TARGET_SDK = 34

sys.path.insert(0, os.path.join(ROOT, 'tools'))
import axml  # noqa: E402


def find_jdk():
    cands = sorted(glob.glob('/root/projects/.sdk/amazon-corretto-17*'))
    for c in cands:
        if os.path.isfile(os.path.join(c, 'bin', 'javac')):
            return c
    raise SystemExit('找不到 JDK')


JDK = find_jdk()
JAVA = os.path.join(JDK, 'bin', 'java')
JAVAC = os.path.join(JDK, 'bin', 'javac')
KEYTOOL = os.path.join(JDK, 'bin', 'keytool')
APKSIGNER_JAR = os.path.join(BUILD_TOOLS, 'lib', 'apksigner.jar')
D8_JAR = os.path.join(BUILD_TOOLS, 'lib', 'd8.jar')


def run(cmd, **kw):
    print('$', ' '.join(cmd) if isinstance(cmd, list) else cmd)
    r = subprocess.run(cmd, **kw)
    if r.returncode != 0:
        raise SystemExit('命令失败(%d): %s' % (r.returncode, cmd))
    return r


def step_clean():
    for d in (BUILD, DIST):
        if os.path.isdir(d):
            shutil.rmtree(d)
    os.makedirs(BUILD)
    os.makedirs(DIST)


def step_manifest():
    data = axml.manifest_bytes(package=PACKAGE, label='无尽割草',
                               version_code=VERSION_CODE,
                               version_name=VERSION_NAME,
                               activity='.MainActivity',
                               permissions=['android.permission.INTERNET'])
    out = os.path.join(BUILD, 'AndroidManifest.xml')
    with open(out, 'wb') as f:
        f.write(data)
    print('manifest: %d bytes' % len(data))
    return out
    return out


def step_javac():
    classes = os.path.join(BUILD, 'classes')
    os.makedirs(classes)
    sources = []
    for base, _dirs, files in os.walk(SRC):
        for fn in files:
            if fn.endswith('.java'):
                sources.append(os.path.join(base, fn))
    run([JAVAC, '--release', '11', '-encoding', 'UTF-8',
         '-sourcepath', SRC, '-cp', ANDROID_JAR, '-d', classes] + sources)
    out = []
    for base, _dirs, files in os.walk(classes):
        for fn in files:
            if fn.endswith('.class'):
                out.append(os.path.join(base, fn))
    print('javac: %d class 文件' % len(out))
    return out


def step_dex(class_files):
    dexdir = os.path.join(BUILD, 'dex')
    os.makedirs(dexdir)
    run([JAVA, '-cp', D8_JAR, 'com.android.tools.r8.D8', '--release',
         '--min-api', str(MIN_SDK), '--lib', ANDROID_JAR,
         '--output', dexdir] + class_files)
    dex = os.path.join(dexdir, 'classes.dex')
    if not os.path.isfile(dex):
        raise SystemExit('d8 没有产出 classes.dex')
    print('d8: classes.dex %d bytes' % os.path.getsize(dex))
    return dex


def step_keystore():
    # keystore 放项目根（build/ 会被 step_clean 整个删掉，keytool 每次生成
    # 都是全新随机密钥——keystore 一旦被删，新包与旧包签名就会不一致，
    # 覆盖安装报 INSTALL_FAILED_UPDATE_INCOMPATIBLE）。
    ks = os.path.join(ROOT, 'debug.keystore')
    if os.path.isfile(ks):
        return ks
    run([KEYTOOL, '-genkeypair', '-keystore', ks, '-storetype', 'PKCS12',
         '-storepass', 'android', '-keypass', 'android',
         '-alias', 'androiddebugkey', '-keyalg', 'RSA', '-keysize', '2048',
         '-validity', '10950', '-dname', 'CN=Android Debug,O=Android,C=US'])
    return ks


STORED_ENTRIES = ['AndroidManifest.xml', 'classes.dex', 'resources.arsc']


def _build_zip(out, manifest_path, dex_path, pads):
    """写一个 zip；pads 是 {name: extra填充字节数}。返回 {name: 数据偏移}。"""
    offsets = {}
    with zipfile.ZipFile(out, 'w') as z:
        def put(name, data, compress, pad):
            zi = zipfile.ZipInfo(name, (2026, 11, 1, 0, 0, 0))
            zi.compress_type = compress
            if pad:
                # zipalign 同款：extra 里放一个 id=0xD935、size=pad-4 的 chunk（pad<4 时直接零填充）
                if pad >= 4:
                    zi.extra = struct.pack('<HH', 0xD935, pad - 4) + b'\x00' * (pad - 4)
                else:
                    zi.extra = b'\x00' * pad
            z.writestr(zi, data)
            info = z.getinfo(name)
            offsets[name] = info.header_offset + 30 + len(name) + len(info.extra or b'')

        put('AndroidManifest.xml', open(manifest_path, 'rb').read(), zipfile.ZIP_STORED, pads.get('AndroidManifest.xml', 0))
        put('classes.dex', open(dex_path, 'rb').read(), zipfile.ZIP_STORED, pads.get('classes.dex', 0))
        import arsc
        put('resources.arsc', arsc.build_arsc(package=PACKAGE), zipfile.ZIP_STORED, pads.get('resources.arsc', 0))
        # res/：启动器图标等（aapt 输出里 res 都是压缩的）
        res_root = os.path.join(ROOT, 'res')
        if os.path.isdir(res_root):
            for base, _dirs, files in os.walk(res_root):
                for fn in sorted(files):
                    p = os.path.join(base, fn)
                    rel = os.path.relpath(p, res_root).replace(os.sep, '/')
                    with open(p, 'rb') as f:
                        data = f.read()
                    z.writestr('res/' + rel, data, compress_type=zipfile.ZIP_DEFLATED)
        for base, _dirs, files in os.walk(ASSETS):
            for fn in sorted(files):
                if fn.startswith('_') or fn.endswith('.map'):
                    continue  # 自检页/调试文件不进 APK
                p = os.path.join(base, fn)
                rel = os.path.relpath(p, ASSETS).replace(os.sep, '/')
                with open(p, 'rb') as f:
                    data = f.read()
                # 视频/音频已压缩，存进去即可，省构建时间也不再二次压
                ct = zipfile.ZIP_STORED if fn.lower().endswith(('.mp4', '.m4a', '.mp3')) else zipfile.ZIP_DEFLATED
                z.writestr('assets/' + rel, data, compress_type=ct)
    return offsets


def _aligned_info(name, compress=zipfile.ZIP_STORED, date_time=None):
    """deprecated — 保留兼容，实际对齐在 _build_zip 的两遍写入里完成。"""
    return zipfile.ZipInfo(name, date_time or (2026, 11, 1, 0, 0, 0))


def step_zip(manifest_path, dex_path):
    """打包 APK：清单 / dex / resources.arsc 不压缩且 4 字节对齐，assets 与 res 压缩。"""
    sys.path.insert(0, os.path.join(ROOT, 'tools'))
    out = os.path.join(BUILD, 'app-unsigned.apk')
    # 两遍写入：第一遍测偏移，第二遍按需给 stored 条目加 extra 补齐到 4 字节
    pads = {}
    for _ in range(4):
        offsets = _build_zip(out, manifest_path, dex_path, pads)
        bad = [n for n in ('classes.dex', 'resources.arsc') if offsets[n] % 4 != 0]
        if not bad:
            break
        for n in bad:
            pads[n] = pads.get(n, 0) + (-offsets[n]) % 4
    else:
        raise AssertionError('对齐失败：' + str(offsets))
    for n in ('classes.dex', 'resources.arsc'):
        print('%s data offset=%d, %%4=%d' % (n, offsets[n], offsets[n] % 4))
        assert offsets[n] % 4 == 0, n + ' 未对齐'
    with zipfile.ZipFile(out) as z:
        n_res = len([n for n in z.namelist() if n.startswith('res/') or n.startswith('assets/')])
    print('zip: %d 个资源文件 + dex，未签名 %d bytes' % (n_res, os.path.getsize(out)))
    return out


def step_sign(unsigned, ks):
    signed = os.path.join(DIST, APP_NAME)
    run([JAVA, '-jar', APKSIGNER_JAR, 'sign',
         '--ks', ks, '--ks-pass', 'pass:android', '--key-pass', 'pass:android',
         '--ks-key-alias', 'androiddebugkey',
         '--min-sdk-version', str(MIN_SDK), '--max-sdk-version', str(TARGET_SDK),
         '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
         '--out', signed, unsigned])
    print('signed: %s (%d bytes)' % (signed, os.path.getsize(signed)))
    return signed


def step_verify(signed):
    run([JAVA, '-jar', APKSIGNER_JAR, 'verify', '--verbose', '--print-certs', signed])
    # 结构自检：zip 里必须有清单、dex 和 index.html
    with zipfile.ZipFile(signed) as z:
        names = z.namelist()
        for need in ('AndroidManifest.xml', 'classes.dex', 'assets/index.html',
                     'assets/game/sim.js', 'assets/game/render.js', 'assets/game/main.js'):
            if need not in names:
                raise SystemExit('APK 缺少 ' + need)
        print('apk 内含 %d 个条目' % len(names))
        info = z.getinfo('classes.dex')
        print('classes.dex 压缩方式=%d (0=stored)' % info.compress_type)


def main():
    step_clean()
    man = step_manifest()
    classes = step_javac()
    dex = step_dex(classes)
    ks = step_keystore()
    unsigned = step_zip(man, dex)
    signed = step_sign(unsigned, ks)
    step_verify(signed)
    print('\n完成：' + signed)


if __name__ == '__main__':
    main()
