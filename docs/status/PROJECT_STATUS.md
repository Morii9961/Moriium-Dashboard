# Moriium Dashboard · 项目状态

> 与 [`project-status.json`](./project-status.json) 内容相同，这是给人看的版本。
> 快照时间：2026-10-12 08:55（UTC+8）· 协议 v1.1 · 报告来自 Claude（开发会话，P1）· 分支 `claude/workspace-tooling` · 提交 `6372af6` · 测试：本次已运行（`pnpm verify` 通过）

## 阶段

**开发中（development）**。整体进度：不估算（`null`）。

公开仓库已建立并推送首次提交；工作区、类型检查、测试、CI 和公开树审计已在分支上完成，等待 CI 与合并。协议包、样本和检查工具（P1.3 到 P1.6）还没开始。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| `p0-plan-approval` | P0 规划获批 | 完成 | Morii 已验收：[设计决定记录](../design-decisions.md) | 已验收 |
| `p1-repo-protocol` | P1 仓库与协议 | 进行中 | 仓库：[GitHub](https://github.com/Morii9961/Moriium-Dashboard)、[CI](../../.github/workflows/ci.yml)、[公开树审计](../../scripts/audit-public.ts)、[ADR 0001](../adr/0001-toolchain-and-native-typescript.md) | 待验收 |
| `p2-shell-design` | P2 外壳与设计基线 | 未开始 | — | 待验收 |
| `p3-import-history` | P3 导入与历史 | 未开始 | — | 待验收 |
| `p4-projects-overview` | P4 项目与概览 | 未开始 | — | 待验收 |
| `p5-mvp` | P5 MVP 完成 | 未开始 | — | 待验收 |
| `p6-vps-deploy` | P6 VPS 部署 | 未开始 | — | 待验收 |

P1 已完成的工作包：1.1（建仓、首次提交、推送）。1.2（工作区与 CI）在分支上，等 CI 和合并。

## 阻塞

无。

## 下一步

| ID | 优先级 | 做什么 | 完成后得到什么 |
| --- | --- | --- | --- |
| `protocol-package` | P0 | 实现 `packages/protocol`（P1.3）与协议样本（P1.4），提供 `status:check`（P1.5） | Schema v1.0 与 v1.1 发布，接收规则有自动化测试，Morii 能用检查工具看真实快照 |
| `design-specimen` | P1 | 制作设计样张页（P2.1），用成熟项目、持续研发项目和 Dashboard 自己的快照 | Morii 用真实内容逐项确定字体、配色和阶段轴画法 |
| `server-skeleton` | P1 | 服务端骨架（P2.4）：Hono、SQLite 与迁移、数据目录、Host 与 Origin 检查、CSP、每日备份 | 服务端能在空数据库上启动并生成备份 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| `enable-snapshots` | 什么时候把「生成项目状态快照」的指令放进其他五个项目的 `AGENTS.md`？建议在 P1 结束、检查工具可用之后。 |
| `data-dir-location` | 本机数据目录放在哪里？建议用系统的应用数据目录（Windows 上是 `%LOCALAPPDATA%\moriium-dashboard`），不放进 OneDrive 等同步目录；也可以用 `MORIIUM_DASHBOARD_DATA` 指定别处。P2.4 之前需要答案。 |
| `vps-access` | 部署到 VPS 后用私网访问，还是公网子域名加登录？最晚在 P6 开始前定。 |

## 依据

`docs/planning/06-mvp-and-roadmap.md`、`docs/design-decisions.md`、ADR 0001、GitHub 仓库、CI 配置、公开树审计脚本、本机 `pnpm verify` 的结果。
