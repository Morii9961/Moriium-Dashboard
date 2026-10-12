# 协议样本

`cases.json` 是清单：每个样本的预期结果（接受、拒绝或询问，以及错误和提醒的代码），`doc` 指向规划 03、04 的章节。测试在 `packages/protocol/test/fixtures.test.ts`，逐条比对。

- 全部内容虚构，项目 ID 用 `demo.alpha`、`demo.beta`，测试时临时登记。
- `encoding/` 下的文件按字节保存（`.gitattributes` 标为 binary），Biome 不格式化本目录。
- 疑似密钥、超过 1 MiB、超长文本这几类样本在测试里运行时生成，不提交：公开仓库不放令牌形态的字符串和大文件。
- 新增样本：放文件，在 `cases.json` 里加一条，再在下面的表里加一行。测试会检查两边一致。

用检查工具看某个样本的说明（P1.5 起）：

```bash
pnpm status:check fixtures/protocol/structure/progress-string.json --register demo.alpha
```

## 合法

| 样本 | 依据 | 情况 | 预期 |
| --- | --- | --- | --- |
| `valid/v1.0-full.json` | 03 §3 | 完整的 v1.0 快照 | 接受 |
| `valid/v1.1-full.json` | 03 §10 | 完整的 v1.1 快照，带 reporter 和条目 id | 接受 |
| `valid/v1.0-minimal.json` | 03 §3 | 最小的 v1.0：空数组、null 进度、null 分支和提交 | 接受 |
| `valid/v1.1-progress-estimate.json` | 03 §3.1 | 有整体进度估算（显示为 Agent 估算） | 接受 |
| `valid/v1.0-done-self-report.json` | 03 §5 #5 | 自报完成：不提醒，界面显示「自报完成」 | 接受 |
| `valid/v1.1-mixed-item-ids.json` | 03 §10.2 | 同一份快照里有 id 和没有 id 的条目混用 | 接受 |
| `valid/v1.1-utc.json` | 03 §3.1 | snapshot_at 用 Z 表示 UTC，带毫秒 | 接受 |

## 编码

| 样本 | 依据 | 情况 | 预期 |
| --- | --- | --- | --- |
| `encoding/utf8-bom.json` | 03 §6.2 | UTF-8 带 BOM：去掉后接受 | 接受：`⚠ bom_stripped` |
| `encoding/crlf.json` | 03 §2 | CRLF 换行：接受 | 接受 |
| `encoding/utf16le-bom.json` | 03 §6.1 | UTF-16 LE（PowerShell 5 的默认） | 拒绝：`✕ encoding_utf16` |
| `encoding/utf16be-bom.json` | 03 §6.1 | UTF-16 BE | 拒绝：`✕ encoding_utf16` |
| `encoding/utf16le-no-bom.json` | 03 §6.1 | 不带 BOM 的 UTF-16 | 拒绝：`✕ encoding_utf16` |
| `encoding/gbk.json` | 03 §6.1 | GBK 编码 | 拒绝：`✕ encoding_not_utf8` |

## 语法与格式

| 样本 | 依据 | 情况 | 预期 |
| --- | --- | --- | --- |
| `syntax/trailing-comma.json` | 04 §7 | 最后一项后面多了逗号 | 拒绝：`✕ json_syntax` |
| `syntax/comments.json` | 03 §2 | JSON 里写了注释 | 拒绝：`✕ json_syntax` |
| `syntax/empty.json` | 04 §3 | 空文件 | 拒绝：`✕ json_syntax` |
| `syntax/top-level-array.json` | 03 §6.1 | 顶层是数组 | 拒绝：`✕ json_not_object` |
| `syntax/code-fence.json` | 03 §6.3 | 被 Markdown 代码块包着：先询问 | 询问 |
| `syntax/code-fence.json` | 03 §6.3 | 被 Markdown 代码块包着：选择提取后接受 · 选项 `{"codeFence":"extract"}` | 接受：`⚠ code_fence_extracted` |
| `syntax/too-deep.json` | ADR 0002 | 嵌套过深 | 拒绝：`✕ json_too_deep` |

## 版本

| 样本 | 依据 | 情况 | 预期 |
| --- | --- | --- | --- |
| `version/missing.json` | 03 §6.1 | 缺少 schema_version | 拒绝：`✕ version_missing` |
| `version/number.json` | 03 §6.1 | schema_version 写成数字 | 拒绝：`✕ version_not_string` |
| `version/malformed.json` | 03 §7 | schema_version 不是「主.次」 | 拒绝：`✕ version_malformed` |
| `version/major-2.json` | 03 §7 | 主版本不是 1 | 拒绝：`✕ version_unsupported_major` |
| `version/newer-minor.json` | 03 §7 | 更新的次版本：按 1.1 校验，未知字段忽略，未知枚举按 unknown | 接受：`⚠ version_unknown_minor` `⚠ unknown_field` `⚠ unknown_enum_mapped` |
| `version/v11-field-in-v10.json` | 03 §7 | v1.0 文件里写了 v1.1 的 reporter 和条目 id：忽略并说明 | 接受：`⚠ newer_version_field` `⚠ newer_version_field` |

## 结构错误（03 第 6.1 节）

| 样本 | 依据 | 情况 | 预期 |
| --- | --- | --- | --- |
| `structure/project-id-missing.json` | 03 §6.1 | 缺少 project_id | 拒绝：`✕ required_missing` |
| `structure/project-id-format.json` | 03 §6.1 | project_id 格式不对 | 拒绝：`✕ project_id_format` |
| `structure/project-id-unregistered.json` | 04 §6 | project_id 没有登记 | 拒绝：`✕ project_unregistered` |
| `structure/snapshot-at-missing.json` | 03 §6.1 | 缺少 snapshot_at | 拒绝：`✕ required_missing` |
| `structure/snapshot-at-no-timezone.json` | 04 §7 | snapshot_at 没有时区 | 拒绝：`✕ snapshot_at_format` |
| `structure/snapshot-at-space.json` | 03 §11 | snapshot_at 缺 T、缺秒、缺时区 | 拒绝：`✕ snapshot_at_format` |
| `structure/snapshot-at-impossible-date.json` | 03 §6.1 | snapshot_at 是不存在的日期 | 拒绝：`✕ snapshot_at_invalid` |
| `structure/snapshot-at-future.json` | 04 §7 | snapshot_at 比现在晚很多 | 拒绝：`✕ snapshot_in_future` |
| `structure/stage-missing.json` | 03 §6.1 | 缺少 stage | 拒绝：`✕ required_missing` |
| `structure/stage-not-string.json` | 03 §6.1 | stage 不是字符串 | 拒绝：`✕ type_mismatch` |
| `structure/stage-unknown-value.json` | 03 §6.1 | v1.0 文件里 stage 是未知值 | 拒绝：`✕ enum_invalid` |
| `structure/summary-missing.json` | 03 §6.1 | 缺少 summary | 拒绝：`✕ required_missing` |
| `structure/summary-empty.json` | 03 §6.1 | summary 是空字符串 | 拒绝：`✕ empty_string` |
| `structure/summary-blank.json` | 03 §6.1 | summary 只有空白 | 拒绝：`✕ summary_blank` |
| `structure/source-missing.json` | 03 §6.1 | 缺少 source | 拒绝：`✕ required_missing` |
| `structure/source-not-object.json` | 03 §6.1 | source 不是对象 | 拒绝：`✕ type_mismatch` |
| `structure/basis-missing.json` | 03 §3.2 | source 里缺少 basis | 拒绝：`✕ required_missing` |
| `structure/tests-rerun-string.json` | 03 §6.1 | tests_rerun 是字符串 | 拒绝：`✕ type_mismatch` |
| `structure/commit-sha-format.json` | 03 §3.2 | commit_sha 用了大写 | 拒绝：`✕ commit_sha_format` |
| `structure/progress-string.json` | 04 §7 | overall_progress 是「60%」 | 拒绝：`✕ type_mismatch` |
| `structure/progress-float.json` | 03 §6.1 | overall_progress 不是整数 | 拒绝：`✕ not_integer` |
| `structure/progress-out-of-range.json` | 03 §6.1 | overall_progress 超过 100 | 拒绝：`✕ out_of_range` |
| `structure/milestones-object.json` | 03 §6.1 | milestones 是对象 | 拒绝：`✕ type_mismatch` |
| `structure/milestone-missing-id.json` | 03 §6.1 | 里程碑缺少 id | 拒绝：`✕ required_missing` |
| `structure/milestone-duplicate-id.json` | 04 §7 | 两个里程碑 id 相同 | 拒绝：`✕ duplicate_milestone_id` |
| `structure/milestone-status-unknown.json` | 04 §7 | 里程碑状态「finished」 | 拒绝：`✕ enum_invalid` |
| `structure/milestone-id-format.json` | 03 §3.3 | 里程碑 id 含空格 | 拒绝：`✕ id_format` |
| `structure/priority-unknown.json` | 03 §6.1 | 下一步优先级不是 P0/P1/P2 | 拒绝：`✕ enum_invalid` |
| `structure/item-duplicate-id.json` | 03 §5 #10 | v1.1 同一数组里两个条目 id 相同 | 拒绝：`✕ duplicate_item_id` |
| `structure/reporter-agent-unknown.json` | 03 §10.1 | reporter.agent 不是可用值 | 拒绝：`✕ enum_invalid` |
| `structure/many-errors.json` | 04 §3 | 多个错误一次全部列出 | 拒绝：`✕ type_mismatch` `✕ enum_invalid` `✕ enum_invalid` `✕ snapshot_at_format` |

## 可以导入但提醒（03 第 5、6.2 节）

| 样本 | 依据 | 情况 | 预期 |
| --- | --- | --- | --- |
| `warnings/summary-too-long.json` | 03 §6.2 | summary 超过 160 字 | 接受：`⚠ summary_too_long` |
| `warnings/unknown-field-typo.json` | 03 §6.2 | 多了一个拼错的字段 next_action | 接受：`⚠ unknown_field` |
| `warnings/arrays-missing.json` | 03 §6.2 | 缺少 blockers、next_actions、needs_morii | 接受：`⚠ filled_empty_array` |
| `warnings/progress-missing.json` | 03 §6.2 | 缺少 overall_progress | 接受：`⚠ filled_null_progress` |
| `warnings/source-branch-missing.json` | 03 §6.2 | source 里缺少 branch | 接受：`⚠ filled_null_source_field` |
| `warnings/project-name-missing.json` | 03 §6.2 | 缺少 project_name | 接受：`⚠ filled_project_name` |
| `warnings/project-name-mismatch.json` | 04 §6 | project_name 与登记名称不同 | 接受：`⚠ project_name_mismatch` |
| `warnings/evidence-acceptance-conflict.json` | 03 §5 #2 | morii_accepted 但 human_acceptance 不是 accepted | 接受：`⚠ evidence_acceptance_conflict` |
| `warnings/accepted-without-evidence.json` | 03 §5 #3 | 说已验收，但证据层级不是 morii_accepted | 接受：`⚠ accepted_without_evidence` |
| `warnings/evidence-refs-missing.json` | 03 §5 #4 | 声称有仓库证据但没写位置 | 接受：`⚠ evidence_refs_missing` |
| `warnings/tests-rerun-true.json` | 03 §5 #6 | tests_rerun 为 true | 接受：`⚠ tests_rerun_claimed` |
| `warnings/paused-with-p0.json` | 03 §5 #7 | 已暂停但下一步有 P0 | 接受：`⚠ paused_with_p0` |
| `warnings/progress-100-incomplete.json` | 03 §5 #8 | 进度 100 但有未完成里程碑 | 接受：`⚠ progress_100_incomplete` |
| `warnings/basis-empty.json` | 03 §5 #9 | basis 是空的 | 接受：`⚠ basis_empty` |
| `warnings/reporter-branch-mismatch.json` | 03 §5 #11 | reporter 是 claude，分支是 codex/ | 接受：`⚠ reporter_branch_mismatch` |
| `warnings/blocker-impact-empty.json` | 03 §3.4 | 阻塞的 impact 为空 | 接受：`⚠ blocker_impact_empty` |
| `warnings/next-action-result-empty.json` | 03 §3.5 | 下一步的 result 为空 | 接受：`⚠ next_action_result_empty` |
| `warnings/private-info.json` | 03 §6.4 | 含本机路径和 IP：提醒会保存在私有数据里 | 接受：`⚠ private_info_present` |

## 项目匹配（04 第 6 节）

| 样本 | 依据 | 情况 | 预期 |
| --- | --- | --- | --- |
| `project/demo-beta.json` | 04 §6 | 属于 demo.beta 的快照 | 接受 |
| `project/demo-beta.json` | 04 §6 | 在 demo.alpha 的项目页导入 demo.beta 的快照 · 选项 `{"expectedProjectId":"demo.alpha"}` | 拒绝：`✕ project_mismatch` |

## 历史定位（04 第 5 节）

`history/` 下是同一个项目（`demo.beta`）不同时刻的快照，用来验证重复、同时冲突、较新、较旧。

| 情况 | 已有 | 新导入 | 预期 |
| --- | --- | --- | --- |
| 较新：成为当前状态 | `t1-base.json` | `t2-newer.json` | `latest` |
| 较旧：只进历史 | `t1-base.json`、`t2-newer.json` | `t0-older.json` | `history` |
| 完全重复（换了键顺序和缩进）：不再保存 | `t1-base.json`、`t2-newer.json` | `t1-base-reformatted.json` | `duplicate` |
| 同一时刻、内容不同（时区写法不同也算同一时刻）：由 Morii 选择 | `t1-base.json`、`t2-newer.json` | `t1-same-instant-different.json` | `conflict` |
| 第一份快照：成为当前状态 | 无 | `t0-older.json` | `latest` |
