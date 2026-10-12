import '../styles/fonts.ts';
import '../styles/tokens.css';
import '../styles/base.css';
import './specimen.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../i18n/i18n.tsx';
import { Specimen } from './Specimen.tsx';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <Specimen />
      </I18nProvider>
    </StrictMode>,
  );
}
