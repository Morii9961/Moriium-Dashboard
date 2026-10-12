# 03 · Project Status Protocol v1

> **正式版已发布（2026-10-12，P1.6）：[`docs/protocol/README.md`](../protocol/README.md)。本文保留为规划阶段的批准记录，不再更新。**
> 状态：已获批（2026-10-12，见 `docs/design-decisions.md`）。Schema：[v1.0](./schema/project-status.v1.0.schema.json)、[v1.1](./schema/project-status.v1.1.schema.json)。两份 Schema 在 P1 发布前仍是草案，P1 只修错误，不改字段和结构；要改结构需另行请 Morii 批准。
> v1.0 的字段名和枚举照搬委托书，没有改动。v1.1 只新增可选字段（第 10 节的 E1、E2），v1.0 的文件继续有效。

## 1. 定位

一份快照回答一个问题：**某个项目在某个时刻，按某些依据，处于什么状态。**

- 生产者：各项目的 Agent（Codex、Claude 或其他），由 Morii 在会话里手动触发。
- 消费者：Moriium Dashboard，由 Morii 手动导入。
- 快照是**证词**，不是事实本身。Dashboard 展示时始终带着「谁说的、什么时候说的、依据是什么」。

快照不承担实时状态。Dashboard 不会把快照时间说成「Agent 在线」或「项目正在进行」。

> 命名提醒：Moriium 主站已有「运行状态」（`/status-data/`，站点是否在线）。本协议说的是「项目状态快照」，两者在界面和文档里都不混用一个词。

## 2. 文件位置与格式

每个项目仓库里两份文件，由 Agent 同时更新：

| 文件 | 给谁看 | 说明 |
| --- | --- | --- |
| `docs/status/project-status.json` | Dashboard | 本协议的 JSON，Dashboard 只导入这一份 |
| `docs/status/PROJECT_STATUS.md` | 人 | 同一份内容的可读版本，格式不做约束，Dashboard 不解析 |

文件格式要求：

- UTF-8，**不带 BOM**，换行用 LF，缩进 2 空格。
- 单个 JSON 对象，不包 Markdown 代码块，不带注释和尾逗号。
- 大小不超过 1 MiB。正常快照只有几 KB。

Windows 上的提醒：PowerShell 5 的 `Out-File` 和 `>` 默认写 UTF-16，会被拒绝。Agent 用编辑工具直接写文件即可。

## 3. 字段表

「必须出现」指键必须存在；「可为 null」指值可以是 `null`。空数组 `[]` 总是合法的。

### 3.1 顶层

| 字段 | 类型 | 必须出现 | 可为 null | 约束 | Dashboard 怎么用 |
| --- | --- | --- | --- | --- | --- |
| `schema_version` | string | 是 | 否 | v1.0 固定为 `"1.0"` | 选择校验规则，见第 7 节 |
| `project_id` | string | 是 | 否 | 小写点分 ID，至少两段，≤ 64 字符；必须已在 Dashboard 登记 | 匹配项目 |
| `project_name` | string | 是 | 否 | 非空 | 只存入历史；界面名称以登记表为准，不一致时提醒 |
| `snapshot_at` | string | 是 | 否 | ISO 8601，**必须带时区** | 排序、判断新旧与新鲜度 |
| `source` | object | 是 | 否 | 见 3.2 | 显示依据 |
| `stage` | string | 是 | 否 | 9 个枚举值之一 | 阶段轴 |
| `summary` | string | 是 | 否 | 1 到 160 字符（按码位计） | 卡片摘要 |
| `overall_progress` | integer | 是 | **是** | 0 到 100 的整数 | 非 null 时显示「Agent 估算」；null 时不画进度条 |
| `milestones` | array | 是 | 否 | 元素见 3.3；`id` 在快照内唯一 | 里程碑格、证据层级、历史对比 |
| `blockers` | array | 是 | 否 | 元素见 3.4 | 阻塞列表 |
| `next_actions` | array | 是 | 否 | 元素见 3.5 | 下一步，可转为任务或今日焦点 |
| `needs_morii` | array | 是 | 否 | 元素见 3.6 | 汇总到概览「需要你决定」 |

### 3.2 `source`

| 字段 | 类型 | 必须出现 | 可为 null | 约束 |
| --- | --- | --- | --- | --- |
| `branch` | string | 是 | 是 | 非空字符串或 null |
| `commit_sha` | string | 是 | 是 | 7 到 64 位小写十六进制，或 null |
| `basis` | string[] | 是 | 否 | 每项非空；建议用仓库相对路径（`docs/handoff-x.md`）、PR 编号、命令名，不写本机绝对路径 |
| `tests_rerun` | boolean | 是 | 否 | 目前统一为 `false` |

### 3.3 `milestones[]`

| 字段 | 类型 | 必须出现 | 可为 null | 约束 |
| --- | --- | --- | --- | --- |
| `id` | string | 是 | 否 | `^[A-Za-z0-9][A-Za-z0-9._-]*$`，≤ 64；**跨快照保持不变** |
| `title` | string | 是 | 否 | 非空 |
| `status` | string | 是 | 否 | `not_started / in_progress / blocked / done / unknown` |
| `evidence_level` | string | 是 | 否 | `self_report / repository / existing_test / morii_accepted / unknown` |
| `evidence_refs` | string[] | 是 | 否 | 可为空数组；每项非空 |
| `human_acceptance` | string | 是 | 否 | `pending / accepted / rejected / not_required / unknown` |

### 3.4 `blockers[]`

| 字段 | 类型 | 必须出现 | 约束 |
| --- | --- | --- | --- |
| `title` | string | 是 | 非空 |
| `impact` | string | 是 | 可为空字符串（导入时提醒） |

### 3.5 `next_actions[]`

| 字段 | 类型 | 必须出现 | 约束 |
| --- | --- | --- | --- |
| `title` | string | 是 | 非空 |
| `priority` | string | 是 | `P0 / P1 / P2` |
| `result` | string | 是 | 完成后应得到的结果；可为空字符串（导入时提醒） |

### 3.6 `needs_morii[]`

| 字段 | 类型 | 必须出现 | 约束 |
| --- | --- | --- | --- |
| `decision` | string | 是 | 非空；写成一个能回答的问题或待选事项 |

### 3.7 长度

协议只规定了 `summary` ≤ 160。其他文本字段在 Schema 里只设了一个宽松的安全上限（2000 字符），数组上限 200 项，用来挡住异常文件，不是写作要求。界面会对长文本折叠显示，所以不会因为标题偏长而拒绝导入。

## 4. 枚举的含义

给 Agent 和 Dashboard 统一口径。写进 Agent 指令模板（[`agent-snapshot-prompt.md`](./agent-snapshot-prompt.md)）。

### 4.1 `stage`

| 值 | 中文 | 什么时候用 |
| --- | --- | --- |
| `planning` | 规划中 | 还没有可运行的实现 |
| `development` | 开发中 | 主要功能在实现，尚未接到一起 |
| `integration` | 集成中 | 各部分在接线、联调 |
| `acceptance` | 验收中 | 功能基本到位，在做验证和 Morii 验收 |
| `launch_preparation` | 上线准备 | 功能成熟，剩部署、配置、发布前事项 |
| `live` | 已上线 | 正式环境在用 |
| `maintenance` | 维护中 | 已上线，只做修复和小改 |
| `paused` | 已暂停 | 主动停下，不是失败 |
| `unknown` | 未知 | Agent 无法判断 |

前七个是一条轴，`paused` 和 `unknown` 不在轴上。这条轴决定了 Moriium 主站这类成熟项目显示为「上线准备」，而不是一个很低的百分比。

### 4.2 `evidence_level`

| 值 | 界面叫法 | 含义 |
| --- | --- | --- |
| `self_report` | 自报 | Agent 根据自己的工作或阅读做出的判断，没有可指认的仓库痕迹 |
| `repository` | 仓库证据 | 能在仓库里指认：提交、文件、已合并的 PR。`evidence_refs` 应写出位置 |
| `existing_test` | 已有测试 | 引用已经存在的测试或验收记录（本次没重跑）。`evidence_refs` 应写出测试或记录位置 |
| `morii_accepted` | Morii 已验收 | 有 Morii 验收的书面记录（文档、PR 评论等），`evidence_refs` 应指向它 |
| `unknown` | 未知 | 说不清 |

### 4.3 `human_acceptance`

| 值 | 含义 |
| --- | --- |
| `pending` | 需要 Morii 验收，还没验 |
| `accepted` | 据 Agent 所知，Morii 已验收 |
| `rejected` | 据 Agent 所知，Morii 退回了 |
| `not_required` | 这个里程碑不需要人工验收 |
| `unknown` | 不清楚 |

快照里的 `human_acceptance` 是 **Agent 转述的验收状态**。Morii 在 Dashboard 里亲自点的「验收通过 / 退回」另外保存，并且优先显示，见 [04 第 9 节](./04-import-and-history.md#9-验收记录与处理状态)。

### 4.4 `priority`

| 值 | 含义 |
| --- | --- |
| `P0` | 不做就卡住后面的工作，或有时间压力 |
| `P1` | 本阶段应该做 |
| `P2` | 有空再做 |

## 5. 跨字段一致性

这些情况 Schema 表达不了，由 Dashboard 的语义校验处理。除第 1 条外都只是提醒，不阻止导入。

| # | 情况 | 处理 |
| --- | --- | --- |
| 1 | 两个里程碑 `id` 相同 | **错误**：历史对比按 `id` 配对，重复会让对比失真 |
| 2 | `evidence_level = morii_accepted`，但 `human_acceptance ≠ accepted` | 提醒：两处说法矛盾 |
| 3 | `human_acceptance = accepted`，但 `evidence_level ≠ morii_accepted` | 提醒：说已验收但没有验收证据 |
| 4 | `evidence_level` 是 `repository` 或 `existing_test`，但 `evidence_refs` 为空 | 提醒：声称有证据但没写在哪 |
| 5 | `status = done`，`evidence_level = self_report` | 不提醒，但界面会把它显示为「自报完成」 |
| 6 | `tests_rerun = true` | 提醒：v1 约定为 false；界面显示「Agent 称已重跑测试」，仍不算 Dashboard 核实 |
| 7 | `stage = paused` 但 `next_actions` 里有 P0 | 提醒 |
| 8 | `overall_progress = 100` 但存在未完成里程碑 | 提醒 |
| 9 | `source.basis` 为空 | 提醒：没有说明依据，整份快照按自报看待 |
| 10 | （v1.1）同一数组里两个条目的 `id` 相同 | **错误**：处理状态按 `id` 跨快照匹配，重复会让匹配失真 |
| 11 | （v1.1）`reporter.agent` 与分支前缀不一致（例如 `claude` 写在 `codex/…` 分支上） | 提醒：以文件里的 `reporter` 为准，同时显示这处不一致 |

## 6. 接收规则（Dashboard 怎么对待一份文件）

Schema 是给生产者的严格标准。Dashboard 接收时更宽一点：能安全理解的问题降为提醒，原文完整保存，做过的规范化逐条记录在快照上。原则是**宁可让 Morii 少回一趟 Agent 会话，也不悄悄改数据**。

### 6.1 阻止导入（错误）

| 情况 | 说明 |
| --- | --- |
| 不是合法 JSON，或顶层不是对象 | 指出行号和列号 |
| UTF-16 等非 UTF-8 编码 | 说明原因，提示让 Agent 用 UTF-8 重写 |
| 文件大于 1 MiB | |
| 疑似包含密钥或令牌 | 见 6.4；**不保存，也不在错误信息里回显** |
| `schema_version` 缺失、不是字符串、主版本不是 1 | |
| `project_id` 缺失、格式不对或未登记 | 列出已登记的 ID |
| `snapshot_at` 缺失、无法解析、没有时区，或比当前时间晚 10 分钟以上 | |
| `stage` 缺失或不是字符串 | |
| `summary` 缺失或为空 | |
| `source` 缺失或不是对象 | |
| 任何字段类型错误（例如 `overall_progress` 是 `"60%"`、`milestones` 是对象） | |
| `overall_progress` 超出 0 到 100，或不是整数 | |
| 里程碑缺少 `id`，或 `id` 重复 | |
| 已知枚举字段出现未知值（v1.0 文件） | 例如 `status: "finished"`，提示可用值 |

### 6.2 可以导入，但提醒（警告）

| 情况 | 处理 |
| --- | --- |
| UTF-8 带 BOM | 去掉 BOM 后解析 |
| `summary` 超过 160 字符 | 原样保存，卡片上截断显示 |
| 出现协议没有的字段 | 忽略，不进规范化数据，但保留在原文里；提示可能是拼写错误（例如 `next_action`） |
| `milestones / blockers / next_actions / needs_morii` 缺失 | 按空数组处理，记一条规范化 |
| `overall_progress` 缺失 | 按 null 处理，记一条规范化 |
| `source` 内缺少 `branch` 或 `commit_sha` | 按 null 处理，记一条规范化 |
| `project_name` 缺失 | 使用登记名称，记一条规范化 |
| `project_name` 与登记名称不同 | 提醒 |
| 第 5 节第 2 到 9 条 | 提醒 |
| 比当前最新快照更旧 | 说明只进历史 |

### 6.3 需要 Morii 选择

| 情况 | 选项 |
| --- | --- |
| 内容与已导入的某份快照完全相同 | 不再保存，显示「已于某时导入」 |
| 同一项目、同一 `snapshot_at`，内容不同 | 「用新内容替换」（旧版标为被替换，保留可查）或「取消」 |
| 文件被 Markdown 代码块包着 | 「提取代码块里的 JSON 再校验」或「取消」。不自动提取 |

### 6.4 安全规则

- 文件内容只当数据。不执行任何代码，不访问任何链接，不预取 `evidence_refs` 和 `basis` 里的地址。
- 所有字符串按纯文本显示，不渲染 Markdown 或 HTML。
- 只有 `https:` 开头的引用显示为可点链接，新标签页打开，带 `rel="noopener noreferrer"`。其他协议（`javascript:`、`file:`、`data:` 等）一律显示为文本。
- 导入前扫描常见密钥形态（GitHub 令牌前缀、`sk-` 形式的 API key、`-----BEGIN ... PRIVATE KEY-----`、`password=` 之类的赋值、AWS key 形态等）。命中即拒绝，错误信息只说「第几行疑似密钥」，不回显内容。
- 本机绝对路径、IP 地址：不拒绝，提醒「这些信息会保存在你的私有数据里」。数据本来就不进公开仓库，这条只是让 Morii 知情。

## 7. 版本兼容

`schema_version` 写成 `"主版本.次版本"`。

**生产者**
- 按自己遵循的版本写 `schema_version`，只写该版本定义过的字段。

**协议演进**
- 次版本（1.0 → 1.1）只能**新增可选字段**，或给枚举**新增值**。不能删字段、改名、改类型、改已有枚举值的含义。
- 主版本（1 → 2）才能做破坏性修改。Dashboard 届时同时支持 v1 和 v2 的导入，旧快照不迁移，按原版本解释。
- 每个发布过的版本有一份独立、不再修改的 Schema 文件。

**Dashboard 作为读者**

| 文件的版本 | Dashboard 的处理 |
| --- | --- |
| 已知的 `1.x` | 用对应 Schema 严格校验，再套第 6 节的接收规则 |
| 未知但主版本为 1（Dashboard 比生产者旧） | 用已知的最新 `1.x` 校验；未知字段忽略并提醒；已知枚举里出现未知值时按 `unknown` 显示并提醒（不报错） |
| 主版本不是 1 | 拒绝，提示升级 Dashboard |

快照入库时同时保存原文、`schema_version` 和当时使用的规则版本，以后规则改了，旧快照的含义不变。

**MVP 支持的版本**：`1.0` 和 `1.1`。Agent 指令模板从 v1.1 开始写；按委托书约定写出的 v1.0 文件照常导入。

## 8. `project_id` 与项目登记

- Schema 只规定格式，不把六个 ID 写成枚举。这样登记新项目时不用升级协议，现有六个 ID 也全部合法。
- 是否接受某个 ID，由 Dashboard 的**项目登记表**决定。首批登记六个：

| `project_id` | 名称 |
| --- | --- |
| `moriium.main` | Moriium 主站 |
| `moriium.gallery` | Moriium Gallery |
| `mori.meta` | MoriMeta |
| `enouia.memory` | Enouia Memory |
| `enouia.runtime` | Enouia Runtime |
| `morii.dashboard` | Moriium Dashboard |

- ID 一经登记不改名。项目改名只改显示名称。
- 未登记的 ID 导入时报错，并给出「去登记」入口。不自动创建项目，防止拼错的 ID 生出一个幽灵项目。

已决定（2026-10-12）：Schema 只规定格式，由登记表决定是否接受，不写死成枚举。

## 9. 证据与验收的三层

界面里「完成」永远带着层级，三层不合并：

| 层 | 来源 | 界面写法 |
| --- | --- | --- |
| Agent 自报 | `evidence_level = self_report` | 「自报完成」 |
| 有证据 | `repository` / `existing_test`，附 `evidence_refs` | 「有仓库证据」「有测试记录」，并注明「引用未经 Dashboard 核实」 |
| Morii 验收 | Dashboard 里 Morii 亲自点的验收记录 | 「你已验收（日期）」 |

快照里的 `morii_accepted` 和 `human_acceptance = accepted` 显示为「据报告已验收」，和 Morii 在 Dashboard 里的验收记录分开显示。将来接入 GitHub 只读同步后，`commit_sha` 和 PR 引用可以被 Dashboard 核实，届时增加「Dashboard 已核实」标记（见 [06 路线图](./06-mvp-and-roadmap.md)）。

## 10. v1.1：已批准的扩展

2026-10-12 Morii 把这一项交给规划方决定。结论：**批准 E1、E2，组成 v1.1；E3、E4 暂缓**。v1.1 只新增可选字段，v1.0 的文件不受影响，只认识 v1.0 的读者会忽略这些字段。

| # | 字段 | 状态 | 解决什么 |
| --- | --- | --- | --- |
| E1 | 顶层 `reporter` | **已批准，进 v1.1** | Agents 页要知道报告来自谁 |
| E2 | `blockers[] / next_actions[] / needs_morii[]` 的可选 `id` | **已批准，进 v1.1** | 跨快照追踪「这条我处理过了」，不受 Agent 改措辞影响 |
| E3 | `needs_morii[]` 的可选 `context`、`options[]`、`due` | 暂缓 | 让 Morii 在 Dashboard 里就能做决定。先看 v1.1 用起来 `decision` 一句话是否够用 |
| E4 | 顶层可选 `recent_work[]` | 暂缓 | 「上次以来做了什么」先由前后两份快照的差异推算 |

### 10.1 E1 `reporter`

| 字段 | 类型 | 必须出现 | 可为 null | 约束 |
| --- | --- | --- | --- | --- |
| `reporter` | object | 否 | 否 | 出现时必须是对象 |
| `reporter.agent` | string | 是（在 `reporter` 内） | 否 | `codex / claude / other` |
| `reporter.note` | string | 否 | 是 | ≤ 200 字符；可写模型名或会话用途，不写密钥、路径、私人信息 |

Dashboard 判断报告来源的顺序：文件里的 `reporter` → Morii 在导入预览里的选择 → `source.branch` 前缀推断 → 「未注明」。界面注明来源属于哪一种。

### 10.2 E2 条目 `id`

- `blockers[]`、`next_actions[]`、`needs_morii[]` 的每个条目可以带 `id`，格式与里程碑 ID 相同（`^[A-Za-z0-9][A-Za-z0-9._-]*$`，≤ 64）。
- 同一数组内唯一（重复是错误，见第 5 节第 10 条）；跨快照保持不变；措辞可以改，`id` 不改。
- 有 `id` 的条目按 `id` 匹配处理状态；没有 `id` 的条目仍按规范化文本匹配。同一份快照里两种可以混用。

### 10.3 以后再扩展

E3、E4 或新的提案，按第 7 节的规则作为 v1.2 等次版本提出，逐项请 Morii 批准。

## 11. 示例

**Dashboard 自己的快照**是一份真实的 v1.1 示例：[`docs/status/project-status.json`](../status/project-status.json)。它带 `reporter` 和条目 `id`；`branch` 和 `commit_sha` 为 null，因为仓库还没建立。

**一份会被拒绝的文件**，以及 Dashboard 给出的解释：

```json
{
  "schema_version": "1.0",
  "project_id": "mori.meta",
  "snapshot_at": "2026-10-11 20:00",
  "stage": "acceptance",
  "summary": "安装包可以本地构建，等待手工测试。",
  "overall_progress": "80%",
  "milestones": [{ "id": "installer", "title": "安装包", "status": "finished" }]
}
```

```text
无法导入 · 5 个错误 · 2 条提醒

错误
1. snapshot_at：「2026-10-11 20:00」日期和时间之间缺少 T，也没有时区。
   应写成 2026-10-11T20:00:00+08:00。
2. source：缺失。需要 { branch, commit_sha, basis, tests_rerun }。
3. overall_progress：收到字符串「80%」，应为 0 到 100 的整数或 null。
   没有严格依据时请写 null。
4. milestones 第 1 项 → status：「finished」不是可用值。
   可用值：not_started、in_progress、blocked、done、unknown。
5. milestones 第 1 项：缺少 evidence_level、evidence_refs、human_acceptance。

提醒（修好错误后仍会出现）
1. 缺少 project_name，将使用登记名称「MoriMeta」。
2. 缺少 blockers、next_actions、needs_morii，将按空列表处理。

[复制给 Agent 的修复说明]
```
