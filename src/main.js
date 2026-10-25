// Startpunkt: Service Worker einrichten und den Editor starten.
import { startEditor } from './editor.js';

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Lokal entwickeln ohne Cache-Überraschungen; zum Testen des Offline-Betriebs ?sw=1 anhängen.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (local && !location.search.includes('sw=1')) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  const banner = document.querySelector('#update-banner');
  let reloading = false;

  const offerUpdate = (worker) => {
    banner.hidden = false;
    document.querySelector('#btn-update').onclick = () => worker.postMessage('SKIP_WAITING');
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // erste Installation: kein Neuladen nötig
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch((err) => console.warn('Service Worker nicht registriert:', err));
}

setupServiceWorker();

startEditor().catch((err) => {
  console.error(err);
  const box = document.createElement('div');
  box.className = 'banner banner-warn';
  box.setAttribute('role', 'alert');
  box.textContent = `Die App konnte nicht gestartet werden: ${err.message}. Bitte die Seite neu laden.`;
  document.body.prepend(box);
});
