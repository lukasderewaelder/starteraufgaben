// Gemeinsame Hilfen für die Browser-Tests. Nutzt das installierte Edge/Chrome (PW_CHANNEL), weil
// Playwrights eigene Browser hier nicht heruntergeladen werden können.
import { after, before } from 'node:test';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.mjs';

export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Startet pro Testdatei einen Server und einen Browser; gibt { base, openApp } zurück. */
export function useApp() {
  const state = { base: '', browser: null, server: null };

  before(async () => {
    const started = await startServer(0);
    state.server = started.server;
    state.base = `http://localhost:${started.port}/`;
    state.browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
  });

  after(async () => {
    await state.browser?.close();
    state.server?.close();
  });

  /**
   * Öffnet die App in einem frischen Browser-Kontext (leerer Speicher).
   * view 'editor' (Standard): das erste Blatt ist geöffnet; 'library': die Bibliothek bleibt stehen.
   */
  async function openApp({ url, viewport = { width: 1376, height: 1000 }, view = 'editor', context: existing } = {}) {
    const context = existing ?? (await state.browser.newContext({ viewport, acceptDownloads: true }));
    const page = await context.newPage();
    const problems = [];
    const foreign = [];
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(String(e)));
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(state.base) && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
    });
    await page.goto(url ?? state.base);
    await page.waitForSelector('#lib-grid .card-sheet, #sheet .sheet-title');
    if (view === 'editor' && (await page.locator('#sheet .sheet-title').count()) === 0) {
      await page.click('.card-open');
      await page.waitForSelector('#sheet .sheet-title');
    }
    return { context, page, problems, foreign };
  }

  return { get base() { return state.base; }, openApp, newContext: (opts = {}) => state.browser.newContext({ viewport: { width: 1376, height: 1000 }, acceptDownloads: true, ...opts }) };
}
