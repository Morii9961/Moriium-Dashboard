# Moriium Dashboard · 项目状态

> 与 [project-status.json](./project-status.json) 同步。
> 快照时间：2026-10-14 18:29:44（UTC+8）· 协议 v1.1 · 报告来自 Codex · 分支 `codex/p5-5-accessibility` · 代码提交 `cc89929940a6ec7c6e2eb542ba39f968f416149f`。
> `tests_rerun: false`：生成快照不另跑测试；开发期间最新验证为 326 项测试、类型检查、公开树审计和生产构建通过。

## 阶段

**待验收（acceptance）**。整体进度保持 `null`，不估算。

P5 核心工程完成：Agents、今日焦点与精力、任务及确切来源、成果与受限封面、最近交付和界面评审已验证。P4 产品验收与 P5 一周真实试用待 Morii；正式实例尚未更新，未打 `v0.1.0`，P6 未开始。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| `p0-plan-approval` | P0 规划获批 | 完成 | [设计决定](../design-decisions.md) | 据记录已验收 |
| `p1-repo-protocol` | P1 仓库与协议 | 完成 | [#6](https://github.com/Morii9961/Moriium-Dashboard/pull/6) 及之前的 PR | 待验收 |
| `p2-shell-design` | P2 外壳与设计基线 | 完成 | [#7](https://github.com/Morii9961/Moriium-Dashboard/pull/7) 到 [#10](https://github.com/Morii9961/Moriium-Dashboard/pull/10) | 待验收 |
| `p3-import-history` | P3 导入与历史 | 完成 | [#11](https://github.com/Morii9961/Moriium-Dashboard/pull/11) 到 [#15](https://github.com/Morii9961/Moriium-Dashboard/pull/15) | 待验收 |
| `p4-projects-overview` | P4 项目与概览 | 进行中：工程完成 | [#18](https://github.com/Morii9961/Moriium-Dashboard/pull/18) 到 [#23](https://github.com/Morii9961/Moriium-Dashboard/pull/23)、[P4 验证](../verification/p4-6.md) | 待验收 |
| `p5-mvp` | P5 MVP 完成 | 进行中：核心工程与开发方评审完成 | [#24](https://github.com/Morii9961/Moriium-Dashboard/pull/24) 到 [#27](https://github.com/Morii9961/Moriium-Dashboard/pull/27)、[P5.5 验证](../verification/p5-5.md) | 待一周真实试用与验收 |
| `p6-vps-deploy` | P6 VPS 部署 | 未开始 | — | 待验收 |

P5 工作包按 5.1 → 5.2 → 5.3 → 5.4 → 5.5 执行。#24 到 #27 已核实普通合并；5.5 随本快照所在 PR 交付，最终双平台 CI 与合并状态以 GitHub 为准。快照绑定生成时已经验证的代码提交，文档与快照随后提交。

## 阻塞

无工程阻塞。P4 产品验收和 P5 一周真实试用待 Morii，开发方不代填结果。

## 下一步

| ID | 优先级 | 工作 | 结果 |
| --- | --- | --- | --- |
| `p4-human-walkthrough` | P0 | 30 秒概览测试、六项目各 10 秒检查与十个状态来源抽查 | 补记 P4 产品验收与实际调整项；P5 开发授权不代替验收 |
| `p5-week-trial` | P0 | 使用更新后的原有正式实例，进行一周真实试用并完成四项 MVP 产品验收 | 记录实际开始日期、各推进项目至少一次导入、30 秒测试、十个来源抽查、虚假进度检查和使用反馈；通过后再打标签 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| `p4-acceptance` | P4 概览、六项目进度与来源抽查是否通过？由 Morii 记录。 |
| `p5-week-trial` | P5 一周实际使用是否顺手，四项 MVP 产品验收是否通过？记录实际日期与问题。 |
| `enable-snapshots` | 其他五个仓库的快照指令由 Morii 加入或另行授权；本轮未修改其他仓库。 |
| `vps-access` | VPS 的私网或公网访问方式在 P6 之前决定；本轮未部署。 |

## 验证与交接

- 本机完整验证：17 个测试文件、326 项测试、类型检查和公开树审计通过；生产构建通过。11 个既有提醒。
- 独立虚构数据库十二组三语 / 浅深 / 桌面 / 375px：焦点、任务、来源、成果与封面、最近交付、回收站与恢复、导航和筛选草稿保护通过。键盘、减少动画偏好、对比度、无溢出、CSP 和无外部请求已检查。
- 连续焦点保存使用服务器确认的版本；延迟读取探针浅深两组通过。其他窗口的旧版本仍被拒绝。
- 本轮没有打开正式数据库，迁移 0008 到 0010 尚未在正式数据执行。原有 P4 真实只读副本的历史走查不作为 P5 本轮验证。
- [试用交接](../handoff-2026-10-14-p5-trial.md)包含正式数据目录核对、迁移前备份、启动方式、试用与验收清单。

本轮快照仅手动更新，未自动导入 Dashboard。可选 P1 收尾项与 5.6 未加入；P6 前须完成的恢复导出包产品流程仍待后续。
