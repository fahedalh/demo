import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureApi, initI18n, initTheme } from '@masar/ui';
import { adminStrings } from './i18n';
import { App } from './App';
import './index.css';

configureApi('admin');
initI18n(adminStrings);
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
