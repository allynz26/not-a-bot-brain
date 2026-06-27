// Minimal service worker: enables "Add to Home Screen" / installability.
// Network pass-through — intentionally NO caching, so the app is never stale.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* let the network handle it */ });
