// Bibliothek: alle Blätter als Karten mit Vorschaubild, Suche, Sortierung und Aktionen.
import { backupReminder, snooze } from './backup.js';
import { FORMATS } from './formats.js';
import { cachedImageUrl, imageUrl } from './images.js';
import { imageIdsOf } from './model.js';
import { renderSheet } from './sheet.js';
import { $ } from './ui.js';

const formatDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE') : '');
const numberOf = (s) => {
  const n = Number.parseFloat(s.number);
  return Number.isFinite(n) ? n : -Infinity;
};

function matches(sheet, query) {
  if (!query) return true;
  const haystack = [sheet.title, sheet.number, sheet.klasse, sheet.instructions, ...sheet.tasks.map((t) => t.text)].join('\n').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function sortSheets(sheets, mode) {
  const list = [...sheets];
  if (mode === 'number-desc') return list.sort((a, b) => numberOf(b) - numberOf(a) || b.updatedAt - a.updatedAt);
  if (mode === 'number-asc') return list.sort((a, b) => numberOf(a) - numberOf(b) || b.updatedAt - a.updatedAt);
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createLibrary(app) {
  const grid = $('#lib-grid');
  const search = $('#lib-search');
  const sortSelect = $('#lib-sort');
  let cardSheetId = null;
  let observer = null;

  async function renderThumb(box, sheet) {
    await Promise.all(imageIdsOf(sheet).map((id) => imageUrl(app.store, id)));
    if (!box.isConnected) return;
    const host = document.createElement('div');
    host.className = 'sheet';
    box.append(host);
    const { size } = renderSheet(host, sheet, { imageUrl: cachedImageUrl });
    host.style.left = '0';
    host.style.top = '0';
    host.style.transform = `scale(${box.clientWidth / size.w})`;
  }

  function observeThumbs() {
    observer?.disconnect();
    const boxes = [...grid.querySelectorAll('.thumb')];
    const build = (box) => {
      const sheet = app.sheets.find((s) => s.id === box.dataset.id);
      if (sheet && !box.firstChild) renderThumb(box, sheet).catch((err) => console.warn('Vorschau fehlgeschlagen', err));
    };
    if (!('IntersectionObserver' in window)) {
      boxes.forEach(build);
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          build(entry.target);
        }
      },
      { rootMargin: '300px' },
    );
    boxes.forEach((box) => observer.observe(box));
  }

  function card(sheet) {
    const article = document.createElement('article');
    article.className = 'card-sheet';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'card-open';
    open.dataset.id = sheet.id;
    open.setAttribute('aria-label', `Blatt Nr. ${sheet.number} „${sheet.title}“ öffnen`);

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.dataset.id = sheet.id;
    const fmt = FORMATS[sheet.format] ?? FORMATS.tabloid;
    thumb.style.aspectRatio = `${fmt.mmW} / ${fmt.mmH}`;

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const title = document.createElement('strong');
    title.className = 't';
    title.textContent = `Nr. ${sheet.number} · ${sheet.title}`;
    const line1 = document.createElement('span');
    line1.className = 't';
    line1.textContent = [sheet.klasse && `Klasse ${sheet.klasse}`, formatDate(sheet.date)].filter(Boolean).join(' · ') || '–';
    const line2 = document.createElement('span');
    line2.className = 't';
    line2.textContent = `${sheet.tasks.length} Aufgaben · ${fmt.label.split(' ')[0]}`;
    const line3 = document.createElement('span');
    line3.className = 't';
    line3.textContent = `geändert ${new Date(sheet.updatedAt).toLocaleDateString('de-DE')}`;
    meta.append(title, line1, line2, line3);
    open.append(thumb, meta);

    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'btn btn-icon card-menu';
    menu.dataset.id = sheet.id;
    menu.textContent = '⋯';
    menu.setAttribute('aria-label', `Aktionen für Blatt Nr. ${sheet.number}`);

    article.append(open, menu);
    return article;
  }

  function render() {
    const visible = sortSheets(app.sheets.filter((s) => matches(s, search.value.trim())), sortSelect.value);
    grid.replaceChildren(...visible.map(card));
    const empty = $('#lib-empty');
    if (!app.sheets.length) {
      empty.textContent = 'Noch keine Blätter. Tippe oben auf „+ Neues Blatt“.';
      empty.hidden = false;
    } else if (!visible.length) {
      empty.textContent = 'Keine Blätter gefunden.';
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }
    observeThumbs();
  }

  function renderReminder() {
    const reminder = backupReminder(app.settings);
    $('#backup-reminder').hidden = !reminder.due;
    if (reminder.due) $('#reminder-text').textContent = reminder.text;
  }

  async function show() {
    document.body.dataset.view = 'library';
    await app.refreshSheets();
    render();
    renderReminder();
    window.scrollTo(0, 0);
  }

  // --- Ereignisse ---------------------------------------------------------------------------
  search.addEventListener('input', render);
  sortSelect.addEventListener('change', render);
  $('#lib-new').addEventListener('click', () => app.createSheet());
  $('#lib-backup').addEventListener('click', () => app.backup.open());
  $('#lib-menu').addEventListener('click', () => $('#dlg-libmenu').showModal());
  $('#reminder-now').addEventListener('click', () => app.backup.open());
  $('#reminder-later').addEventListener('click', async () => {
    $('#backup-reminder').hidden = true;
    await app.setSettings(snooze());
    renderReminder();
  });

  grid.addEventListener('click', (e) => {
    const open = e.target.closest('.card-open');
    if (open) {
      app.go(`#/blatt/${encodeURIComponent(open.dataset.id)}`);
      return;
    }
    const menu = e.target.closest('.card-menu');
    if (menu) {
      cardSheetId = menu.dataset.id;
      const sheet = app.sheets.find((s) => s.id === cardSheetId);
      $('#dlg-card-title').textContent = sheet ? `Nr. ${sheet.number} · ${sheet.title}` : 'Blatt';
      $('#dlg-card').showModal();
    }
  });

  const withCardSheet = (fn) => async () => {
    const sheet = app.sheets.find((s) => s.id === cardSheetId);
    $('#dlg-card').close();
    if (sheet) await fn(sheet);
  };
  $('#c-open').addEventListener('click', withCardSheet((s) => app.go(`#/blatt/${encodeURIComponent(s.id)}`)));
  $('#c-dup').addEventListener('click', withCardSheet(async (s) => {
    await app.duplicateSheet(s, { open: false });
    await show();
  }));
  $('#c-file').addEventListener('click', withCardSheet((s) => app.backup.open({ sheets: [s] })));
  $('#c-del').addEventListener('click', withCardSheet((s) => app.deleteSheet(s)));

  $('#lm-settings').addEventListener('click', () => {
    $('#dlg-libmenu').close();
    app.openSettings();
  });
  $('#lm-diag').addEventListener('click', () => {
    $('#dlg-libmenu').close();
    app.openDiagnostics();
  });

  /** Gibt die Vorschaubilder frei, wenn der Editor übernimmt (spart Speicher auf dem iPad). */
  function clear() {
    observer?.disconnect();
    grid.replaceChildren();
  }

  return { show, clear, render, renderReminder };
}
