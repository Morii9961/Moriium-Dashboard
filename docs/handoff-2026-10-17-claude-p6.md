# Claude 工程交接 · 2026-10-17

当前口令工具的代码工作已经完成。Morii 要求完成手中工作、交付 Claude 启动提示词与标准状态快照后停下，并明确要求交付阶段不再测试。本轮到此结束，没有开始 HTTP 接入或登录界面。

复制 [启动提示词](claude-start-2026-10-17-p6.md) 交给 Claude。更早的架构与准备过程见 [登录底层交接](handoff-2026-10-17-p6-auth.md) 与 [恢复准备交接](handoff-2026-10-16-p6-preparation.md)；当前事实以本文为准，接手再核对 Git / GitHub。

## 当前位置与发布状态

仓库为 `Morii9961/Moriium-Dashboard`。当前分支 `codex/p6-auth-setup`，已提交代码 HEAD 为 `f09b368b20ceb570918282f579c0aba1eac82bfc`。本轮新增交付文档、AGENTS / README 更新与状态 Markdown / JSON 保留在本地工作区，未提交；不要 reset、clean 或覆盖这些文件。

| 工作包 | 提交 / 基线 | 最后核实的远端状态 |
| --- | --- | --- |
| P5 与两项可选收尾 | main `0dca65b599c334e4c3632861ec58a794ec2f877a` | 已合并，本机前端已于此前更新；此轮未重新核对正式进程健康 |
| P6.1a 容器校验 | `2de276f`，基于 main | [PR #31](https://github.com/Morii9961/Moriium-Dashboard/pull/31) 开放，Windows / Linux CI 通过，未合并 |
| P6.1b 离线恢复 | `6dba1ea`，PR head `a71c7fd`，基于 #31 | [PR #32](https://github.com/Morii9961/Moriium-Dashboard/pull/32) 开放，Windows / Linux CI 通过，未合并 |
| P6.2a 登录底层 | `ef7eee6`，文档 `b9913d8`，CI 修复 head `151048f`，基于 #32 | [PR #33](https://github.com/Morii9961/Moriium-Dashboard/pull/33) 开放，Windows / Linux CI 通过，未合并 |
| P6.2b 隐藏口令工具 | `f09b368`，交付文档 `22ee6bc`，基于 `151048f` | [PR #34](https://github.com/Morii9961/Moriium-Dashboard/pull/34) 开放，由 Claude 发布；CI 以 PR 为准，未合并 |

最后推送与建 PR 的组合调用在进程创建前被自动审批服务的账户限额拦下，两个命令均未执行。这是审批服务不可用，不是代码不安全的判定；没有改用其他通道绕过。当前代码提交已在本地保留，交付文档也只在此工作区，不能假定远端或新 clone 中存在。

## 已完成的功能与证据

- 离线恢复：严格解析自有 ZIP 格式、校验内容与引用，先在内存构建，再排他写入新目录；不覆盖原目录、不启动服务。见 [操作说明](operations/export-restore.md) 与 [P6.1b 验证](verification/p6-1b-restore.md)。
- 登录底层：独立 `auth.sqlite`、固定成本 scrypt、会话摘要、空闲与绝对超时、持久限速、固定事件记录；没有连接 `main.ts` / `app.ts`。见 [ADR 0005](adr/0005-private-auth-store.md)。
- 口令工具：`pnpm auth:setup init` / `reset`，两次隐藏 TTY 输入，本地重置撤销全部会话与限速；不启用登录、不启动服务。见 [操作说明](operations/auth-setup.md)。
- 最新代码验证：开发阶段 `pnpm verify` 377 项测试 / 21 个文件通过，11 条既有提醒；一次 Windows 原生 TTY 虚构账户流程无回显、可登录、退出 0，临时数据已清理。详见 [P6.2b 验证](verification/p6-2b-auth-setup.md)。本轮交付文档与快照未新增测试或自动校验。

此前 P5 还补查过 768px / 1024px、浅深色、中日英共十二组抽屉与侧栏焦点路径；这是隔离虚构数据检查，不算 Morii 验收。本轮未改 UI。

## 接手先完成的发布收尾

先读 `AGENTS.md`、本文和当前工作区 diff。尊重“不需要任何测试，快速交付”的当前指令，复用已有证据，不为了接手再跑完整测试。若后续用户授权继续修改代码，再按改动范围决定必要验证。

核对分支、提交、未提交交付文件、PR #31–#33 的当前 head 和 CI；先阅读并保留本地文件。确认审批服务可用后，提交本轮交付文件，再推送该分支，并创建堆叠 PR。不要假定下一个 PR 编号。代码提交已包含 Codex 署名；后续提交按实际贡献和项目约定署名。

可在提交文档之后使用以下发布命令；这是留给后续执行者的步骤，本轮没有执行成功：

```text
git push -u origin codex/p6-auth-setup
gh pr create --repo Morii9961/Moriium-Dashboard --base codex/p6-auth-core --head codex/p6-auth-setup --title "Add hidden local account setup and reset tools" --body-file docs/p6-auth-setup-pr-description.md
```

创建后核对实际 head 与双平台 CI，更新 PR 描述中的发布状态，以及本文和快照里的陈旧状态。若使用 Codex 创建 PR，调用相应工具将 PR 附到当前任务。P6 尚无合并授权，不能自动合并；获得授权后按 #31 → #32 → #33 → 口令工具的依赖顺序处理并核对改基线后的 CI。

## 后续工程清单，尚未开始

只有 Morii 在 Claude 中要求继续时才推进下一工作包。顺序为 HTTP 接入与默认拒绝策略，再做登录 UI，随后才是部署模板和恢复演练准备。启用配置必须显式；缺少或损坏凭据时拒绝启动或拒绝受保护请求，不能退回免登录。

HTTP 工作包需要覆盖全部受保护 API 与页面、Origin / Host / 写请求头策略、登录与退出、cookie、限速与超时、可信代理及日志边界。内部会话签发函数只能在认证成功后调用；本地重置不能变成匿名路由。UI 沿用已有 S1 / S3 决定与三语要求，先查设计决定，不重新设计整个 Dashboard。

## 正式数据与授权边界

Morii 于 2026-10-16 允许先做 P6 工程准备。P4 产品验收、P5 一周真实使用仍待 Morii 记录，不能代填通过，也不能打 `v0.1.0`。P5 普通合并授权不自动扩展到 P6。

原正式库此前已另获授权备份升级到结构 10 并启动，六项目与十份历史及其他旧表核对完整；本阶段没有改动或重新启动原正式实例。Windows 打包应用可能重定向数据目录，不能按新终端的默认路径创建一个空实例后覆盖旧数据。旧本机私有定位线索只在本工作区被忽略的 `screenshots/p4-6-real/data-location.md`，不要复制进公开文档；这不是当前进程仍健康的证明。

实际恢复原数据、设置真实口令、正式启用认证、切换数据源、VPS 变更及访问方式仍按对应步骤取得授权。口令由 Morii 在隐藏终端输入，不在聊天、参数或环境变量中传递。业务导出不含认证库，认证资料的备份策略仍待部署工作包处理。

## 手动导入文件

[project-status.json](status/project-status.json) 是用户要求的标准导入格式，采用已有 Project Status Protocol v1.1，固定 `project_id: morii.dashboard`；[PROJECT_STATUS.md](status/PROJECT_STATUS.md) 与它同步。没有用量统计、自动采集或自动导入，没有伪造百分比。

快照绑定已验证代码 `f09b368`，`tests_rerun: false`，明确记下本地未发布和待验收。本轮按用户要求不运行快照校验器；导入预览是否接受仍应由后续实际导入确认，不能把格式已起草等同于已导入成功。
