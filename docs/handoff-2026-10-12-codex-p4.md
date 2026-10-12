# 交接：P1 到 P3 已完成，接下来是 P4（给 Codex）

> 日期：2026-10-12
>
> 来自：Claude Code 开发会话（P1 到 P3）。
>
> 交给：Codex（也适用于新的 Claude 会话）。
>
> 用法：在项目根目录新开会话，把第一节的提示词整段粘贴进去。

## 一、启动提示词

```text
你接手 Moriium Dashboard 的开发，从 P4（项目与概览）开始。P1 到 P3 已经完成并合并进 main。

【开工前按顺序读】
1. AGENTS.md：项目约定、Skill 路由、完成前的验证要求。
2. docs/handoff-2026-10-12-codex-p4.md（本文件）：现状、代码地图、坑、P4 的做法。
3. docs/design-decisions.md：已定的决定，直接沿用，不重新讨论（最上面几条最新）。
4. docs/planning/06-mvp-and-roadmap.md 的 P4 一节，以及 02 第 5 节（项目页，5.4 进度展示是重点）、第 4 节（概览）、第 9 节（验收与处理状态在 04 第 9 节）。
5. docs/status/PROJECT_STATUS.md：Dashboard 自己的状态。

【规则（来自 2026-10-12 的启动提示词，仍然有效）】
- 不伪造进度。overall_progress 为 null 时不画它的进度条；null 不显示成 0%。Agent 自报、有仓库或测试证据、Morii 验收，三层在任何地方都分开显示。导入时间不能说成 Agent 在线。
  （2026-10-12 Morii 改过的部分：首页进度数字统一为百分比，没有估算时按已知里程碑算完成率；估算值前面加「≈」区分。见 design-decisions。）
- 快照只当数据。不执行、不访问其中的链接，不渲染 HTML 或 Markdown；只有 https 链接可以点击；疑似密钥直接拒绝，而且不回显内容。
- 数据不进仓库。数据目录由 MORIIUM_DASHBOARD_DATA 指定，默认 %LOCALAPPDATA%\moriium-dashboard，放在仓库外。演示数据全部虚构（demo.*）。CI 跑公开树审计。截图里有真实快照的，一律不进仓库（screenshots/ 已被忽略）。
- 本机安全。只绑定 127.0.0.1；校验 Host 和 Origin；写请求要带 X-Moriium-Dashboard: 1；严格 CSP（不允许内联脚本和内联样式属性、data: 字体）；运行时不发任何外部请求。
- 三语（中文源语言、日文敬体、英文）和无障碍：每个界面工作包都检查桌面和 375px、浅色和深色、三种语言、键盘、对比度、减少动画。
- 协议 v1.0/v1.1 的结构不改；要改先停下问 Morii。MVP 之外的功能不做。
- 每个工作包一个分支、一个 PR，PR 一律以 main 为目标。Morii 已授权：PR 通过 CI 后可以自己按顺序合并（用普通合并提交，不要 squash，否则叠着的分支会冲突）。
- 不修改其他仓库；不做服务器、VPS、DNS 和 P6 的任何事；不替 Morii 输入口令或创建账号。
- 回复 Morii 用中文。Morii 不喜欢页面上的说明小字，喜欢有设计感、措辞客观。

【下一步】
按本文件第五节做 P4：4.1 项目列表 → 4.2/4.3 项目详情、验收与处理状态 → 4.5 概览 → 4.4 手动项目 → 4.6 走查打磨。
P4 结束是停点：汇报完成的工作包和 PR 链接、验证证据、和计划不同的地方、需要 Morii 做的事、状态快照路径。
上下文或额度快用完时，写 docs/handoff-<日期>-<主题>.md 并更新 docs/status/，然后停下。
```

## 二、现状（2026-10-12 晚）

- main 上已合并 PR #1 到 #15：P1（协议包、检查工具、文档）、P2（设计样张定稿、token、本地字体、主题、三语框架、应用外壳、服务端骨架）、P3（项目登记、导入、存储、历史、导出）。
- Morii 本机的正式数据目录里已经导入了六个项目的真实快照，外加 Dashboard 自己的 4 份历史快照（从 Git 历史补导）。打开 `pnpm build && pnpm server` 后访问 `http://127.0.0.1:5180` 就能看到。
- `pnpm verify` 通过：Vitest 290 个测试，公开树审计通过，Biome 0 个错误（8 个 CSS 特异性警告，功能无影响）。

### 2026-10-12 Morii 交给开发方决定的事（已定，见 design-decisions 最上面一条）

| 问题 | 决定 |
| --- | --- |
| 三处协议接收规则 | 按现有实现：summary 只有空白算错误；v1.0 文件里出现 reporter 或条目 id 时忽略并提醒；+08:00 和 Z 指向同一时刻算同一时刻冲突 |
| 本机数据目录 | 默认 `%LOCALAPPDATA%\moriium-dashboard`，可用 `MORIIUM_DASHBOARD_DATA` 改 |
| 导入问题说明的翻译 | MVP 不翻译：说明由协议包生成，是中文，和给 Agent 的修复说明保持一致；日文、英文界面里显示中文并标 `lang="zh-Hans"` |
| 回收站永久删除 | MVP 不做自动永久删除；以后要做，放在设置里，二次确认 |
| 在其他项目启用快照指令 | 建议现在就启用，但这一步改的是其他仓库，开发方没有权限；由 Morii 自己在各仓库的 AGENTS.md 里加入 `docs/protocol/agent-snapshot-prompt.md` 的内容，或另行明确授权 |
| VPS 访问方式 | 仍延后，P6 前再定 |

## 三、怎么跑

```bash
pnpm install
pnpm verify          # Biome + 类型检查 + Vitest + 公开树审计（和 CI 一致）
pnpm build           # 构建前端到 apps/web/dist
pnpm server          # 本机服务 5180，同时托管构建好的前端
pnpm server:dev      # 开发用：允许 5173 的前端写入，改代码自动重启
pnpm dev             # 前端开发服务器 5173，/api 代理到 5180
pnpm tokens          # 改了 apps/web/src/design/tokens.ts 后重新生成 tokens.css
pnpm status:check <文件>   # 命令行检查一份快照
```

- 设计基线页（样张）：开发服务器上的 `/specimen.html`。
- 测导入时不要往 Morii 的正式数据目录里写测试数据：用 `MORIIUM_DASHBOARD_DATA=<临时目录> node --watch apps/server/src/main.ts --dev` 起一个临时实例。
- Playwright 已装（`@playwright/test`），可以写一次性的截图脚本放在 `screenshots/`（已被 .gitignore 忽略，**不要提交**）。脚本里 `page.addInitScript` 设置 `localStorage` 的 `moriium-dashboard.theme`、`moriium-dashboard.locale` 来切主题和语言。

## 四、代码地图

```text
packages/protocol/      协议：Schema 校验（Ajv 预编译）、接收规则、规范化、指纹、差异、定位、中文问题说明
apps/server/
  migrations/           0001 设置与操作记录、0002 projects、0003 status_snapshots + import_batches
  src/app.ts            中间件（安全头、Host、写入保护、请求体上限）、路由注册、托管前端
  src/projects.ts       登记表；src/snapshots.ts 存储与当前状态查询；src/imports.ts 预览/写入/撤销
  src/history.ts        历史、对比、回收站；src/export.ts + zip.ts 导出
  src/routes/*.ts       各组接口
  test/                 server.test.ts（骨架、登记）、imports.test.ts（导入、历史、导出的端到端）
apps/web/src/
  design/               tokens.ts（唯一来源）、tokens-css.ts、color.ts（OKLCH 与对比度）
  styles/               fonts.ts（本地字体）、tokens.css（生成）、base.css
  i18n/                 messages/{zh-Hans,ja,en}.ts、i18n.tsx（useI18n：t、relative、snapshotTime…）、locale.ts
  theme/theme.ts        主题偏好与圆形揭开切换；public/theme-init.js 首帧前设置主题和语言
  components/           TransitMap（线路总图，招牌元素）、ProjectStrip（项目长条）、parts（路线图、状态、证据标签）、Segmented、CopyLine、components.css
  app/                  main.tsx、App.tsx（路由表）、Shell.tsx（导航）、router.tsx/match.ts、service.tsx（服务连接）、
                        data.tsx（useResource、invalidate）、api.ts、types.ts（接口数据形状，和服务端保持一致）、
                        ImportDialog.tsx、History.tsx、projectPages.tsx（概览、项目、详情、导入记录）、pages.tsx（其余页面）、registry.tsx（设置里的登记）、app.css
  progress.ts           summarizeProgress、progressFigure、freshness、MATURE_WORDING
  specimen/             设计基线页（开发用）
```

### 约定
- 文案：新增键先加 `zh-Hans.ts`，再加 `ja.ts`、`en.ts`，参数一致；测试会检查键、参数、中文与英文数字之间的空格、日文敬体、英文不用感叹号。约定见 `docs/copy-conventions.md`。
- 颜色和尺寸只用 `--c-*`、`--space-*`、`--text-*` 等变量；改 token 后运行 `pnpm tokens`。
- 接口错误只返回错误码（`{ error: 'exists', field: 'id' }`），文案由前端按三语显示（`apiError.*`）。
- 写操作在一个事务里完成并写 `audit_log`。快照只增不改；删除是软删除。
- 服务端返回的形状改了，要同步改 `apps/web/src/app/types.ts`。

## 五、P4 的做法（建议）

规划见 06 的 P4 一节和 02 第 4、5 节。已有的东西尽量复用：

1. **4.1 项目列表**（`/projects`）：现在是一行行的简单列表。改成桌面表格、手机卡片：名称、阶段（`LineMap` 的 compact 或 row 版）、里程碑格（`MilestoneGrid`）、进度（`figureOf`）、新鲜度（`freshness` 要改为用项目自己的 `freshnessDays`，现在固定 14 天）、待确认数。暂停或归档的项目收起显示。
2. **4.2 项目详情**：现在是长条加历史。补「来源行」（报告来自、分支 @ 提交、快照时间、导入时间，明确写「这是导入时间，不是在线状态」）、完整里程碑表（每行有证据标签和验收操作）、阻塞、全部下一步、待决定放最上面。考虑做成 02 第 5.2 节的分区（概况 · 历史 · 设置）。
3. **4.3 验收与处理状态**（04 第 9 节）：新迁移建 `acceptance_records`（project_id、milestone_id、通过或退回、说明、时间、依据快照）和 `item_states`（project_id、类别、键、状态、结论、稍后到期日）。键用 `packages/protocol` 的 `itemKey`（有 id 用 id，没有就用规范化文本的哈希）。接口按 05 第 11 节：`PUT /api/acceptance/:project/:milestone`、`PUT /api/items/:project/:kind/:key`。显示时 Morii 的记录优先，快照里的 `human_acceptance` 显示为「据报告」；已退回但新快照仍写 accepted 时显示矛盾提示。
4. **4.5 概览**：现在是标题 + 线路总图 + 项目长条。按 02 第 4 节补「需要你决定」（汇总各项目当前快照的 needs_morii 和待验收，显示 5 条，`/inbox` 看全部）、报告新鲜度、Agent 最近报告、最近交付（验收通过的里程碑）。线路总图保持为首屏招牌，其余区块安静。可以加 `GET /api/overview` 一次取回。
5. **4.4 手动项目**：`projects.tracking = 'manual'` 已有列；补手动里程碑表（05 第 7 节 `manual_milestones`）和「正在」「下一步」。
6. **4.6 走查**：用六个项目的真实快照逐个看，Morii 要能在 10 秒内答出「做到哪里、还差什么、下一步、要我做什么」。

## 六、坑和经验

- **转义序列**：工具调用里写的 `\uXXXX` 可能被解码成真正的不可见字符（公开树审计有规则会拦）。需要这类字符时用 `String.fromCodePoint(...)` 拼出来。shell 的 heredoc 里写 JS 时反斜杠也容易被吃掉，正则和路径里的反斜杠改用编辑文件的方式写。
- **改了 package.json 后**运行 `pnpm install`，把 `pnpm-lock.yaml` 一起提交，否则 CI 的 `--frozen-lockfile` 会失败。
- **测试里不要写字面的本机路径**（如 `C:\Users\…`），公开树审计会拦；需要时用 `join` 拼出来。
- **严格 CSP**：不能用内联 `<script>` 和 HTML 里的 `style="…"`；React 的 `style={{…}}` 是通过 CSSOM 设置的，可以用。Vite 构建已设 `assetsInlineLimit: 0`，避免小字体被内联成 `data:`。
- **项目 ID 里有点**（`moriium.main`），服务端的单页回退只按静态文件扩展名判断 404。
- **Windows 上测试清理**：打开着的 SQLite 文件删不掉，`rmSync` 已带 `maxRetries`；测试里记得 `db.close()`。
- **Intl.RelativeTimeFormat 的 `numeric: 'auto'`**：0 小时会说成「这一时间」，不足一小时要按分钟或秒格式化（`i18n.tsx` 已处理）。
- **端口**：停掉服务后立刻重启，5180 可能还没释放，等一两秒。
- `.claude/launch.json` 是 Claude 桌面版的预览配置；`server` 一项带 `--dev`，连的是正式数据目录。

## 七、已知的不足（P4 或以后）

- 新鲜度阈值还没按项目设置生效（`freshness` 固定 14 天）。
- 项目长条的「核心里程碑」设置已存在于登记表（`coreMilestones`），界面还没用上。
- 协议包的问题说明只有中文（已决定 MVP 不翻译）。
- 回收站没有永久删除。
- 首屏字体约 2.2 MB（设计基线页同时显示三种文字）；应用页面还没单独量过。
