import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureApi, initI18n, initTheme, registerServiceWorker } from '@masar/ui';
import { driverStrings } from './i18n';
import { App } from './App';
import './index.css';

configureApi('driver');
initI18n(driverStrings);
initTheme();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
