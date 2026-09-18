import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Handle PWA service worker with anti-reload loop safeguards
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // In dev mode, unregister leftover service workers to prevent cache/reload loops
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    });
  } else {
    // In production, register with passive reload control
    const updateSW = registerSW({
      immediate: false,
      onNeedRefresh() {
        // Prevent aggressive reload cycles: max once per 60s
        try {
          const now = Date.now();
          const lastReload = parseInt(sessionStorage.getItem('btn_sw_last_reload') || '0', 10);
          if (now - lastReload > 60000) {
            sessionStorage.setItem('btn_sw_last_reload', now.toString());
            updateSW(true);
          }
        } catch {
          updateSW(true);
        }
      },
      onRegistered(r) {
        if (r) {
          // Check for SW updates periodically every 60 minutes
          setInterval(() => {
            r.update().catch(() => {});
          }, 60 * 60 * 1000);
        }
      },
      onRegisterError(error) {
        console.warn('PWA registration warning:', error);
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
