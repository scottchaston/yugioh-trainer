import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

// Installable web app: the service worker caches the app shell so the page opens instantly (and offline for
// hot-seat play) once it has been visited. Only in production builds served over http(s); never for the
// single-file build opened from disk.
if (import.meta.env.PROD && 'serviceWorker' in navigator && /^https?:/.test(window.location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline caching is optional */
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
