# 界面文案约定

适用于 Dashboard 的全部界面文案（`apps/web/src/i18n/messages/`）。规划依据见 `docs/planning/02-information-architecture-ux.md` 第 15 节，2026-10-12 的决定见 `docs/design-decisions.md`。

## 共同规则

- 界面源语言是简体中文，另有日文、英文。每条文案是一整句 ICU 消息，按句翻译，不在代码里拼接句子片段。
- 快照内容不翻译。快照里的标题、摘要等文字块一律标 `lang="zh-Hans"`，日文界面里也按中文字形显示。
- 说清事实，不催促，不庆祝。不用感叹号，不写「太棒了」「赶快」这类话。
- 错误信息先说发生了什么，再说可以怎么做。不道歉，不含糊。
- 同一个动作在整个流程里用同一个名字：按钮叫「导入」，结果就说「已导入」。
- 计数和状态用客观的词：「待确认」而不是「等你」，「报告已 16 天」而不是「好久没更新」。
- 数字、日期、相对时间用 `Intl` 按界面语言格式化，不手写格式。

## 中文

- 中文与英文、数字之间加一个半角空格：「还差 3 个里程碑」「Agent 估算」「main @ fd48f88」。ICU 参数两边同样留空格：「展开 {name} 的详情」。测试会检查这一条。
- 全角标点后面不加空格：「（据分支推断）· 2 个阻塞」。
- 用「你」，不用「您」。

## 日本語

- 文は敬体（です・ます）で書きます。見出し、ラベル、ボタンは体言止めでかまいません。テストは「。」で終わる文が敬体かどうかを確認します。
- 数字と漢字・かなの間には半角スペースを入れます（中国語の表記とそろえるため）。例：「報告から 16 日」。
- カタカナ語は一般的な表記を使います（スナップショット、マイルストーン）。

## English

- Sentence case for headings, labels and buttons.
- Plain verbs, active voice. Say exactly what a control does.
- Use ICU plural forms for every count: `{n, plural, one {# milestone} other {# milestones}}`.
- No exclamation marks (checked by a test).

## 新增文案的步骤

1. 在 `zh-Hans.ts` 加键和中文原文。
2. 在 `ja.ts`、`en.ts` 加同一个键，参数名保持一致。
3. 运行 `pnpm test`：会检查三份文案的键和参数一致、每条都能解析、中文空格、日文敬体、英文没有感叹号。
4. 在 375px 宽度下看三种语言的长度和换行。
