// Editor: verbindet Modell, Blatt-Vorschau, Seitenleiste, Speicher und PDF-Export.
import { collectDiagnostics, diagnosticsToText } from './diagnose.js';
import { applyPrintPageSize, canSharePdf, createPdf, downloadPdf, openPdf, pdfFile, printSheet, safeFilename, sharePdf } from './export-pdf.js';
import { autoFit } from './fit.js';
import { FORMATS } from './formats.js';
import { History } from './history.js';
import { cachedImageUrl, imageUrl, prepareImage, rememberImage } from './images.js';
import {
  DEFAULT_SETTINGS,
  MAX_TASKS,
  WEIGHTS,
  duplicateSheet,
  duplicateTask,
  imageIdsOf,
  moveTask,
  newSheet,
  newTask,
  nextNumber,
} from './model.js';
import { SOLUTION_STYLES, fitPreview, patchHeader, patchTaskText, renderSheet } from './sheet.js';
import { openStore } from './store.js';
import { toggleList, toggleSubtasks, toggleWrap } from './text-tools.js';

const $ = (selector) => document.querySelector(selector);

const FIRST_SHEET_TASKS = [
  'Berechne:\n$7 \\cdot 5$',
  'Runde die Zahl 388 auf Hunderter.',
  'Wie viele Sekunden hat eine Minute?',
  'Welche der Figuren sind Dreiecke?',
];

export async function startEditor() {
  const sheetEl = $('#sheet');
  const wrapper = $('#preview-wrapper');
  const selBox = $('#sel-box');
  const history = new History();

  let store;
  let settings = { ...DEFAULT_SETTINGS };
  let sheets = [];
  let sheet = null;
  let selected = null; // Index der gewählten Aufgabe oder null
  let previewSize = null;
  let fitInfo = { fit: 1, overflow: false, cells: [] };
  let saveTimer = null;
  let dirty = false;
  let lastExport = null;
  let pdfToken = 0;
  let toastTimer = null;

  // --- kleine Helfer ------------------------------------------------------------------------
  const fill = (select, entries, withDefault) => {
    select.replaceChildren();
    if (withDefault) select.add(new Option(withDefault, ''));
    for (const [value, label] of entries) select.add(new Option(label, value));
  };
  const formatEntries = Object.values(FORMATS).map((f) => [f.id, f.label]);
  const styleEntries = Object.entries(SOLUTION_STYLES);
  const weightLabel = (w) => `${String(w).replace('.', ',')}×`;

  function toast(text, { action, onAction, ms = 6000 } = {}) {
    $('#toast-text').textContent = text;
    const btn = $('#toast-action');
    btn.hidden = !action;
    btn.textContent = action ?? '';
    btn.onclick = () => {
      $('#toast').hidden = true;
      onAction?.();
    };
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($('#toast').hidden = true), ms);
  }

  function setSaveState(text) {
    $('#save-state').textContent = text;
  }

  // --- Speichern ----------------------------------------------------------------------------
  function markDirty() {
    dirty = true;
    setSaveState('Speichert …');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  }

  async function flushSave() {
    clearTimeout(saveTimer);
    if (!dirty || !sheet) return;
    dirty = false;
    sheet.updatedAt = Date.now();
    try {
      await store.saveSheet(sheet);
      const entry = structuredClone(sheet);
      sheets = [entry, ...sheets.filter((s) => s.id !== entry.id)];
      refreshSwitcher();
      setSaveState(store.persistent ? 'Gespeichert' : 'Nicht dauerhaft gespeichert');
    } catch (err) {
      console.error(err);
      dirty = true;
      setSaveState('Speichern fehlgeschlagen');
    }
  }

  function commit(key = null) {
    history.push(sheet, key);
    markDirty();
    updateTopbar();
  }

  // --- Anzeige ------------------------------------------------------------------------------
  function refreshSwitcher() {
    const select = $('#sel-sheet');
    fill(
      select,
      sheets.map((s) => [s.id, `Nr. ${s.number} – ${s.title}${s.klasse ? ` (${s.klasse})` : ''}`]),
    );
    select.value = sheet?.id ?? '';
  }

  function updateTopbar() {
    $('#btn-undo').disabled = !history.canUndo;
    $('#btn-redo').disabled = !history.canRedo;
  }

  function updateFitNote() {
    const note = $('#fit-note');
    if (fitInfo.overflow) {
      const list = fitInfo.cells.map((i) => i + 1).join(', ');
      const subject = fitInfo.cells.length > 1 ? `Aufgaben ${list} passen` : `Aufgabe ${list} passt`;
      note.textContent = `${subject} nicht mehr aufs Blatt. Text kürzen oder weniger Aufgaben wählen.`;
      note.className = 'fit-note';
      note.hidden = false;
    } else if (fitInfo.fit < 0.995) {
      note.textContent = `Schrift wurde automatisch auf ${Math.round(fitInfo.fit * 100)} % verkleinert, damit alles passt.`;
      note.className = 'fit-note info';
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  }

  function updateChips() {
    const box = $('#task-chips');
    box.replaceChildren(
      ...sheet.tasks.map((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `chip${fitInfo.cells.includes(i) ? ' warn' : ''}`;
        b.textContent = String(i + 1);
        b.setAttribute('aria-label', `Aufgabe ${i + 1}`);
        b.setAttribute('aria-pressed', String(i === selected));
        b.addEventListener('click', () => selectTask(i, { focus: false }));
        return b;
      }),
    );
    $('#btn-add-task').disabled = sheet.tasks.length >= MAX_TASKS;
  }

  function updateOverlay() {
    if (selected === null) {
      selBox.hidden = true;
      return;
    }
    const task = sheetEl.querySelector(`.cell-task[data-index="${selected}"]`);
    const solution = sheetEl.querySelector(`.cell-sol[data-index="${selected}"]`);
    if (!task || !solution) {
      selBox.hidden = true;
      return;
    }
    const w = wrapper.getBoundingClientRect();
    const a = task.getBoundingClientRect();
    const b = solution.getBoundingClientRect();
    Object.assign(selBox.style, {
      left: `${a.left - w.left}px`,
      top: `${a.top - w.top}px`,
      width: `${b.right - a.left}px`,
      height: `${a.height}px`,
    });
    selBox.hidden = false;
  }

  function renderAll() {
    const res = renderSheet(sheetEl, sheet, { imageUrl: cachedImageUrl });
    previewSize = res.size;
    fitInfo = res.fit;
    fitPreview(wrapper, sheetEl, previewSize);
    applyPrintPageSize(sheet.format);
    updateFitNote();
    updateChips();
    updateOverlay();
    updateTopbar();
  }

  function afterPatch(fit) {
    if (!fit) return;
    fitInfo = fit;
    updateFitNote();
    updateChips();
    updateOverlay();
  }

  // --- Formulare ----------------------------------------------------------------------------
  function fillSheetForm() {
    $('#f-title').value = sheet.title;
    $('#f-number').value = sheet.number;
    $('#f-zeit').value = sheet.zeit;
    $('#f-date').value = sheet.date;
    $('#f-klasse').value = sheet.klasse;
    $('#f-instructions').value = sheet.instructions;
    $('#f-format').value = sheet.format;
    $('#f-solution').value = sheet.solutionDefault;
  }

  function fillTaskForm({ keepText = false } = {}) {
    const empty = selected === null || !sheet.tasks[selected];
    $('#task-empty').hidden = !empty;
    $('#task-form').hidden = empty;
    if (empty) return;
    const task = sheet.tasks[selected];
    $('#task-heading').textContent = `Aufgabe ${selected + 1}`;
    if (!keepText) $('#f-text').value = task.text;
    $('#f-task-solution').value = task.solutionStyle ?? '';
    $('#f-weight').value = String(task.weight);
    const url = task.imageId ? cachedImageUrl(task.imageId) : null;
    $('#img-thumb').hidden = !url;
    if (url) $('#img-thumb').src = url;
    $('#btn-image-remove').hidden = !task.imageId;
    $('#lbl-image').textContent = task.imageId ? 'Bild ersetzen' : 'Bild hinzufügen';
    $('#btn-task-prev').disabled = selected === 0;
    $('#btn-task-next').disabled = selected === sheet.tasks.length - 1;
    $('#btn-task-up').disabled = selected === 0;
    $('#btn-task-down').disabled = selected === sheet.tasks.length - 1;
  }

  function showTab(name) {
    const isSheet = name === 'sheet';
    $('#pane-sheet').hidden = !isSheet;
    $('#pane-task').hidden = isSheet;
    $('#tab-sheet').setAttribute('aria-selected', String(isSheet));
    $('#tab-task').setAttribute('aria-selected', String(!isSheet));
  }

  function selectTask(index, { focus = true } = {}) {
    if (index === null || !sheet.tasks[index]) {
      selected = null;
    } else {
      selected = index;
    }
    showTab(selected === null ? 'sheet' : 'task');
    fillTaskForm();
    updateChips();
    updateOverlay();
    if (focus && selected !== null && sheet.tasks[selected].text === '') $('#f-text').focus();
  }

  const FIELD_INPUT = {
    title: '#f-title',
    instructions: '#f-instructions',
    number: '#f-number',
    zeit: '#f-zeit',
    date: '#f-date',
    klasse: '#f-klasse',
  };

  function focusSheetField(field) {
    selected = null;
    showTab('sheet');
    fillTaskForm();
    updateChips();
    updateOverlay();
    const input = $(FIELD_INPUT[field] ?? '#f-title');
    input.focus();
    input.select?.();
    input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // --- Blätter laden und wechseln -----------------------------------------------------------
  async function loadImages(target) {
    await Promise.all(imageIdsOf(target).map((id) => imageUrl(store, id)));
  }

  async function setSheet(next) {
    sheet = next;
    history.reset(sheet);
    selected = null;
    await loadImages(sheet);
    fillSheetForm();
    showTab('sheet');
    fillTaskForm();
    renderAll();
    refreshSwitcher();
    await store.setSetting('lastSheetId', sheet.id);
  }

  async function createSheet(base) {
    await flushSave();
    const created = base ?? newSheet({ number: nextNumber(sheets), settings });
    await store.saveSheet(created);
    sheets = [structuredClone(created), ...sheets.filter((s) => s.id !== created.id)];
    await setSheet(created);
    setSaveState(store.persistent ? 'Gespeichert' : 'Nicht dauerhaft gespeichert');
  }

  async function removeUnusedImages() {
    const used = new Set(sheets.flatMap(imageIdsOf));
    for (const id of await store.listImageIds()) if (!used.has(id)) await store.deleteImage(id);
  }

  // --- Änderungen am Blatt ------------------------------------------------------------------
  function bindSheetField(selector, prop, { rerender = false } = {}) {
    $(selector).addEventListener('input', (e) => {
      sheet[prop] = e.target.value;
      if (rerender) renderAll();
      else afterPatch(patchHeader(sheetEl, sheet));
      commit(`sheet-${prop}`);
    });
  }
  bindSheetField('#f-title', 'title');
  bindSheetField('#f-number', 'number');
  bindSheetField('#f-zeit', 'zeit');
  bindSheetField('#f-date', 'date');
  bindSheetField('#f-klasse', 'klasse');
  bindSheetField('#f-instructions', 'instructions');
  bindSheetField('#f-format', 'format', { rerender: true });
  bindSheetField('#f-solution', 'solutionDefault', { rerender: true });
  $('#btn-date-clear').addEventListener('click', () => {
    sheet.date = '';
    $('#f-date').value = '';
    afterPatch(patchHeader(sheetEl, sheet));
    commit('sheet-date');
  });

  // Antippen im Blatt
  sheetEl.addEventListener('click', (e) => {
    const field = e.target.closest('[data-field]');
    if (field) {
      focusSheetField(field.dataset.field);
      return;
    }
    const cell = e.target.closest('.cell-task, .cell-sol');
    if (cell) selectTask(Number(cell.dataset.index));
  });

  // Bilder laden nach: Größe der Zeile ändert sich -> neu anpassen
  sheetEl.addEventListener('load', () => afterPatch(autoFit(sheetEl)), true);

  // --- Aufgabe bearbeiten -------------------------------------------------------------------
  const text = $('#f-text');
  text.addEventListener('input', () => {
    const task = sheet.tasks[selected];
    if (!task) return;
    task.text = text.value;
    afterPatch(patchTaskText(sheetEl, sheet, selected));
    commit(`text-${task.id}`);
  });

  const TOOLS = {
    bold: (v, s, e) => toggleWrap(v, s, e, '**'),
    italic: (v, s, e) => toggleWrap(v, s, e, '*'),
    underline: (v, s, e) => toggleWrap(v, s, e, '__'),
    sub: toggleSubtasks,
    list: toggleList,
  };
  document.querySelectorAll('.toolbar [data-tool]').forEach((button) => {
    // Fokus im Textfeld lassen, damit am iPad die Tastatur offen bleibt.
    button.addEventListener('pointerdown', (e) => e.preventDefault());
    button.addEventListener('click', () => {
      const tool = TOOLS[button.dataset.tool];
      if (!tool) return;
      const result = tool(text.value, text.selectionStart, text.selectionEnd);
      text.value = result.text;
      text.setSelectionRange(result.start, result.end);
      text.focus();
      text.dispatchEvent(new Event('input'));
    });
  });

  $('#f-task-solution').addEventListener('change', (e) => {
    sheet.tasks[selected].solutionStyle = e.target.value || null;
    renderAll();
    commit(`task-solution-${sheet.tasks[selected].id}`);
  });
  $('#f-weight').addEventListener('change', (e) => {
    sheet.tasks[selected].weight = Number(e.target.value);
    renderAll();
    commit(`task-weight-${sheet.tasks[selected].id}`);
  });

  $('#f-image').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || selected === null) return;
    try {
      const image = await prepareImage(file);
      await store.saveImage(image);
      rememberImage(image.id, image.blob);
      sheet.tasks[selected].imageId = image.id;
      renderAll();
      fillTaskForm({ keepText: true });
      commit();
    } catch (err) {
      console.error(err);
      toast('Das Bild konnte nicht gelesen werden.');
    }
  });
  $('#btn-image-remove').addEventListener('click', () => {
    sheet.tasks[selected].imageId = null;
    renderAll();
    fillTaskForm({ keepText: true });
    commit();
  });

  function addTask() {
    if (sheet.tasks.length >= MAX_TASKS) {
      toast(`Mehr als ${MAX_TASKS} Aufgaben passen nicht auf ein Blatt.`);
      return;
    }
    sheet.tasks.push(newTask());
    renderAll();
    selectTask(sheet.tasks.length - 1);
    commit();
  }
  $('#btn-add-task').addEventListener('click', addTask);

  const step = (delta) => selectTask(Math.min(Math.max(selected + delta, 0), sheet.tasks.length - 1), { focus: false });
  $('#btn-task-prev').addEventListener('click', () => step(-1));
  $('#btn-task-next').addEventListener('click', () => step(1));

  function move(delta) {
    selected = moveTask(sheet, selected, selected + delta);
    renderAll();
    fillTaskForm();
    commit();
  }
  $('#btn-task-up').addEventListener('click', () => move(-1));
  $('#btn-task-down').addEventListener('click', () => move(1));

  $('#btn-task-dup').addEventListener('click', () => {
    if (sheet.tasks.length >= MAX_TASKS) {
      toast(`Mehr als ${MAX_TASKS} Aufgaben passen nicht auf ein Blatt.`);
      return;
    }
    sheet.tasks.splice(selected + 1, 0, duplicateTask(sheet.tasks[selected]));
    renderAll();
    selectTask(selected + 1, { focus: false });
    commit();
  });

  $('#btn-task-del').addEventListener('click', () => {
    if (sheet.tasks.length <= 1) {
      toast('Ein Blatt braucht mindestens eine Aufgabe.');
      return;
    }
    const at = selected;
    sheet.tasks.splice(at, 1);
    renderAll();
    selectTask(Math.min(at, sheet.tasks.length - 1), { focus: false });
    commit();
    toast(`Aufgabe ${at + 1} gelöscht.`, { action: 'Rückgängig', onAction: undo });
  });

  // --- Rückgängig / Wiederholen ---------------------------------------------------------------
  async function applySnapshot(snapshot) {
    if (!snapshot) return;
    sheet = snapshot;
    await loadImages(sheet);
    if (selected !== null && selected >= sheet.tasks.length) selected = sheet.tasks.length - 1;
    fillSheetForm();
    renderAll();
    fillTaskForm();
    markDirty();
  }
  const undo = () => applySnapshot(history.undo());
  const redo = () => applySnapshot(history.redo());
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const typing = e.target.closest?.('input, textarea, select');
    if (!mod || typing) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault();
      redo();
    }
  });

  // --- Tabs, Dialoge, Menü ------------------------------------------------------------------
  $('#tab-sheet').addEventListener('click', () => {
    selected = null;
    showTab('sheet');
    fillTaskForm();
    updateChips();
    updateOverlay();
  });
  $('#tab-task').addEventListener('click', () => {
    if (selected === null && sheet.tasks.length) selectTask(0, { focus: false });
    else showTab('task');
  });

  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) dialog.close();
      else if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (outside) dialog.close();
      }
    });
  });

  $('#sel-sheet').addEventListener('change', async (e) => {
    const target = sheets.find((s) => s.id === e.target.value);
    if (!target) return;
    await flushSave();
    await setSheet(structuredClone(target));
  });

  $('#btn-menu').addEventListener('click', () => $('#dlg-menu').showModal());
  const fromMenu = (id, fn) =>
    $(id).addEventListener('click', async () => {
      $('#dlg-menu').close();
      await fn();
    });
  fromMenu('#m-new', () => createSheet());
  fromMenu('#m-dup', () => createSheet(duplicateSheet(sheet, { number: nextNumber(sheets) })));
  fromMenu('#m-del', async () => {
    if (!window.confirm(`Blatt „${sheet.title}“ (Nr. ${sheet.number}) wirklich löschen?`)) return;
    clearTimeout(saveTimer);
    dirty = false;
    await store.deleteSheet(sheet.id);
    sheets = sheets.filter((s) => s.id !== sheet.id);
    if (sheets.length) await setSheet(structuredClone(sheets[0]));
    else await createSheet();
    toast('Blatt gelöscht.');
  });
  fromMenu('#m-settings', () => $('#dlg-settings').showModal());
  fromMenu('#m-diag', async () => {
    $('#dlg-diag').showModal();
    await refreshDiagnostics();
  });

  // Voreinstellungen
  $('#s-format').addEventListener('change', async (e) => {
    settings.defaultFormat = e.target.value;
    await store.setSetting('defaultFormat', settings.defaultFormat);
  });
  $('#s-solution').addEventListener('change', async (e) => {
    settings.defaultSolutionStyle = e.target.value;
    await store.setSetting('defaultSolutionStyle', settings.defaultSolutionStyle);
  });

  // Diagnose
  let diagRows = [];
  async function refreshDiagnostics() {
    diagRows = await collectDiagnostics(lastExport);
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
  $('#btn-diag').addEventListener('click', refreshDiagnostics);
  $('#btn-diag-copy').addEventListener('click', async () => {
    const textToCopy = diagnosticsToText(diagRows);
    try {
      await navigator.clipboard.writeText(textToCopy);
      $('#diag-copied').hidden = false;
      setTimeout(() => ($('#diag-copied').hidden = true), 3000);
    } catch {
      window.prompt('Diagnose kopieren:', textToCopy);
    }
  });

  // --- PDF ----------------------------------------------------------------------------------
  const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2).replace('.', ',')} MB`;
  const actionButton = (label, onClick, primary = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = primary ? 'btn btn-primary' : 'btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  async function exportPdf() {
    await flushSave();
    const dialog = $('#dlg-pdf');
    const status = $('#pdf-status');
    const actions = $('#pdf-actions');
    status.className = '';
    status.textContent = 'Erstelle PDF …';
    actions.replaceChildren();
    if (!dialog.open) dialog.showModal();
    const token = (pdfToken += 1);
    try {
      const res = await createPdf(sheetEl, sheet.format);
      if (token !== pdfToken) return;
      lastExport = res;
      const name = `${safeFilename(`${sheet.title}_Nr-${sheet.number}${sheet.date ? `_${sheet.date}` : ''}`)}.pdf`;
      const file = pdfFile(res.blob, name);
      status.textContent = `${name} – ${mb(file.size)}, ${(res.ms / 1000).toFixed(1).replace('.', ',')} s${res.scale < 2 ? `, Auflösung ${res.scale}×` : ''}`;
      // Teilen braucht eine frische Nutzeraktion – deshalb ein eigener Knopf statt Auto-Aufruf nach dem Rendern.
      if (canSharePdf(file)) {
        actions.append(
          actionButton('Teilen …', async () => {
            try {
              await sharePdf(file);
            } catch (err) {
              status.textContent = `Teilen nicht möglich (${err.message}). Bitte „Herunterladen“ nehmen.`;
            }
          }, true),
        );
      }
      actions.append(actionButton('Herunterladen', () => downloadPdf(res.blob, name), !canSharePdf(file)), actionButton('Öffnen', () => openPdf(res.blob)));
    } catch (err) {
      if (token !== pdfToken) return;
      status.className = 'result-error';
      status.textContent = `PDF konnte nicht erstellt werden: ${err.message}`;
    }
  }
  $('#btn-pdf').addEventListener('click', exportPdf);
  $('#dlg-pdf').addEventListener('close', () => {
    pdfToken += 1; // laufenden Export verwerfen
  });
  $('#btn-print').addEventListener('click', () => {
    $('#dlg-pdf').close();
    setTimeout(() => printSheet(sheet.format), 150);
  });

  // --- Start --------------------------------------------------------------------------------
  fill($('#f-format'), formatEntries);
  fill($('#s-format'), formatEntries);
  fill($('#f-solution'), styleEntries);
  fill($('#s-solution'), styleEntries);
  fill($('#f-task-solution'), styleEntries, 'Wie Blatt (Standard)');
  fill($('#f-weight'), WEIGHTS.map((w) => [String(w), weightLabel(w)]));

  store = await openStore();
  $('#storage-banner').hidden = store.persistent;
  settings = await store.getSettings();
  $('#s-format').value = settings.defaultFormat;
  $('#s-solution').value = settings.defaultSolutionStyle;
  sheets = await store.listSheets();
  navigator.storage?.persist?.().catch(() => {});

  // Schrift zuerst laden, damit die erste Anpassung mit den echten Maßen rechnet.
  await document.fonts?.load('32px "Comic Neue"').catch(() => {});

  const lastId = settings.lastSheetId;
  const start = sheets.find((s) => s.id === lastId) ?? sheets[0];
  if (start) {
    await setSheet(structuredClone(start));
  } else {
    await createSheet(newSheet({ number: 1, settings, taskTexts: FIRST_SHEET_TASKS }));
  }
  removeUnusedImages().catch(() => {});
  setSaveState(store.persistent ? 'Gespeichert' : 'Nicht dauerhaft gespeichert');

  new ResizeObserver(() => {
    if (!previewSize) return;
    fitPreview(wrapper, sheetEl, previewSize);
    updateOverlay();
  }).observe(wrapper);
  document.fonts?.ready.then(() => afterPatch(autoFit(sheetEl)));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.addEventListener('pagehide', flushSave);

  // Für Tests und Fehlersuche
  window.__starteraufgaben = { getSheet: () => sheet, flushSave, store: () => store };
}
