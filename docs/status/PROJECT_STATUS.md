# Moriium Dashboard · 项目状态

> 与 [project-status.json](./project-status.json) 同步。
> 快照时间：2026-10-13 19:58:26（UTC+8）· 协议 v1.1 · 报告来自 Codex · 分支 `codex/p4-6-progress-review` · 代码提交 `4b5a086a280c948cf784d920b994d1f987b22698`。
> `tests_rerun` 按 v1 约定写 `false`：生成快照不另跑测试。开发期间完整验证为 306 个测试通过；相同代码提交的 Windows、Linux CI 通过。

## 阶段

**开发中（development）**。整体进度保持 `null`，不估算。

P4 六个工程工作包已实现：项目列表与详情、独立验收、跨快照处理状态、概览、手动项目与进度打磨。真实数据库只读副本走查通过。Morii 的 30 秒测试、六项目逐项验收与来源抽查尚未进行，因此 P4 里程碑保持进行中。P5、P6 未开始。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| `p0-plan-approval` | P0 规划获批 | 完成 | [设计决定](../design-decisions.md) | 据记录已验收 |
| `p1-repo-protocol` | P1 仓库与协议 | 完成 | [#6](https://github.com/Morii9961/Moriium-Dashboard/pull/6) 及之前的 PR | 待验收 |
| `p2-shell-design` | P2 外壳与设计基线 | 完成 | [#7](https://github.com/Morii9961/Moriium-Dashboard/pull/7) 到 [#10](https://github.com/Morii9961/Moriium-Dashboard/pull/10) | 待验收 |
| `p3-import-history` | P3 导入与历史 | 完成 | [#11](https://github.com/Morii9961/Moriium-Dashboard/pull/11) 到 [#15](https://github.com/Morii9961/Moriium-Dashboard/pull/15) | 待验收 |
| `p4-projects-overview` | P4 项目与概览 | 进行中：工程完成，产品验收待进行 | [#18](https://github.com/Morii9961/Moriium-Dashboard/pull/18) 到 [#23](https://github.com/Morii9961/Moriium-Dashboard/pull/23)、[验证记录](../verification/p4-6.md) | 待验收 |
| `p5-mvp` | P5 MVP 完成 | 未开始 | — | 待验收 |
| `p6-vps-deploy` | P6 VPS 部署 | 未开始 | — | 待验收 |

工作包按交接顺序执行：4.1 → 4.2 → 4.3 → 4.5 → 4.4 → 4.6。PR #18 到 #22 已普通合并；P4.6 对应 PR #23。快照绑定生成时已经验证的代码提交，文档与快照随后在同一 PR 中提交。

## 阻塞

无工程阻塞。P4 产品验收待 Morii 进行，不代填验收结果。

## 下一步

| ID | 优先级 | 工作 | 结果 |
| --- | --- | --- | --- |
| `p4-human-walkthrough` | P0 | 30 秒概览测试、六项目各 10 秒检查与 10 个状态来源抽查 | 记录 Morii 的验收结果和需要调整的地方，之后再决定是否进入 P5 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| `p4-acceptance` | P4 的概览、六项目进度展示与来源抽查是否通过？工程检查已完成，验收由 Morii 记录。 |
| `enable-snapshots` | 其他五个仓库的快照指令仍由 Morii 自己加入，或另行明确授权；本轮没有修改其他仓库。 |
| `vps-access` | VPS 的私网或公网访问方式仍在 P6 之前决定；本轮没有部署。 |

## 验证与交接

- `pnpm verify`：306 个测试、类型检查与公开树审计通过；`pnpm build` 通过。
- 虚构数据 12 组三语 / 浅深 / 桌面 / 375px、键盘、减少动画走查通过；既有 token 对比度测试通过。
- 正式库只读副本：概览、列表和六个详情的 96 页矩阵通过，无横向溢出、CSP 错误或外部请求。开发方逐卡检查完成，真实截图不提交。
- [P4 停点交接](../handoff-2026-10-13-p4-stop.md)说明取舍、数据位置、启动方式与待验收事项。

本轮快照没有自动导入 Dashboard；由 Morii 手动导入。
