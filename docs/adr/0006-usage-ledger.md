# ADR 0006 · 手动 Usage 账本

- 日期：2026-10-21
- 状态：D0 业务规则由 Morii 在本次会话确认；实现与验证证据另记。
- 基线：main d0fb1c9；独立分支 codex/usage-ledger-mvp。PR #41（前端重构）与 #42（部署）未合并，本任务不接管。

## 决定

1. UsageSnapshot 1.0 是声明区间的完整、不可变替代集合，拒绝 delta。区间半开，逐日覆盖必须穷尽声明区间；缺失日不能冒充零。dataset_id 为随机 UUID，与设备、账户、路径无关；一个 dataset 固定一种来源。同一 dataset 的 revision 为十进制字符串。
2. 重叠日期需要人工审核并显式选择，选择以预览时的有效日 hash 作并发检查；旧 revision、乱序补录、审核轨迹全部保留。恢复旧选择也是新审核记录，不改历史。不同 dataset/来源分别出账，账单必须指定 dataset，不产生跨口径全局总计。
3. 请求按开始时刻转上海日归桶。来源只有不可投影的服务日桶时标 provider_day，不进入上海周计数，保留诊断。周一 00:00 至下周一 00:00，Asia/Shanghai；不能按生成时间或文件修改日归属。
4. 未知 tier/context 默认不计价。仅用户显式选择 standard_short 情景，才把未知条件代入标准短上下文，记录假设。该选项不推断缺失计数，不处理未知模型，不假定缓存写入为零。effort 从不修改费率。
5. 所有 Token 为规范非负十进制字符串（最多 78 位）；未知为 null。互斥输入桶包括普通输入、缓存读、5m/1h/30m/未知时长缓存写。桶全已知才验证和等于 input_total；已知部分也不得超过总输入。reasoning 是 output_total 子集。
6. OpenAI 原 input 含 cached：仅适配器证实所有写入计数和语义后可相减；Claude 原 input 为普通输入，须加读写桶还原 total。不完整适配必须用 null 和 missing 状态，不能套用提案里的旧审计零值。
7. 价目表、汇率由人工提交，版本不可变，无内置真实价格。规则精确匹配 provider/model/有效日/tier/context/region/Token 类别；缓存期限独立规则，不乘经验倍率。费率为 USD/M，最多 9 位小数；BigInt 计算 USD 15 位、CNY 24 位定点数，最终显示才舍入。
8. 每次显式生成/重计价得到不可变账单 revision，保存选定日、原始 hash、价格/汇率完整副本、算法版本、覆盖与未计价原因。新导入或改价不改变旧账单。账单只叫 API 等价值，绝不代表订阅实付。
9. Usage 独立领域表，不写 status_snapshots、公共 ActivityData。复用 db.ts 事务和备份；全部数据导出提升格式并兼容旧包恢复，新格式必须包含 Usage 完整性验证。任何正式库升级另行授权。
10. 仅人工选择聚合 JSON。协议 CLI 是离线 conformance 入口，不包含日志扫描、定时任务、同步、路径读取 HTTP API。严格字段白名单、限大小/深度、固定错误代码；不回显私人文件名、原文、未知键或 JSON 片段。

## 与提案及现行项目的取舍

- 提案是设计参考，不是价格核验或跨仓库集成证据；不复制其中真实审计数字和私人来源信息。
- 不采纳自由 coverage notes、collector 名称或机器别名；仅版本标识、有限诊断枚举和随机 UUID。
- 全部 source/model/effort 均可表达，但不能把 account_daily 与 local 计数相加。source_daily 不伪造上海请求日。
- 当前基线设计组件继续使用；未合并重构不在此次范围。lieflat-charts 仅作图型选型顾问，遵守现有 MIT 约束，不复制 PolyForm 模板。
- A0 的 Dashboard 本地契约测试与未来 Runtime 的独立验证分开；只有双方分别通过冻结 fixture 才可称跨仓库 conformance 完成。

## 上限与版本

单文件 1 MiB，最多 366 天、2000 行、32 层 JSON。不接受未来协议版本的宽松降级；Usage 1.0 与 Project Status 1.0/1.1 各自校验、各自演进。字段扩展须发新版本，已冻结文件及 fixture hash 不静默更新。
