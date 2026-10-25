#!/usr/bin/env bash
# 构建但不启动：release.sh --prepare <commit-or-tag>；发布：release.sh <commit-or-tag>
# 目录：$APP_ROOT/repo.git（git clone --bare 一次）、$APP_ROOT/releases/<提交>、$APP_ROOT/current（符号链接）。
# 启动失败时仅在迁移文件相同的情况下自动回退；数据库迁移由服务启动时先备份再执行。
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/moriium-dashboard}"
SERVICE="${SERVICE:-moriium-dashboard}"
PORT="${PORT:-5180}"
prepare=0
if [ "${1:-}" = --prepare ]; then
  prepare=1
  shift
fi
if [ "$#" -ne 1 ]; then
  echo '用法：release.sh [--prepare] <提交或标签>' >&2
  exit 1
fi
ref="$1"

cd "$APP_ROOT"
git -C repo.git fetch --quiet --tags origin '+refs/heads/*:refs/heads/*'
sha="$(git -C repo.git rev-parse --verify --quiet "${ref}^{commit}")" || {
  echo "找不到提交：$ref" >&2
  exit 1
}
dest="releases/$sha"

if [ ! -d "$dest" ]; then
  tmp="releases/.building-$sha"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  git -C repo.git archive "$sha" | tar -x -C "$tmp"
  (cd "$tmp" && pnpm install --frozen-lockfile && pnpm build)
  mv "$tmp" "$dest"
fi

if [ "$prepare" -eq 1 ]; then
  echo "已构建 $sha：$APP_ROOT/$dest。未切换 current，未启动服务。"
  exit 0
fi
previous="$(readlink current || true)"

switch_to() {
  ln -sfn "$1" current.next
  mv -T current.next current
}

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS --connect-timeout 2 --max-time 3 -H "Host: 127.0.0.1:$PORT" "http://127.0.0.1:$PORT/api/health" | grep -q '"status":"ok"'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

switch_to "$dest"
if sudo systemctl restart "$SERVICE" && healthy; then
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$sha" >> releases.log
  echo "已发布 $sha。"
else
  echo "服务重启或健康检查没有通过。服务日志：journalctl -u $SERVICE -n 100" >&2
  # 停掉 systemd 的自动重试；新代码可能已经迁移数据库，不能直接运行旧代码。
  sudo systemctl stop "$SERVICE"
  if [ -n "$previous" ] && [ "$previous" != "$dest" ]; then
    if ! diff -qr "$dest/apps/server/migrations" "$previous/apps/server/migrations" > /dev/null; then
      echo '迁移文件不同或无法核对，已停服务并保留 current；需要核对数据库与迁移前备份后人工恢复。' >&2
      exit 1
    fi
    switch_to "$previous"
    if ! { sudo systemctl restart "$SERVICE" && healthy; }; then
      sudo systemctl stop "$SERVICE"
      echo '上一个版本也没有通过启动检查，已停服务，需要人工处理。' >&2
    fi
  else
    echo '没有其他可退回的版本，已停服务并保留 current 供排查。' >&2
  fi
  exit 1
fi
