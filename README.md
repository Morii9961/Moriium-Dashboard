# Moriium Dashboard

Morii 一个人用的工作台。各项目的 Agent 按统一协议写出「项目状态快照」，Dashboard 导入后显示每个项目做到哪里、还差什么、下一步是什么、需要 Morii 做什么。今日焦点、基本任务和成果登记已实现，待真实试用。

它不是任务管理软件，也不是实时运维平台。快照由 Morii 手动触发、手动导入；Agent 自报、有仓库或测试证据、Morii 验收三层始终分开显示，没有可信依据时不画进度百分比。

## 当前状态

P1 到 P3 已合并。P4 工程完成，产品验收待 Morii。P5 核心功能与界面评审已完成：Agents、今日焦点和精力、任务及来源、成果与封面，等待一周真实试用。未打 `v0.1.0` 标签。2026-10-16 已获准提前做 P6 工程准备，实际恢复、登录启用和 VPS 部署仍待对应授权。启动与试用清单见 [P5 交接](./docs/handoff-2026-10-14-p5-trial.md)。

P5 可选收尾已补齐粘贴 JSON 与命令面板（Ctrl / ⌘ K）。P6.1 恢复与 P6.2 登录底层、隐藏口令工具已完成本地工程验证，尚未接入正式服务；P6 PR #31–#34 均未合并。当前进展见 [Claude 交接](./docs/handoff-2026-10-17-claude-p6.md)，另有 [可复制启动提示词](./docs/claude-start-2026-10-17-p6.md) 和 [口令工具说明](./docs/operations/auth-setup.md)。

- 规划：[`docs/planning/`](./docs/planning/README.md)
- 当前进度：[`docs/status/PROJECT_STATUS.md`](./docs/status/PROJECT_STATUS.md)
- 设计决定：[`docs/design-decisions.md`](./docs/design-decisions.md)

## Project Status Protocol

快照的格式。v1.0 与 v1.1 同时支持。

- 协议说明：[`docs/protocol/README.md`](./docs/protocol/README.md)
- JSON Schema 2020-12：[v1.0](./docs/protocol/schema/project-status.v1.0.schema.json)、[v1.1](./docs/protocol/schema/project-status.v1.1.schema.json)
- 给 Agent 的指令模板：[`docs/protocol/agent-snapshot-prompt.md`](./docs/protocol/agent-snapshot-prompt.md)
- 协议样本：[`fixtures/protocol/`](./fixtures/protocol/README.md)

## 本地开发

需要 Node.js 24 和 pnpm 10（版本以 `.node-version` 与 `package.json` 的 `packageManager` 为准）。

```bash
pnpm install
pnpm verify        # 依次运行下面四项，和 CI 一致
pnpm check         # Biome 格式与检查；pnpm format 自动修复
pnpm typecheck     # TypeScript 类型检查
pnpm test          # Vitest
pnpm audit:public  # 公开树审计：数据库、导出包、密钥形态、IP、本机路径、邮箱
```

服务端和脚本由 Node 直接运行 `.ts`，没有构建步骤，原因见 [ADR 0001](./docs/adr/0001-toolchain-and-native-typescript.md)。

### 使用

```bash
pnpm build    # 构建前端（apps/web/dist）
pnpm server   # 启动本机服务，同时托管构建好的前端
```

然后打开 `http://127.0.0.1:5180`。服务只监听本机。第一次启动会在系统的应用数据目录（Windows 上是 `%LOCALAPPDATA%\moriium-dashboard`）建数据库并做一次备份；数据目录在仓库里或同步盘里时拒绝启动。可用的环境变量见 [`.env.example`](./.env.example)，设计见 [ADR 0003](./docs/adr/0003-server-storage-and-local-security.md)。

Windows 的打包应用可能把 `%LOCALAPPDATA%` 重定向到自己的应用数据目录。换到另一个终端或 Agent 应用后，如果看到空项目，不要重新导入或覆盖原库；先确认旧实例的实际数据位置，用 `MORIIUM_DASHBOARD_DATA` 指向同一目录。数据库迁移会先生成备份；测试与真实内容走查使用仓库外的独立副本。

### 开发

```bash
pnpm server:dev   # 本机服务（5180），允许 5173 的前端写入，改代码自动重启
pnpm dev          # 前端开发服务器（5173），/api 自动转给本机服务
```

应用在 `http://127.0.0.1:5173`，设计基线页在 `http://127.0.0.1:5173/specimen.html`。设计基线页想用本机的真实快照，在 `apps/web/.env.local`（已被 `.gitignore` 排除）里写一行 `MORIIUM_SPECIMEN_SNAPSHOTS=`，后面跟文件路径，多个用分号分开。真实快照只在开发服务器上读取，不进仓库，也不进构建产物。地址后面加 `?demo` 只显示演示数据。改了 `apps/web/src/design/tokens.ts` 后运行 `pnpm tokens` 重新生成 CSS。

### 检查快照文件

```bash
pnpm status:check path/to/project-status.json
```

输出和导入预览一致：能不能导入、错误和提醒（位置 · 问题 · 收到了什么 · 怎么改），无法导入时附一段可以直接粘贴回 Agent 会话的修复说明。只读取文件，不访问网络，不保存任何内容。可以一次检查多个文件；`pnpm status:check --help` 列出全部选项。退出码：0 可以导入，1 无法导入，2 需要先做选择（文件被代码块包着）。

### 从完整导出包恢复

`pnpm data:restore --check <export.zip>` 在内存检查；`pnpm data:restore --apply <export.zip> --target <NEW_ABSOLUTE_DIR>` 仅写入不存在的新目录，不覆盖已有实例或启动服务。用法、保留范围和核对步骤见 [恢复说明](./docs/operations/export-restore.md)。

## 数据与隐私

数据库、备份、导出包和任何令牌都不进这个仓库。运行时数据放在环境变量 `MORIIUM_DASHBOARD_DATA` 指定的仓库外目录。仓库里的演示数据全部虚构。

---

## English

Moriium Dashboard is a single-user workspace. Agents write project status snapshots in a shared JSON format. The dashboard imports them and shows each project's stage, remaining work, next action, and decisions for Morii. Agent reports, repository or test evidence, and Morii's acceptance stay separate. Progress uses a marked Agent estimate or the completion rate of known milestones. Daily focus, tasks, and works are implemented and await real use.

**Status:** P1–P3 are merged. P4 product acceptance remains pending. P5 core implementation and local UI review are complete; a week of real use and Morii's acceptance remain pending. No `v0.1.0` tag has been created. P6 engineering preparation was authorized on 2026-10-16; live recovery, login activation and VPS deployment still need separate authorization. See the [P5 handoff](./docs/handoff-2026-10-14-p5-trial.md).

**Protocol:** see [`docs/protocol/README.md`](./docs/protocol/README.md) (Chinese) and the JSON Schemas for [v1.0](./docs/protocol/schema/project-status.v1.0.schema.json) and [v1.1](./docs/protocol/schema/project-status.v1.1.schema.json). Run `pnpm status:check <file>` to check a snapshot.

**License:** code is MIT. Runtime data never enters this repository.
