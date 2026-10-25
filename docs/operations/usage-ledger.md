# 手动算力账本

入口：Agents 下的「算力账本」、命令面板或设置的数据区。默认没有数据、价格或汇率，不运行网络抓取。功能使用独立 Usage 表，与项目状态导入并存。

## 使用

1. 人工选择符合 [UsageSnapshot 1.0](../../packages/protocol/usage/README.md) 或 [1.1](../../packages/protocol/usage/v1.1/README.md) 的聚合 JSON。不要选择日志、对话导出或包含路径的文件。预览查看来源、覆盖日、前后已知 Token 与 SHA；确认后才写入。
2. 重复 hash 零变化。同一 dataset/revision 不同内容拒绝；发布修订应使用新 revision。重叠日期必须勾选审核，选择会替代整个声明范围，包括缺失日，旧版仍保留。下方修订列表可重新选用旧范围；撤销只在原导入选用未被后续操作修改时允许。
3. 选择数据集、周一日期、价目表版本和固定汇率。不同来源各自查看，不形成跨口径总量。服务定义日桶不能投影时不纳入上海周，只显示原因。
4. 默认仅对请求条件完整的计量计价。可显式启用标准短上下文情景，但不会补缺失缓存或未知模型价格。未计价金额显示「—」，不当作零加入小计。缓存比率分母为输入；high/xhigh 分母为已知观测 Token，均不代表请求次数。
5. 「生成固定账单」保存用量选择、价目表、汇率、算法和覆盖诊断。新价格、新导入不会改变旧账单。打开历史后更换价格/汇率并显式重计价，会沿用该账单的固定用量，生成关联 revision；返回当前用量后生成账单才采用最新选择。

所有金额是 Token 的 **API 等价值**，不代表订阅支付或实际 API 付款，也不含工具调用附加费。费用核心使用整数计算，USD 保留 15 位、CNY 保留 24 位小数；界面最后显示到分，明细悬停保留未舍入 USD。价格缺失时不会显示虚假总额。

## 1.1 质量与无法归日的观测

1.1 协议固定提交为 `6a5140f2a85d5962c1977509c67cb63acf27109f`，已推送 PR #43。该提交包含 Schema、类型、JSON Schema + 语义分派校验器、共享正反 fixture、SHA 清单与 ADR 0007；不含后续消费者实现。1.0 交换文件与 SHA 未改变。

预览和周页面持续显示快照、日、模型行的有限质量原因。未上报与已检查无异常不同；发生次数未知显示「—」，确认为零显示 0。原因单位是文件、记录、会话、观测或 checkpoint，不是 Token；跨作用域可能重叠，不能合计或用来补数。

缺少可证明的请求开始时间时，只能在 `unallocated` 中保留观测或完成日期，不伪造上海归属日。页面显示最新有效显式选择指向的完整数据集观测集，即使选择日期在当前周外；不拼接修订、不按观测日归入周计量。冻结账单记录独立的观测 hash，重计价保留它。未分配计数不进入任何已知 Token 小计、比例、日图或金额。

计算器新版本为 `usage-fixed-v2`，不可投影的完整空日也保留未知。历史 `usage-fixed-v1` 账单恢复仍用旧计算器复核原 hash；显式重计价才生成新算法修订。没有新增迁移，领域表仍为结构 11；不修改正式数据库。

前端以 PR #41 的 `144c63a4c3c581a603cb42ee56ff982e6f645d08` 为视觉依据。Usage 复用其 Archivo / Noto 字体与中性灰主题，不复制整站外壳。两 PR 都未合并；组合预览发现 `Shell.tsx` 的导航定义冲突，集成时保留 #41 无图标的文字导航并加入 Usage 入口，不能把旧图标导航带回。最终合并顺序由 Morii 决定。

## 手动价格和汇率文件

价格表结构见 [PriceCatalog 类型](../../packages/protocol/src/usage-types.ts)；可参考 [合成价目表](../../fixtures/usage/catalog.synthetic.json)，其中的模型和费率完全虚构。运行时只接受人工提供文件，不预装这份例子。

一个 catalog 的 id 标识整个不可变版本，version 保存价目表版本说明，checked_at 为人工核验日期。规则按 provider + 精确 model + 有效半开日期区间 + tier + context_class + region + category 匹配。category 分别为普通输入、缓存读、各期限缓存写、总输出；不会单独收费 reasoning。每条规则要求官方 HTTPS 出处，不允许账户凭据、查询参数或个人链接。模型支持 openai / anthropic 的已登记官方文档域名；不访问链接，也不把填写链接当成价格核验完成。费率单位 USD / 百万 Token，十进制字符串，最多 9 位小数。

一个汇率 id 是不可变固定值。base=USD、quote=CNY；rate 为最多 9 位小数的正十进制字符串。as_of 为来源日期，source 是 manual / ecb / pbc，kind 为 manual_assumption / reference_rate；manual 必须为 manual_assumption，source_url 必须为 null；参考汇率的 source_url 必须是对应 ECB/PBC 的官方 HTTPS 链接，不含凭据或查询参数。人工选择让该固定值用于整张账单，无隐式日汇率或自动换算。参考 [合成汇率](../../fixtures/usage/fx.synthetic.json)，此值不是真实汇率。真实使用由 Morii 录入核实后的数字和出处类别，新版本使用新 id。

## 数据、备份和恢复

新增迁移 0011_usage.sql，现行程序认识 schema 11。它只创建独立 Usage 表；本次验证仅在空的临时/内存库执行。**不得用本次开发授权升级正式私人库**，运行正式实例前须另获授权并按既有流程迁移前备份。

全量导出格式提升为 2，新增 usage.json，包含不可变导入、选用轨迹、价目表、汇率与固定账单；派生 daily rows 恢复时从已校验聚合重新构建。恢复会复核 hash、引用和逐账单原输入重算结果；格式 1 的旧包继续恢复为空 Usage 域，过新格式拒绝。导出只含聚合数据，不含原始日志或机器路径。既有 SQLite 在线备份自然覆盖这些表；「只导出项目快照」仍只导出 Project Status。

恢复只写空实例，遵守既有 data:restore 和正式数据授权规则。测试中注入 SQLite ABORT 证明事务回滚，不等于真实断电演练；正式磁盘/断电、私有数据、VPS 验收本次未做。

## API

全部位于既有 Host、会话、Origin、自定义 CSRF 请求头防护内，Usage 请求体限 1 MiB + 4 KiB。只有人工选择聚合文件的客户端入口，不新增机器扫描或自动同步。

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | /api/usage/datasets | 来源、导入修订元数据、当前选用日期、最近 50 条选用轨迹与并发状态 hash |
| POST | /api/usage/imports/preview | {snapshot}；只读预览、逐日差异和冲突 |
| POST | /api/usage/imports | {snapshot, expected_state, replace}；事务导入并显式覆盖 |
| GET | /api/usage/imports/:hash/preview | 对保留修订重新生成预览 |
| POST | /api/usage/imports/:hash/select | {expected_state, undo}；选用旧范围或撤销原导入选择 |
| GET | /api/usage/pricing | 已保存价目表和汇率 |
| POST | /api/usage/catalogs | 保存不可变 PriceCatalog |
| POST | /api/usage/fx | 保存不可变 FxSnapshot |
| GET | /api/usage/weeks/:monday | dataset、catalog、fx、mode；可选 previous 固定旧账单用量的计价预览 |
| GET | /api/usage/bills | dataset、week 的账单修订元数据 |
| GET | /api/usage/bills/:id | 不可变账单与依据 |
| POST | /api/usage/bills | {dataset, week, catalog, fx, mode, previous}；生成或显式重计价 |

未知和非法输入只返回固定错误码；不返回文件原文、私人文件名、未知字段名或异常里的 SQL 参数。浏览器正常读取的是已接受的白名单聚合模型标识和计数，仍属于私人数据，不能发布到公开 Activity。

## 开发验证

`pnpm usage:check <聚合 JSON>` 只读离线。`pnpm verify` 包含静态检查、类型、全套测试、公开树审计；`pnpm build` 构建生产前端。`node apps/server/test/usage-ui.ts` 在内存 SQLite 和随机回环端口上运行合成浏览器流程，结束关闭服务器，不调用 main.ts、无正式数据或备份任务。需要本机 Edge；截图进入被忽略的 screenshots/usage。

Runtime 自动化、真实个人数据读取、自动价格/汇率、VPS 部署与正式库迁移均**未授权、未启用**。跨仓库测试需 Runtime 之后独立核对冻结 SHA；Dashboard 本地测试不能替代它。
