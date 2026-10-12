# Moriium Dashboard

Morii 一个人用的工作台。各项目的 Agent 按统一协议写出「项目状态快照」，Dashboard 导入后显示每个项目做到哪里、还差什么、下一步是什么、需要 Morii 做什么；另有今日焦点、基本任务和成果登记。

它不是任务管理软件，也不是实时运维平台。快照由 Morii 手动触发、手动导入；Agent 自报、有仓库或测试证据、Morii 验收三层始终分开显示，没有可信依据时不画进度百分比。

## 当前状态

规划已于 2026-10-12 获批，P1（仓库与协议）的工作包都已提交审阅：协议包、样本和检查工具可以用；界面和服务端还没开始。

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

然后打开 `http://127.0.0.1:5180`。服务只监听本机。第一次启动会在系统的应用数据目录（Windows 上是 `%LOCALAPPDATA%moriium-dashboard`）建数据库并做一次备份；数据目录在仓库里或同步盘里时拒绝启动。可用的环境变量见 [`.env.example`](./.env.example)，设计见 [ADR 0003](./docs/adr/0003-server-storage-and-local-security.md)。

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

## 数据与隐私

数据库、备份、导出包和任何令牌都不进这个仓库。运行时数据放在环境变量 `MORIIUM_DASHBOARD_DATA` 指定的仓库外目录。仓库里的演示数据全部虚构。

---

## English

Moriium Dashboard is a single-user workspace. Agents working on Morii's projects write "project status snapshots" in a shared JSON format (the Project Status Protocol). The dashboard imports them and shows, for each project, where it stands, what is still missing, what comes next, and what needs Morii's decision. It also holds a daily focus list, basic tasks, and a log of finished work. Agent self-reports, repository or test evidence, and Morii's own acceptance are always shown separately, and no progress percentage is drawn without a trustworthy basis.

**Status:** planning was approved on 2026-10-12. P1 (repository and protocol) is in review: the protocol package, fixtures and the checker work; the UI and server have not started.

**Protocol:** see [`docs/protocol/README.md`](./docs/protocol/README.md) (Chinese) and the JSON Schemas for [v1.0](./docs/protocol/schema/project-status.v1.0.schema.json) and [v1.1](./docs/protocol/schema/project-status.v1.1.schema.json). Run `pnpm status:check <file>` to check a snapshot.

**License:** code is MIT. Runtime data never enters this repository.
