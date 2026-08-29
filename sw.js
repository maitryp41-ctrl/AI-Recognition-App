// Minimal service worker. Its only job here is to exist — Chrome/Edge/Android
// require an active service worker before they'll show the "Install app"
// prompt. It doesn't cache anything or change how your app talks to the
// Flask backend; every request still goes straight to the network as normal.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Pass-through: just let the request go to the network normally.
  event.respondWith(fetch(event.request));
});
