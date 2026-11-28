import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { I18nProvider } from './core/i18n/I18nContext.tsx';
import './index.css';
import { registriereCoreSharedRuntime } from './plugins/sharedRuntime.ts';

registriereCoreSharedRuntime();

createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
