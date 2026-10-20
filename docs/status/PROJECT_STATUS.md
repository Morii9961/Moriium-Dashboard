# Moriium Dashboard · 项目状态

> 与 [project-status.json](./project-status.json) 同步，供手动导入。
> 快照时间：2026-10-20T15:09:08+08:00 · 协议 v1.1 · 项目 ID morii.dashboard · Codex。
> 分支 codex/deploy-preflight · 提交 c15b22f（完整 SHA 见 JSON）。
> tests_rerun: false：本地 pnpm verify 与 PR CI 的结果写在依据里，由 Dashboard 之外核实。

## 阶段

**开发中（development）**。整体进度为 null，没有估算百分比。

P6 工程和 P7 · L2 已在 main；灰阶尺设计 PR #41 仍未合并。本分支修复首次构建与激活顺序、启动失败恢复及迁移保护。Morii 已选公网子域名、HTTPS 加登录；正式部署和迁移待授权，P4/P5 产品验收仍搁置。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| p0-plan-approval | P0 规划获批 | 完成 | [设计决定](../design-decisions.md) | 据记录已验收 |
| p1-repo-protocol | P1 仓库与协议 | 完成 | PR #6 及之前的 PR | 待验收 |
| p2-shell-design | P2 外壳与设计基线 | 完成 | PR #7–#10 | 待验收 |
| p3-import-history | P3 导入与历史 | 完成 | PR #11–#15 | 待验收 |
| p4-projects-overview | P4 项目与概览 | 进行中：工程完成 | [P4 验证](../verification/p4-6.md)、PR #18–#23 | 暂且搁置 |
| p5-mvp | P5 MVP 完成 | 进行中：核心与已选可选工程完成 | PR #24–#30 | 暂且搁置 |
| p6-vps-deploy | P6 VPS 部署 | 进行中：工程部分已合并，待部署 | PR #31–#38、[HTTP 接入](../verification/p6-2c-http-auth.md)、[登录页](../verification/p6-2d-login-ui.md)、[验收清单](../operations/deploy-checklist.md) | 待验收 |

## 阻塞

无。

## 下一步

| ID | 优先级 | 工作 | 结果 |
| --- | --- | --- | --- |
| review-pending-prs | P1 | 审阅灰阶尺设计 PR #41 与部署前修复，确定待部署的合并提交 | 核实对应 head 的 CI 和人工审阅结果；经 Morii 明确批准后合并 |
| p6-deploy | P1 | 按[部署说明](../operations/deploy.md)完成公网 HTTPS 加登录部署与 P6.5 验收 | 授权后现场核对 VPS 和 DNS；只构建、恢复数据、本人设口令、再激活；核对后决定唯一数据源切换 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| p6-deploy-authorization | 是否授权在 VPS 上部署、迁移数据并由你本人设置口令？ |
| p4-acceptance | P4 产品验收：已暂且搁置，恢复使用后由 Morii 记录。 |
| p5-week-trial | P5 一周真实使用与 MVP 验收：已暂且搁置，恢复后记录。 |

## 证据与交接

- 2026-10-20 已核对远端 `main` 为 `d0fb1c9`；[PR #41](https://github.com/Morii9961/Moriium-Dashboard/pull/41) 开启，head `144c63a`，尚未合并。下列 2026-10-17 检查属于历史记录。
- 本分支 [部署前修复](../verification/p6-deploy-preflight.md)：`pnpm verify` 392 项测试、类型检查及公开树审计通过；11 个虚构发布场景通过。本机链接操作使用模型，Linux CI 需另核对。没有连接 VPS 或操作真实数据。
- Morii 已选公网子域名、HTTPS 加登录；具体地址和主机资料只保存在本机忽略目录。本次 PR 合并、正式部署与迁移仍待明确授权。
- PR #31–#34 已于 2026-10-17 按依赖顺序合并（main bd4d9ed）。
- [#35](https://github.com/Morii9961/Moriium-Dashboard/pull/35) 状态快照、[#36](https://github.com/Morii9961/Moriium-Dashboard/pull/36) HTTP 接入、[#37](https://github.com/Morii9961/Moriium-Dashboard/pull/37) 登录页、[#38](https://github.com/Morii9961/Moriium-Dashboard/pull/38) 部署模板、[#39](https://github.com/Morii9961/Moriium-Dashboard/pull/39) 本机仓库扫描，各 head 双平台 CI 通过后于 2026-10-17 按顺序合并（main 2f0b072）。
- 本地 `pnpm verify`：387 项测试 / 22 个文件、类型检查、公开树审计通过。登录页在临时虚构实例上实测深浅色、375px、中日英、错误与正确登录、退出、锁定提示和键盘流程。
- 部署模板只在仓库内，没有连接任何服务器。
- P7 · L2 本机仓库扫描：本地 `pnpm verify` 392 项测试 / 23 个文件与公开树审计通过，临时虚构实例上完成浏览器检查，见 [验证记录](../verification/p7-local-scan.md)。

本快照手动更新；没有用量采集、后台同步或百分比估算。
