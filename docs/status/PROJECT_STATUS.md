# Moriium Dashboard · 项目状态

> 与 [`project-status.json`](./project-status.json) 内容相同，这是给人看的版本。
> 快照时间：2026-10-12 08:32（UTC+8）· 协议 v1.1 · 报告来自 Claude（规划会话）· 分支和提交：无（Git 仓库尚未建立）· 测试：未运行

## 阶段

**规划中（planning）**。整体进度：不估算（`null`）。

规划已于 2026-10-12 获批：前端加本机 SQLite 小服务，协议支持 v1.0 与 v1.1，首版按 MVP 执行并以各项目的进度展示为重点。正式开发将在新会话里从 P1 开始，目前还没有代码和 Git 仓库。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| `p0-plan-approval` | P0 规划获批 | 完成 | Morii 已验收：[设计决定记录](../design-decisions.md) | 已验收 |
| `p1-repo-protocol` | P1 仓库与协议 | 未开始 | — | 待验收 |
| `p2-shell-design` | P2 外壳与设计基线 | 未开始 | — | 待验收 |
| `p3-import-history` | P3 导入与历史 | 未开始 | — | 待验收 |
| `p4-projects-overview` | P4 项目与概览 | 未开始 | — | 待验收 |
| `p5-mvp` | P5 MVP 完成 | 未开始 | — | 待验收 |
| `p6-vps-deploy` | P6 VPS 部署 | 未开始 | — | 待验收 |

## 阻塞

无。

## 下一步

| ID | 优先级 | 做什么 | 完成后得到什么 |
| --- | --- | --- | --- |
| `p1-start` | P0 | 在新会话里按[启动提示词](../handoff-2026-10-12-development-kickoff.md)开始 P1.1：初始化 Git，创建公开仓库 `Morii9961/Moriium-Dashboard` 并推送 | 下一份快照能写入分支和提交 |
| `protocol-package` | P1 | 实现 `packages/protocol` 与协议样本测试，提供 `status:check` | Schema v1.0 与 v1.1 发布，接收规则有自动化测试 |
| `design-specimen` | P1 | 制作设计样张页，至少用一个成熟项目、一个持续研发项目和 Dashboard 自己的快照 | Morii 用真实内容逐项确定视觉 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| `enable-snapshots` | 什么时候把「生成项目状态快照」的指令放进其他五个项目的 `AGENTS.md`？建议在 P1 结束、检查工具可用之后。 |
| `vps-access` | 部署到 VPS 后用私网访问，还是公网子域名加登录？最晚在 P6 开始前定。 |

## 依据

`docs/planning/` 下的规划文档与两份 Schema、`docs/design-decisions.md`、开发启动提示词、`AGENTS.md`。
