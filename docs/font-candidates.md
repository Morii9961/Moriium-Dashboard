# 字体候选（草稿）

状态：参考资料，不是规范。范围是中、日、英三语。这里只提供选型依据和两套完整方案，具体项目的选择记进 `docs/design-decisions.md`。

## 一、依据与边界

**核实过的**（2026-10-11，Fontsource 接口）：下文每个标了「OFL」的字体，授权、字重、是否为可变字体都是查过的。
**读过的文章**：
- [Typotheque：CJK 排版原则](https://www.typotheque.com/articles/typesetting-cjk-text)
- [Snook：CJK 字体栈笔记](https://snook.ca/archives/html_and_css/cjk-font-stack-notes)
- [霞鹜字体项目列表](https://lxgw.github.io/open-source/)、[LxgwNeoXiHei 仓库](https://github.com/lxgw/LxgwNeoXiHei)

**没做到的**：
- 推文的[上册](https://x.com/AdrianPunk115/status/2095455845823971411)（20 个杂志类字体）和[下册](https://x.com/AdrianPunk115/status/2095791816750596304)（另 20 个：极简无衬线、窄体工业、手写、签名）都已读完。两册的用途是写 AI 生图提示词，不是网页字体评测。下册末尾的「8 种情绪」分类是图片，文字抓取读不到。下册的字体与免费替代的对应关系已合并进 `DESIGN.md` 第 3.4 节。
- 中文、日文方面没搜到有分量的 2026 年网页字体评测。日文资料零散，多为 Google Fonts 清单；中文多为 2019 到 2023 年的字体合集。所以选型依据主要是上面核实过的元数据加通用排版知识，**没有做过实际渲染对比**。

## 二、推文上册：哪些能用在产品界面里

上册大部分是杂志、时装类的展示字体，气质强，不适合高密度界面。可用的是少数，且多数需要换成免费的近似字体：

| 推文里的字体 | 气质 | 能不能直接用 | 免费替代（OFL，已核实） |
| --- | --- | --- | --- |
| Helvetica Neue、Neue Haas Grotesk | 瑞士风中性无衬线 | 商业字体，授权未核实，不直接用 | Inter、Geist、Instrument Sans |
| Futura | 几何无衬线 | 同上 | Jost |
| Tiempos | 报刊衬线 | 同上 | Source Serif 4、Newsreader |
| Caslon、Garamond | 古典书籍衬线 | 通用名，可用 | Libre Caslon Text、EB Garamond |
| Didot、Bodoni、Playfair Display | 高反差时装衬线 | Playfair 本身是 OFL | Bodoni Moda、Playfair Display |
| Instrument Serif | 现代展示衬线 | 可用（OFL，仅 400 一个字重） | 就是它 |
| Cormorant Garamond | 文学感古典衬线 | 可用（OFL，300 到 700） | 就是它，笔画细，只适合大字 |
| Fraunces | 软衬线，有表情 | 可用（OFL，可变字体） | 就是它，和极简风不搭 |
| PP Editorial New、Canela、GT Super、Lyon Display、Recoleta | 展示衬线 | 商业字体，不用 | 无需替代 |

高反差衬线（Didot、Bodoni、Cormorant）发丝很细，放在中日文旁边会显得单薄，只适合做大号数字或标题，不要做正文。

## 三、三语排版的硬规则（所有方案共用）

1. **按语言切换字体栈。** 汉字在中日两种语言里字形不同，字体栈要用 `:lang(zh-Hans)`、`:lang(ja)` 分开写，页面和内容块都要有正确的 `lang`。没写 `lang`，日文可能会用中文字体显示。
2. **Latin 放前面，CJK 放后面。** 大部分 Latin 字体没有汉字，大部分 CJK 字体都带 Latin（Snook 的做法）。想要英文有个性，就把专用的 Latin 字体写在最前面。
3. **同字号下 Latin 会显得偏小。** CJK 字符铺满方格，Latin 是比例字形（Typotheque）。混排要实际看效果，必要时用 `size-adjust` 调整 Latin 字体。
4. **日文字体自带的欧文不一定好看。** 欧文占比高的标题，另指定一个欧文字体更稳。
5. **CJK 长文行距约 1.7**（Typotheque）。表格和紧凑组件可以更紧，需要实际测试。
6. **标点位置有地区差异。** 大陆和日本把标点放在方格角落，台湾和香港居中。繁体界面要单独处理。
7. **数字用等宽数字。** 表格和指标卡里设 `font-variant-numeric: tabular-nums`，选的字体要支持。
8. **体积。** 中日文字体文件很大（日文资料也明确提到这一点）。用 Fontsource 这类本地打包方式，只加载用到的字重，并实际量一下首屏加载的字体体积。

## 四、方案 A：编辑路线（衬线加无衬线）

衬线标题加无衬线界面，适合报告页、品牌入口页这类「要读」的区域。

| 角色 | 英文 | 中文 | 日文 |
| --- | --- | --- | --- |
| 标题、长文 | Source Serif 4 或 Newsreader | Noto Serif SC | Noto Serif JP，标题可用 Shippori Mincho |
| 界面、正文 | IBM Plex Sans | Noto Sans SC | Noto Sans JP 或 IBM Plex Sans JP |
| 数据、元信息 | IBM Plex Mono | Noto Sans SC | Noto Sans JP |
| 点缀（引语、空状态文案） | Instrument Serif | 霞鹜文楷 Screen | Klee One |

- 霞鹜文楷衍生自 Klee One（日本教科书字体），两者的假名和 Latin 同源，搭配起来天然统一。网页字体可以用 npm 包 `lxgw-wenkai-screen-webfont`。
- IBM Plex Sans 加 IBM Plex Sans JP 是同一设计体系，Latin 和日文容易对齐。IBM Plex 没有简体中文版，中文用 Noto Sans SC。

## 五、方案 B：新方向（极简无衬线）

更适合高密度界面，也和 `lieflat-charts`（用 Inter）和 `hairline` 的极简线条风格一致。

| 角色 | 英文 | 中文 | 日文 |
| --- | --- | --- | --- |
| 界面、正文 | Inter（可变） | Noto Sans SC（可变，100 到 900） | Noto Sans JP（可变，100 到 900） |
| 标题 | Inter | Noto Sans SC | Zen Kaku Gothic New（300/400/500/700/900） |
| 小字号表格 | Inter | Noto Sans SC | BIZ UDPGothic（仅 400/700，UD 设计，笔画对比清晰） |
| 数据、代码 | Geist Mono 或 JetBrains Mono（可变） | 同界面 | 同界面 |
| 大号数字（可选） | Instrument Serif | — | — |

- 中日文都用 Noto 的可变字体，字重范围宽，细字重可以配合极简风格。
- 日文标题换成 Zen Kaku Gothic New 能让日文更精致，但它是静态字重，要多加载几个文件。
- 「大号数字用 Instrument Serif」是一个可选的点缀：整个界面是无衬线，只有 KPI 大数字用衬线，会有一个清楚的招牌时刻。

## 六、我的倾向

**数据密集的工作区和数据区用方案 B，方案 A 只用在编辑气质的区域**（报告页、品牌入口、引语）。两套的 Noto 底座是同一族，混用不会有断层。如果你想让整个产品更有个性，改用方案 A 作主体也可以，但表格和数据密集区会受影响。

## 七、候选池（供替换）

### 中文
| 字体 | 授权 | 说明 |
| --- | --- | --- |
| Noto Sans SC / Noto Serif SC | OFL，可变字体 | 稳妥的默认，Fontsource 提供 |
| 霞鹜文楷、霞鹜文楷 Screen | OFL | 楷体，适合点缀，不适合密集界面 |
| ZCOOL 小薇 / 快乐 / 庆科黄油，马善政 | OFL，仅一个字重 | 展示字体，只用在大标题 |
| 霞鹜新晰黑（LXGW Neo XiHei） | **IPA Font License 1.0**，只有一个字重 | 官方提示嵌入前要自行评估合规成本，不推荐 |
| MiSans | 免费商用；官方 FAQ 称网页嵌入可以，**需注明使用了 MiSans** | 不在 Fontsource，要自行托管 |
| 阿里巴巴普惠体 2.0 | 免费商用；**禁止再分发字体文件** | 把字体文件放进仓库有风险，不推荐自托管 |
| HarmonyOS Sans | 称可免费商用，**许可协议原文我没取到** | 网页嵌入条款待核实 |

### 日文
| 字体 | 授权 | 说明 |
| --- | --- | --- |
| Noto Sans JP / Noto Serif JP | OFL，可变字体 | 稳妥的默认 |
| Zen Kaku Gothic New | OFL，300/400/500/700/900 | 精致，适合标题 |
| BIZ UDPGothic / BIZ UDPMincho | OFL，仅 400/700 | UD 设计，小字号清晰 |
| IBM Plex Sans JP | OFL，100 到 700 | 配 IBM Plex 用 |
| Shippori Mincho / Zen Old Mincho | OFL | 明朝体，前者适合正文，后者更适合标题 |
| LINE Seed JP | OFL，100/400/700/800 | 偏几何，有品牌感 |
| M PLUS 2 / Murecho | OFL，可变字体 | 可选的现代无衬线 |
| Klee One | OFL，400/600 | 手写感，配霞鹜文楷 |

## 八、CSS 骨架示意（方案 B）

```css
:root {
  --font-ui: "Inter Variable", "Noto Sans SC Variable", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-data: "Geist Mono", ui-monospace, monospace;
}
:lang(ja) {
  --font-ui: "Inter Variable", "Noto Sans JP Variable", "Hiragino Sans", "Yu Gothic", sans-serif;
}
body { font-family: var(--font-ui); font-variant-numeric: tabular-nums; }
```

Fontsource 的包名：`@fontsource-variable/inter`、`@fontsource-variable/noto-sans-sc`、`@fontsource-variable/noto-sans-jp`；静态字重用 `@fontsource/zen-kaku-gothic-new`、`@fontsource/biz-udpgothic` 这种形式。

## 九、下一步建议

1. 你补上推文下册的链接（或截图），我把里面的手写体和选择指南补进来。
2. 用项目的真实内容（一张表格、一组指标卡、一段中日英混排）做一页字体对比页，两套方案并排，放进浏览器里实际看。
3. 定下前端技术栈，再决定字体怎么加载。
