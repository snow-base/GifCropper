/*
 * GitHub Pages cross-origin isolation helper.
 * Purpose: enable SharedArrayBuffer/WebAssembly threads where custom HTTP
 * COOP/COEP headers cannot be configured directly.
 */
(() => {
  const isServiceWorker = typeof window === 'undefined';

  if (isServiceWorker) {
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener('fetch', (event) => {
      const request = event.request;

      // Chromium can issue this special cache request for module scripts.
      if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

      event.respondWith((async () => {
        try {
          const response = await fetch(request);

          // Opaque responses cannot be safely rebuilt with custom headers.
          if (!response || response.status === 0) return response;

          const headers = new Headers(response.headers);
          headers.set('Cross-Origin-Opener-Policy', 'same-origin');
          headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
          headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        } catch (error) {
          console.error('[COI] fetch failed:', error);
          return Response.error();
        }
      })());
    });

    return;
  }

  const reloadKey = 'videoGifCoiReloaded';

  // A real server may already provide COOP/COEP. In that case nothing else is needed.
  if (window.crossOriginIsolated) {
    sessionStorage.removeItem(reloadKey);
    return;
  }

  if (!window.isSecureContext) {
    console.warn('[COI] HTTPS (or localhost) is required for Service Workers.');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.warn('[COI] This browser does not support Service Workers.');
    return;
  }

  const swURL = document.currentScript?.src;
  if (!swURL) {
    console.error('[COI] Could not determine coi-serviceworker.js URL.');
    return;
  }

  navigator.serviceWorker.register(swURL).then(async (registration) => {
    await navigator.serviceWorker.ready;

    // On the first visit the current document is not yet controlled by the new SW.
    if (!navigator.serviceWorker.controller && sessionStorage.getItem(reloadKey) !== '1') {
      sessionStorage.setItem(reloadKey, '1');
      location.reload();
      return;
    }

    // If a controller exists, allow a single refresh to pick up a newly updated SW.
    if (navigator.serviceWorker.controller && !window.crossOriginIsolated && sessionStorage.getItem(reloadKey) !== '2') {
      sessionStorage.setItem(reloadKey, '2');
      location.reload();
      return;
    }

    // Clear the guard after a successful isolated load so future SW updates can reload once.
    if (window.crossOriginIsolated) sessionStorage.removeItem(reloadKey);
  }).catch((error) => {
    console.error('[COI] Service Worker registration failed:', error);
  });
})();
