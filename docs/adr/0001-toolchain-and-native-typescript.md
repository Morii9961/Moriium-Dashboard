# 0001 · 工具链版本；Node 直接运行 TypeScript

- 日期：2026-10-12
- 状态：采用
- 范围：P1.2 起的整个仓库

## 背景

规划 05 第 4 节定了技术栈，版本留到实施时核实。服务端和命令行工具（`status:check`）都要跑 TypeScript，有三种做法：先编译再运行、用 tsx 之类的加载器、用 Node 自带的类型擦除。

## 决定

1. **版本**（2026-10-12 从 npm registry 核实，`packageManager` 和 `.node-version` 锁定）：

   | 工具 | 版本 | 备注 |
   | --- | --- | --- |
   | Node.js | 24（本机 24.15，LTS） | `engines` 限定 `>=24.11 <25` |
   | pnpm | 10.33.0 | |
   | TypeScript | 7.0.2 | 原生编译器那一代，只用来做类型检查（`noEmit`） |
   | Biome | 2.5.15 | 格式化与检查 |
   | Vitest | 5.0.3 | 要求 Node `^22.12 \|\| ^24` |

2. **Node 直接运行 `.ts`**：服务端、命令行工具和仓库脚本用 Node 24 自带的类型擦除运行，不编译、不引入 tsx。前端仍由 Vite 处理。

3. **为此的 TypeScript 约束**（`tsconfig.base.json`）：
   - `erasableSyntaxOnly`：禁止 enum、namespace、参数属性这类需要生成代码的语法。
   - `allowImportingTsExtensions` + `verbatimModuleSyntax`：相对导入写 `.ts` 后缀，类型导入写 `import type`。
   - `module: nodenext`，JSON 用 `with { type: 'json' }` 导入。
   - 严格模式之外再开 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`：协议数据里大量可选字段和数组下标，这两项能在编译期拦住「把缺失当成有值」。

4. **工作区包直接导出源码**：`packages/protocol` 的 `exports` 指向 `src/index.ts`，不产出 `dist`。

## 理由

- 少一个构建步骤，少一个依赖；本机和以后 VPS 上的运行方式一样。
- 实测（Node 24.15）：`process.features.typescript` 为 `strip`；通过 pnpm 工作区链接引用的 `.ts` 包能直接运行（Node 按真实路径判断，不算 `node_modules` 里的文件）；没有实验性警告。
- TypeScript 7 实测能报出上面几项严格选项的错误，`erasableSyntaxOnly` 会拦下 enum。

## 后果

- 不能用 enum，枚举用 `as const` 数组加联合类型（协议的枚举本来就以 Schema 为准）。
- 类型检查只靠 `pnpm typecheck` 和 CI，运行时不检查类型。
- 如果以后要把 `packages/protocol` 发布给其他仓库用，需要另加构建产物；目前只在本仓库内用，不需要。
- `node:sqlite` 的取舍不在这份 ADR，P2.4 单独记录。
