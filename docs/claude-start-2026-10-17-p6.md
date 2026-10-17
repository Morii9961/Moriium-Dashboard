# Claude 启动提示词

将下面整段复制给 Claude，在当前 Moriium Dashboard 仓库打开；交付文件尚未提交，需使用保留这些文件的本地工作区。

```text
接手 Moriium Dashboard。先读 AGENTS.md、docs/handoff-2026-10-17-claude-p6.md、docs/operations/auth-setup.md、docs/verification/p6-2b-auth-setup.md 和 docs/status/PROJECT_STATUS.md。涉及后续实现时再读对应规划、ADR 与设计决定。

当前分支 codex/p6-auth-setup，已提交代码 HEAD 为 f09b368b20ceb570918282f579c0aba1eac82bfc。口令工具代码已完成；本地另有未提交的交付文档、AGENTS / README 更新、标准状态 JSON / Markdown，必须保留，不要 reset、clean 或覆盖。代码已有 pnpm verify 377 项测试 / 21 文件通过及一次 Windows 原生 TTY 无回显、可登录、退出 0 的证据。用户最后明确要求“不需要做任何测试，快速交付”，不要因接手重跑测试；交付文档和快照未另行自动校验。

先完成发布收尾：核对 git status / log 和 PR #31、#32、#33 的准确 head 与当前 CI。#31/#32 最后核实双平台通过、未合并；#33 head 151048f 最后核实 Linux 通过、Windows 运行中，不能直接写双平台通过。口令工具分支尚未推送、没有 PR：上次推送和建 PR 在执行前被自动审批服务账户限额阻止，不要绕过审批，也不要假定 PR 编号。

阅读本地交付文件，确认审批服务可用后提交并推送 codex/p6-auth-setup，基于 codex/p6-auth-core 创建堆叠 PR。现成正文在 docs/p6-auth-setup-pr-description.md，命令见交接。核对实际提交与 CI，再更新发布状态。P6 合并没有授权，不能合并或开启自动合并；P5 的授权不适用。

这次先完成这些收尾并交付，不自行开启下一工作包。以后只有我明确要求继续，才推进 P6 HTTP 接入、登录 UI 和部署准备。现有登录底层与口令工具均未接入正式服务，设置工具不会启用认证或启动服务。

P4 产品验收、P5 一周真实使用仍待我完成，不代填通过、不打 v0.1.0。真实恢复、正式口令设置、认证启用、数据源切换和 VPS 操作仍需对应授权。不要操作原正式实例或在默认目录另建空实例覆盖旧数据；口令不能进聊天、参数、环境变量或日志。

状态快照为 docs/status/project-status.json，协议 v1.1，project_id 固定 morii.dashboard，与 PROJECT_STATUS.md 同步；只供手动导入。完成发布收尾后给出准确提交、PR 状态和剩余边界，然后停下。
```
