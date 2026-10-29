// App-Rahmen: Speicher, Einstellungen, Routing (Bibliothek ↔ Editor ↔ Aufgabenbank) und die gemeinsamen Dialoge.
import { createBackupUi } from './backup-ui.js';
import { registerChange } from './backup.js';
import { imageIdsOfBank } from './bank.js';
import { createBankUi } from './bank-ui.js';
import { collectDiagnostics, diagnosticsToText } from './diagnose.js';
import { createEditor } from './editor.js';
import { FORMATS } from './formats.js';
import { FOLDER_ALL, cleanFolderName, newFolder, sortFolders, validSelection } from './folders.js';
import { createFormulaDialog } from './formula.js';
import { createGeneratorDialog } from './gen-ui.js';
import { createLibrary } from './library.js';
import { duplicateSheet, imageIdsOf, newSheet, nextNumber } from './model.js';
import { setMarkupOptions } from './markup.js';
import { SOLUTION_STYLES } from './sheet.js';
import { openStore } from './store.js';
import { $, fill, toast, wireDialogs } from './ui.js';

const FIRST_SHEET_TASKS = [
  'Berechne:\n$7 \\cdot 5$',
  'Runde die Zahl 388 auf Hunderter.',
  'Wie viele Sekunden hat eine Minute?',
  'Welche der Figuren sind Dreiecke?',
];

/** Formelschrift (mathfont*.css an/aus) und Tausendertrenner nach den Einstellungen setzen. */
function applyFormulaLook(settings) {
  setMarkupOptions({ thousands: settings.thousandsSeparator, matchFont: settings.formulaFontMatch });
  for (const id of ['mathfont-css', 'mathfont-symbols-css']) {
    const link = document.getElementById(id);
    if (link) link.disabled = !settings.formulaFontMatch;
  }
}

const sheetPath = (id) => `#/blatt/${encodeURIComponent(id)}`;
const currentSheetId = () => {
  const m = location.hash.match(/^#\/blatt\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};

export async function startApp() {
  wireDialogs();
  const store = await openStore();
  $('#storage-banner').hidden = store.persistent;
  navigator.storage?.persist?.().catch(() => {});

  const app = { store, settings: await store.getSettings(), sheets: [], bank: [], folders: [], lastChangeAt: 0 };
  applyFormulaLook(app.settings);
  app.refreshSheets = async () => {
    app.sheets = await store.listSheets();
  };
  app.refreshBank = async () => {
    app.bank = await store.listBank();
  };
  /** Zählt eine Bearbeitung für die Sicherungs-Erinnerung (Blätter und Bank). */
  app.noteChange = () => {
    const patch = registerChange(app.settings, app.lastChangeAt);
    app.lastChangeAt = Date.now();
    if (Object.keys(patch).length) app.setSettings(patch).catch((err) => console.warn(err));
  };
  app.setSettings = async (patch) => {
    Object.assign(app.settings, patch);
    await Promise.all(Object.entries(patch).map(([key, value]) => store.setSetting(key, value)));
  };

  // --- Navigation ---------------------------------------------------------------------------
  let editor;
  let library;
  let bank;
  let routing = Promise.resolve();
  async function doRoute() {
    if (location.hash === '#/bank') {
      await editor.close();
      library.clear();
      await bank.show();
      return;
    }
    await bank.leave();
    const id = currentSheetId();
    if (id) {
      if (await editor.open(id)) {
        library.clear();
        bank.clear();
        return;
      }
      history.replaceState(null, '', '#/'); // unbekanntes Blatt -> Bibliothek
    }
    await editor.close();
    bank.clear();
    await library.show();
  }
  const route = () => {
    routing = routing.then(doRoute).catch((err) => console.error(err));
    return routing;
  };
  app.go = (hash) => {
    if ((location.hash || '#/') === hash) return route();
    location.hash = hash;
    return routing;
  };
  window.addEventListener('hashchange', route);

  // --- Blätter anlegen, kopieren, löschen -----------------------------------------------------
  app.flush = () => editor.flush();
  app.onLibraryChanged = () => {
    if (document.body.dataset.view === 'library') library.show();
  };
  app.onBackupClosed = () => {
    if (document.body.dataset.view === 'library') library.renderReminder();
  };
  app.onSheetSaved = (sheet) => {
    const entry = structuredClone(sheet);
    app.sheets = [entry, ...app.sheets.filter((s) => s.id !== entry.id)];
    app.noteChange();
  };

  // --- Klassen-Ordner ---------------------------------------------------------------------------
  app.refreshFolders = async () => {
    app.folders = sortFolders(await store.listFolders());
  };
  /** Der in der Bibliothek gewählte Ordner (oder null bei „Alle“ / „Ohne Ordner“). */
  app.currentFolder = () => app.folders.find((f) => f.id === app.settings.libraryFolder) ?? null;
  app.setLibraryFolder = (selection) => app.setSettings({ libraryFolder: validSelection(selection, app.folders) });

  app.createFolder = async (name) => {
    const folder = newFolder({ name });
    await store.saveFolder(folder);
    await app.refreshFolders();
    app.noteChange();
    return folder;
  };
  app.renameFolder = async (folder, name) => {
    await store.saveFolder({ ...folder, name: cleanFolderName(name) || folder.name, updatedAt: Date.now() });
    await app.refreshFolders();
    app.noteChange();
  };
  /** Verschiebt ein Blatt in einen Ordner (null = ohne Ordner). Nur aus der Bibliothek aufrufen (der Editor hält sein Blatt selbst). */
  app.moveSheet = async (sheet, folderId) => {
    const latest = (await store.getSheet(sheet.id)) ?? sheet;
    await store.saveSheet({ ...latest, folderId: folderId || null, updatedAt: Date.now() });
    await app.refreshSheets();
    app.noteChange();
  };
  /** Löscht einen Ordner; die Blätter darin bleiben erhalten und liegen danach ohne Ordner. „Rückgängig“ stellt alles wieder her. */
  app.deleteFolder = async (folder) => {
    const inside = app.sheets.filter((s) => s.folderId === folder.id);
    for (const sheet of inside) await store.saveSheet({ ...(await store.getSheet(sheet.id)), folderId: null, updatedAt: Date.now() });
    await store.deleteFolder(folder.id);
    if (app.settings.libraryFolder === folder.id) await app.setSettings({ libraryFolder: FOLDER_ALL });
    await app.refreshFolders();
    await app.refreshSheets();
    app.noteChange();
    if (document.body.dataset.view === 'library') await library.show();
    toast(`Ordner „${folder.name}“ gelöscht${inside.length ? ` – ${inside.length === 1 ? 'das Blatt liegt' : `die ${inside.length} Blätter liegen`} jetzt ohne Ordner` : ''}.`, {
      action: 'Rückgängig',
      ms: 10_000,
      onAction: async () => {
        await store.saveFolder(folder);
        for (const sheet of inside) {
          const now = await store.getSheet(sheet.id);
          if (now && !now.folderId) await store.saveSheet({ ...now, folderId: folder.id, updatedAt: Date.now() });
        }
        await app.refreshFolders();
        await app.refreshSheets();
        if (document.body.dataset.view === 'library') await library.show();
      },
    });
  };

  app.createSheet = async (base) => {
    const sheet = base ?? newSheet({ number: nextNumber(app.sheets), settings: app.settings });
    if (!base && app.currentFolder()) sheet.folderId = app.currentFolder().id; // neues Blatt landet im gerade geöffneten Ordner
    await store.saveSheet(sheet);
    await app.refreshSheets();
    await app.go(sheetPath(sheet.id));
    return sheet;
  };

  app.duplicateSheet = async (sheet, { open = true } = {}) => {
    await editor.flush();
    const latest = (await store.getSheet(sheet.id)) ?? sheet;
    const copy = duplicateSheet(latest, { number: nextNumber(app.sheets) });
    await store.saveSheet(copy);
    await app.refreshSheets();
    if (open) await app.go(sheetPath(copy.id));
    else toast(`Kopie als Nr. ${copy.number} angelegt.`);
    return copy;
  };

  app.deleteSheet = async (sheet) => {
    editor.discard(sheet.id);
    const snapshot = (await store.getSheet(sheet.id)) ?? structuredClone(sheet);
    await store.deleteSheet(sheet.id);
    await app.refreshSheets();
    if (currentSheetId()) await app.go('#/');
    else await library.show();
    toast(`Blatt Nr. ${sheet.number} gelöscht.`, {
      action: 'Rückgängig',
      ms: 10_000,
      onAction: async () => {
        await store.saveSheet(snapshot);
        await app.refreshSheets();
        if (document.body.dataset.view === 'library') await library.show();
      },
    });
  };

  // --- Voreinstellungen und Diagnose (für beide Ansichten) ------------------------------------
  const formatEntries = Object.values(FORMATS).map((f) => [f.id, f.label]);
  const styleEntries = Object.entries(SOLUTION_STYLES);
  fill($('#s-format'), formatEntries);
  fill($('#s-solution'), styleEntries);
  $('#s-format').value = app.settings.defaultFormat;
  $('#s-solution').value = app.settings.defaultSolutionStyle;
  $('#s-formula').checked = app.settings.formulaEditor;
  $('#s-formula').addEventListener('change', (e) => app.setSettings({ formulaEditor: e.target.checked }));
  $('#s-mathfont').checked = app.settings.formulaFontMatch;
  $('#s-thousands').checked = app.settings.thousandsSeparator;
  // Formelschrift und Tausendertrenner wirken beim Zeichnen der Formeln: nach dem Umschalten alles neu zeichnen.
  const changeFormulaLook = async (patch) => {
    await app.setSettings(patch);
    applyFormulaLook(app.settings);
    await app.flush();
    await route();
  };
  $('#s-mathfont').addEventListener('change', (e) => changeFormulaLook({ formulaFontMatch: e.target.checked }));
  $('#s-thousands').addEventListener('change', (e) => changeFormulaLook({ thousandsSeparator: e.target.checked }));
  $('#s-format').addEventListener('change', (e) => app.setSettings({ defaultFormat: e.target.value }));
  $('#s-solution').addEventListener('change', (e) => app.setSettings({ defaultSolutionStyle: e.target.value }));
  app.openSettings = () => $('#dlg-settings').showModal();

  let diagRows = [];
  async function refreshDiagnostics() {
    diagRows = await collectDiagnostics(editor.getLastExport());
    $('#diag-list').replaceChildren(
      ...diagRows.map((row) => {
        const li = document.createElement('li');
        li.className = row.state;
        const dot = document.createElement('span');
        dot.className = 'dot';
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = row.label;
        const value = document.createElement('span');
        value.className = 'value';
        value.textContent = row.value;
        li.append(dot, label, value);
        return li;
      }),
    );
  }
  app.openDiagnostics = async () => {
    $('#dlg-diag').showModal();
    await refreshDiagnostics();
  };
  $('#btn-diag').addEventListener('click', refreshDiagnostics);
  $('#btn-diag-copy').addEventListener('click', async () => {
    const text = diagnosticsToText(diagRows);
    try {
      await navigator.clipboard.writeText(text);
      $('#diag-copied').hidden = false;
      setTimeout(() => ($('#diag-copied').hidden = true), 3000);
    } catch {
      window.prompt('Diagnose kopieren:', text);
    }
  });

  // --- Start --------------------------------------------------------------------------------
  app.backup = createBackupUi(app);
  app.formula = createFormulaDialog();
  app.generator = createGeneratorDialog(app);
  editor = createEditor(app);
  library = createLibrary(app);
  bank = createBankUi(app);
  app.pickFromBank = (options) => bank.pick(options);
  app.saveToBank = (task, sheet) => bank.saveTask(task, sheet);

  await app.refreshSheets();
  await app.refreshBank();
  await app.refreshFolders();
  if (!app.sheets.length) {
    await store.saveSheet(newSheet({ number: 1, settings: app.settings, taskTexts: FIRST_SHEET_TASKS }));
    await app.refreshSheets();
  }
  await document.fonts?.load('32px "Comic Neue"').catch(() => {});
  await route();

  // Bilder, die kein Blatt mehr braucht, aufräumen (nur beim Start, damit „Rückgängig“ sicher ist).
  const used = new Set([...app.sheets.flatMap(imageIdsOf), ...imageIdsOfBank(app.bank)]);
  store
    .listImageIds()
    .then((ids) => Promise.all(ids.filter((id) => !used.has(id)).map((id) => store.deleteImage(id))))
    .catch(() => {});

  // Für Tests und Fehlersuche
  window.__starteraufgaben = { app, getSheet: () => editor.getSheet(), flushSave: () => editor.flush() };
}
