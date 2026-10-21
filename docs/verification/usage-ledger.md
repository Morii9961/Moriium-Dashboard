# Usage Ledger · D0–D3 合成验证与交接

日期：2026-10-21。仓库 Morii9961/Moriium-Dashboard；基线 main `d0fb1c9708f52570f5a898ff65437c39669a6795`；工作分支 `codex/usage-ledger-mvp`。初始工作树干净，PR #41 灰阶尺、#42 部署预检未合并且分别在其他工作树。本任务未修改它们，未操作 Moriium 公开博客。

## 交付范围

- D0：[ADR 0006](../adr/0006-usage-ledger.md)、[UsageSnapshot 1.0](../../packages/protocol/usage/README.md)、Schema、类型、原生离线 CLI、7 份合法及 10 份非法冻结 fixture。范围替代、人工冲突、上海请求开始日、严格默认计价由 Morii 在本次会话确认。
- D1：迁移 `0011_usage.sql`（schema 10 → 11），独立 Usage 私有表与选用视图；只读预览、严格幂等、冲突与撤销、不可变价格/汇率、BigInt 计价、上海周、固定账单；全量导出格式 2，兼容旧格式 1 恢复。API 清单见[操作说明](../operations/usage-ledger.md#api)。
- D2：`/usage`、三语、人工选取聚合 JSON、数据集/周/价格/汇率/计价策略选择、API 等价值、逐日柱与可访问表格、模型/Token 类别/费用/未计价原因、冻结历史与重计价、导入修订与选用轨迹。沿用当前基线组件，不复制未合并前端或第三方非 MIT 模板。
- D3：独立功能说明与本证据。未改现有项目状态快照，未替 Morii 验收 P4/P5，未创建 v0.1.0。

## 首次 D0–D3 实际运行（fede141）

环境 Node v24.15.0、pnpm 10.33.0、Windows。未新增或升级依赖，使用已有 lockfile 安装依赖。

| 命令 | 结果与范围 |
| --- | --- |
| `pnpm verify` | 26 个文件、442 项测试全部通过，0 失败；类型检查与公开树审计通过。11 条既有 Biome 警告，均在未修改的原有文件 |
| `pnpm build` | 生产前端构建通过，Usage 独立懒加载 chunk；后续仅新增截图/键盘检查脚本与样式验证，没有改计价算法 |
| `pnpm usage:check packages/protocol/usage/fixtures/valid-week.json` | 原生 Node CLI 合法返回 0；反例返回 1 也在自动测试内验证 |
| `node apps/server/test/usage-ui.ts` | 独立内存库、随机回环端口、Edge 无头模式；完整合成生命周期与 12 组视图通过，结束自动关闭 |
| `git diff --check` | 无空白错误 |

Vitest 在受限沙箱临时目录中曾报 ENOENT，既有模块也同样受影响；正常本机权限下复核通过。最初的 Host 测试预期码误写为 403，已按既有 421 修正；生成校验器曾残留 CJS require，按项目已有 ESM helper 模式修正，并加入原生 CLI 回归。以上早期失败均已处理，不将它们记为通过证据。

## 核心证据

| 边界 | 检查内容 |
| --- | --- |
| 计数 | Schema/语义正反 fixture；负数、浮点、数字 revision、非法日期、超过 78 位拒绝；互斥输入守恒、reasoning subset、未知 cache writes、深度和原生 ESM/CLI |
| 定价 | 普通/读缓存/5m/1h/30m/未知时长分开；已分类 long（虚构请求输入超过 272K）与 short；fast/区域必须独立规则；effort 无倍率；未知模型/条件/计数保持不可计价，显式情景留下假设 |
| 精度 | 超过 JS 安全整数；nano USD/M，USD 15 位/CNY 24 位整数运算；最终分位四舍五入、缺汇率不造人民币、缺价格不显示 $0 |
| 生命周期 | 预览无写入；重复 hash 零 total_changes；同 revision 冲突；重叠显式确认与并发状态检查；乱序覆盖不相加；撤销与旧选择审核；固定账单保留、明确重计价引用旧用量而非最新用量 |
| 备份/恢复 | SQLite ABORT 注入后导入 receipt/rows/selections 全部回滚，重试恢复；在线备份后重新打开；导出恢复旧固定账单及所有修订；篡改账单拒绝；旧格式 1 接受、未来格式拒绝 |
| 周界 | 上海周一半开区间、跨月周；相邻周数据隔离；服务日桶不可投影，不计入上海周；无观测为 null，完整零明确为 0 |
| 隐私/访问 | 聚合白名单、密钥形态扫描、固定错误码；测试拒绝私人扩展字段且控制台无原文；Host/Origin/CSRF/未登录拒绝；新增路由复用全局会话门；不返回原始 JSONL/文件名/路径 |
| 旧功能 | 全套已有协议、状态导入、历史、任务、成果、认证和恢复测试通过；唯一旧导出断言按显式格式 2 更新 |

UI 实测：默认空、无价、部分计价、重复导入、冲突勾选、键盘确认、生成固定账单、历史与重计价。中/日/英 × 浅/深 × 1440/375 = 12 组，无整页横向溢出、无外部请求、无页面异常；减少动画偏好下无运行动画；窄屏表格可聚焦并用方向键横滚。单色柱有精确文字表格，不靠颜色区分类目。复用 token 的两主题文字/图形/表单边界对比度有测试。人工检查了桌面中文、窄屏日文/英文的首部与图表截图。

截图和机器可读记录在被忽略的 screenshots/usage，不进 Git。浏览器测试读取真实后端 API，页面没有内置演示数据；测试的内存库及上传文件全部为虚构数据，包括合成模型、超大数、价格和汇率。

## 未验证与停机线

- Runtime 未运行同一冻结 fixture 清单；只有 Dashboard 本地 conformance，不称跨仓库集成完成。
- 未运行 Linux 本机浏览器、读屏器、真实断电/进程强杀或实际私人账单对账；SQLite ABORT/在线备份不替代真实断电验收。
- 未核验或内置实时官方价格/汇率；实际使用需 Morii 选择有依据的文件，并确认模型别名、计价条件和适配器转换。
- Morii 的产品使用、真实聚合文件选取及私人账单验收仍待人工进行；合成通过不构成 P4/P5 或 v0.1.0 验收。
- Runtime 自动化、真实个人日志读取、机器扫描、后台同步、外部抓价/汇率任务、正式库迁移、真实认证密钥、VPS 部署：**未授权、未启用**。

完成本次 D0–D3 工程交接后停止，不自动进入 Runtime、真实数据采集或部署。

## 1.1 与灰阶尺收尾（2026-10-21）

Morii 继续授权在同一 PR 内补齐协议、消费者与灰阶尺适配。协议独立提交 `6a5140f2a85d5962c1977509c67cb63acf27109f` 已推送至 PR #43；1.1 交换说明见 `packages/protocol/usage/v1.1/README.md`，7 个合法、15 个非法 fixture。Schema SHA-256 为 `fd24d1061fab771c2a8968acd648c5ceac84e1f1cea1d7346d9ff1a6b2b35e2b`；原 1.0 文件和 SHA 未改。Runtime 需要独立检验固定 Git 对象，不能把以下结果称为跨仓库验收。

消费者保留并显示质量原因与完整数据集未分配观测；后者永不参与日/周总量、比率与金额。最新有效显式选择决定观测集，但冻结与重计价保留原 hash。`usage-fixed-v2` 修正无法投影的完整空日假零；保留独立 v1 计算器复核旧账单。数据库仍为结构 11，API 路径不变，仅响应增加可选质量字段。

| 实际命令 | 本轮结果 |
| --- | --- |
| `pnpm exec vitest run packages/protocol/test/usage.test.ts packages/protocol/test/usage-v1-1.test.ts apps/server/test/usage.test.ts apps/web/test/usage-format.test.ts` | 4 文件，79 项通过、0 失败；含旧协议/新质量与午夜观测、历史 v1 恢复、v2 修订、周外观测版本保留、不投影空日 |
| `pnpm verify` | 27 文件，471 项通过、0 失败；类型检查与公开树审计通过；11 条既有警告，无新增警告 |
| `pnpm build` | 当前功能分支生产构建通过；此分支外壳仍为 main 基线，不声称已包含 PR #41 |
| `node screenshots/usage-zone-preview/build.mjs` | 被忽略目录中的 PR #41 固定 Git 对象与 Usage 组合构建通过；只读复用已安装依赖，没有更改另一工作树。该临时脚本不是仓库工具或部署产物 |
| `node apps/server/test/usage-ui.ts --zone-preview` | 组合预览使用合成内存 SQLite、随机回环端口和 Edge；完整生命周期含 1.1 预览/选用/质量/未分配观测；三语 × 两主题 × 1440/375 共 12 组通过 |
| `pnpm usage:check packages/protocol/usage/v1.1/fixtures/valid-midnight-observation.json` | 原生 CLI 返回 0，UsageSnapshot 1.1 valid |
| `pnpm usage:check packages/protocol/usage/v1.1/fixtures/invalid-misdated-observation.json` | 按预期返回 1，仅固定码 usage_semantics |
| `pnpm typecheck` | 最终导出路径/类型导入调整后再次通过；浏览器通过独立常量入口，避免打包服务端校验器 |
| `git diff --check` | 无空白错误 |

组合截图在被忽略的 `screenshots/usage-zone/`，机器结果为 checks.json。12 组均无整页溢出、外部请求、页面异常或运行动画；逐组核验键盘焦点为 2px solid，窄屏表格能方向键横滚。人工看过中文明色桌面、日文暗色窄屏、英文日图窄屏。所有数据与价格都虚构。

PR #41 固定版本 `144c63a4c3c581a603cb42ee56ff982e6f645d08` 与本功能的组合存在一处 Shell.tsx 导航定义冲突；预览保留 #41 纯文字 NAV，增加 Usage 项，不带回 icon/sub 旧定义。该处理只在临时预览，不代表两个分支已集成或 PR 已合并。正式集成时需按此解决并复核。原工作树、#41、#42、main 均未变。

本轮未运行 Linux 浏览器、读屏器、真实个人账单对账、正式数据库迁移、真实断电恢复或 Runtime conformance。Morii 的产品验收、合并与正式实例更新待其明确授权；不替代 P4/P5 签收。Runtime 自动化、真实日志读取、VPS 部署继续未授权、未启用。

### CI 时间预算修正

`7061366` 的 CI run 39583404394：Ubuntu 全部通过；Windows 470 项通过、1 项失败，失败为旧恢复 CLI 集成测试耗时约 6.7 秒超过 Vitest 默认 5 秒，未出现功能断言失败。该测试顺序启动 4 个原生 Node 进程，且本已有每个子进程 15 秒限制。本轮只把该测试总时限明确为 15 秒，保持所有退出码、恢复和隐私断言及子进程限制不变，不扩大全局时限或重试掩盖失败。修正后另跑定向恢复测试，并等待新提交 CI；不能把原失败记录称为双平台通过。

`d000496` 的 run 39583784344：Ubuntu 通过；Windows 同一组合测试约 15.9 秒仍超时。该次修正不足，尚不能据此确定是累计冷启动还是单个子进程阻塞。随后把原四个 CLI 场景拆成独立参数用例，保留全部断言和各进程 15 秒上限；每项外层 20 秒只给子进程退出/失败断言留余量。CI 诊断仅含固定场景名、耗时、状态和错误码，不含参数、路径或文件内容。`pnpm exec vitest run apps/server/test/restore.test.ts` 拆分后 27 项通过，0 失败；全套用例数因此从 471 增为 474，等待新提交 CI 分项证据，不复用旧提交的双平台结论。
