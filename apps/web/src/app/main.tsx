import '../styles/fonts.ts';
import '../styles/tokens.css';
import '../styles/base.css';
import '../components/components.css';
import './app.css';
import './projects.css';
import './personal.css';
import './zone.css';
import './motion.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../i18n/i18n.tsx';
import { App } from './App.tsx';
import { AuthGate } from './auth.tsx';
import { CommandProvider } from './Commands.tsx';
import { DataProvider } from './data.tsx';
import { ImportProvider } from './ImportDialog.tsx';
import { ServiceProvider } from './service.tsx';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <AuthGate>
          <ServiceProvider>
            <DataProvider>
              <ImportProvider>
                <CommandProvider>
                  <App />
                </CommandProvider>
              </ImportProvider>
            </DataProvider>
          </ServiceProvider>
        </AuthGate>
      </I18nProvider>
    </StrictMode>,
  );
}
