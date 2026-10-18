/**
 * 字体全部本地打包（npm 包里的 woff2，由 Vite 输出到构建产物），运行时不请求任何外部地址。
 * 中日文字体按 unicode-range 分片，浏览器只下载页面用到的字。许可见仓库根目录 THIRD_PARTY_NOTICES.md。
 *
 * 灰阶尺（DESIGN.md 第 3 节）：拉丁只用 Archivo（可变字体，字重 + 宽度两轴）；
 * 中文 Noto Sans SC、日文 Noto Sans JP（都是可变字重，一组文件覆盖 300–500）。
 */
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-sans-jp';
