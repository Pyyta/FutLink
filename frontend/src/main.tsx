import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento #root');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The native shell already ships its web assets locally. A second service
// worker adds no value there and can interfere with native plugin injection.
if (!Capacitor.isNativePlatform()) {
  registerSW({ immediate: true });
}
