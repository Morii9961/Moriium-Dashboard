# Claude 交接 · 2026-10-26 · 灰阶尺收尾与算力账本重做

Claude 的周额度随时可能用完，这份文档每做完一个阶段就更新一次。接手的 Codex 复制 [启动提示词](codex-start-2026-10-26-ledger.md) 即可开始。当前事实以本文为准，接手后仍要核对 Git / GitHub 的实际状态。

## 当前位置

仓库 `Morii9961/Moriium-Dashboard`。灰阶尺已经进了 `main`，进行中的只剩算力账本一条：

| 分支 | 最后推送的提交 | 状态 |
| --- | --- | --- |
| `redesign/final` | `07d6f4c` | [PR #41](https://github.com/Morii9961/Moriium-Dashboard/pull/41) **已合并**（Morii 2026-10-26 授权 Claude 合并）：合并提交 `b11d765`，普通合并、锁定在 CI 通过的 `07d6f4c`。远端分支被仓库的「合并后自动删除」设置删掉了，提交都在 `main` 里，需要时可在 PR 页面恢复。 |
| `feat/usage-tokens-ci` | 见 `git log -1 origin/feat/usage-tokens-ci` | #41 合并后已把 `main` 合进来（`23e38a9`，没有文件变化），[PR #44](https://github.com/Morii9961/Moriium-Dashboard/pull/44) 开放，基准 `main`，**未合并**；CI 以 PR 页面为准。 |

Claude 的工作目录是本机上的一个 git worktree（目录名 `moriium-dashboard-redesign-16cd0f`），目前停在 `feat/usage-tokens-ci`。

## 已完成并验证

### PR #41（灰阶尺）上的最近三轮

1. **全站动效**（`a56f9fa`）：换页显影、按钮按压、对话框与抽屉、展开收起、主题交叉淡入；命令面板开合故意不加动画。规范在 `DESIGN.md` 第 7 节，代码在 `apps/web/src/app/motion.css`。
2. **合并 main**（`3c46c93`）：导航里「算力账本」按灰阶尺的平铺文字导航放在 Agents 后面；顺带修了旧算力账本页的三处排版。
3. **换页抽搐与 Agents**（`07d6f4c`）：加载态先等 300ms 再淡入并与正文对齐；`scrollbar-gutter: stable`；显影结束不残留 `transform`。「未注明」的 Agent 一律显示为 Codex（三语），Agents 页去掉「其他 Agent」并把未注明并入 Codex。只改前端显示，数据字段不变。

证据：`pnpm verify`（474 项）、`pnpm build`，逐帧换页记录与动效采样见 `docs/design-decisions.md` 2026-10-25 的两条。

### `feat/usage-tokens-ci`（算力账本重做）

- **服务端**：`apps/server/src/tokensci.ts` 与 `routes/tokensci.ts`。`GET /api/tokens-ci` 代读 `https://tokens.ci/api/users/<用户名>`，只保留页面要用的字段（含缓存读写），缓存 10 分钟（`?refresh=1` 强制刷新），失败回退到上次数据并标 `stale`；`PUT /api/tokens-ci/settings` 保存用户名。用户名和缓存存在数据目录的 `tokens-ci.json`、`tokens-ci-cache.json`，不进数据库和导出包。**这是服务端第一处访问外网**：只读、不发送本机数据，清空用户名就停止访问。类型在 `packages/protocol/src/tokens-ci-types.ts`。测试 `apps/server/test/tokens-ci.test.ts`。
- **页面**（`apps/web/src/app/Usage.tsx`、`ledger.css`、`ledger-format.ts`）：累计 Token 主数字、灰阶日历（每天一格，越用越黑，方向键可走）、选中那天的明细、近 30 天按日柱、数据来源设置。三语 × 1440 / 820 / 390 截图无横向溢出。
- **每日账单**（`Receipt.tsx`、`receipt-draw.ts`、`receipt.css`）：第二版按 Morii 给的参考小票复刻内容；420px 宽，JetBrains Mono（新依赖 `@fontsource-variable/jetbrains-mono` 5.3.0，OFL，已登记到 `THIRD_PARTY_NOTICES.md`），字重分层；客户端和模型图标用 Canvas 画；连续送纸加细微震动；拉扯是弹簧、撕下后跟手、松手按速度和重力甩出；撕下后弹出保存面板（费用 / Token、11 级灰阶底色、保存或复制 PNG）。减少动画下只淡入淡出。
- **旧手动账本**（#43）：服务端代码、`/api/usage/*`、数据表、迁移、测试都保留；它的前端页面、`usage-format.ts` 及测试、浏览器脚本 `apps/server/test/usage-ui.ts`、不再使用的 `usage.*` 文案已移除。说明写在 `docs/operations/usage-ledger.md` 开头。
- 规范与记录：`DESIGN.md` 第 3、6、7、8、11 节；`docs/design-decisions.md` 2026-10-25「算力账本改用 tokens.ci」与 2026-10-26「每日账单第二版」。

## 未完成与待定

- **Morii 的产品验收**：灰阶尺整体、动效、算力账本与账单都还没有在真实浏览器里验收。
- **PR #44**：等 CI 与 Morii 验收后再合并；合并方式照 #41（普通合并、锁定已通过 CI 的提交）。
- **正式本机实例**：`main` 已经是新前端，但正式实例要 Morii 用 `main` 重新 `pnpm build` 后才会换上；#44 合并前，正式实例的算力账本仍是旧的手动导入页。
- **数据源风险**：`tokens.ci/api/users/<name>` 是 tokens.ci 文档里提到、第三方客户端在用的公开接口，但没有正式版本承诺；字段变了时 `normalizeProfile` 返回 `invalid_response`，页面会显示错误并保留上次缓存。
- **已知问题**：页面加载后焦点还在 body 时，第一次按 Tab 进正文而不是「跳到正文」（旧版同样）；`docs/status/` 快照没有更新到这些分支的进展。
- **图标**是示意画法，不是官方标志文件。

## 本机才有的工具（`.design/`，被 git 忽略）

只有在 Claude 的工作目录里才有，新 clone 里没有：

- `node .design/tools/fixture-server.mjs`：用临时数据目录（系统临时目录下的 `moriium-dashboard-design-fixtures`，里面是从各项目仓库读来的真实快照）在 5181 启动服务端；**从不碰正式库**。
- `node .design/tools/web-dev.mjs`：Vite 5173，代理到 5181。
- `node .design/tools/receipt-check.mjs [--width 390] [--dark] [--reduce]`：走完账单全流程并截图、下载 PNG。
- `node .design/tools/motion-check.mjs`、`node .design/tools/jitter-check.mjs`：动效采样、逐帧换页记录（在 Git Bash 里传 `/usage` 这类参数要加 `MSYS_NO_PATHCONV=1`）。
- `node tools/shot.mjs --out DIR --widths 1440,820,390 [--locale ja-JP] [--dark] name=url`：截图与指标（在仓库里，所有人都有）。

截图里是真实项目数据，按约定不进仓库、不放进公开 PR。

## 验证命令

```text
pnpm verify
pnpm build
```

最近一次（2026-10-26，账单第二版）：`feat/usage-tokens-ci` 上 `pnpm verify` 通过（484 项测试、Biome 无错误、类型检查、公开树审计），`pnpm build` 通过。

## 约束（照旧）

不合并 PR、不开 auto-merge；PR 基准总是 `main`；不 rebase、不 force push；不读不复制正式数据目录；真实数据、截图、令牌不进仓库。
