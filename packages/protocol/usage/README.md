# UsageSnapshot 1.0 · A0 交换契约

本协议独立于 Project Status 1.0/1.1，不改变其 Schema、接收规则或导入入口。

- 业务规则：[ADR 0006](../../../docs/adr/0006-usage-ledger.md)，Morii 已确认范围替代、人工冲突审核、上海请求开始日和默认严格计价。
- 正式结构：[usage-snapshot.v1.schema.json](usage-snapshot.v1.schema.json)，JSON Schema 2020-12。
- 类型：[usage-types.ts](../src/usage-types.ts)；可复用验证入口 `@moriium-dashboard/protocol/usage` 的 `checkUsage(value)` / `parseUsage(text)`。
- 冻结交换清单：[SHA256.json](SHA256.json)，包括 Schema 原始字节和全部正反 fixture。单独传递此目录即可，不需读取另一仓库。
- 离线检查：`pnpm usage:check packages/protocol/usage/fixtures/valid-week.json`；退出码 0 合法、1 非法/不可读。只返回固定状态，不回显文件路径或内容，不访问网络。

## 身份、范围和时间

顶层所有字段必须存在，未知字段拒绝。`kind=ai_usage_snapshot`、`schema_version=1.0`、`mode=range_replacement` 固定。一个 `dataset_id` 是随机 UUID v4，不得由机器名、账户、用户名、路径或这些信息的 hash 生成。一个 dataset 固定一种 source；同一 revision 不允许不同内容。revision 用正十进制字符串（1–30 位），生成端单调递增，接收端允许历史乱序到达但必须审核覆盖。

`range` 为上海日期的半开区间，1–366 天。`days` 按日期升序，必须逐日穷尽区间；`complete` 表示生产者声明该日无缺口，`partial` 表示已知有缺口，`missing` 表示期望数据不可用，`not_collected` 表示未采集。后两者不得携带行。完整日零行是确认零；缺失日零行是未知。不能用完整声明掩盖未知缓存。

`generated_at` 是生成时刻，必须为有效日历时间，秒精度、Z 或 +08:00；不是用量归属。`timezone` 固定上海。`source_timezone` 描述导出日桶的归属基准，逐请求时间经转换后填写 Asia/Shanghai；原始时间戳采用 UTC 不妨碍转换。`provider_defined` / `unknown` 或 UTC 服务日桶不可投影，行必须使用 `provider_day`。account_daily 必须为 provider_day；既有账户日总量不转换成虚构请求时间。

`source`：codex_local / claude_local / account_daily / manual_aggregate。来源不是 Provider；Provider 是 openai / anthropic / unknown。adapter_version 是执行标准化的适配器版本号，不填机器名或私有目录。Dashboard 不验证适配器的真实采集行为。

`time_basis`：request_start 为已转换的请求开始日；shanghai_day 为来源已经可靠归属到上海日的日聚合；provider_day 为不可投影服务日。跨日请求全部归请求开始日，对应日有效价格；不按 Token 生成时刻拆分。仅生成端有请求信息，Dashboard 不从聚合 Token 总量猜开始日或长上下文。

## 行与互斥计数

每行是 date × provider × exact model × effort × 时间/价格/质量条件的一组互不重叠计数，完整相同维度不能重复；生产端必须先去重再聚合。不能把累计计数和 last 片段分别当两行。不同来源/数据集不求和，周账单必须指定一个 dataset。

所有九个 count 键必须存在；已知值用规范非负十进制字符串，最多 78 位，禁止负数、浮点、指数、前导零和 JSON number。`null` 是未知/未上报，`"0"` 是确认零。普通输入、cache read、5m/1h/30m/unknown-duration cache write 是互斥输入桶。全部已知时它们必须合计等于 input_total，部分已知时已知之和也不能超过 input_total。output_reasoning_subset 不得大于已知 output_total，不独立收费。

- OpenAI：input_tokens 已含 cached_input；只有验证过源版本、确认所有写入桶语义且数值完整后，才可 `uncached = input_total - read - writes`。未上报 write 必须为 null，uncached 也不能据此推导为确定值。
- Claude：原 input_tokens 通常为普通输入；验证适配器版本后将 read 和各期限 write 加入 input_total。只有 cache_creation 总数但未知期限时，放 input_cache_write_unknown，已证实不存在的期限可为零；总写入也缺失时相关桶为 null。
- cache_detail=complete 要求互斥输入桶全已知；missing 表示不能宣称已完整分类。输出 reasoning 的 null 不妨碍已知总输出计价。
- effort 是 low/medium/high/xhigh/max/unknown/not_applicable；effort_evidence 为 reported/inferred/unknown/not_applicable，后两种须与 effort 对应。high/xhigh 没有单价倍率。比例以观测 Token 为分母，不称调用次数。

## 价格条件

service_tier：standard/fast/ultrafast/flex/batch/unknown；context_class：short/long/not_applicable/unknown；region：global/精确官方区域标识（例如 us-east-1）/unknown。classification=request_classified 表示生产端已对请求条件可靠分类，不能包含 unknown 条件；否则 unknown。`long` 的具体模型门槛由经核验的模型规则解释，Dashboard 不把日/周累计大于 272K 当单次长请求。

默认 classified 策略不计未知条件。手动选择 standard_short 时，才为未知 tier/context/region 代入 standard/short/global，并保存 assumed_standard_short。已知 fast/long/regional 仍精确匹配独立规则，不被标准情景覆盖。情景不补未知模型或缺失计数。所有结果只是 Token 的 API 等价值，不含工具调用附加费、订阅付款或账户余额。

## 校验、隐私与交换证据

结构 Schema 之外，生产者必须执行以上日期、覆盖穷尽、维度唯一、BigInt 守恒和 subset 的语义检查；不能只跑通用 JSON Schema 后称 conformance 成功。fixture 的 invalid-date、subset、double-count 等反例用于验证语义层。单文件 1 MiB、2000 行、嵌套最多 32 层。

禁止对话、代码、提示词、原始事件/JSONL、路径、设备名、账户标识、密钥、自由 notes。只允许规定聚合字段。任意语法合法的模型标签仍须由生产端审查来源，消费者不能靠格式推断它是否为个人名称。服务端严格白名单和密钥形态扫描，不回显未知键或私人片段。

fixtures/valid-week.json 是完全虚构的 8 行跨月周：包含 high/xhigh、互斥缓存、5m/1h 写入、已分类 long、超安全整数、未知 tier、未知模型、未上报写入。价格和汇率例子另在 fixtures/usage，全部为合成费率，不能用于真实估值。

当前只有 Dashboard 本地检查器与 fixture 验证；Runtime 尚未独立运行冻结清单，**跨仓库 conformance / 集成未完成**。未来 Runtime 只需独立验证同一 Schema + 语义并核对每份 SHA；这不授权采集真实日志或自动传输。
