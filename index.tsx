import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  const appScope = new URL(import.meta.env.BASE_URL, document.baseURI);
  const workerUrl = new URL('service-worker.js', appScope);
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(workerUrl.href, { scope: appScope.href })
        .then((registration) => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        })
        .catch((err) => {
          console.log('ServiceWorker registration failed: ', err);
        });
    });
  } else {
    void navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations
        .filter(registration => registration.scope === appScope.href &&
          [registration.active, registration.waiting, registration.installing]
            .some(worker => worker?.scriptURL === workerUrl.href))
        .map(registration => registration.unregister())))
      .catch(err => console.warn('ServiceWorker development cleanup failed:', err));
  }
}
