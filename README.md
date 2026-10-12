# Moriium Dashboard

Morii 一个人用的工作台。各项目的 Agent 按统一协议写出「项目状态快照」，Dashboard 导入后显示每个项目做到哪里、还差什么、下一步是什么、需要 Morii 做什么；另有今日焦点、基本任务和成果登记。

它不是任务管理软件，也不是实时运维平台。快照由 Morii 手动触发、手动导入；Agent 自报、有仓库或测试证据、Morii 验收三层始终分开显示，没有可信依据时不画进度百分比。

## 当前状态

规划已于 2026-10-12 获批，正在进行 P1（仓库与协议）。还没有可运行的代码，本地开发说明会在 P1.2 补上。

- 规划：[`docs/planning/`](./docs/planning/README.md)
- 当前进度：[`docs/status/PROJECT_STATUS.md`](./docs/status/PROJECT_STATUS.md)
- 设计决定：[`docs/design-decisions.md`](./docs/design-decisions.md)

## Project Status Protocol

快照的格式。v1.0 与 v1.1 同时支持。

- 协议说明：[`docs/planning/03-status-protocol-v1.md`](./docs/planning/03-status-protocol-v1.md)（P1.6 后移到 `docs/protocol/`）
- JSON Schema 2020-12：[v1.0](./docs/planning/schema/project-status.v1.0.schema.json)、[v1.1](./docs/planning/schema/project-status.v1.1.schema.json)
- 给 Agent 的指令模板：[`docs/planning/agent-snapshot-prompt.md`](./docs/planning/agent-snapshot-prompt.md)

## 数据与隐私

数据库、备份、导出包和任何令牌都不进这个仓库。运行时数据放在环境变量 `MORIIUM_DASHBOARD_DATA` 指定的仓库外目录。仓库里的演示数据全部虚构。

---

## English

Moriium Dashboard is a single-user workspace. Agents working on Morii's projects write "project status snapshots" in a shared JSON format (the Project Status Protocol). The dashboard imports them and shows, for each project, where it stands, what is still missing, what comes next, and what needs Morii's decision. It also holds a daily focus list, basic tasks, and a log of finished work. Agent self-reports, repository or test evidence, and Morii's own acceptance are always shown separately, and no progress percentage is drawn without a trustworthy basis.

**Status:** planning was approved on 2026-10-12; work on P1 (repository and protocol) is in progress. There is no runnable code yet.

**Protocol:** see [`docs/planning/03-status-protocol-v1.md`](./docs/planning/03-status-protocol-v1.md) (Chinese) and the JSON Schemas for [v1.0](./docs/planning/schema/project-status.v1.0.schema.json) and [v1.1](./docs/planning/schema/project-status.v1.1.schema.json).

**License:** code is MIT. Runtime data never enters this repository.
