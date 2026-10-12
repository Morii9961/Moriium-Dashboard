# Moriium Dashboard · 项目状态

> 与 [`project-status.json`](./project-status.json) 内容相同，这是给人看的版本。
> 快照时间：2026-10-12 20:14（UTC+8）· 协议 v1.1 · 报告来自 Claude（开发会话）· 分支 `claude/export` · 提交 `29545c2` · 测试：生成快照时未重跑（按 v1 约定写 false；之前刚跑过 `pnpm verify`，290/290）

## 阶段

**开发中（development）**。整体进度：不估算（`null`）。

P3 的五个工作包都已提交 PR：项目登记、导入对话框、快照存储与导入接口、历史与对比、导出。端到端测试覆盖交付标准列出的情况，临时数据目录里已导入六个项目的真实快照。等 Morii 用真实文件试导一轮、合并 PR 后，P3 才算完成；下一步是 P4 项目与概览。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| `p0-plan-approval` | P0 规划获批 | 完成 | Morii 已验收：[设计决定记录](../design-decisions.md) | 已验收 |
| `p1-repo-protocol` | P1 仓库与协议 | 进行中 | 仓库：PR [#1](https://github.com/Morii9961/Moriium-Dashboard/pull/1) 到 [#6](https://github.com/Morii9961/Moriium-Dashboard/pull/6) | 待验收 |
| `p2-shell-design` | P2 外壳与设计基线 | 进行中 | 仓库：PR [#7](https://github.com/Morii9961/Moriium-Dashboard/pull/7) 到 [#10](https://github.com/Morii9961/Moriium-Dashboard/pull/10)、[设计决定记录](../design-decisions.md) | 待验收 |
| `p3-import-history` | P3 导入与历史 | 进行中 | 仓库：PR [#11](https://github.com/Morii9961/Moriium-Dashboard/pull/11) 到 [#15](https://github.com/Morii9961/Moriium-Dashboard/pull/15) | 待验收 |
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
| `p4-overview` | P1 | 概览（P4.5）：需要你决定、项目、报告新鲜度、Agent 最近报告、最近交付 | 30 秒测试可以通过 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| `p3-trial-import` | 用真实文件试导一轮（`pnpm build` 后 `pnpm server`，打开 `http://127.0.0.1:5180`，点「导入」选五个项目的 `project-status.json`），指出看不懂的提示。 |
| `merge-stack` | PR 是一层叠一层开的，请按 #6 → #7 → … → #15 的顺序合并；每个都以 `main` 为目标。 |
| `issue-translation` | 导入时的问题说明由协议包生成，目前只有中文，日文和英文界面里也显示中文。要不要翻译成日文和英文？ |
| `p1-review` | 用 `pnpm status:check` 看过真实快照了吗？输出看得懂吗？ |
| `protocol-interpretations` | 三处接收规则按我的理解实现，是否同意：`summary` 只有空白算错误；v1.0 文件里出现 `reporter` 或条目 `id` 时忽略并提醒；`+08:00` 和 `Z` 写法指向同一时刻时算同一时刻冲突？ |
| `data-dir-location` | 本机数据目录默认用 `%LOCALAPPDATA%\moriium-dashboard`（可用 `MORIIUM_DASHBOARD_DATA` 改），在仓库里或同步盘里时拒绝启动。P2.3、P3.1 试跑服务端时已经在这个位置建了空数据库（迁移到版本 2）和备份；P3 的导入测试都在临时目录里做，没有写进这里。这个默认位置可以吗？ |
| `enable-snapshots` | 什么时候把「生成项目状态快照」的指令（[`docs/protocol/agent-snapshot-prompt.md`](../protocol/agent-snapshot-prompt.md)）放进其他五个项目的 `AGENTS.md`？检查工具已经可用。 |
| `vps-access` | 部署到 VPS 后用私网访问，还是公网子域名加登录？最晚在 P6 开始前定。 |

## 依据

规划 04、06，设计决定记录，PR #11 到 #15，本机 `pnpm verify`，临时数据目录里的真实快照试导、Git 历史补导与导出再导入。
