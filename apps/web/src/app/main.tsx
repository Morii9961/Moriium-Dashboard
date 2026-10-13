import '../styles/fonts.ts';
import '../styles/tokens.css';
import '../styles/base.css';
import '../components/components.css';
import './app.css';
import './projects.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../i18n/i18n.tsx';
import { App } from './App.tsx';
import { DataProvider } from './data.tsx';
import { ImportProvider } from './ImportDialog.tsx';
import { ServiceProvider } from './service.tsx';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <ServiceProvider>
          <DataProvider>
            <ImportProvider>
              <App />
            </ImportProvider>
          </DataProvider>
        </ServiceProvider>
      </I18nProvider>
    </StrictMode>,
  );
}
