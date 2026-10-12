# Moriium Dashboard · 项目状态

> 与 [`project-status.json`](./project-status.json) 内容相同，这是给人看的版本。
> 快照时间：2026-10-12 13:12（UTC+8）· 协议 v1.1 · 报告来自 Claude（开发会话，P2）· 分支 `claude/design-specimen` · 提交 `9170cd8` · 测试：生成快照时未重跑（按 v1 约定写 false；之前刚跑过 `pnpm verify`，242/242）

## 阶段

**开发中（development）**。整体进度：不估算（`null`）。

P2.4 服务端骨架和 P2.1 设计样张已提交 PR，样张用真实快照比较字体、颜色、状态表达和阶段轴，等 Morii 逐项拍板后定稿 token。P1.3 到 P1.6 已审阅，但要合并 #6 才进入 `main`。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| `p0-plan-approval` | P0 规划获批 | 完成 | Morii 已验收：[设计决定记录](../design-decisions.md) | 已验收 |
| `p1-repo-protocol` | P1 仓库与协议 | 进行中 | 仓库：PR [#1](https://github.com/Morii9961/Moriium-Dashboard/pull/1) 到 [#5](https://github.com/Morii9961/Moriium-Dashboard/pull/5) 已合并（合进了叠放的分支），[#6](https://github.com/Morii9961/Moriium-Dashboard/pull/6) 把它们带进 `main` | 待验收 |
| `p2-shell-design` | P2 外壳与设计基线 | 进行中 | 仓库：[#7](https://github.com/Morii9961/Moriium-Dashboard/pull/7) 服务端骨架、[#8](https://github.com/Morii9961/Moriium-Dashboard/pull/8) 设计样张、[ADR 0003](../adr/0003-server-storage-and-local-security.md) | 待验收 |
| `p3-import-history` | P3 导入与历史 | 未开始 | — | 待验收 |
| `p4-projects-overview` | P4 项目与概览 | 未开始 | — | 待验收 |
| `p5-mvp` | P5 MVP 完成 | 未开始 | — | 待验收 |
| `p6-vps-deploy` | P6 VPS 部署 | 未开始 | — | 待验收 |

P2 的工作包：2.1 设计样张（#8，等你拍板）、2.4 服务端骨架（#7）已完成；2.2 token 定稿、2.3 应用外壳要等拍板之后做。

## 阻塞

无。

## 下一步

| ID | 优先级 | 做什么 | 完成后得到什么 |
| --- | --- | --- | --- |
| `design-tokens` | P0 | 按 Morii 的拍板定稿颜色、字体、间距 token，字体本地打包，主题切换，三语框架与文案约定（P2.2） | 正式 token 写进 `design-decisions.md`，样张的候选值退役 |
| `app-shell` | P1 | 应用外壳（P2.3）：响应式导航、路由、空状态、错误边界、「服务未连接」横幅，由服务端提供静态文件 | 外壳在两种宽度、两种主题、三种语言下通过检查 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| `specimen-decisions` | 设计样张（PR #8）逐项拍板：字体方案 A 或 B、等宽字、强调色、阶段轴画法、中性色与状态色、深色模式、日文敬体或常体、中文里中英文之间是否加空格。 |
| `p1-review` | 请合并 #6，把已审阅的 P1.3 到 P1.6 带进 `main`（之前的 PR 是叠着的，合进了各自的上一层分支）；之后再合并 #7、#8。用 `pnpm status:check` 看过真实快照了吗？ |
| `protocol-interpretations` | 三处接收规则按我的理解实现，是否同意：`summary` 只有空白算错误；v1.0 文件里出现 `reporter` 或条目 `id` 时忽略并提醒；`+08:00` 和 `Z` 写法指向同一时刻时算同一时刻冲突？ |
| `data-dir-location` | 本机数据目录先按建议用 `%LOCALAPPDATA%\moriium-dashboard`（可用 `MORIIUM_DASHBOARD_DATA` 改），在仓库里或同步盘里时拒绝启动。这个默认位置可以吗？ |
| `enable-snapshots` | 什么时候把「生成项目状态快照」的指令（[`docs/protocol/agent-snapshot-prompt.md`](../protocol/agent-snapshot-prompt.md)）放进其他五个项目的 `AGENTS.md`？检查工具已经可用。 |
| `vps-access` | 部署到 VPS 后用私网访问，还是公网子域名加登录？最晚在 P6 开始前定。 |

## 依据

规划 06、设计决定记录、ADR 0003、PR #6 到 #8、候选 token 文件、本机 `pnpm verify` 与服务端试跑的结果。
