#!/usr/bin/env bash
# 在本机运行，把服务器上还没拉回的数据库备份复制下来并检查完整性：
#   pull-backups.sh <ssh 主机别名> <本机备份目录>
# 本机目录放在仓库和同步盘之外。需要本机有 Node（用自带的 node:sqlite 做完整性检查）。
set -euo pipefail

host="${1:?用法：pull-backups.sh <ssh 主机别名> <本机备份目录>}"
local_dir="${2:?用法：pull-backups.sh <ssh 主机别名> <本机备份目录>}"
remote_dir="${REMOTE_DIR:-/var/lib/moriium-dashboard/data/backups}"
mkdir -p "$local_dir"

mapfile -t names < <(ssh "$host" "sudo -u moriium ls -1 '$remote_dir'" | grep -E '^(daily|pre-migration)-.*\.sqlite$')
missing=()
for name in "${names[@]}"; do
  [ -e "$local_dir/$name" ] || missing+=("$name")
done
if [ "${#missing[@]}" -eq 0 ]; then
  echo "没有新的备份。"
  exit 0
fi

ssh "$host" "sudo -u moriium tar -C '$remote_dir' -cf - ${missing[*]}" | tar -xf - -C "$local_dir"
for name in "${missing[@]}"; do
  node -e "
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(process.argv[1], { readOnly: true });
    const r = db.prepare('PRAGMA integrity_check').get();
    db.close();
    if (Object.values(r)[0] !== 'ok') { console.error('完整性检查失败：' + process.argv[1]); process.exit(1); }
  " "$local_dir/$name"
  echo "已拉回并检查：$name"
done
