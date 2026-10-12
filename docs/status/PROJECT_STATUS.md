# Moriium Dashboard · 项目状态

> 与 [`project-status.json`](./project-status.json) 内容相同，这是给人看的版本。
> 快照时间：2026-10-12 20:43（UTC+8）· 协议 v1.1 · 报告来自 Claude（开发会话 P1 到 P3，交接给 Codex）· 分支 `main` · 提交 `f5702df` · 测试：生成快照时未重跑（按 v1 约定写 false；之前刚跑过 `pnpm verify`，290/290）

## 阶段

**开发中（development）**。整体进度：不估算（`null`）。

P1 到 P3 已完成并合并进 `main`：协议包与检查工具、设计基线与应用外壳、项目登记、导入、历史与导出。六个项目的真实快照已导入 Morii 本机。下一步是 P4 项目与概览，由 Codex 接手，交接见 [`docs/handoff-2026-10-12-codex-p4.md`](../handoff-2026-10-12-codex-p4.md)。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| `p0-plan-approval` | P0 规划获批 | 完成 | Morii 已验收：[设计决定记录](../design-decisions.md) | 已验收 |
| `p1-repo-protocol` | P1 仓库与协议 | 完成 | 仓库：[#6](https://github.com/Morii9961/Moriium-Dashboard/pull/6) 及之前的 PR | 待验收 |
| `p2-shell-design` | P2 外壳与设计基线 | 完成 | 仓库：[#7](https://github.com/Morii9961/Moriium-Dashboard/pull/7) 到 [#10](https://github.com/Morii9961/Moriium-Dashboard/pull/10)、[设计决定记录](../design-decisions.md) | 待验收 |
| `p3-import-history` | P3 导入与历史 | 完成 | 仓库：[#11](https://github.com/Morii9961/Moriium-Dashboard/pull/11) 到 [#15](https://github.com/Morii9961/Moriium-Dashboard/pull/15) | 待验收 |
| `p4-projects-overview` | P4 项目与概览 | 未开始 | — | 待验收 |
| `p5-mvp` | P5 MVP 完成 | 未开始 | — | 待验收 |
| `p6-vps-deploy` | P6 VPS 部署 | 未开始 | — | 待验收 |

## 阻塞

无。

## 下一步

| ID | 优先级 | 做什么 | 完成后得到什么 |
| --- | --- | --- | --- |
| `p4-project-list` | P0 | 项目列表（P4.1）：表格与手机卡片、阶段轴、里程碑格、按项目阈值的新鲜度 | 项目页一眼看出每个项目做到哪里、报告是否过期 |
| `p4-project-detail` | P0 | 项目详情与验收（P4.2、P4.3）：来源行、里程碑与证据、验收通过或退回、待决定与阻塞的处理状态 | Morii 的判断单独记录，下一份快照来了也不会被覆盖 |
| `p4-overview` | P1 | 概览（P4.5）：需要你决定、报告新鲜度、Agent 最近报告、最近交付 | 30 秒测试可以通过 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| `enable-snapshots` | 建议现在就把「生成项目状态快照」的指令（[`docs/protocol/agent-snapshot-prompt.md`](../protocol/agent-snapshot-prompt.md)）放进其他五个项目的 `AGENTS.md`。这一步改的是其他仓库，需要 Morii 自己做，或另行明确授权。 |
| `vps-access` | 部署到 VPS 后用私网访问，还是公网子域名加登录？最晚在 P6 开始前定。 |

## 依据

规划 06、设计决定记录、交接文档、PR #6 到 #15（已合并）、本机 `pnpm verify` 与 CI、Morii 本机数据目录里的真实快照导入。
