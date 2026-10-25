// Technik-Diagnose: zeigt, ob Offline-Betrieb, Installation und Teilen auf diesem Gerät funktionieren.
import { canSharePdf } from './export-pdf.js';

function swStatus(sw) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data);
    };
    sw.postMessage('STATUS', [channel.port2]);
  });
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

/** Liefert [{ label, value, state }] mit state = ok | warn | bad | info. */
export async function collectDiagnostics(lastExport) {
  const rows = [];
  const add = (label, value, state = 'info') => rows.push({ label, value, state });

  add('Gerät / Browser', navigator.userAgent);
  add('Bildschirm', `${innerWidth}×${innerHeight} px, Pixeldichte ${devicePixelRatio}`);

  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  add('Als App installiert (Home-Bildschirm)', standalone ? 'ja' : 'nein, läuft im Browser', standalone ? 'ok' : 'info');

  add('Sicherer Kontext (HTTPS)', isSecureContext ? 'ja' : 'nein', isSecureContext ? 'ok' : 'bad');

  if (!('serviceWorker' in navigator)) {
    add('Offline-Speicher (Service Worker)', 'nicht unterstützt', 'bad');
  } else {
    const reg = await navigator.serviceWorker.getRegistration();
    const sw = reg?.active ?? navigator.serviceWorker.controller;
    if (!sw) {
      add('Offline-Speicher (Service Worker)', 'noch nicht aktiv – Seite einmal neu laden', 'warn');
    } else {
      const status = await swStatus(sw);
      if (!status) {
        add('Offline-Speicher (Service Worker)', 'aktiv, Status nicht lesbar', 'warn');
      } else {
        const ok = status.cached >= status.expected;
        add(
          'Offline-Speicher (Service Worker)',
          `Version ${status.version}: ${status.cached}/${status.expected} Dateien gespeichert`,
          ok ? 'ok' : 'warn',
        );
      }
      add('Seite vom Service Worker ausgeliefert', navigator.serviceWorker.controller ? 'ja' : 'noch nicht', navigator.serviceWorker.controller ? 'ok' : 'info');
    }
  }

  if (navigator.storage?.persisted) {
    const persisted = await navigator.storage.persisted();
    add('Speicher dauerhaft geschützt', persisted ? 'ja' : 'nein (Browser kann bei Platzmangel räumen)', persisted ? 'ok' : 'warn');
  }
  if (navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    add('Speicher belegt / Kontingent', `${mb(usage)} / ${quota ? mb(quota) : 'unbekannt'}`);
  }

  const probe = new File([new Uint8Array([37, 80, 68, 70])], 'test.pdf', { type: 'application/pdf' });
  const canShare = canSharePdf(probe);
  add('PDF teilen (Teilen-Menü)', canShare ? 'unterstützt' : 'nicht unterstützt – es gibt „Herunterladen“', canShare ? 'ok' : 'warn');

  add('KaTeX', window.katex ? `Version ${window.katex.version}` : 'nicht geladen', window.katex ? 'ok' : 'bad');
  add('Schrift „Comic Neue“', document.fonts?.check('32px "Comic Neue"') ? 'geladen' : 'nicht geladen', document.fonts?.check('32px "Comic Neue"') ? 'ok' : 'warn');

  if (lastExport) {
    add(
      'Letzter PDF-Export',
      `${mb(lastExport.blob.size)}, Skalierung ${lastExport.scale}× (${lastExport.canvasPx} px), ${(lastExport.ms / 1000).toFixed(1)} s`,
      lastExport.scale >= 2 ? 'ok' : 'warn',
    );
  } else {
    add('Letzter PDF-Export', 'noch keiner');
  }
  return rows;
}

export function diagnosticsToText(rows) {
  const mark = { ok: '[OK]', warn: '[!]', bad: '[FEHLER]', info: '[i]' };
  return ['Starteraufgaben – Diagnose', ...rows.map((r) => `${mark[r.state] ?? '[i]'} ${r.label}: ${r.value}`)].join('\n');
}
