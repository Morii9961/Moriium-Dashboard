# Moriium Dashboard · 项目状态

> 与 [`project-status.json`](./project-status.json) 内容相同，这是给人看的版本。
> 快照时间：2026-10-12 09:27（UTC+8）· 协议 v1.1 · 报告来自 Claude（开发会话，P1）· 分支 `claude/protocol-docs` · 提交 `3558560` · 测试：本次生成快照时未重跑（按 v1 约定写 false；生成前刚跑过 `pnpm verify`，206/206）

## 阶段

**开发中（development）**。整体进度：不估算（`null`）。

P1 的六个工作包都已提交 PR：协议 Schema 正式发布，校验、接收规则、样本、`status:check` 检查工具和正式文档已完成，本机 206 项测试通过。等 Morii 用检查工具看真实快照并审阅合并；P2 还没开始。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| `p0-plan-approval` | P0 规划获批 | 完成 | Morii 已验收：[设计决定记录](../design-decisions.md) | 已验收 |
| `p1-repo-protocol` | P1 仓库与协议 | 进行中 | 仓库：[#1](https://github.com/Morii9961/Moriium-Dashboard/pull/1)、[#2](https://github.com/Morii9961/Moriium-Dashboard/pull/2)、[#3](https://github.com/Morii9961/Moriium-Dashboard/pull/3)、[#4](https://github.com/Morii9961/Moriium-Dashboard/pull/4)、[协议正式文档](../protocol/README.md)、[样本清单](../../fixtures/protocol/cases.json) | 待验收 |
| `p2-shell-design` | P2 外壳与设计基线 | 未开始 | — | 待验收 |
| `p3-import-history` | P3 导入与历史 | 未开始 | — | 待验收 |
| `p4-projects-overview` | P4 项目与概览 | 未开始 | — | 待验收 |
| `p5-mvp` | P5 MVP 完成 | 未开始 | — | 待验收 |
| `p6-vps-deploy` | P6 VPS 部署 | 未开始 | — | 待验收 |

P1 为什么还不是「完成」：交付标准有三条，其中「CI 通过」和「每个样本的结果与文档一致」已满足（本机全部通过，PR #1 的 CI 在 Ubuntu 和 Windows 上通过）；第三条「Morii 用检查工具看一两份真实快照，能看懂输出」要在停点由 Morii 完成。

| 工作包 | 内容 | PR |
| --- | --- | --- |
| 1.1 | 建仓、隐私检查、首次提交、推送 | 直接进 `main`（`adfb890`） |
| 1.2 | 工作区、严格类型、Biome、Vitest、CI、公开树审计 | #1 |
| 1.3 | 协议包：Schema 发布、校验、接收规则、指纹、差异、定位 | #2 |
| 1.4 | 协议样本与清单 | #3 |
| 1.5 | `pnpm status:check` | #4 |
| 1.6 | 协议正式文档、Agent 指令模板定稿 | `claude/protocol-docs` |

## 阻塞

无。

## 下一步

| ID | 优先级 | 做什么 | 完成后得到什么 |
| --- | --- | --- | --- |
| `design-specimen` | P0 | 制作设计样张页（P2.1），用成熟项目、持续研发项目和 Dashboard 自己的快照 | Morii 用真实内容逐项确定字体、配色和阶段轴画法 |
| `server-skeleton` | P1 | 服务端骨架（P2.4）：Hono、SQLite 与迁移、数据目录、Host 与 Origin 检查、CSP、每日备份 | 服务端能在空数据库上启动并生成备份 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| `p1-review` | P1 停点：请用 `pnpm status:check` 看一两份真实快照，确认输出看得懂；PR #1 到 #5 是否合并？ |
| `protocol-interpretations` | 三处接收规则按我的理解实现，是否同意：`summary` 只有空白算错误；v1.0 文件里出现 `reporter` 或条目 `id` 时忽略并提醒；`+08:00` 和 `Z` 写法指向同一时刻时算同一时刻冲突？ |
| `enable-snapshots` | 什么时候把「生成项目状态快照」的指令（[`docs/protocol/agent-snapshot-prompt.md`](../protocol/agent-snapshot-prompt.md)）放进其他五个项目的 `AGENTS.md`？检查工具已经可用。 |
| `data-dir-location` | 本机数据目录放在哪里？建议用系统的应用数据目录（Windows 上是 `%LOCALAPPDATA%\moriium-dashboard`），不放进 OneDrive 等同步目录；也可以用 `MORIIUM_DASHBOARD_DATA` 指定别处。P2.4 之前需要答案。 |
| `vps-access` | 部署到 VPS 后用私网访问，还是公网子域名加登录？最晚在 P6 开始前定。 |

## 依据

规划 06、设计决定记录、ADR 0001 与 0002、协议正式文档、样本清单、PR #1 到 #4 与 `claude/protocol-docs` 分支、本机 `pnpm verify` 与 `pnpm status:check` 的结果。
