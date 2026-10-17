# Moriium Dashboard · 项目状态

> 与 [project-status.json](./project-status.json) 同步，供手动导入。
> 快照时间：2026-10-17T16:31:35+08:00 · 协议 v1.1 · 项目 ID morii.dashboard · Codex。
> 分支 codex/p6-auth-setup · 已验证代码 f09b368b20ceb570918282f579c0aba1eac82bfc。
> tests_rerun: false：复用开发阶段证据。按 Morii 最后要求，交付文档和 JSON 不再测试或运行校验器；文件尚未提交。

## 阶段

**开发中（development）**。整体进度为 null，没有估算百分比。

P5 及可选收尾已合并发布，P4/P5 真实验收待完成。P6.1 恢复、P6.2 登录底层与口令工具已验证，尚未接入正式服务；口令工具仅本地提交，推送受审批限额阻挡。HTTP、登录界面与 VPS 部署未完成。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| p0-plan-approval | P0 规划获批 | 完成 | [设计决定](../design-decisions.md) | 据记录已验收 |
| p1-repo-protocol | P1 仓库与协议 | 完成 | PR #6 及之前的 PR | 待验收 |
| p2-shell-design | P2 外壳与设计基线 | 完成 | PR #7–#10 | 待验收 |
| p3-import-history | P3 导入与历史 | 完成 | PR #11–#15 | 待验收 |
| p4-projects-overview | P4 项目与概览 | 进行中：工程完成 | [P4 验证](../verification/p4-6.md)、PR #18–#23 | 待验收 |
| p5-mvp | P5 MVP 完成 | 进行中：核心与已选可选工程完成 | PR #24–#30、[粘贴](../verification/p5-paste-json.md)、[命令面板](../verification/p5-command-palette.md) | 待一周真实使用与验收 |
| p6-vps-deploy | P6 VPS 部署 | 进行中：仅部分工程准备完成 | PR #31–#33、[口令工具验证](../verification/p6-2b-auth-setup.md)、本地 f09b368 | 待验收 |

P6 里程碑尚未完成；内部函数与离线命令的验证不证明正式登录、HTTP 保护或部署可用。所有稳定里程碑 ID 沿用前次快照。

## 阻塞

p6-publish-limit：自动审批服务的账户限额阻挡口令工具分支发布。推送与建 PR 在执行前被拦下，代码提交保留本地，交付文档尚未提交；新工作包没有 PR 或 CI 结果。审批可用后由 Claude 完成提交、推送与建 PR，不能绕过审批。

## 下一步

| ID | 优先级 | 工作 | 结果 |
| --- | --- | --- | --- |
| p6-claude-publication | P0 | Claude 提交本地交付文件、推送口令工具分支并创建堆叠 PR | 保留工作区，核对 #33 及新 PR 的准确 head 与双平台 CI；不自行合并或开启下一工作包 |
| p4-human-walkthrough | P0 | P4 的 30 秒概览测试、六项目各 10 秒走查、10 个来源抽查 | Morii 记录产品验收与问题，P5 开发授权不代替验收 |
| p5-week-trial | P0 | 使用原正式实例进行一周真实试用与四项 MVP 验收 | 记录实际日期、各推进项目导入、30 秒测试、十个来源抽查、虚假进度检查和反馈；通过后再打 v0.1.0 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| p4-acceptance | P4 概览、六项目展示与来源抽查是否通过？由 Morii 记录。 |
| p5-week-trial | 一周真实使用与四项 MVP 产品验收是否通过？待记录实际日期和问题。 |
| vps-access | 正式部署选择私网还是公网子域名登录？实际恢复、认证启用与 VPS 变更仍在对应步骤单独决定。 |
| p6-merge-authorization | P6 各 PR 验证与双平台 CI 通过后是否允许按依赖顺序合并？目前没有该授权。 |

## 证据与交接

- P5 已核实合并、更新本机前端；此前原正式库已获授权备份升级到结构 10 并启动，六项目、十份历史与其他旧表核对完整。本轮未重新检查正式进程，也未改动其数据。
- P6 [PR #31](https://github.com/Morii9961/Moriium-Dashboard/pull/31) / [#32](https://github.com/Morii9961/Moriium-Dashboard/pull/32) 最后核实双平台 CI 通过，均未合并。
- [PR #33](https://github.com/Morii9961/Moriium-Dashboard/pull/33) 修复 head 151048f 于 2026-10-17 16:27:12（上海时间）最后核实 Linux 通过、Windows 运行中；最终结果未复查。
- 本地代码 f09b368 的开发验证为 377 项测试 / 21 个文件、类型检查及当时公开树审计通过，11 条既有提醒；一次 Windows 原生 TTY 虚构账户流程无回显、可登录、退出 0，临时数据已清理。新增交付文件未再自动校验。
- Morii 于 2026-10-16 允许先做 P6 工程准备；真实试用和产品验收仍待完成，未打 v0.1.0。P6 合并、真实恢复、正式认证启用和 VPS 操作没有被本次工程准备自动授权。

[Claude 交接](../handoff-2026-10-17-claude-p6.md) · [启动提示词](../claude-start-2026-10-17-p6.md) · [恢复说明](../operations/export-restore.md) · [口令说明](../operations/auth-setup.md)。

本快照仅手动更新，未导入 Dashboard；没有用量采集、后台同步或百分比估算。可选 5.6 未加入。当前工作交付后停止，HTTP 与登录界面留待后续明确继续。
