// Editor: verbindet Modell, Blatt-Vorschau, Seitenleiste, Speicher und PDF-Export für ein geöffnetes Blatt.
import { applyPrintPageSize, canSharePdf, createPdf, downloadPdf, openPdf, pdfFile, printSheet, safeFilename, sharePdf } from './export-pdf.js';
import { autoFit } from './fit.js';
import { FORMATS } from './formats.js';
import { describeSpec, generateTasks, rollTask } from './generators/index.js';
import { History } from './history.js';
import { cachedImageUrl, imageUrl, prepareImage, rememberImage } from './images.js';
import { MAX_TASKS, WEIGHTS, duplicateTask, imageIdsOf, moveTask, newTask } from './model.js';
import { SOLUTION_STYLES, fitPreview, patchHeader, patchTaskText, renderSheet } from './sheet.js';
import { wireTextToolbar } from './toolbar.js';
import { $, fill, mb, toast } from './ui.js';

export function createEditor(app) {
  const sheetEl = $('#sheet');
  const wrapper = $('#preview-wrapper');
  const selBox = $('#sel-box');
  const history = new History();

  let sheet = null; // das geöffnete Blatt (null, wenn die Bibliothek zu sehen ist)
  let selected = null; // Index der gewählten Aufgabe oder null
  let previewSize = null;
  let fitInfo = { fit: 1, overflow: false, cells: [] };
  let saveTimer = null;
  let dirty = false;
  let lastExport = null;
  let pdfToken = 0;

  const styleEntries = Object.entries(SOLUTION_STYLES);
  fill($('#f-format'), Object.values(FORMATS).map((f) => [f.id, f.label]));
  fill($('#f-solution'), styleEntries);
  fill($('#f-task-solution'), styleEntries, 'Wie Blatt (Standard)');
  fill($('#f-weight'), WEIGHTS.map((w) => [String(w), `${String(w).replace('.', ',')}×`]));

  const setSaveState = (text) => {
    $('#save-state').textContent = text;
  };

  // --- Speichern ----------------------------------------------------------------------------
  function markDirty() {
    dirty = true;
    setSaveState('Speichert …');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  }

  async function flush() {
    clearTimeout(saveTimer);
    if (!dirty || !sheet) return;
    dirty = false;
    sheet.updatedAt = Date.now();
    try {
      await app.store.saveSheet(sheet);
      app.onSheetSaved(sheet);
      setSaveState(app.store.persistent ? 'Gespeichert' : 'Nicht dauerhaft gespeichert');
    } catch (err) {
      console.error(err);
      dirty = true;
      setSaveState('Speichern fehlgeschlagen');
    }
  }

  /** Verwirft ungespeicherte Änderungen des Blatts mit dieser ID (vor dem Löschen). */
  function discard(id) {
    if (sheet?.id !== id) return;
    clearTimeout(saveTimer);
    dirty = false;
  }

  function commit(key = null) {
    history.push(sheet, key);
    markDirty();
    updateTopbar();
  }

  // --- Anzeige ------------------------------------------------------------------------------
  function updateTopbar() {
    $('#btn-undo').disabled = !history.canUndo;
    $('#btn-redo').disabled = !history.canRedo;
    $('#topbar-title').textContent = sheet ? `Nr. ${sheet.number} – ${sheet.title}` : '';
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
    $('#task-chips').replaceChildren(
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
    const task = selected === null ? null : sheetEl.querySelector(`.cell-task[data-index="${selected}"]`);
    const solution = selected === null ? null : sheetEl.querySelector(`.cell-sol[data-index="${selected}"]`);
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
    $('#task-gen').hidden = !task.generator;
    if (task.generator) $('#task-gen-desc').textContent = describeSpec(task.generator);
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
    selected = index !== null && sheet.tasks[index] ? index : null;
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

  // --- Öffnen und Schließen -----------------------------------------------------------------
  const loadImages = (target) => Promise.all(imageIdsOf(target).map((id) => imageUrl(app.store, id)));

  /** Öffnet das Blatt mit dieser ID; false, wenn es nicht existiert. */
  async function open(id) {
    await flush();
    const loaded = await app.store.getSheet(id);
    if (!loaded) return false;
    await loadImages(loaded);
    sheet = loaded;
    history.reset(sheet);
    selected = null;
    document.body.dataset.view = 'editor'; // erst jetzt sichtbar, damit die Anpassung echte Maße misst
    fillSheetForm();
    showTab('sheet');
    fillTaskForm();
    renderAll();
    setSaveState(app.store.persistent ? 'Gespeichert' : 'Nicht dauerhaft gespeichert');
    return true;
  }

  async function close() {
    if (!sheet) return;
    await flush();
    sheet = null;
    selected = null;
  }

  // --- Änderungen am Blatt ------------------------------------------------------------------
  function bindSheetField(selector, prop, { rerender = false } = {}) {
    $(selector).addEventListener('input', (e) => {
      if (!sheet) return;
      sheet[prop] = e.target.value;
      if (rerender) renderAll();
      else afterPatch(patchHeader(sheetEl, sheet));
      commit(`sheet-${prop}`);
      updateTopbar();
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
    if (!sheet) return;
    const field = e.target.closest('[data-field]');
    if (field) {
      focusSheetField(field.dataset.field);
      return;
    }
    const cell = e.target.closest('.cell-task, .cell-sol');
    if (cell) selectTask(Number(cell.dataset.index));
  });

  // Bilder laden nach: Größe der Zeile ändert sich -> neu anpassen
  sheetEl.addEventListener('load', () => sheet && afterPatch(autoFit(sheetEl)), true);

  // --- Aufgabe bearbeiten -------------------------------------------------------------------
  const text = $('#f-text');
  text.addEventListener('input', () => {
    const task = sheet?.tasks[selected];
    if (!task) return;
    task.text = text.value;
    afterPatch(patchTaskText(sheetEl, sheet, selected));
    commit(`text-${task.id}`);
  });

  wireTextToolbar({ toolbar: $('#pane-task .toolbar'), textarea: text, app, isActive: () => Boolean(sheet?.tasks[selected]) });

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
      await app.store.saveImage(image);
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

  // Aufgaben aus der Aufgabenbank übernehmen (als Kopien; das Blatt bleibt unabhängig von der Bank).
  // Zufalls-Vorlagen würfeln dabei frische Zahlen.
  function tasksFromBankItem(item) {
    if (!item.generator) return [newTask(item.text, { imageId: item.imageId, solution: item.solution })];
    const { tasks } = generateTasks(item.generator);
    return tasks.map((t) => newTask(t.text, { solution: t.solution, generator: t.generator }));
  }

  $('#btn-bank-pick').addEventListener('click', async () => {
    const room = MAX_TASKS - sheet.tasks.length;
    const items = await app.pickFromBank({ room });
    if (!items?.length || !sheet) return;
    const first = sheet.tasks.length;
    for (const item of items) {
      for (const task of tasksFromBankItem(item)) if (sheet.tasks.length < MAX_TASKS) sheet.tasks.push(task);
    }
    const added = sheet.tasks.length - first;
    if (!added) {
      toast('Mit den Einstellungen der Vorlage lässt sich keine Aufgabe erzeugen.');
      return;
    }
    await loadImages(sheet);
    renderAll();
    selectTask(first, { focus: false });
    commit();
    toast(added === 1 ? 'Aufgabe aus der Bank hinzugefügt.' : `${added} Aufgaben aus der Bank hinzugefügt.`);
  });

  // Zufallsaufgaben: neue Aufgaben erzeugen, einzelne neu würfeln, Einstellungen ändern.
  $('#btn-gen').addEventListener('click', async () => {
    const room = MAX_TASKS - sheet.tasks.length;
    if (room <= 0) {
      toast(`Mehr als ${MAX_TASKS} Aufgaben passen nicht auf ein Blatt.`);
      return;
    }
    const result = await app.generator.open({ mode: 'add', room, sheet });
    if (!result || !sheet) return;
    const first = sheet.tasks.length;
    for (const t of result.tasks) sheet.tasks.push(newTask(t.text, { solution: t.solution, generator: t.generator }));
    renderAll();
    selectTask(first, { focus: false });
    commit();
    toast(result.tasks.length === 1 ? 'Zufallsaufgabe hinzugefügt.' : `${result.tasks.length} Zufallsaufgaben hinzugefügt.`);
  });

  function replaceTaskContent(task, next) {
    task.text = next.text;
    task.solution = next.solution;
    task.generator = next.generator;
    text.value = task.text;
    afterPatch(patchTaskText(sheetEl, sheet, selected));
    fillTaskForm({ keepText: true });
    commit();
  }

  $('#btn-reroll').addEventListener('click', () => {
    const task = sheet.tasks[selected];
    const next = task?.generator ? rollTask(task.generator) : null;
    if (!next) {
      toast('Mit diesen Einstellungen lässt sich keine Aufgabe erzeugen.');
      return;
    }
    replaceTaskContent(task, next);
  });

  $('#btn-gen-edit').addEventListener('click', async () => {
    const task = sheet.tasks[selected];
    if (!task?.generator) return;
    const result = await app.generator.open({ mode: 'edit-task', spec: task.generator, sheet });
    if (!result || !sheet?.tasks[selected]) return;
    replaceTaskContent(sheet.tasks[selected], result.tasks[0]);
  });
  $('#btn-task-bank').addEventListener('click', () => {
    if (sheet?.tasks[selected]) app.saveToBank(sheet.tasks[selected], sheet);
  });

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
    if (!snapshot || !sheet) return;
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
    if (!sheet || document.body.dataset.view !== 'editor') return;
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

  // --- Reiter, Menü -------------------------------------------------------------------------
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

  $('#btn-library').addEventListener('click', () => app.go('#/'));
  $('#btn-menu').addEventListener('click', () => $('#dlg-menu').showModal());
  const fromMenu = (id, fn) =>
    $(id).addEventListener('click', async () => {
      $('#dlg-menu').close();
      await fn();
    });
  fromMenu('#m-new', () => app.createSheet());
  fromMenu('#m-dup', () => app.duplicateSheet(sheet));
  fromMenu('#m-file', () => app.backup.open({ sheets: [sheet] }));
  fromMenu('#m-del', () => app.deleteSheet(sheet));
  fromMenu('#m-settings', () => app.openSettings());
  fromMenu('#m-diag', () => app.openDiagnostics());

  // --- PDF ----------------------------------------------------------------------------------
  const actionButton = (label, onClick, primary = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = primary ? 'btn btn-primary' : 'btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  async function exportPdf() {
    await flush();
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

  // --- Hintergrundereignisse ----------------------------------------------------------------
  new ResizeObserver(() => {
    if (!sheet || !previewSize) return;
    fitPreview(wrapper, sheetEl, previewSize);
    updateOverlay();
  }).observe(wrapper);
  document.fonts?.ready.then(() => sheet && afterPatch(autoFit(sheetEl)));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  return { open, close, flush, discard, getSheet: () => sheet, getLastExport: () => lastExport };
}
