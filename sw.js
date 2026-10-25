// Service Worker: speichert die ganze App beim ersten Besuch, danach läuft sie ohne Netz.
// Der Block zwischen den Marken wird von tools/precache.mjs erzeugt (node tools/precache.mjs).

// >>> precache
const VERSION = '4e1146205f';
const ASSETS = [
  './',
  './assets/css/app.css',
  './assets/css/fonts.css',
  './assets/css/print.css',
  './assets/css/sheet.css',
  './assets/fonts/comic-neue-latin-400-italic.woff2',
  './assets/fonts/comic-neue-latin-400-normal.woff2',
  './assets/fonts/comic-neue-latin-700-italic.woff2',
  './assets/fonts/comic-neue-latin-700-normal.woff2',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/icon.svg',
  './index.html',
  './manifest.webmanifest',
  './src/app.js',
  './src/backup-ui.js',
  './src/backup.js',
  './src/diagnose.js',
  './src/editor.js',
  './src/export-pdf.js',
  './src/fit.js',
  './src/formats.js',
  './src/formula.js',
  './src/history.js',
  './src/images.js',
  './src/library.js',
  './src/main.js',
  './src/markup.js',
  './src/model.js',
  './src/sheet.js',
  './src/store.js',
  './src/text-tools.js',
  './src/ui.js',
  './vendor/html2canvas/html2canvas.min.js',
  './vendor/jspdf/jspdf.umd.min.js',
  './vendor/katex/contrib/auto-render.min.js',
  './vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  './vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  './vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Main-Bold.woff2',
  './vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  './vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  './vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  './vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  './vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  './vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2',
  './vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Script-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size4-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2',
  './vendor/katex/katex.min.css',
  './vendor/katex/katex.min.js',
  './vendor/mathlive/mathlive.min.mjs',
];
// <<< precache

const CACHE_PREFIX = 'starteraufgaben-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data === 'STATUS' && event.ports[0]) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = (await cache.keys()).length;
        event.ports[0].postMessage({ version: VERSION, expected: ASSETS.length, cached });
      })(),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(request);
      } catch (err) {
        if (request.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});
