# Moriium Dashboard · 项目状态

> 与 [`project-status.json`](./project-status.json) 内容相同，这是给人看的版本。
> 快照时间：2026-10-12 19:30（UTC+8）· 协议 v1.1 · 报告来自 Claude（开发会话，P2）· 分支 `claude/app-shell` · 提交 `3c1c553` · 测试：生成快照时未重跑（按 v1 约定写 false；之前刚跑过 `pnpm verify`，262/262）

## 阶段

**开发中（development）**。整体进度：不估算（`null`）。

P2 的四个工作包都已提交 PR：样张的决定都已定稿，token、本地字体、主题、三语框架和应用外壳已完成，前端由本机服务托管。等 Morii 看过线路总图和外壳、按顺序合并 PR 后，P2 才算完成；下一步是 P3 导入。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| `p0-plan-approval` | P0 规划获批 | 完成 | Morii 已验收：[设计决定记录](../design-decisions.md) | 已验收 |
| `p1-repo-protocol` | P1 仓库与协议 | 进行中 | 仓库：PR [#1](https://github.com/Morii9961/Moriium-Dashboard/pull/1) 到 [#5](https://github.com/Morii9961/Moriium-Dashboard/pull/5) 已合并（合进了叠放的分支），[#6](https://github.com/Morii9961/Moriium-Dashboard/pull/6) 把它们带进 `main` | 待验收 |
| `p2-shell-design` | P2 外壳与设计基线 | 进行中 | 仓库：[#7](https://github.com/Morii9961/Moriium-Dashboard/pull/7) 服务端骨架、[#8](https://github.com/Morii9961/Moriium-Dashboard/pull/8) 设计样张、[#9](https://github.com/Morii9961/Moriium-Dashboard/pull/9) 设计基线、P2.3 应用外壳、[设计决定记录](../design-decisions.md) | 待验收 |
| `p3-import-history` | P3 导入与历史 | 未开始 | — | 待验收 |
| `p4-projects-overview` | P4 项目与概览 | 未开始 | — | 待验收 |
| `p5-mvp` | P5 MVP 完成 | 未开始 | — | 待验收 |
| `p6-vps-deploy` | P6 VPS 部署 | 未开始 | — | 待验收 |

## 阻塞

无。

## 下一步

| ID | 优先级 | 做什么 | 完成后得到什么 |
| --- | --- | --- | --- |
| `p3-registry` | P0 | 项目登记（P3.1）：服务端预置六个项目，设置页的项目管理 | 前端从服务端读取登记表，不再用协议包里的预置列表 |
| `p3-import-dialog` | P0 | 导入对话框（P3.2）：多文件、即时预览、服务端复核、确认、撤销；导入记录页 | 六个项目的真实快照可以导入，概览的线路总图显示真实进度 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| `p2-review` | 看一下线路总图和应用外壳（`pnpm build` 后 `pnpm server`，打开 `http://127.0.0.1:5180`）是否可以；然后按 #6 → #7 → #8 → #9 → P2.3 的顺序合并 PR。 |
| `p1-review` | 用 `pnpm status:check` 看过真实快照了吗？输出看得懂吗？ |
| `protocol-interpretations` | 三处接收规则按我的理解实现，是否同意：`summary` 只有空白算错误；v1.0 文件里出现 `reporter` 或条目 `id` 时忽略并提醒；`+08:00` 和 `Z` 写法指向同一时刻时算同一时刻冲突？ |
| `data-dir-location` | 本机数据目录默认用 `%LOCALAPPDATA%\moriium-dashboard`（可用 `MORIIUM_DASHBOARD_DATA` 改），在仓库里或同步盘里时拒绝启动。P2.3 试跑服务端时已经在这个位置建了空数据库和一份备份。这个默认位置可以吗？ |
| `enable-snapshots` | 什么时候把「生成项目状态快照」的指令（[`docs/protocol/agent-snapshot-prompt.md`](../protocol/agent-snapshot-prompt.md)）放进其他五个项目的 `AGENTS.md`？检查工具已经可用。 |
| `vps-access` | 部署到 VPS 后用私网访问，还是公网子域名加登录？最晚在 P6 开始前定。 |

## 依据

规划 06、设计决定记录、PR #6 到 #9、本机 `pnpm verify`、生产构建在严格 CSP 下的试跑与截图检查。
