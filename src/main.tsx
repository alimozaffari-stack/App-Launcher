import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (window.appLauncherDesktop) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((registration) => registration.unregister()))
        .catch((error) => console.warn('Service worker cleanup failed:', error));
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .catch((error) => console.warn('Service worker registration failed:', error));
  });
}
