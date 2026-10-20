# 部署到 VPS

P6.3 / 6.4 的操作步骤。模板在 [`deploy/`](../../deploy/README.md)。动服务器之前需要 Morii 对这一次部署的明确授权；访问方式由 Morii 选定；登录口令由 Morii 本人在终端隐藏输入，Agent 不代填。下文的主机名、域名都是占位。

## 0. 前提

- 一台 Linux VPS，有 systemd、Nginx、fail2ban，能用 SSH 登录并 sudo。
- Node 满足 `package.json` 的 `engines`（24.15 起、25 以下），pnpm 与 `packageManager` 一致（用 corepack 启用）。
- 选定访问方式：**公网子域名**（`deploy/nginx/public.conf`，需要 DNS 和公网证书）或 **私网**（`deploy/nginx/private.conf`，例如 Tailscale，证书用私网签发）。两种都必须是 HTTPS，都要登录。

## 1. 用户与目录

```text
sudo useradd --system --home /var/lib/moriium-dashboard --shell /usr/sbin/nologin moriium
sudo install -d -o moriium -g moriium -m 0700 /var/lib/moriium-dashboard /var/lib/moriium-dashboard/auth
sudo install -d -o <DEPLOY_USER> -m 0755 /opt/moriium-dashboard /opt/moriium-dashboard/releases
sudo install -d -m 0750 -g moriium /etc/moriium-dashboard
git clone --bare https://github.com/Morii9961/Moriium-Dashboard.git /opt/moriium-dashboard/repo.git
```

数据目录 `/var/lib/moriium-dashboard/data` 不要预先建空库：第 4 步由恢复命令建立。

## 2. 配置

复制 `deploy/dashboard.env.example` 到 `/etc/moriium-dashboard/dashboard.env`（`root:moriium`，`0640`），按选定的访问方式填 `MORIIUM_DASHBOARD_PUBLIC_ORIGIN`。复制 `deploy/systemd/moriium-dashboard.service` 到 `/etc/systemd/system/`，执行 `sudo systemctl daemon-reload`，**先不启动**。

Nginx：把 `deploy/nginx/moriium-dashboard-proxy.conf` 放进 `/etc/nginx/snippets/`，按访问方式选一份站点配置，替换占位的主机名与证书路径，`sudo nginx -t` 通过后重载。fail2ban：复制 `deploy/fail2ban/moriium-dashboard.conf` 到 `filter.d/`，把 `jail.local.example` 的内容追加到 `jail.local`，重载。

## 3. 准备代码（首次部署不启动）

把 `deploy/scripts/release.sh` 和 `rollback.sh` 放到 `/opt/moriium-dashboard/`，以部署用户执行：

```text
./release.sh --prepare <提交或标签>
```

它把该提交解包到 `releases/<完整提交 SHA>`，安装依赖并构建前端，然后输出构建目录。此时不切换 `current`，不启动或重启服务。记下输出的完整 SHA，在该构建目录完成第 4、5 步后，再正式发布。

## 4. 迁移数据（需授权）

在本机：设置 → 导出全部数据，得到导出包；在本机运行 `pnpm data:restore --check <导出包>`，记下输出的各类记录数量（检查时已逐份核对快照原文与内容指纹）。把导出包传到服务器的临时目录（`moriium` 用户能读），在第 3 步输出的 `/opt/moriium-dashboard/releases/<完整提交 SHA>` 目录运行（服务用户没有登录 shell，直接用 node 调用同一个命令）：

```text
sudo -u moriium node apps/server/src/restore/command.ts --check <导出包>
sudo -u moriium node apps/server/src/restore/command.ts --apply <导出包> --target /var/lib/moriium-dashboard/data
```

两边输出的记录数量一致，第 6 步启动后概览与项目页也和本机一致，才算迁移成功。恢复命令只写入新的空目录，不覆盖已有数据。核对完成后删除服务器临时目录里的导出包。切换为 VPS 唯一数据源的时点、本机实例只读保留还是停用，由 Morii 决定；切换前先冻结本机写入，避免导出后两边继续产生不同数据。

## 5. 设置口令（Morii 本人）

用 SSH 交互终端（必须是 TTY，`ssh -t`），在第 3 步输出的构建目录：

```text
sudo -u moriium node apps/server/src/auth/setup.ts init --data /var/lib/moriium-dashboard/auth --account <login>
```

两次隐藏输入，口令不进命令参数、环境变量或聊天。

## 6. 激活与核对

账户和业务数据都已准备好后，以部署用户执行 `./release.sh <第 3 步的完整提交 SHA>`。脚本切换 `current` 并重启服务；启动命令成功后最多检查 30 次健康接口，每次请求超时 3 秒。成功后再执行 `sudo systemctl enable moriium-dashboard`，`journalctl -u moriium-dashboard -n 20` 应出现「已开启登录认证，对外地址 …」。按[部署验收清单](./deploy-checklist.md)验证正式 HTTPS 地址、登录和数据。

启动或健康检查失败时，脚本先停掉服务的自动重试。迁移文件相同的版本会尝试切回旧版本并验证启动；迁移文件不同或无法核对的版本保留当前代码并停服，等待核对数据库及迁移前备份，避免自动运行不认识新结构的旧程序。首次发布没有旧版本时也停服并保留 `current` 供排查。失败不会记成成功发布。

## 回滚

`deploy/scripts/rollback.sh` 退回上一个发布。如果目标版本的迁移文件更少，脚本保守拒绝退回，即使已经恢复数据库也不会绕过。跨迁移恢复需要单独授权：停服务、保留当前数据库与 WAL/SHM 及代码链接、核对迁移前备份和目标版本，再按人工恢复方案切换数据库及代码。不要直接覆盖运行中的数据库，也不要靠重复执行回滚脚本解除保护。

## 备份

服务每天自动在线备份到 `data/backups/`（14 份日备份、8 份周备份、5 份迁移前备份）。在本机定期运行 `deploy/scripts/pull-backups.sh <ssh 主机> <本机目录>` 拉回并做完整性检查；本机目录放在仓库和同步盘之外。

认证库不做备份：它只存口令哈希、会话和限速，丢失或损坏时服务拒绝启动，由 Morii 按第 5 步重新设置即可；忘记口令时用同一命令的 `reset … --confirm-reset`。这样口令哈希不会离开服务器。

## 不在这份说明里的事

域名购买与 DNS、证书申请、防火墙规则、服务器加固都按 VPS 自身的做法处理；本仓库不保存任何地址、证书或口令。
