import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureApi, initI18n, initTheme, registerServiceWorker } from '@masar/ui';
import { passengerStrings } from './i18n';
import { App } from './App';
import './index.css';

configureApi('passenger');
initI18n(passengerStrings);
initTheme();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
