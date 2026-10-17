# 部署模板（P6.3–6.5）

这里只有模板和脚本，没有任何服务器地址、域名或口令。真正部署前需要 Morii 对本次部署的明确授权，并由 Morii 选定访问方式、亲自设置口令。步骤见 [部署说明](../docs/operations/deploy.md)，验收见 [部署验收清单](../docs/operations/deploy-checklist.md)。

| 文件 | 用途 |
| --- | --- |
| `dashboard.env.example` | 服务的环境变量；复制到 `/etc/moriium-dashboard/dashboard.env` |
| `systemd/moriium-dashboard.service` | 单进程服务，专用用户，只写数据目录 |
| `nginx/public.conf` | 公网子域名 + HTTPS + 登录 |
| `nginx/private.conf` | 私网（例如 Tailscale）+ HTTPS + 登录 |
| `nginx/moriium-dashboard-proxy.conf` | 两种方式共用的转发设置，放进 `/etc/nginx/snippets/` |
| `fail2ban/` | 按服务日志里的登录失败来源封禁 |
| `scripts/release.sh` | 在服务器上发布指定提交，健康检查失败自动退回 |
| `scripts/rollback.sh` | 退回上一个发布；跨数据库迁移时拒绝并说明 |
| `scripts/pull-backups.sh` | 在本机把服务器上的备份拉回 |

两种访问方式都要求 HTTPS：会话 cookie 带 `Secure` 和 `__Host-` 前缀，浏览器不会在普通 http 上保存它。
