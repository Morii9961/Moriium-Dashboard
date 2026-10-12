/**
 * 字体全部本地打包（npm 包里的 woff2，由 Vite 输出到构建产物），运行时不请求任何外部地址。
 * 中日文字体按 unicode-range 分片，浏览器只下载页面用到的字。许可见仓库根目录 THIRD_PARTY_NOTICES.md。
 *
 * 拉丁字母（方案 A）：IBM Plex Sans 正文、Source Serif 4 标题、IBM Plex Mono 数据。
 * 中文：MiSans（可变字体）正文、霞鹜文楷 GB Screen 标题。
 * 日文：Murecho（可变字体）正文、Klee One 标题（霞鹜文楷由它衍生）。
 */
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/source-serif-4';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import 'misans/lib/Normal/MiSansVF.min.css';
import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css';
import '@fontsource-variable/murecho';
import '@fontsource/klee-one/400.css';
import '@fontsource/klee-one/600.css';
