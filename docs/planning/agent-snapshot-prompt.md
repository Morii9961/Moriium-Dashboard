# Agent 指令模板：生成项目状态快照

> 状态：已获批（2026-10-12），按协议 v1.1 编写。P1.6 定稿后迁到 `docs/protocol/`，正文不变。
> 用法：Morii 把下面「指令正文」放进各项目的 `AGENTS.md`（或在会话里直接粘贴）。之后在该项目的会话里输入「生成项目状态快照」，Agent 就按这份指令做。
> Dashboard 的开发会话**不修改**其他项目的仓库；放不放、什么时候放，由 Morii 在那些仓库里决定。

---

## 指令正文

### 生成项目状态快照

当 Morii 说「生成项目状态快照」时，更新本仓库的两份文件，然后停下，不做别的事：

- `docs/status/project-status.json`：Project Status Protocol v1.1，Moriium Dashboard 会导入它。
- `docs/status/PROJECT_STATUS.md`：同一内容的可读版本，给人看。

**只读不改。** 生成快照期间不改代码，不运行构建和测试，不提交、不推送，除非 Morii 另外要求。这两份文件应当提交进本仓库，但什么时候提交由 Morii 决定。

**JSON 的结构**（全部 13 个键都要写；没有内容就写 `[]` 或 `null`）：

```json
{
  "schema_version": "1.1",
  "project_id": "<本项目固定 ID>",
  "project_name": "<显示名称>",
  "snapshot_at": "<ISO 8601，带时区，例如 2026-10-11T22:30:00+08:00>",
  "source": {
    "branch": "<当前分支或 null>",
    "commit_sha": "<当前提交完整 SHA 或 null>",
    "basis": ["<依据，用仓库相对路径、PR 编号或命令名>"],
    "tests_rerun": false
  },
  "reporter": { "agent": "codex | claude | other", "note": null },
  "stage": "planning | development | integration | acceptance | launch_preparation | live | maintenance | paused | unknown",
  "summary": "<中文，最多 160 字>",
  "overall_progress": null,
  "milestones": [
    {
      "id": "<稳定 ID，以后不改名>",
      "title": "<标题>",
      "status": "not_started | in_progress | blocked | done | unknown",
      "evidence_level": "self_report | repository | existing_test | morii_accepted | unknown",
      "evidence_refs": ["<证据位置>"],
      "human_acceptance": "pending | accepted | rejected | not_required | unknown"
    }
  ],
  "blockers": [{ "id": "<稳定 ID>", "title": "<阻塞>", "impact": "<影响>" }],
  "next_actions": [{ "id": "<稳定 ID>", "title": "<下一步>", "priority": "P0 | P1 | P2", "result": "<完成后得到什么>" }],
  "needs_morii": [{ "id": "<稳定 ID>", "decision": "<需要 Morii 决定的事>" }]
}
```

**规则**

1. **不编造。** 只写你在仓库里读到、或本次会话里确实做过的事。不确定就写 `unknown`。
2. **`overall_progress` 默认写 `null`。** 只有存在严格估算依据（例如明确的验收清单完成了几项）时才写整数，并在 `basis` 里写出依据。
3. **证据层级要如实：**
   - `self_report`：你的判断，仓库里没有可指认的痕迹。
   - `repository`：能指认提交、文件或已合并 PR，写进 `evidence_refs`。
   - `existing_test`：引用已有的测试或验收记录（本次没重跑），写出位置。
   - `morii_accepted`：仓库里有 Morii 验收的书面记录，写出位置。没有记录就不要用。
4. **`human_acceptance`** 只转述有记录的验收。不知道就写 `pending`（需要验收）或 `unknown`。
5. **`tests_rerun` 写 `false`。** 生成快照不跑测试。
6. **ID 保持稳定。** 里程碑、阻塞、下一步、待决定都有 `id`。先读旧的 `project-status.json`，同一件事沿用原来的 `id`；新出现的事才起新 `id`。措辞可以改，`id` 不改。同一个数组里 `id` 不能重复。
7. **`stage` 看实际情况。** 功能成熟、只差部署的项目写 `launch_preparation`，不要因为没上线就写成 `development`。
8. **不写隐私和密钥。** 不写令牌、密码、服务器地址、本机绝对路径、私人行程和预算。依据用仓库相对路径。
9. **文件格式：** UTF-8 无 BOM，LF 换行，2 空格缩进，纯 JSON，不加代码块围栏和注释。
10. **`summary` 不超过 160 字**，说清现在在哪、离可用还差什么。
11. **`needs_morii` 写成能直接回答的问题**，例如「是否在 10 月内开放 Gallery 的公开访问？」，而不是「需要讨论 Gallery」。
12. **`reporter.agent`** 写你自己：Codex 写 `codex`，Claude 写 `claude`，其他写 `other`。`note` 可写模型名，不写别的；没有就写 `null`。

完成后，在回复里用三五行告诉 Morii：快照时间、阶段、有几条需要 Morii 决定的事，以及两份文件的路径。

---

## 各项目的固定 ID

| 项目 | `project_id` |
| --- | --- |
| Moriium 主站 | `moriium.main` |
| Moriium Gallery | `moriium.gallery` |
| MoriMeta | `mori.meta` |
| Enouia Memory | `enouia.memory` |
| Enouia Runtime | `enouia.runtime` |
| Moriium Dashboard | `morii.dashboard` |
