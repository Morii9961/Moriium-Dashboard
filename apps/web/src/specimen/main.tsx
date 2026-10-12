// 方案 A（已定）：IBM Plex Sans、Source Serif 4、IBM Plex Mono。
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/source-serif-4';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
// 中文（已定）：MiSans（正文，可变字体）+ 霞鹜文楷 GB Screen（标题）。
import 'misans/lib/Normal/MiSansVF.min.css';
import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css';
// 日文候选：M PLUS 2 或 Murecho（正文）+ Klee One（标题，霞鹜文楷由它衍生）。
import '@fontsource-variable/m-plus-2';
import '@fontsource-variable/murecho';
import '@fontsource/klee-one/400.css';
import '@fontsource/klee-one/600.css';
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
