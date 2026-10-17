#!/usr/bin/env bash
# 在服务器上发布指定的提交或标签：release.sh <commit-or-tag>
# 目录：$APP_ROOT/repo.git（git clone --bare 一次）、$APP_ROOT/releases/<提交>、$APP_ROOT/current（符号链接）。
# 新版本启动后健康检查不通过，自动切回上一个版本。数据库迁移由服务启动时先备份再执行。
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/moriium-dashboard}"
SERVICE="${SERVICE:-moriium-dashboard}"
PORT="${PORT:-5180}"
ref="${1:?用法：release.sh <提交或标签>}"

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

previous="$(readlink current || true)"
if [ "$previous" = "$dest" ]; then
  echo "已经是 $sha，不需要发布。"
  exit 0
fi

switch_to() {
  ln -sfn "$1" current.next
  mv -T current.next current
  sudo systemctl restart "$SERVICE"
}

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS -H "Host: 127.0.0.1:$PORT" "http://127.0.0.1:$PORT/api/health" | grep -q '"status":"ok"'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

switch_to "$dest"
if healthy; then
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$sha" >> releases.log
  echo "已发布 $sha。"
else
  echo "健康检查没有通过，切回上一个版本。服务日志：journalctl -u $SERVICE -n 100" >&2
  if [ -n "$previous" ]; then
    switch_to "$previous"
    healthy || echo "上一个版本也没有通过健康检查，需要人工处理。" >&2
  fi
  exit 1
fi
