/**
 * 字体全部本地打包（npm 包里的 woff2，由 Vite 输出到构建产物），运行时不请求任何外部地址。
 * 中日文字体按 unicode-range 分片，浏览器只下载页面用到的字。许可见仓库根目录 THIRD_PARTY_NOTICES.md。
 *
 * 灰阶尺（DESIGN.md 第 3 节）：拉丁只用 Archivo（可变字体，字重 + 宽度两轴）；
 * 中文 Noto Sans SC 只打包 300（展示）与 400（正文）两档静态字重：可变字体的首屏分片实测 817–869KB，
 * 两档静态 543–705KB（2026-10-18，DESIGN.md 第 3 节）。中文强调靠墨色和字号，不用 500。
 * 日文 Noto Sans JP 用可变字体，只在 :lang(ja) 下加载。
 */
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/noto-sans-sc/300.css';
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource-variable/noto-sans-jp';
