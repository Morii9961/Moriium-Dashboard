# 设计决定记录

每做出一个具体的设计决定，在最上面加一条。已记录的决定直接沿用，不重新讨论。推翻旧决定时，新增一条并写明替代了哪一条，不要直接改旧条目。

条目格式：

```
## YYYY-MM-DD · 标题

- 决定：做了什么选择。
- 理由：为什么。
- 影响：涉及哪些区域、组件或 token。
- 依据：看过的参考、读过的 Skill、测量或截图（只写实际看过的）。
- 状态：试验 / 定稿 / 已被替代（替代者：…）
```

---

## 2026-10-12 · 规划获批，进入正式开发

- 决定：`docs/planning/` 的规划（2026-10-11 起草）获批。正式开发在新的会话里进行，从 P1 开始，按 `docs/planning/06-mvp-and-roadmap.md` 的阶段与参与点推进；P6 部署需届时另行授权。
- 理由：Morii 在 2026-10-12 回答了规划提出的五个问题，并要求准备正式开发的启动提示词。
- 影响：全部规划文档的状态改为已获批；`AGENTS.md` 第八节更新；启动提示词见 `docs/handoff-2026-10-12-development-kickoff.md`。
- 依据：Morii 2026-10-12 的回复。
- 状态：定稿

## 2026-10-12 · 形态：前端 + 本机小服务（SQLite）

- 决定：浏览器访问的个人控制台。前端 React + Vite + TypeScript；服务端为单进程 Hono，数据存 SQLite 文件；本机阶段只监听 `127.0.0.1`、不设登录。技术栈按 `docs/planning/05-architecture-and-data.md` 第 4 节。
- 理由：数据落在可备份的文件里；部署后多设备共用一份数据；以后的令牌只放服务端；导入要在服务端复核。纯前端（IndexedDB）方案未采用。
- 影响：仓库结构为 `apps/web`、`apps/server`、`packages/protocol`；版本号实施时按 `source-driven-development` 核实，`node:sqlite` 不满足时改用 better-sqlite3。
- 依据：规划 05 第 2 到 4 节；Morii 的选择。
- 状态：定稿

## 2026-10-12 · 首版范围按 MVP，进度展示列为重点

- 决定：按 `docs/planning/06-mvp-and-roadmap.md` 第 1 节的 MVP 执行。同时把各项目的进度展示列为首版重点：「还差什么」行、核心里程碑、进入当前阶段的时间、任选两份快照对比与时间带（从 P1 提前到 P0）、手动项目可选的手动里程碑；P4 增加工作包 4.6，用六个项目的真实快照逐个走查。
- 理由：Morii 要求「先按 MVP 来，但是各个项目的进度展示也要做好」。上述各项都只读取快照和 Morii 自己的记录，不引入估算。
- 影响：02 第 5.4 节；01 第 6 节的优先级；05 的数据模型增加核心里程碑 ID 和 `manual_milestones`；06 的 P3、P4 与参与点。
- 依据：Morii 2026-10-12 的回复。
- 状态：定稿

## 2026-10-12 · Project Status Protocol：批准 v1.1（E1、E2）

- 决定：v1.1 = v1.0 + 两项可选字段：顶层 `reporter: { agent, note }`（E1），`blockers / next_actions / needs_morii` 条目的可选 `id`（E2）。E3（待决定的上下文与选项）、E4（`recent_work`）暂缓。`project_id` 只规定格式，由项目登记表决定是否接受。MVP 同时支持 1.0 和 1.1；Agent 指令模板改为写 v1.1。
- 理由：Morii 把这一项交给规划方决定。E1 解决 Agents 页的报告归属，E2 让「已处理」状态不受 Agent 改措辞影响；两者都是可选字段，不影响按委托书写出的 v1.0 文件。E3、E4 先看实际使用是否需要。
- 影响：`docs/planning/03-status-protocol-v1.md` 第 5、7、8、10 节；`docs/planning/schema/project-status.v1.1.schema.json`；`docs/planning/agent-snapshot-prompt.md`；`docs/status/project-status.json` 改用 v1.1。
- 依据：Morii 2026-10-12「第三条你自己决定」。
- 状态：定稿（Schema 在 P1 发布前只修错误，不改结构）

## 2026-10-12 · 开源边界

- 决定：仓库 `Morii9961/Moriium-Dashboard`，公开，代码 MIT。数据、备份、导出包、令牌永远不进仓库。各项目的 `docs/status/PROJECT_STATUS.md` 与 `project-status.json` 提交进各自的仓库，提交时机由 Morii 决定。
- 理由：与 `Moriium-Gallery` 命名一致；MIT 与 Moriium 一致；快照文件有 Git 历史，以后 GitHub 只读同步也能读到。
- 影响：P1.1 可直接创建公开仓库并推送（推送前做隐私检查）；`lieflat-charts`（PolyForm Noncommercial）只作选型参考，不复制其代码。
- 依据：Morii 2026-10-11「稍后你可以自己新建仓库然后上传代码」，2026-10-12「都可以的」。
- 状态：定稿

## 2026-10-12 · VPS 访问方式延后决定

- 决定：私网访问还是公网子域名加登录，暂不决定，最晚在 P5 结束、P6 开始前定。
- 理由：Morii「回头再说」；只影响 P6。
- 影响：P1 到 P5 不受影响；P6 开始前须先得到这个答案和部署授权。
- 依据：Morii 2026-10-12 的回复。
- 状态：待定
