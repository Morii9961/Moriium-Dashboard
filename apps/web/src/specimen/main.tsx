import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-sans-jp';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-sans-jp/400.css';
import '@fontsource/ibm-plex-sans-jp/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource-variable/source-serif-4';
import '@fontsource-variable/noto-serif-sc';
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
