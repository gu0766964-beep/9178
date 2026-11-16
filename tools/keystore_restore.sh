#!/usr/bin/env bash
# 从仓库里的加密备份恢复签名密钥
#
#   ./tools/keystore_restore.sh            # 交互输入口令
#   ./tools/keystore_restore.sh 口令        # 直接给口令（会留在 shell 历史里，慎用）
#   KEYSTORE_PASS=口令 ./tools/keystore_restore.sh
#
# 恢复出来的 debug.keystore 会被 build_apk.py 的 step_keystore() 自动复用，
# 打出的包才能覆盖安装已发布的版本。仓库里的 signing/debug.keystore.enc 是
# AES-256-CBC + PBKDF2(200000) 加密的，口令不在仓库里。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENC="$ROOT/signing/debug.keystore.enc"
OUT="$ROOT/debug.keystore"

EXPECT_SHA256="46af10e9cd8b91327dbc09f066f4e2f159d769b3aefafda99b32d4abe19928eb"
EXPECT_CERT="598ffed90a26749c8b1da0bb75240961b31419f8222420fae7e18e88d2e94e94"

[ -f "$ENC" ] || { echo "找不到加密备份：$ENC" >&2; exit 2; }

if [ -f "$OUT" ]; then
  echo "注意：$OUT 已存在，将被覆盖（先备份为 $OUT.bak）"
  cp -p "$OUT" "$OUT.bak"
fi

PASS="${1:-${KEYSTORE_PASS:-}}"
if [ -z "$PASS" ]; then
  read -r -s -p "输入密钥库口令: " PASS
  echo
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$ENC" -out "$tmp" -pass pass:"$PASS" 2>/dev/null; then
  echo "解密失败：口令不对，或文件损坏" >&2
  exit 1
fi

got="$(sha256sum "$tmp" | awk '{print $1}')"
if [ "$got" != "$EXPECT_SHA256" ]; then
  echo "校验失败：解密内容 sha256 不符" >&2
  echo "  期望 $EXPECT_SHA256" >&2
  echo "  实际 $got" >&2
  exit 1
fi

umask 077
cp "$tmp" "$OUT"
chmod 600 "$OUT"

echo "已恢复 $OUT"
echo "  sha256 = $got"

# 若本机有 JDK，顺手打印证书指纹自检
JAVA_HOME_GUESS="/root/projects/.sdk/amazon-corretto-17.0.21.0.11-linux-aarch64"
if [ -x "$JAVA_HOME_GUESS/bin/keytool" ]; then
  fp="$("$JAVA_HOME_GUESS/bin/keytool" -list -v -keystore "$OUT" -storepass android 2>/dev/null \
        | grep -oE 'SHA256: [0-9A-F:]{95}' | head -1 | sed 's/SHA256: //')"
  echo "  证书 SHA-256 = $fp"
  norm="$(echo "$fp" | tr -d ':' | tr 'A-F' 'a-f')"
  if [ "$norm" = "$EXPECT_CERT" ]; then
    echo "  ✓ 与线上版本签名一致，可以覆盖安装"
  else
    echo "  ✗ 证书指纹不符，别用这个包发版" >&2
    exit 1
  fi
fi

echo
echo "下一步：python3 tools/build_apk.py"
