# 0003 · 服务端存储、迁移、备份与本机安全

- 日期：2026-10-12
- 状态：采用
- 范围：`apps/server`（P2.4）

## 背景

规划 05 第 4 节选了 Hono + SQLite，要求在 P2 前核实 Node 内置 `node:sqlite` 是否够用，不够就用 better-sqlite3（R9）。数据目录的本机默认位置要在 P1 时和 Morii 确认（05 第 6 节）；Morii 还没有回复，先用下面的默认值，用环境变量可以改。

## 决定

1. **SQLite 驱动用 `node:sqlite`。**
   - Node 24 文档：「Stability: 1.2 - Release candidate」，从 v24.15.0 起（本机正是 24.15.0）；不需要实验开关。
   - 需要的都有：同步 API、WAL、JSON1、`isTransaction`、`timeout`（忙等待）、在线 `backup()`；v24.14 起默认开启 `defensive`（普通 SQL 不能故意写坏数据库文件）。
   - 不引入原生编译依赖，Windows 上不需要编译工具链。
   - `engines` 提高到 `>=24.15.0`。数据访问集中在 `src/db.ts`，以后要换 better-sqlite3 只改这一个文件。

2. **迁移：手写 SQL 文件 + 很小的执行器**（05 第 4 节）。
   - 文件在 `apps/server/migrations/`，命名 `0001_xxx.sql`，版本号必须从 1 开始连续。
   - 每个迁移一个事务，失败整体回滚；版本记在 `schema_migrations`。
   - 数据库版本比程序认识的新时拒绝启动，提示升级。
   - 骨架的 `0001_init.sql` 只建 `settings` 和 `audit_log`。项目、快照等表在 P3 按需新增迁移，不预先建好。
   - 表都用 `STRICT`。

3. **备份**（04 第 12 节）。
   - 启动时和之后每小时检查一次，超过 24 小时没有日备份就做一次。
   - 已有数据库在迁移前强制备份一次。
   - 用 `node:sqlite` 的在线备份，先写临时文件再改名，所以半截的文件不会被当成有效备份；崩溃留下的半截文件超过一天会被清掉。
   - 保留最近 14 份日备份，更早的每周留最新一份、最多 8 周；迁移前的备份留最近 5 份。

4. **数据目录。**
   - `MORIIUM_DASHBOARD_DATA` 指定，必须是绝对路径。
   - 不指定时用系统的应用数据目录：Windows 是 `%LOCALAPPDATA%\moriium-dashboard`，macOS 是 `~/Library/Application Support/moriium-dashboard`，Linux 是 `$XDG_DATA_HOME` 或 `~/.local/share` 下的 `moriium-dashboard`。
   - **在仓库里面**：拒绝启动，不提供绕过的办法。
   - **在 OneDrive、Dropbox、iCloud Drive、Google Drive 里**（按路径段和 `OneDrive*` 环境变量判断）：拒绝启动，除非设置 `MORIIUM_DASHBOARD_ALLOW_SYNCED_DATA_DIR=1`（R11）。

5. **本机安全**（05 第 10 节）。
   - 只监听 `127.0.0.1`，端口默认 5180（`MORIIUM_DASHBOARD_PORT`）。
   - `Host` 头只接受 `127.0.0.1:<端口>` 和 `localhost:<端口>`，否则返回 421（防 DNS 重绑定）。
   - `/api/*` 的写请求要求 `Origin` 在允许列表里，并带 `X-Moriium-Dashboard: 1`；不回应 CORS 预检，所以跨源页面发不出这样的请求。开发时 Vite 的地址用 `MORIIUM_DASHBOARD_DEV_ORIGINS` 加入，只接受本机地址。
   - 所有响应都带严格的 CSP（`default-src 'none'`，脚本、样式、字体、连接只允许同源，没有 `unsafe-inline` 和 `unsafe-eval`）和其他安全头：`nosniff`、`no-referrer`、`frame-ancestors 'none'` 等。
   - `/api/health` 不返回任何路径。出错时浏览器只收到 `internal_error`，细节只写进服务端日志。

## 后果

- 本机 Node 版本低于 24.15 时 `pnpm install` 会提示 engines 不满足。
- 开发时前端从 Vite（5173）访问服务端，需要设置 `MORIIUM_DASHBOARD_DEV_ORIGINS=http://localhost:5173`。P2.3 接入前端时在启动脚本里配好。
- 恢复备份：停掉服务，把 `backups/` 里的某个文件复制为 `dashboard.sqlite`（同时删掉旧的 `-wal`、`-shm` 文件），再启动。「从导出包恢复」在 P6 前补上。
- P6 部署时，Host 白名单和 Origin 列表要按届时的访问方式重新设计。
