// 方案 A（已定）：IBM Plex Sans、Source Serif 4、IBM Plex Mono。
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/source-serif-4';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
// 中文候选：MiSans（正文，可变字体）+ 霞鹜文楷 GB Screen（标题）；思源作第一轮对照。
import 'misans/lib/Normal/MiSansVF.min.css';
import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-serif-sc';
// 日文候选：Zen Kaku Gothic New + Shippori Mincho；LINE Seed JP + Klee One；IBM Plex Sans JP 作对照。
import '@fontsource/zen-kaku-gothic-new/400.css';
import '@fontsource/zen-kaku-gothic-new/500.css';
import '@fontsource/zen-kaku-gothic-new/700.css';
import '@fontsource/shippori-mincho/500.css';
import '@fontsource/shippori-mincho/600.css';
import '@fontsource/line-seed-jp/400.css';
import '@fontsource/line-seed-jp/700.css';
import '@fontsource/klee-one/400.css';
import '@fontsource/klee-one/600.css';
import '@fontsource-variable/noto-sans-jp';
import '@fontsource/ibm-plex-sans-jp/400.css';
import '@fontsource/ibm-plex-sans-jp/600.css';
import './specimen.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Specimen } from './Specimen.tsx';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Specimen />
    </StrictMode>,
  );
}
