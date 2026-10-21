# ADR 0007 · Usage 1.1 质量原因与无法归日计量

日期：2026-10-21。范围：PR #43 的协议补齐及必要消费者兼容；不涉及 Runtime 文件、真实日志或部署。

## 最小决定集（编码基线）

1. 保留已确认的上海请求开始日口径。只有完成/usage 观测时间的 Codex checkpoint 不得写成 request_start，也不能无依据写成 shanghai_day。新增 `unallocated` 聚合区：可注明观测日和观测依据，但它不是用量归属日，永不并入上海日/周计数或金额。跨午夜仍如此。
2. 在快照、日、已归日行分别新增可选 `quality`；未提供表示未上报，`reported` + 空 reasons 表示该作用域检查无异常，`not_reported` 不允许带原因。原因使用有限 code + 规范十进制 occurrences/null，不接收自由文本、路径、会话 ID 或机器字段。每个 code 的计数单位固定；同一作用域禁止重复 code，生产者先去重合并。跨作用域可能重叠，消费者不相加。
3. 无法归日行复用模型/effort/互斥计数及计价条件，增加 `observed_date`（日期或 null）、`time_basis`（usage_observation / response_completion / checkpoint_unknown）及必填净化质量原因。观测日不必位于声明用量范围内：它可能观察到旧 checkpoint，但必须不晚于 generated_at 的上海日。unknown checkpoint 的 observed_date 必须为 null；其他两种必须有观测日。原因必须包含 request_start_unavailable 或 checkpoint_unallocated。
4. 质量元数据不授权自动选择冲突值或补零。未决冲突无法得出可靠数值时对应 count 必须 null；已接受历史可保留已知值并注明 retained_not_observed。原因计数记录受影响的对象数，不是 Token，不添加到 Token 总量。无法归日累计/增量去重仍由生产者负责。
5. 发布新的可兼容 1.1 Schema、类型、正反 fixture 和独立 SHA 清单；1.0 Schema/fixture/SHA 不变，1.0 导入继续工作。1.1 的新增字段可选，unallocated 行中的 quality 必填；旧生产者不被迫合成质量信息。
6. Dashboard 保留并展示质量原因；周页面同时显示「数据集未分配日期的观测」，注明不能归入当前周，不按 observed_date 筛成当前周用量。未分配计量和缺失原因不能折叠隐藏。历史账单保存当时的这份提示，但不把它称为某周用量。
7. 计算器升为 usage-fixed-v2。修正不可投影空日的假零，新增质量/未分配观测信息；旧 v1 账单恢复继续用原计算器复核，避免新规则悄悄改写历史金额或 hash。没有数据库迁移或 1.0 交换文件变更。
8. unallocated 是每个修订的完整数据集观测集，不是按日分片或增量。Dashboard 使用当前仍有效的日选择中 selection ID 最新的一份快照作为观测集；选用日期可在当前周外。选择旧版或撤销会改变该指向，但不拼接观测集。冻结账单记录独立的观测 hash，重计价保留该指向。界面始终明确这是数据集信息，与当前周无归属关系。

## 原因代码与单位

| code | 单位 | 含义 |
| --- | --- | --- |
| counter_reset | checkpoints | 计数观察出现重置，需按适配器去重与重建 |
| session_copy_conflict | sessions | 同一会话的副本存在无法自动仲裁的差异 |
| source_missing | files | 期望来源不存在 |
| source_unreadable | files | 来源无法读取 |
| source_deleted | files | 曾观察的来源现已删除 |
| retained_not_observed | checkpoints | 已接受的历史本次未观察到，仍保留 |
| checkpoint_unallocated | checkpoints | checkpoint 无法可靠分配请求日 |
| request_start_unavailable | observations | 观测缺少可证明的请求开始时间 |
| incomplete_tail | files | 未完成尾部记录未被当作完整事件 |
| parse_rejected | records | 有界解析拒绝的记录 |
| unsupported_source | records | 不支持的源格式或版本 |
| model_unresolved | records | 模型归属未知 |
| effort_inferred | records | effort 为推断归属 |
| counts_unreported | records | 必要计数未上报 |
| pricing_conditions_unknown | records | 请求级计价条件未知 |

## 版本与修订

质量信息也是不可变快照内容，改变原因或 occurrences 必须发新 revision，参与内容 hash；同范围仍人工审核替代，不新增叠加语义。相同归一化维度的重复行不能靠改 quality 绕过唯一性；unallocated 相同观测日/时间依据/模型条件也必须生产端先聚合。

normal / confirmed zero / unknown / conflict / retained / unavailable / 午夜观察与完成时间均用虚构 fixture 验证。Runtime 需要独立核验新版本固定提交与 SHA，Dashboard 测试不代表跨仓库 conformance 已完成。
