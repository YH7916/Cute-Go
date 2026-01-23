// PWA Service Worker Registration

let registration: ServiceWorkerRegistration | null = null;

export function registerServiceWorker(options?: {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegistered?: (registration: ServiceWorkerRegistration) => void;
}) {
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service workers not supported');
    return;
  }

  // Only register in production (sw.js is only generated in production builds)
  if (import.meta.env.DEV) {
    console.log('[PWA] Skipping service worker registration in development');
    return;
  }

  const basePath = import.meta.env.VITE_ASSET_PREFIX || '/';

  navigator.serviceWorker
    .register(`${basePath}sw.js`)
    .then(reg => {
      registration = reg;
      console.log('[PWA] Service worker registered');
      options?.onRegistered?.(reg);

      // Check for updates periodically
      setInterval(
        () => {
          reg.update();
        },
        60 * 60 * 1000
      ); // Check every hour

      // When a new service worker is installed and waiting
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New version available');
              options?.onNeedRefresh?.();
            } else if (newWorker.state === 'activated' && !navigator.serviceWorker.controller) {
              console.log('[PWA] Content cached for offline use');
              options?.onOfflineReady?.();
            }
          });
        }
      });
    })
    .catch(error => {
      console.error('[PWA] Service worker registration failed:', error);
    });

  // Note: We don't auto-reload on controllerchange because it conflicts with
  // coi-serviceworker which also triggers reloads for CORS isolation.
  // The user will be prompted to refresh when a new version is available.
}

export function skipWaiting() {
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}
