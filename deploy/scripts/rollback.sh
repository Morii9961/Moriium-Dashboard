#!/usr/bin/env bash
# 退回上一个发布：rollback.sh [提交]。不给提交时退回 releases.log 里的上一条。
# 旧程序不认识新数据库结构，会拒绝启动；所以新版本带了迁移时，这里拒绝退回，
# 需要先在授权下用迁移前的备份恢复数据（见 docs/operations/deploy.md 的回滚一节）。
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/moriium-dashboard}"
SERVICE="${SERVICE:-moriium-dashboard}"
cd "$APP_ROOT"

current="$(readlink current)"
if [ -n "${1:-}" ]; then
  target="releases/$1"
else
  target="releases/$(awk '{print $2}' releases.log | grep -vx "${current#releases/}" | tail -n 1)"
fi
[ -d "$target" ] || {
  echo "找不到要退回的版本：$target" >&2
  exit 1
}

count() { find "$1/apps/server/migrations" -maxdepth 1 -name '*.sql' | wc -l; }
if [ "$(count "$target")" -lt "$(count "$current")" ]; then
  echo "当前版本比 $target 多了数据库迁移，旧程序会拒绝打开现在的数据库。" >&2
  echo "需要退回时，先停服务，用 data/backups 里对应的 pre-migration 备份恢复，再执行本脚本。" >&2
  exit 1
fi

ln -sfn "$target" current.next
mv -T current.next current
sudo systemctl restart "$SERVICE"
printf '%s %s rollback\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${target#releases/}" >> releases.log
echo "已退回 ${target#releases/}。"
