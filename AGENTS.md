# AGENTS.md — 设计与 Skill 工作约定

<!-- design-kit 1.0.0：由 design-kit 安装。装进项目后这份文件归项目所有，可以直接改。 -->

> 给 Claude Code 和 Codex 共用。`CLAUDE.md` 只是指向本文件。
> 这是一份**通用框架**，不是严格的设计规范：它回答「怎么选 Skill、什么时候触发、怎么做设计决定」，不规定具体色值和字号。
> 选定的设计规范（灰阶尺，2026-10-18）在 [`DESIGN.md`](./DESIGN.md)，做任何视觉改动前读相关章节；通用框架在 [`docs/design-framework.md`](./docs/design-framework.md)，只在规范没覆盖时参考。

## 一、优先级

1. 用户当下的明确指令。
2. 项目已记录的设计决定（`docs/design-decisions.md`）。
3. `DESIGN.md`（选定的灰阶尺规范），再往下是 `docs/design-framework.md` 的默认值。
4. Skill 的建议。

Skill 给的是建议，不是权威。风格类 Skill 是顾问，不是项目的主人。`docs/design-framework.md` 里的「默认值」可以推翻，但要说明理由，并记进设计决定。

## 二、做设计任务的顺序

1. **判断区域**（见第三节）。区域决定风格能不能介入。
2. **查已有决定**。已记录的决定直接沿用，不重新讨论。
3. **读 `DESIGN.md` 相关章节**，只读用得上的；它没覆盖的再看 `docs/design-framework.md`。
4. **选最少的 Skill**（见第四节），能不用就不用。
5. **用真实内容做**，不用占位文字。
6. **验证后再说完成**：桌面和窄屏各看一次、浅色深色各看一次、键盘能不能走通、对比度、中日英三语的长度和换行、减少动画偏好。用 `verification-before-completion`。

## 三、按区域决定风格能不能介入

风格是点缀，不是底色。风格强度和信息密度成反比。

| 区域 | 例子 | 风格 Skill |
| --- | --- | --- |
| S1 工作区主体 | 表格、筛选、表单、导航、设置 | **不介入**。只有框架没覆盖的决定才用 `frontend-design` / `ui-ux-pro-max` |
| S2 数据可视化 | 图表、指标卡、报表页 | 主力 `lieflat-charts`，校验用 `dataviz`（仅 Claude） |
| S3 品牌入口 | 登录、引导、欢迎页、404、加载页 | 可：`cinematic-ui`、`hallmark`、`frontend-design` |
| S4 插画与素材 | 空状态、封面图、分享卡、海报 | 可：`hairline-create`、`mono-color`、`lieflat-charts` 报告模板 |
| S5 动效 | 转场、入场、反馈 | `animate`，确有必要才加一个 GSAP 专项 |
| S6 界面文案 | 按钮、提示、说明 | 中文用 `humanizer-zh`，英文用 `writing-clearly-and-concisely` |

## 四、Skill 路由

只有本表列出的 Skill 属于默认流程。表外的 Skill，只在用户点名，或任务毫无歧义地匹配它的描述时才用。不要因为「装了」就用。

### 设计与实现

| Skill | 何时用 | 何时不用 |
| --- | --- | --- |
| `frontend-design` | 一个新的视觉决定：方向、字体、层级、构图，而框架和已有决定没覆盖 | 落实已定方向、局部样式修复、非视觉代码 |
| `ui-ux-pro-max` | 交互、响应式、无障碍、导航、配色、字体上有悬而未决的问题。它用本地检索，别把整库读进上下文 | 小 CSS 修正、套用已定模式 |
| `web-design-guidelines` | 用户要求 UI/UX/无障碍审查，或发布前正式评审 | 初始设计、日常实现 |
| `hallmark` | 用户明确要 Hallmark 的研究、审计或大改版 | 日常页面实现、默认艺术指导 |
| `cinematic-ui` | 用户明确要电影感或导演风格 | 普通页面，尤其是数据密集页面 |
| `mono-color` | 单色、双色、孔版、网点类素材 | 通用界面样式、照片处理 |
| `hairline-create` | 等距线框插画、空状态插画、封面或展位图 | 数据图表、图标、需要静态位图的地方 |
| `prototype` | 用户明确要多个可切换的视觉版本 | 日常实现，不要把原型当定稿 |
| `vercel-react-best-practices`、`vercel-composition-patterns` | 写或重构 React / Next.js 代码、设计可复用组件接口 | 非 React 代码 |
| `source-driven-development` | 不熟悉或版本敏感的 API、新增或升级依赖 | 已验证的同版本模式 |

### 图表

| Skill | 何时用 | 说明 |
| --- | --- | --- |
| `lieflat-charts` | 图表、可视化、报表。**图表主力** | 默认出图表；只有明确要「报告、年报、月报、海报、brief」才进报告模式。后台和仪表盘组件走 Glance，年报和对外展示页走 Lupi |
| `dataviz`（仅 Claude） | 校验配色（色盲可区分度）、悬停、图例、深色模式、反模式 | Codex 里没有，改用 `DESIGN.md` 第 8 节与 `docs/design-framework.md` 图表一节的清单 |

### 动效

| Skill | 何时用 | 何时不用 |
| --- | --- | --- |
| `animate` | 确实需要动效，且在 `DESIGN.md` 的克制范围内 | 静态工作、没有明确目的的动效 |
| `gsap-core`、`gsap-timeline`、`gsap-scrolltrigger`、`gsap-performance`、`gsap-frameworks` | CSS 做不到的编排：时间线、滚动编排、复杂可中断。只选和机制匹配的那一个 | 简单过渡、没有动效的任务 |
| `find-animation-opportunities`、`review-animations`、`improve-animations` | 只在用户明确要求时 | 默认流程 |

### 工程质量

| Skill | 何时用 |
| --- | --- |
| `systematic-debugging` | 有 bug、失败的测试或构建、无法解释的行为。先复现、找根因，再改 |
| `verification-before-completion` | 声称较大的工作完成、修好或通过之前 |
| `code-review-and-quality` | 用户要求审查，或准备提交合并，或有风险的改动 |

### 写作

| Skill | 何时用 | 何时不用 |
| --- | --- | --- |
| `humanizer-zh` | 大段中文文案或文章的自然化。深度改写会先过结构层 | 英文、代码、精确技术文本、短回复、按钮这类微文案 |
| `writing-clearly-and-concisely` | 起草或大幅修改较长的英文 | 状态回复、短提交信息、已给定的措辞 |
| `documentation-writer`、`doc-coauthoring` | 技术教程、参考文档、需要共同决定结构的方案 | 小修改、目的明确的起草 |
| `sepia` 及其包装、`beautiful-prose` | 只在用户明确点名时。`sepia` 不用于中文说明文 | 任何隐含或日常任务 |

## 五、风格类 Skill 的触发

**第一档：点名触发。** 用户说出 Skill 名或它的风格词，就用，不再追问。

| Skill | 风格词 |
| --- | --- |
| `cinematic-ui` | 电影感、电影海报、导演风格、分镜、黑色电影、胶片、cinematic、film noir |
| `hallmark` | hallmark、视觉审计、视觉 DNA、大改版 |
| `mono-color` | 单色、双色、孔版、risograph、网点、zine |
| `hairline-create` | 等距、线框插画、isometric、空状态插画、展位图 |
| `lieflat-charts` | 图表、可视化、报表、年报、月报、数据海报 |

**第二档：按区域提议。** 任务落在 S3 或 S4，视觉方向还没定，这时用一句话提最多两个风格选项让用户选。同一区域、同一会话最多问一次；没得到回答前不套用任何风格；被拒绝后走默认实现。

**第三档：定了就只听点名。** 项目决定记录了方向后，风格 Skill 只在点名时介入。

**护栏**
- 每个页面最多一个「招牌时刻」，其余保持安静。
- 同一区域，`cinematic-ui`、`hallmark`、`mono-color` 最多选一个。
- 风格不能让对比度、键盘可达、减少动画偏好变差。
- 以下情况不触发任何风格 Skill：日常实现、修 bug、重构、数据逻辑、单个样式小修、已定决定的落地。

## 六、引入新 Skill 的规则

1. **先读后装。** 读 `SKILL.md` 和它带的脚本，看有没有网络请求、命令执行、写文件。
2. **看许可证。** 个人项目可用非商业许可，转商用要换掉；没有许可证的不用。
3. **不盲目 `npx` 运行。** 用 `git clone` 到独立目录，审查后再复制，不带 `.git`。
4. **两处都装。** `~/.claude/skills/` 和 `~/.codex/skills/` 保持一致。装完在 design-kit 里重新运行 `snapshot`，换电脑时用 `restore` 一次还原全部 Skill。
5. **登记到本表。** 没登记的不属于默认流程。
6. **不随手改第三方 Skill 的文件。** 更新会覆盖。需要调整行为，优先写在本文件里；必须改文件时，做成补丁放进 design-kit 的 `skills/overlays/`，更新后可以重新应用。

## 七、两个 Agent 的差异

- Claude 读 `CLAUDE.md`，里面导入本文件；Codex 直接读 `AGENTS.md`。
- Skill 目录：Claude 在 `~/.claude/skills/`，Codex 在 `~/.codex/skills/`。点名 Skill 的写法按各自界面。
- 仅 Claude 有：`dataviz` 和 Claude 内置的一些工具型 Skill。表里标了的，Codex 用文档里的清单代替。
- 浏览器预览：Claude 可用内置浏览器；Codex 按自己的工具截图检查。

## 八、项目事实（安装后填写）

- 项目名称与用途：Moriium Dashboard，一个独立的 Dashboard 项目。与 Moriium 公开站无关，Moriium 的设计规范只作参考，不是约束，后续希望做出更新的设计。
- 技术栈（2026-10-12 定）：前端 React + Vite + TypeScript；服务端单进程 Hono + SQLite，本机阶段只监听 `127.0.0.1`；pnpm workspace（`apps/web`、`apps/server`、`packages/protocol`）。详见 [`docs/planning/05-architecture-and-data.md`](./docs/planning/05-architecture-and-data.md) 第 4、5 节，版本按 `source-driven-development` 核实。
- 规划（2026-10-12 获批）：[`docs/planning/README.md`](./docs/planning/README.md)。阶段、交付标准和 Morii 的参与点见 [`06-mvp-and-roadmap.md`](./docs/planning/06-mvp-and-roadmap.md)；开发启动提示词见 [`docs/handoff-2026-10-12-development-kickoff.md`](./docs/handoff-2026-10-12-development-kickoff.md)。
- 当前进度（2026-10-17）：P1 到 P3 已完成，P4 工程完成待 Morii 产品验收。P5 核心、界面评审、粘贴 JSON / 命令面板均已验证并合并，正式本机前端已更新。原正式库已另获授权备份升级至结构 10 并启动，待一周真实使用。P6.1 PR #31 / #32 双平台 CI 通过，未合并；P6.2a PR #33 双平台 CI 通过，未合并。P6.2b 隐藏口令工具 PR #34（代码 f09b368，377 项测试与一次原生 TTY 检查通过）已由 Claude 推送，堆叠于 #33，未合并，未接入正式服务。接手先读 [Claude 交接](./docs/handoff-2026-10-17-claude-p6.md) 和 [启动提示词](./docs/claude-start-2026-10-17-p6.md)，核对实际 Git / PR 状态。发布收尾已完成，只有 Morii 明确要求才继续 HTTP 接入、登录 UI 与部署准备。2026-10-16 已获准先做 P6 工程准备，真实试用和产品验收仍待完成；未获真实验收前不打 v0.1.0。实际恢复原数据、VPS 部署、访问方式和正式登录启用仍按对应步骤取得授权。P5 的顺序普通合并授权不自动扩展为 P6 合并授权。可选 5.6 未加入。
- 项目状态快照：[`docs/status/`](./docs/status/)，遵循 Project Status Protocol v1.1，`project_id` 为 `morii.dashboard`。
- 仓库：`Morii9961/Moriium-Dashboard`，公开，代码 MIT。数据、备份、导出包、令牌永远不进仓库。
- 界面语言：中文、日文、英文。
- 区域取舍：至少有 S1 工作区和 S2 数据可视化（图表以 `lieflat-charts` 为主力）；S3 到 S6 是否需要，待定。
- 设计规范：2026-10-18 选定「灰阶尺」，具体值全部在 `DESIGN.md`；之后进入 REFINE 模式，风格类 Skill 只在点名时介入（第五节第三档）。新的具体决定记进 `docs/design-decisions.md`。
- 设计决定记录：[`docs/design-decisions.md`](./docs/design-decisions.md)，记日期、决定和理由。
- 字体候选：[`docs/font-candidates.md`](./docs/font-candidates.md)。
- 参考资料库：[`docs/reference-library.md`](./docs/reference-library.md)。

## 九、design-kit v2 设计工作约定（2026-10-17 合并）

> 来源：design-kit 的 `templates/AGENTS.md`，原样合并为本节。与前八节冲突时：设计探索（EXPLORE）按本节；Skill 路由的「风格类 Skill」在本节流程中默认不主动使用，用户点名时照常。

> Claude Code 和 Codex 共用，`CLAUDE.md` 只导入本文件。
> 这套约定的目标不是「管理设计」，而是让设计**发散、具体、被真正看过、被记住**。
> 细则在 `docs/design-kit/`，需要时再读对应那一份，不要一次全读。

### 9.1 四条根本原则

1. **发散优先。** 默认做法是同时做出几个真正不同的方向，让人挑，而不是你替人收敛到「最稳妥」的那一个。
2. **具体胜过形容词。** 「克制」「高级」「有质感」不算决定。能写成 hex、字体名、px、ms、栏数的才算。
3. **没看过就不算做完。** 设计必须渲染、截图、亲眼看（读取 PNG），写出具体问题再改。只读代码得出的「看起来不错」无效。
4. **概念先行。** 每个方向先有一句话的世界观（「这是一台暗房里的……」），所有选择都要对它负责。

### 9.2 优先级

1. 用户当下的明确指令。
2. 项目里已选定的 `DESIGN.md` 与 `docs/design-decisions.md`。
3. `docs/design-kit/` 里的规则与方向库。
4. 任何 Skill 的建议。

设计类 Skill 默认**不主动使用**：它们来自不同作者，叠在一起得到的是更平均的平均值。用户点名了才用；用了也只当参考，以本约定为准。工程类 Skill（调试、验证、代码审查）照常可用。

### 9.3 三种模式

| 模式 | 什么时候 | 做什么 |
| --- | --- | --- |
| EXPLORE | 用户说「多尝试几种风格」「重做」「重构设计」，或项目还没有 `DESIGN.md` 的决定 | 走下面的完整流程，产出多个方向，**停下来等人选** |
| REFINE | 方向已选定 | 只听 `DESIGN.md`，不再重新发散；改动后仍要截图自检 |
| FIX | 小改、修样式 bug | 直接改，不开新方向，不动整体风格 |

拿不准是哪种模式，按 EXPLORE 对待，并在第一条回复里说明你的判断。

### 9.4 EXPLORE 流程

| 阶段 | 做什么 | 读哪份 | 产出（放进 `.design/`） |
| --- | --- | --- | --- |
| 0 勘察 | 盘点功能、页面、数据、约束；取真实数据做 fixtures | `dashboard.md`（若是后台/看板） | `00-recon.md`、`fixtures/` |
| 1 发散 | 想 8 个概念，弃掉最先想到的 3 个，选出 N 个（默认 5），过「距离规则」 | `divergence.md`、`directions.md`、`anti-slop.md` | `01-directions.md`，每个方向一份 `DIRECTION.md` |
| 2 原型 | 每个方向各做一个**垂直切片**（总览 + 最密的数据页 + 一个边缘状态 + 手机宽度），用同一份真实数据 | `type-cjk.md`、`dashboard.md` | 每个方向独立目录或独立路由 |
| 2b 自检 | 截图 → 亲眼看 → 写 3 处具体问题 → 修 → 再来一轮，每个方向至少两轮 | `critique.md` | 每个方向的 `critique-log.md` |
| 3 呈现 | 生成并排对比页，诚实写出每个方向的风险与短板，**然后停下** | `divergence.md` 第 8 节 | `review/index.html` |
| 4 收敛 | 人选定后（可以混搭），写 `DESIGN.md`，再完整实现 | `DESIGN.md` 模板 | `DESIGN.md`、`design-decisions.md` |

阶段 3 结束必须停下等人选择，不要自己挑一个继续做下去。

### 9.5 硬规则

- 不用占位内容：用真实数据、真实中文文案、真实图片。需要照片素材就向用户要，不用外链图库，不用 lorem ipsum，不用 "John Doe"。
- 字体全部自托管，授权必须是已核实的可商用/可嵌入（见 `type-cjk.md`），不依赖 CDN。
- 只动前端表现层。不改数据层、接口、业务逻辑；功能清单是约束，外观不是。
- 变体做在旁边（独立目录或 `/__design/<id>` 路由、独立分支），不删除现有前端。
- 无障碍与性能是底线，不是风格上限：正文对比度 ≥ 4.5:1、焦点可见、键盘可达、尊重 `prefers-reduced-motion`、颜色不是唯一线索。用风格化的方式满足它们，而不是因为它们就放弃风格。
- 不要把「反 AI 味」做成新的模板。见 `anti-slop.md`。
- 做不到的事（缺素材、缺授权、看不了图）要在报告里明说，不要用「看起来不错」带过。

### 9.6 项目事实（安装后填写）

- 项目名称与用途：Moriium Dashboard，Morii 一个人用的项目进度看板：导入各项目仓库里的 Project Status Protocol 快照，显示阶段、里程碑、证据、待决定与验收；另有今日焦点、任务、作品。
- 技术栈与运行方式：pnpm workspace；`apps/web` React 19 + Vite 8 + TS（手写 CSS、无路由/UI/图表库）；`apps/server` Hono + SQLite，只听 127.0.0.1:5180。开发 `pnpm dev`（5173），正式 `pnpm build && pnpm server`。
- 界面语言：中文为主，同时保持日文、英文三语。
- 必须保留的功能与页面：概览（今日面板、线路总图、需要你决定、项目长条、报告新鲜度、Agent 最新报告、最近交付）、需要你决定、项目列表、项目详情（概况/历史/成果/任务/设置、里程碑证据与验收、阻塞、下一步、历史对比）、Agents、作品、计划、导入记录、设置（主题、语言、项目登记、导出、服务状态）、命令面板、导入对话框（拖放与粘贴 JSON）、服务离线横幅、三语。清单见 `.design/00-recon.md`。
- 不能碰的东西：`apps/server`、`packages/protocol`、接口与数据含义、迁移、部署与认证脚本、正式数据目录；探索期不改 `apps/web` 现有前端。
- 设计决定记录：[`docs/design-decisions.md`](./docs/design-decisions.md)
- 当前选定的设计：[`DESIGN.md`](./DESIGN.md)——灰阶尺（2026-10-18 选定，来源 `.design/variants/04-zone/`）。
