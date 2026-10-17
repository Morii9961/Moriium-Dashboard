# Moriium Dashboard · 项目状态

> 与 [project-status.json](./project-status.json) 同步，供手动导入。
> 快照时间：2026-10-17T16:50:00+08:00 · 协议 v1.1 · 项目 ID morii.dashboard · Claude。
> 分支 main · 提交 bd4d9ed4de4014b3618c9f49565984a4c91411a5。
> tests_rerun: false：复用合并前各 head 的双平台 CI 与开发阶段证据。

## 阶段

**开发中（development）**。整体进度为 null，没有估算百分比。

P5 及可选收尾已合并发布；P6.1 恢复、P6.2 登录底层与口令工具已合并入 main，尚未接入正式服务。实际使用与 P4/P5 产品验收暂且搁置。下一步 HTTP 接入与默认拒绝，随后登录界面和部署模板。

## 里程碑

| ID | 里程碑 | 状态 | 证据 | Morii 验收 |
| --- | --- | --- | --- | --- |
| p0-plan-approval | P0 规划获批 | 完成 | [设计决定](../design-decisions.md) | 据记录已验收 |
| p1-repo-protocol | P1 仓库与协议 | 完成 | PR #6 及之前的 PR | 待验收 |
| p2-shell-design | P2 外壳与设计基线 | 完成 | PR #7–#10 | 待验收 |
| p3-import-history | P3 导入与历史 | 完成 | PR #11–#15 | 待验收 |
| p4-projects-overview | P4 项目与概览 | 进行中：工程完成 | [P4 验证](../verification/p4-6.md)、PR #18–#23 | 暂且搁置 |
| p5-mvp | P5 MVP 完成 | 进行中：核心与已选可选工程完成 | PR #24–#30、[粘贴](../verification/p5-paste-json.md)、[命令面板](../verification/p5-command-palette.md) | 暂且搁置 |
| p6-vps-deploy | P6 VPS 部署 | 进行中：恢复、登录底层、口令工具已合并 | PR #31–#34、[口令工具验证](../verification/p6-2b-auth-setup.md) | 待验收 |

P6 里程碑尚未完成；内部函数与离线命令的验证不证明正式登录、HTTP 保护或部署可用。

## 阻塞

无。

## 下一步

| ID | 优先级 | 工作 | 结果 |
| --- | --- | --- | --- |
| p6-http-auth | P0 | P6.2c HTTP 接入：显式启用认证、全部受保护路由默认拒绝、登录与退出接口、cookie、Origin / Host 策略 | 启用配置缺失或凭据损坏时拒绝启动或拒绝请求；未启用时本机行为不变；双平台 CI 通过 |
| p6-login-ui | P1 | P6.2d 登录界面：三语、键盘可达、错误与锁定提示 | 沿用已有 S1 / S3 设计决定，浅深色与窄屏检查通过 |
| p6-deploy-templates | P1 | P6.3–6.5 部署模板：systemd、Nginx、发布与回滚脚本、备份拉回、验收清单 | 只准备仓库内模板与文档，不改动任何服务器 |

## 需要 Morii 决定

| ID | 决定 |
| --- | --- |
| p4-acceptance | P4 概览、六项目展示与来源抽查是否通过？已暂且搁置，恢复使用后由 Morii 记录。 |
| p5-week-trial | 一周真实使用与四项 MVP 产品验收是否通过？已暂且搁置，恢复后记录实际日期与问题。 |
| vps-access | 正式部署选择私网还是公网子域名登录？模板两种都准备；正式口令由 Morii 在隐藏终端自行设置。 |

## 证据与交接

- 2026-10-17 Morii 批准合并 P6：[#31](https://github.com/Morii9961/Moriium-Dashboard/pull/31)、[#32](https://github.com/Morii9961/Moriium-Dashboard/pull/32)、[#33](https://github.com/Morii9961/Moriium-Dashboard/pull/33)、[#34](https://github.com/Morii9961/Moriium-Dashboard/pull/34) 按依赖顺序普通合并入 main（2b0c4df、29b23e9、405e3f5、bd4d9ed）。合并前各 head 双平台 CI 通过，main 的树与 #34 已测 head a3da2d3 相同。
- 口令工具开发验证为 377 项测试 / 21 个文件、类型检查及当时公开树审计通过；一次 Windows 原生 TTY 虚构账户流程无回显、可登录、退出 0。
- 同日 Morii 决定实际使用暂且搁置，并批准开始其余未进行的工作。未打 v0.1.0；正式口令设置和服务器变更仍需 Morii 本人操作。

[Claude 交接](../handoff-2026-10-17-claude-p6.md) · [恢复说明](../operations/export-restore.md) · [口令说明](../operations/auth-setup.md)。

本快照手动更新；没有用量采集、后台同步或百分比估算。
