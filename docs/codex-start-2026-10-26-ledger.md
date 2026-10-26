# Codex 启动提示词 · 2026-10-26

把下面整段复制给 Codex。

```text
你接手 Moriium Dashboard（仓库 Morii9961/Moriium-Dashboard）的前端重设计与算力账本工作。Claude 因周额度用完停下，交接在 docs/handoff-2026-10-26-claude-redesign-ledger.md。

先做：
1. 读 AGENTS.md、DESIGN.md（灰阶尺规范，重点第 3、6、7、8、11 节）、上面的交接文档，以及 docs/design-decisions.md 最上面几条（2026-10-25、2026-10-26）。
2. 核对实际状态，不要只信文档：git fetch；看 origin/main 与 origin/feat/usage-tokens-ci 的最新提交；gh pr view 44 的状态、CI 与可合并性。
3. 在你自己的工作区里检出 feat/usage-tokens-ci（已包含 #41 合并后的 main），pnpm install，然后 pnpm verify 和 pnpm build，确认基线是绿的。

当前进度：PR #41（灰阶尺、全站动效、换页抽搐修复、Agents 把未注明并入 Codex）已于 2026-10-26 合并进 main（b11d765）。PR #44（feat/usage-tokens-ci）开放：算力账本改为从 tokens.ci 自动读取（服务端代理 /api/tokens-ci），并做了可打印、可撕下、可保存图片的每日账单。旧的手动导入账本只保留了服务端。

接下来做什么，以 Morii 当下的指令为准。没有新指令时：只汇报核对结果（#44 的 CI 与可合并状态），并问 Morii 算力账本和每日账单有没有要改的地方。#44 的 CI 若失败就修，修完推到 feat/usage-tokens-ci；不要自行合并。

约束：不合并任何 PR、不开 auto-merge；PR 基准总是 main；不 rebase、不 force push；不读不复制正式数据目录，预览用临时数据；真实数据、截图、令牌不进仓库；视觉改动按 DESIGN.md，新的具体决定写进 docs/design-decisions.md；改动后按影响范围截图自检（tools/shot.mjs），三语与 1440 / 820 / 390 宽度。
```
