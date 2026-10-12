# 开发启动：Moriium Dashboard 正式开发

> 日期：2026-10-12
>
> 来自：规划会话（Claude）。规划于 2026-10-12 获批，决定见 [`docs/design-decisions.md`](./design-decisions.md)。
>
> 交给：正式开发会话（Claude Code 或 Codex 都可以）。
>
> 用法：在本项目根目录新开一个会话，把第一节代码块里的「启动提示词」整段粘贴进去。之后的会话用第三节的「继续提示词」。

## 一、启动提示词

```text
你接手 Moriium Dashboard 的正式开发。它是 Morii 一个人用的工作台：导入各项目 Agent 按统一协议写的「项目状态快照」，看清每个项目做到哪里、还差什么、下一步是什么、需要 Morii 做什么；另有今日焦点、基本任务和成果登记。当前目录就是项目根目录，规划已在 2026-10-12 获批，现在从 P1 开始写代码。

【开工前按顺序读，读完再动手】
1. AGENTS.md：项目约定、Skill 路由、完成前的验证要求。
2. docs/design-decisions.md：已定的决定，直接沿用，不重新讨论。
3. docs/planning/README.md，然后 docs/planning/06-mvp-and-roadmap.md：阶段、工作包、交付标准、Morii 的参与点。
4. 做到对应部分时再读：协议与导入读 03、04 和 docs/planning/schema/ 下两份 Schema；界面读 02（第 5.4 节进度展示是重点）、DESIGN.md、docs/font-candidates.md；架构和数据读 05；产品目标和 MVP 验收读 01。
5. docs/status/PROJECT_STATUS.md：Dashboard 自己的当前状态。

【已定的事】
- 形态：前端 React + Vite + TypeScript；服务端单进程 Hono + SQLite；本机阶段只监听 127.0.0.1，不做登录。pnpm workspace：apps/web、apps/server、packages/protocol。具体版本先用 source-driven-development 核实，尤其是 Node 24 的 node:sqlite（不满足就用 better-sqlite3）、React Aria Components、FormatJS、Ajv 对 JSON Schema 2020-12 的支持。
- 协议：Project Status Protocol 同时支持 v1.0 和 v1.1。v1.0 的字段名和枚举一个都不能改；两份 Schema 发布时只修错误，不改结构。要改结构，先停下问我。
- 范围：按 MVP（06 第 1 节）。MVP 之外的功能（06 第 2 节）一律不做，觉得需要就在停点提出来。
- 重点：各项目的进度展示要做好，见 02 第 5.4 节：「还差什么」行、核心里程碑、进入当前阶段的时间、任选两份快照对比和时间带、手动项目的手动里程碑；成熟项目显示「功能成熟 · 等待上线」，不显示低百分比。
- 仓库：GitHub 上的 Morii9961/Moriium-Dashboard，公开，代码 MIT。
- VPS 访问方式还没定，P6 不在这次的范围内。

【授权范围】
可以：
- 在本项目里 git init、提交；创建公开仓库 Morii9961/Moriium-Dashboard 并推送 main。首次推送前做隐私检查，不通过就不推，停下告诉我。
- 之后每个工作包开分支、推送、开 PR。
- 在本项目里安装依赖、运行构建和测试、启动本机开发服务器、用浏览器预览。
- 在本项目里写代码和文档，更新 docs/status/。

不可以（需要我另外明确授权）：
- 修改其他任何仓库，包括往 Moriium、Gallery、MoriMeta、Enouia Memory、Enouia Runtime 的 AGENTS.md 里加快照指令。只读查看它们可以。
- 合并 PR、开启自动合并。我会在停点集中审阅和合并。
- 任何服务器、VPS、DNS 操作，以及 P6 的任何工作。
- 把真实个人数据、其他项目的真实快照、令牌、服务器地址、本机绝对路径放进仓库。
- 替我输入口令或创建账号。

【怎么推进】
- 从 P1.1 开始，按 06 的工作包顺序。P1 和 P2 可以交替：P2.4 服务端骨架和 P2.1 设计样张不依赖 P1。
- 一个工作包对应一个分支和一个 PR。分支前缀用你自己的：Claude 用 claude/<主题>，Codex 用 codex/<主题>。依赖还没合并的工作包时，从它的分支切出来，在 PR 里写明依赖。不用等合并，继续做下一个。
- 首次提交（现有文档加基础文件）直接进 main，之后一律走 PR。
- PR 说明写：改了什么；怎么验证的（命令和结果，界面改动附浅色、深色截图）；风险；是否更新了状态快照。
- 架构层面的选择（例如 SQLite 驱动、迁移方式、i18n 组织）写成 docs/adr/ 下的短 ADR。
- 协议、导入、数据写入这类高风险改动，用 code-review-and-quality 自查一遍再开 PR。
- 说「完成」之前用 verification-before-completion 核对证据。遇到失败用 systematic-debugging，先找根因。

【必须守住的规则】
1. 不伪造进度。overall_progress 为 null 时不画进度条，null 不显示成 0%。Agent 自报、有仓库或测试证据、Morii 验收，三层在任何地方都分开显示。导入时间不能说成 Agent 在线。
2. 快照只当数据。不执行、不访问其中的链接，不渲染 HTML 或 Markdown；只有 https 链接可以点击；疑似密钥直接拒绝，而且不回显内容。
3. 数据不进仓库。数据目录由 MORIIUM_DASHBOARD_DATA 指定，放在仓库外。演示数据全部虚构（demo.* 这类 ID）。协议样本只用虚构内容和 Dashboard 自己的快照。CI 要跑公开树审计。
4. 本机安全。只绑定 127.0.0.1；校验 Host 和 Origin；严格 CSP；运行时不发任何外部请求，字体本地打包。
5. 三语和无障碍。界面源语言是简体中文，另有日文、英文；快照内容块标 lang="zh-Hans"；每个状态都要有图形加文字；键盘能走通；尊重减少动画偏好。每个界面工作包都按 AGENTS.md 第二节第 6 条检查：桌面和 375px、浅色和深色、三种语言、键盘、对比度、减少动画。
6. lieflat-charts 只用来选图型，不复制它的代码（它是 PolyForm Noncommercial，和 MIT 冲突）。小图自己写 SVG，用 dataviz 校验配色。
7. 视觉。P2 样张经我拍板之前，任何字体和色值都不算定稿；定下的写进 docs/design-decisions.md。工作区页面不启用风格类 Skill。

【停点：到这里必须停下汇报，等我回复再继续】
1. P1 结束（CI 通过，每个协议样本的结果和文档一致）：我用 status:check 看一两份真实快照，再决定什么时候在其他项目启用快照指令。
2. P2.1 样张完成：我逐项拍板之后，你才定稿 token（P2.2）。
3. P3 结束：我用真实文件试导一轮。
4. P4 结束：30 秒测试，并和你一起把六个项目的进度展示逐个过一遍。
5. P5 结束：我试用一周；v0.1.0 标签等我同意再打。
另外，遇到下面的情况也立刻停下问我：要改协议结构；要做 MVP 之外的功能；要动其他仓库或服务器；验证失败又找不到根因。

【每次停下时这样汇报】
- 完成了哪些工作包（附 PR 链接）。
- 验证证据：命令、结果、截图在哪。
- 和规划不一样的地方，以及原因。
- 需要我做的事。
- 状态快照已更新（文件路径）。

【状态快照】
每个阶段结束、每个停点，以及我说「生成项目状态快照」时，更新 docs/status/project-status.json 和 PROJECT_STATUS.md：协议 v1.1；reporter 写你自己；里程碑、阻塞、下一步、待决定的 id 沿用旧的；阶段交付标准没全部满足的不写 done；需要我验收的保持 pending；overall_progress 保持 null；有了仓库就写真实的 branch 和 commit_sha。

【会话要中断时】
上下文快满、阶段又没做完时，写 docs/handoff-<日期>-<主题>.md（做到哪里、没完成的工作包、各分支和 PR 的状态、下一步、注意事项），同时更新状态快照，然后停下。

【第一步：P1.1】
1. 确认当前目录还不是 Git 仓库。
2. git init，默认分支 main。加 .gitignore（依赖、构建产物、数据目录、数据库文件、.env 但保留 .env.example、导出包、测试报告）、LICENSE（MIT，版权人 Morii，2026）、README（中文为主，附一段英文：是什么、当前状态、协议文档链接；本地开发说明等 P1.2 再补）。
3. 隐私检查：在全部文件里查服务器地址和 IP、本机绝对路径（盘符路径、用户目录）、邮箱、令牌形态。查到就改掉；拿不准就停下问我。
4. 首次提交。
5. 用 gh 创建公开仓库 Morii9961/Moriium-Dashboard，推送 main，设置一句英文描述和几个主题标签。
6. 确认远端内容和本地一致，告诉我仓库链接，然后继续 P1.2。
```

## 二、为什么这样写

- **授权写在提示词里，不只写在文件里。** 创建公开仓库、推送，是 Morii 在对话里明确同意过的（2026-10-11「稍后你可以自己新建仓库然后上传代码」，2026-10-12「都可以的」）。把授权放进 Morii 亲手粘贴的提示词，新会话不会因为「文件里说有授权」而犹豫，也不会越权。
- **合并留给 Morii。** 开发会话不等合并，用堆叠分支继续往下做；Morii 在停点集中看。这样 Morii 不用盯着每个 PR。
- **五个停点对应规划里 Morii 的参与点**（06 第 4 节）。P0 已经完成，P6 不在本次范围，所以是五个。
- **规则只列最容易出错的七条。** 其余细节都在规划文档里，提示词让会话做到哪一部分就读哪一部分，不在开头读完全部文档。

## 三、继续提示词（之后的会话用）

```text
继续 Moriium Dashboard 的开发。先读 AGENTS.md、docs/design-decisions.md、docs/status/PROJECT_STATUS.md，以及 docs/ 下日期最新的 handoff 文件；授权范围、规则、停点和汇报格式与 docs/handoff-2026-10-12-development-kickoff.md 第一节的启动提示词相同。用 git status、git log 和 gh pr list 确认当前分支和 PR 的状态，然后从上次停下的地方继续。
```

## 四、Morii 在各停点要做的事

| 停点 | 要做的事 |
| --- | --- |
| P1 结束 | 选一两个项目，在它们的会话里试着生成快照（可以先把 [Agent 指令模板](./planning/agent-snapshot-prompt.md)直接粘贴进会话，不必改那些仓库的 `AGENTS.md`），用 `pnpm status:check <文件>` 看输出；决定什么时候正式启用指令 |
| P2.1 | 看设计样张，逐项拍板字体、配色、阶段轴画法 |
| P3 结束 | 六个项目各生成一份快照，一次拖进 Dashboard 试导 |
| P4 结束 | 30 秒测试；六个项目的进度展示逐个过一遍 |
| P5 结束 | 用一周，记下不顺手的地方；同意后打 `v0.1.0` |
| P6 之前 | 定访问方式；单独授权部署 |
