# 第三方声明

Moriium Dashboard 的代码使用 MIT 许可（见 `LICENSE`）。下面这些第三方资源随构建产物一起分发，各自遵循自己的许可。字体文件不在本仓库里，由 npm 包在构建时打包。

## 字体

| 字体 | 用途 | 来源（npm 包） | 许可 |
| --- | --- | --- | --- |
| IBM Plex Sans | 拉丁字母界面 | `@fontsource-variable/ibm-plex-sans` | SIL Open Font License 1.1 |
| IBM Plex Mono | 编号、SHA、时间 | `@fontsource/ibm-plex-mono` | SIL Open Font License 1.1 |
| Source Serif 4 | 拉丁字母标题 | `@fontsource-variable/source-serif-4` | SIL Open Font License 1.1 |
| MiSans | 中文界面 | `misans`（打包脚本 Apache-2.0） | MiSans 字体知识产权许可协议（小米） |
| 霞鹜文楷 GB Screen（LXGW WenKai Screen） | 中文标题 | `lxgw-wenkai-screen-webfont`（打包 MIT） | SIL Open Font License 1.1 |
| Murecho | 日文界面 | `@fontsource-variable/murecho` | SIL Open Font License 1.1 |
| Klee One | 日文标题 | `@fontsource/klee-one` | SIL Open Font License 1.1 |

**本产品使用了 MiSans 字体。** MiSans 由小米公司提供，可以免费商用，可以嵌入网页使用，但不能单独再分发字体文件，使用时需注明使用了 MiSans。完整条款以小米官方发布的《MiSans 字体知识产权许可协议》为准。

## 代码库

运行时依赖的许可见各自的 npm 包，主要有：React、React DOM（MIT），Hono、@hono/node-server（MIT），Ajv（MIT），intl-messageformat（BSD-3-Clause）。
