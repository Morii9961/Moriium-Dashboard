# 部署验收清单（P6.5）

部署后逐项实测并记录日期与结果，全部通过才算 P6 完成。每一项都在 VPS 上的正式实例做，需要 Morii 对这次部署的授权；口令相关的操作由 Morii 本人进行。

## 服务

- [ ] `systemctl stop` 后对外地址返回 502，`systemctl start` 后恢复，数据不变。
- [ ] 重启服务器后服务自动启动（`enable` 生效）。
- [ ] 删除或改坏 `dashboard.env` 里的认证设置，服务拒绝启动，不会以免登录方式运行；改回后恢复。
- [ ] 认证库目录为空时服务拒绝启动，日志只有固定说明，没有路径和内容。

## 发布与回滚

- [ ] 用 `release.sh` 发布一个新提交，`releases.log` 记下提交，健康检查通过。
- [ ] 故意发布一个启动失败的版本（例如在测试分支上改坏入口），脚本自动切回上一个版本。
- [ ] 用 `rollback.sh` 退回上一个发布并恢复；跨迁移时脚本拒绝并给出说明。

## 备份与恢复演练

- [ ] `data/backups/` 每天出现日备份。
- [ ] 在本机运行 `pull-backups.sh`，备份拉回并通过完整性检查。
- [ ] 用一份拉回的导出包在服务器上 `data:restore --apply` 到一个新的临时目录，以该目录启动一个临时实例（另一个端口、不对外），核对记录数量后停止并删除临时目录。

## 登录

- [ ] 未登录访问任意 `/api/*`（除登录、退出、会话、健康检查）返回 401；页面只显示登录页。
- [ ] 错误口令显示统一提示；连续失败后出现锁定提示，等待时间与 `Retry-After` 一致。
- [ ] 日志出现 `moriium-auth failure from <真实来源 IP>`，fail2ban 在设定次数后封禁该来源；解封后恢复。
- [ ] 退出后旧 cookie 不能再访问；「退出所有设备」让另一台设备也回到登录页。
- [ ] 本地 `auth:setup reset` 后旧会话全部失效。

## 安全头与路径

- [ ] 响应头包含 `Content-Security-Policy`、`Strict-Transport-Security`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`。
- [ ] 会话 cookie 带 `__Host-` 前缀、`Secure`、`HttpOnly`、`SameSite=Strict`，没有 `Domain`。
- [ ] 用错误的 Host 头直接请求返回 421；跨源写请求返回 403。
- [ ] 数据目录、认证库、备份和环境文件都不能经 HTTP 取到（例如 `/var/lib/...`、`/backups/...`、`/.env` 都不是可下载的文件）。
- [ ] 公网方式：`http://` 跳转到 `https://`；私网方式：公网地址上的 443 不可达。

## 收尾

- [ ] 本机实例的去留由 Morii 决定并记录；此后 VPS 是唯一数据源。
- [ ] 结果写进 `docs/verification/`，项目状态快照更新 P6 里程碑。
