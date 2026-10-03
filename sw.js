// Service worker: precaches the whole game so it works offline once installed.
// IMPORTANT: bump VERSION (same as VERSION in src/main.js) at every release, and
// list every new file in ASSETS. tests/pwa.test.mjs checks both.

const VERSION = '1.0.0';
const CACHE = 'frotefrote-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './src/main.js',
  './src/data/catalog.js',
  './src/data/meta.js',
  './src/data/upgrades.js',
  './src/data/levels/index.js',
  './src/data/levels/01-snack.js',
  './src/data/levels/02-cafe.js',
  './src/data/levels/03-pizzeria.js',
  './src/data/levels/04-sushi.js',
  './src/data/levels/05-diner.js',
  './src/data/levels/06-creperie.js',
  './src/data/levels/07-foodcourt.js',
  './src/data/levels/08-palace.js',
  './src/engine/audio.js',
  './src/engine/input.js',
  './src/engine/particles.js',
  './src/engine/storage.js',
  './src/game/agents.js',
  './src/game/dirt.js',
  './src/game/economy.js',
  './src/game/entities.js',
  './src/game/game.js',
  './src/game/level.js',
  './src/game/quests.js',
  './src/game/save.js',
  './src/render/draw.js',
  './src/render/renderer.js',
  './src/ui/ui.js',
  './src/util/math.js',
  './src/util/path.js',
  './src/util/rng.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('frotefrote-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Cache first (the game is fully static), falling back to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
