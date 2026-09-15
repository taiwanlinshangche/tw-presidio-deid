#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
RUNTIME_ROOT="$ROOT/.runtime"
LOCK_FILE="$RUNTIME_ROOT/bootstrap.lockfile"
NODE_VERSION="24.21.0"
ARCHIVE="node-v$NODE_VERSION-darwin-arm64.tar.gz"
ARCHIVE_SHA256="bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057"
DOWNLOAD_URL="https://nodejs.org/dist/v$NODE_VERSION/$ARCHIVE"
CACHE_FILE="$RUNTIME_ROOT/cache/$ARCHIVE"
MANAGED_NODE="$RUNTIME_ROOT/node-v$NODE_VERSION-darwin-arm64/bin/node"

fail() {
  printf '啟動失敗：%s\n' "$1" >&2
  exit 1
}

node_is_compatible() {
  [ -x "$1" ] || command -v "$1" >/dev/null 2>&1 || return 1
  version=$("$1" -p 'process.versions.node' 2>/dev/null) || return 1
  old_ifs=$IFS
  IFS=.
  set -- $version
  IFS=$old_ifs
  major=${1:-0}
  minor=${2:-0}
  case "$major:$minor" in
    *[!0-9:]*) return 1 ;;
  esac
  [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 12 ]; }
}

resolve_npm_cli() {
  node_path=$("$1" -p 'process.execPath' 2>/dev/null) || return 1
  node_dir=$(CDPATH= cd -- "$(dirname -- "$node_path")" 2>/dev/null && pwd) || return 1
  npm_cli="$node_dir/../lib/node_modules/npm/bin/npm-cli.js"
  [ -f "$npm_cli" ] || return 1
  DEID_NPM_CLI=$(CDPATH= cd -- "$(dirname -- "$npm_cli")" && pwd)/npm-cli.js
  export DEID_NPM_CLI
}

LOCK_HELD=0
cleanup() {
  if [ "$LOCK_HELD" -eq 1 ]; then
    exec 9>&-
    LOCK_HELD=0
  fi
  [ -z "${STAGE_DIR:-}" ] || rm -rf "$STAGE_DIR"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$RUNTIME_ROOT"
exec 9>"$LOCK_FILE"
LOCK_HELD=1
if ! /usr/bin/perl -MFcntl=:flock -e 'open(my $f, ">&=9") or die $!; flock($f, LOCK_EX|LOCK_NB) or exit 1;' 2>/dev/null; then
  fail "另一個初始化程序正在執行，請等待它完成。"
fi

[ "$(uname -s)" = "Darwin" ] || fail "此啟動器僅支援 macOS。"
[ "$(uname -m)" = "arm64" ] || fail "此版本僅支援 Apple Silicon Mac。"
mac_major=$(sw_vers -productVersion 2>/dev/null | awk -F. '{print $1}')
case "$mac_major" in
  ''|*[!0-9]*) fail "無法確認 macOS 版本。" ;;
esac
[ "$mac_major" -ge 14 ] || fail "需要 macOS 14 或更新版本。"

NODE=""
if command -v node >/dev/null 2>&1 && node_is_compatible node && resolve_npm_cli node; then
  NODE=$(command -v node)
elif node_is_compatible "$MANAGED_NODE" && resolve_npm_cli "$MANAGED_NODE"; then
  NODE="$MANAGED_NODE"
else
  for tool in curl tar shasum; do
    command -v "$tool" >/dev/null 2>&1 || fail "系統缺少必要工具：$tool。"
  done

  mkdir -p "$RUNTIME_ROOT/cache"
  cached_sha=$(shasum -a 256 "$CACHE_FILE" 2>/dev/null | awk '{print $1}' || true)
  if [ "$cached_sha" != "$ARCHIVE_SHA256" ]; then
    rm -f "$CACHE_FILE"
    printf '首次啟動：正在下載 Node.js %s（畫面會顯示進度）…\n' "$NODE_VERSION"
    curl --fail --location --progress-bar --output "$CACHE_FILE.part" "$DOWNLOAD_URL" || fail "Node.js 下載失敗，請確認網路連線後重試。"
    downloaded_sha=$(shasum -a 256 "$CACHE_FILE.part" | awk '{print $1}')
    [ "$downloaded_sha" = "$ARCHIVE_SHA256" ] || fail "Node.js 檔案校驗失敗，已停止安裝。"
    mv "$CACHE_FILE.part" "$CACHE_FILE"
  fi

  STAGE_DIR="$RUNTIME_ROOT/.node-stage-$$"
  rm -rf "$STAGE_DIR"
  mkdir "$STAGE_DIR"
  tar -xzf "$CACHE_FILE" -C "$STAGE_DIR" || fail "Node.js 解壓縮失敗。"
  STAGED_NODE="$STAGE_DIR/node-v$NODE_VERSION-darwin-arm64/bin/node"
  node_is_compatible "$STAGED_NODE" || fail "下載的 Node.js 無法執行或版本不符。"
  resolve_npm_cli "$STAGED_NODE" || fail "下載的 Node.js 缺少 npm，已停止安裝。"
  rm -rf "$RUNTIME_ROOT/node-v$NODE_VERSION-darwin-arm64"
  mv "$STAGE_DIR/node-v$NODE_VERSION-darwin-arm64" "$RUNTIME_ROOT/node-v$NODE_VERSION-darwin-arm64"
  rm -rf "$STAGE_DIR"
  STAGE_DIR=""
  NODE="$MANAGED_NODE"
  resolve_npm_cli "$NODE" || fail "安裝的 Node.js 缺少 npm。"
fi

cleanup
trap - EXIT HUP INT TERM
exec "$NODE" "$ROOT/scripts/start.mjs" --open
