# Moriium Dashboard · 项目状态

> 与 [project-status.json](./project-status.json) 同步，供手动导入。
> 快照时间：2026-10-17T17:25:01+08:00 · 协议 v1.1 · 项目 ID morii.dashboard · Claude。
> 分支 main · 提交 2f0b0725b3a2b462dae4eeafba85d2b3973547ec。
> tests_rerun: false：本地 pnpm verify 与 PR CI 的结果写在依据里，由 Dashboard 之外核实。

## 阶段

**开发中（development）**。整体进度为 null，没有估算百分比。

P6 的工程部分（恢复、登录底层、口令工具、HTTP 接入、登录页、部署模板）与 P7 · L2 本机仓库扫描已合并入 main。实际使用与 P4/P5 验收暂且搁置。剩下的 VPS 部署需要 Morii 授权、选定访问方式并亲自设置口令。

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
| p6-deploy | P1 | 按[部署说明](../operations/deploy.md)在 VPS 上部署并逐项完成验收清单 | 需要 Morii 授权、选定访问方式、本人设置口令；迁移后两边记录数量一致，此后 VPS 为唯一数据源 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| vps-access | 正式部署采用私网还是公网子域名？两种 Nginx 模板都已准备，都要求 HTTPS 和登录。 |
| p6-deploy-authorization | 是否授权在 VPS 上部署、迁移数据并由你本人设置口令？ |
| p4-acceptance | P4 产品验收：已暂且搁置，恢复使用后由 Morii 记录。 |
| p5-week-trial | P5 一周真实使用与 MVP 验收：已暂且搁置，恢复后记录。 |

## 证据与交接

- PR #31–#34 已于 2026-10-17 按依赖顺序合并（main bd4d9ed）。
- [#35](https://github.com/Morii9961/Moriium-Dashboard/pull/35) 状态快照、[#36](https://github.com/Morii9961/Moriium-Dashboard/pull/36) HTTP 接入、[#37](https://github.com/Morii9961/Moriium-Dashboard/pull/37) 登录页、[#38](https://github.com/Morii9961/Moriium-Dashboard/pull/38) 部署模板、[#39](https://github.com/Morii9961/Moriium-Dashboard/pull/39) 本机仓库扫描，各 head 双平台 CI 通过后于 2026-10-17 按顺序合并（main 2f0b072）。
- 本地 `pnpm verify`：387 项测试 / 22 个文件、类型检查、公开树审计通过。登录页在临时虚构实例上实测深浅色、375px、中日英、错误与正确登录、退出、锁定提示和键盘流程。
- 部署模板只在仓库内，没有连接任何服务器。
- P7 · L2 本机仓库扫描：本地 `pnpm verify` 392 项测试 / 23 个文件与公开树审计通过，临时虚构实例上完成浏览器检查，见 [验证记录](../verification/p7-local-scan.md)。

本快照手动更新；没有用量采集、后台同步或百分比估算。
