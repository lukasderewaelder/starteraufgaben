// Aufgabenbank: Ansicht (Liste + Bearbeiten), Auswahl-Dialog für den Blatt-Editor und „In Bank speichern“.
import { GRADES, facets, filterBank, findDuplicate, findTemplate, gradeFromClass, newBankItem, parseTags, sortBank, topicSuggestions } from './bank.js';
import { describeSpec, rollTask, taskCount } from './generators/index.js';
import { cachedImageUrl, imageUrl, prepareImage, rememberImage } from './images.js';
import { markupToHtml } from './markup.js';
import { uid } from './model.js';
import { wireTextToolbar } from './toolbar.js';
import { $, fill, toast } from './ui.js';

const gradeLabel = (g) => `Klasse ${g}`;
const gradeEntries = () => [['', '– keine –'], ...GRADES.map((g) => [g, gradeLabel(g)])];

/** Filterleiste (Suche, Klassenstufe, Thema, Schlagwörter) – gemeinsam für die Bank-Ansicht und den Auswahl-Dialog. */
function createFilters({ search, grade, topic, tags, onChange }) {
  const state = { query: '', klassenstufe: '', thema: '', tag: '' };
  search.addEventListener('input', () => {
    state.query = search.value;
    onChange();
  });
  grade.addEventListener('change', () => {
    state.klassenstufe = grade.value;
    onChange();
  });
  topic.addEventListener('change', () => {
    state.thema = topic.value;
    onChange();
  });
  tags.addEventListener('click', (e) => {
    const button = e.target.closest('[data-tag]');
    if (!button) return;
    state.tag = state.tag.toLowerCase() === button.dataset.tag.toLowerCase() ? '' : button.dataset.tag;
    onChange();
  });
  return {
    state,
    /** Füllt die Auswahlfelder mit den vorhandenen Werten; die Auswahl bleibt, solange es sie noch gibt. */
    refresh(items) {
      const f = facets(items);
      if (!f.klassenstufen.includes(state.klassenstufe)) state.klassenstufe = '';
      if (!f.themen.includes(state.thema)) state.thema = '';
      if (!f.tags.some((t) => t.tag.toLowerCase() === state.tag.toLowerCase())) state.tag = '';
      fill(grade, f.klassenstufen.map((g) => [g, gradeLabel(g)]), 'Alle Klassen');
      fill(topic, f.themen.map((t) => [t, t]), 'Alle Themen');
      grade.value = state.klassenstufe;
      topic.value = state.thema;
      tags.replaceChildren(
        ...f.tags.map(({ tag, count }) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'pill-btn';
          b.dataset.tag = tag;
          b.setAttribute('aria-pressed', String(tag.toLowerCase() === state.tag.toLowerCase()));
          b.textContent = `${tag} (${count})`;
          return b;
        }),
      );
    },
    reset() {
      Object.assign(state, { query: '', klassenstufe: '', thema: '', tag: '' });
      search.value = '';
    },
    apply: (items) => sortBank(filterBank(items, state)),
  };
}

function pill(text, className = '') {
  const span = document.createElement('span');
  span.className = `pill ${className}`.trim();
  span.textContent = text;
  return span;
}

function buildCard(item, { selectable = false, selected = false, highlighted = false } = {}) {
  const card = document.createElement('article');
  card.className = `bank-card${selected || highlighted ? ' selected' : ''}`;
  card.dataset.id = item.id;
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'bank-open';
  open.dataset.id = item.id;
  if (selectable) open.setAttribute('aria-pressed', String(selected));

  const text = document.createElement('div');
  text.className = 'task-preview';
  text.innerHTML = markupToHtml(item.text);
  open.append(text);

  const url = item.imageId ? cachedImageUrl(item.imageId) : null;
  if (url) {
    const img = document.createElement('img');
    img.className = 'bank-img';
    img.alt = '';
    img.src = url;
    open.append(img);
  }
  const meta = document.createElement('div');
  meta.className = 'bank-meta';
  if (item.generator) meta.append(pill('Zufallsvorlage', 'grade'));
  if (item.klassenstufe) meta.append(pill(gradeLabel(item.klassenstufe), 'grade'));
  if (item.thema) meta.append(pill(item.thema));
  item.tags.forEach((t) => meta.append(pill(`#${t}`)));
  if (meta.childElementCount) open.append(meta);
  card.append(open);

  if (selectable) {
    const mark = document.createElement('span');
    mark.className = 'bank-pick-mark';
    mark.textContent = selected ? '✓' : '';
    card.append(mark);
  }
  return card;
}

export function createBankUi(app) {
  const grid = $('#bank-grid');
  const editor = $('#bank-editor');
  const text = $('#bank-text');
  let current = null; // Aufgabe im Bearbeiten-Bereich (Objekt aus app.bank)
  let saveTimer = null;
  let dirty = false;
  let renderToken = 0;

  const preloadImages = (items) => Promise.all(items.map((i) => (i.imageId ? imageUrl(app.store, i.imageId) : null)));
  const setSaveState = (s) => {
    $('#bank-save-state').textContent = s;
  };
  const refreshTopicList = () => {
    $('#topic-list').replaceChildren(...topicSuggestions(app.bank).map((t) => new Option(t)));
  };

  fill($('#bank-f-grade'), gradeEntries());
  fill($('#tb-grade'), gradeEntries());

  // --- Liste ---------------------------------------------------------------------------------
  const filters = createFilters({
    search: $('#bank-search'),
    grade: $('#bank-grade'),
    topic: $('#bank-topic'),
    tags: $('#bank-tags'),
    onChange: () => renderList(),
  });

  async function renderList() {
    const token = (renderToken += 1);
    filters.refresh(app.bank);
    const items = filters.apply(app.bank);
    await preloadImages(items);
    if (token !== renderToken) return;
    grid.replaceChildren(...items.map((item) => buildCard(item, { highlighted: item.id === current?.id })));
    const empty = $('#bank-empty');
    if (!app.bank.length) {
      empty.textContent = 'Die Aufgabenbank ist noch leer. Lege oben eine „+ Neue Aufgabe“ an – oder speichere im Blatt-Editor eine Aufgabe mit „In Bank speichern“.';
      empty.hidden = false;
    } else if (!items.length) {
      empty.textContent = 'Keine Aufgaben gefunden.';
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }
  }

  function refreshCard(item) {
    const old = grid.querySelector(`.bank-card[data-id="${item.id}"]`);
    if (old) old.replaceWith(buildCard(item, { highlighted: item.id === current?.id }));
  }

  // --- Bearbeiten ---------------------------------------------------------------------------
  async function flushSave() {
    clearTimeout(saveTimer);
    if (!dirty || !current) return;
    dirty = false;
    try {
      await app.store.saveBankItem(current);
      app.noteChange();
      setSaveState(app.store.persistent ? 'Gespeichert' : 'Nicht dauerhaft gespeichert');
    } catch (err) {
      console.error(err);
      dirty = true;
      setSaveState('Speichern fehlgeschlagen');
    }
  }

  function touch() {
    if (!current) return;
    current.updatedAt = Date.now();
    dirty = true;
    setSaveState('Speichert …');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await flushSave();
      filters.refresh(app.bank);
      refreshTopicList();
    }, 500);
    refreshCard(current);
  }

  function fillEditor() {
    const template = Boolean(current.generator);
    $('#bank-template').hidden = !template;
    $('#bank-text-block').hidden = template;
    $('#bank-image-block').hidden = template;
    if (template) $('#bank-template-desc').textContent = describeSpec(current.generator);
    text.value = current.text;
    $('#bank-f-grade').value = current.klassenstufe;
    $('#bank-f-topic').value = current.thema;
    $('#bank-f-tags').value = current.tags.join(', ');
    updateImageUi();
    $('#bank-preview').innerHTML = markupToHtml(current.text);
  }

  function updateImageUi() {
    const url = current.imageId ? cachedImageUrl(current.imageId) : null;
    $('#bank-thumb').hidden = !url;
    if (url) $('#bank-thumb').src = url;
    $('#bank-image-remove').hidden = !current.imageId;
    $('#bank-lbl-image').textContent = current.imageId ? 'Bild ersetzen' : 'Bild hinzufügen';
  }

  async function openEditor(id, { focus = false } = {}) {
    const item = app.bank.find((i) => i.id === id);
    if (!item) return;
    await closeEditor();
    current = item;
    await preloadImages([item]);
    fillEditor();
    editor.hidden = false;
    grid.querySelectorAll('.bank-card.selected').forEach((c) => c.classList.remove('selected'));
    grid.querySelector(`.bank-card[data-id="${id}"]`)?.classList.add('selected');
    if (focus) text.focus();
    else editor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Speichert, blendet den Bearbeiten-Bereich aus und entfernt Aufgaben, die leer geblieben sind. */
  async function closeEditor() {
    if (!current) return;
    await flushSave();
    const item = current;
    current = null;
    editor.hidden = true;
    grid.querySelector(`.bank-card[data-id="${item.id}"]`)?.classList.remove('selected');
    if (!item.generator && !item.text.trim() && !item.imageId) {
      await app.store.deleteBankItem(item.id);
      app.bank = app.bank.filter((i) => i.id !== item.id);
      await renderList();
    }
  }

  text.addEventListener('input', () => {
    if (!current) return;
    current.text = text.value;
    $('#bank-preview').innerHTML = markupToHtml(current.text);
    touch();
  });
  $('#bank-f-grade').addEventListener('change', (e) => {
    current.klassenstufe = e.target.value;
    touch();
  });
  $('#bank-f-topic').addEventListener('input', (e) => {
    current.thema = e.target.value.trim().slice(0, 80);
    touch();
  });
  $('#bank-f-tags').addEventListener('input', (e) => {
    current.tags = parseTags(e.target.value);
    touch();
  });
  wireTextToolbar({ toolbar: $('#bank-editor .toolbar'), textarea: text, app, isActive: () => Boolean(current) });

  $('#bank-f-image').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !current) return;
    try {
      const image = await prepareImage(file);
      await app.store.saveImage(image);
      rememberImage(image.id, image.blob);
      current.imageId = image.id;
      updateImageUi();
      touch();
    } catch (err) {
      console.error(err);
      toast('Das Bild konnte nicht gelesen werden.');
    }
  });
  $('#bank-image-remove').addEventListener('click', () => {
    current.imageId = null;
    updateImageUi();
    touch();
  });

  $('#bank-new').addEventListener('click', async () => {
    const item = newBankItem({
      klassenstufe: filters.state.klassenstufe,
      thema: filters.state.thema,
      tags: filters.state.tag ? [filters.state.tag] : [],
    });
    app.bank.unshift(item);
    await app.store.saveBankItem(item);
    await renderList();
    await openEditor(item.id, { focus: true });
  });

  // Zufallsvorlagen: neu anlegen, Einstellungen ändern, neues Beispiel würfeln
  $('#bank-new-template').addEventListener('click', async () => {
    const result = await app.generator.open({ mode: 'template' });
    if (!result) return;
    const item = newBankItem({
      text: result.tasks[0].text,
      generator: result.spec,
      klassenstufe: filters.state.klassenstufe,
      thema: filters.state.thema,
      tags: filters.state.tag ? [filters.state.tag] : [],
    });
    app.bank.unshift(item);
    await app.store.saveBankItem(item);
    app.noteChange();
    await renderList();
    refreshTopicList();
    await openEditor(item.id);
  });

  $('#bank-template-edit').addEventListener('click', async () => {
    if (!current?.generator) return;
    const id = current.id;
    const result = await app.generator.open({ mode: 'template', spec: current.generator });
    if (!result || current?.id !== id) return;
    current.generator = result.spec;
    current.text = result.tasks[0].text;
    fillEditor();
    touch();
  });

  $('#bank-template-roll').addEventListener('click', () => {
    if (!current?.generator) return;
    const sample = rollTask(current.generator);
    if (!sample) {
      toast('Mit diesen Einstellungen lässt sich keine Aufgabe erzeugen.');
      return;
    }
    current.text = sample.text;
    $('#bank-preview').innerHTML = markupToHtml(current.text);
    touch();
  });

  $('#bank-dup').addEventListener('click', async () => {
    if (!current) return;
    await flushSave();
    const now = Date.now();
    const copy = { ...structuredClone(current), id: uid(), createdAt: now, updatedAt: now };
    app.bank.unshift(copy);
    await app.store.saveBankItem(copy);
    app.noteChange();
    await renderList();
    await openEditor(copy.id);
  });

  $('#bank-del').addEventListener('click', async () => {
    if (!current) return;
    const snapshot = structuredClone(current);
    clearTimeout(saveTimer);
    dirty = false;
    current = null;
    editor.hidden = true;
    await app.store.deleteBankItem(snapshot.id);
    app.bank = app.bank.filter((i) => i.id !== snapshot.id);
    await renderList();
    refreshTopicList();
    toast('Aufgabe gelöscht.', {
      action: 'Rückgängig',
      ms: 10_000,
      onAction: async () => {
        await app.store.saveBankItem(snapshot);
        app.bank = [snapshot, ...app.bank];
        await renderList();
        refreshTopicList();
      },
    });
  });

  $('#bank-close').addEventListener('click', () => closeEditor());
  grid.addEventListener('click', (e) => {
    const open = e.target.closest('.bank-open');
    if (open) openEditor(open.dataset.id, { focus: false });
  });
  $('#bank-back').addEventListener('click', () => app.go('#/'));

  // --- Ansicht ein-/ausblenden ----------------------------------------------------------------
  async function show() {
    document.body.dataset.view = 'bank';
    await app.refreshBank();
    refreshTopicList();
    editor.hidden = !current;
    await renderList();
    setSaveState('');
    window.scrollTo(0, 0);
  }

  /** Beim Verlassen der Ansicht (Router). */
  async function leave() {
    await closeEditor();
  }

  function clear() {
    renderToken += 1;
    grid.replaceChildren();
  }

  // --- Auswahl-Dialog für den Blatt-Editor ---------------------------------------------------
  const pickDialog = $('#dlg-pick');
  const pickList = $('#pick-list');
  let picked = [];
  let pickLimit = 0;
  let pickResolve = null;
  let pickToken = 0;

  const pickFilters = createFilters({
    search: $('#pick-search'),
    grade: $('#pick-grade'),
    topic: $('#pick-topic'),
    tags: $('#pick-tags'),
    onChange: () => renderPick(),
  });

  // Zufallsvorlagen mit „einzelnen Aufgaben“ belegen mehrere Plätze auf dem Blatt.
  const weightOf = (id) => {
    const item = app.bank.find((i) => i.id === id);
    return item?.generator ? taskCount(item.generator) : 1;
  };
  const usedPlaces = () => picked.reduce((sum, id) => sum + weightOf(id), 0);

  function updatePickNote(message = '') {
    const ok = $('#pick-ok');
    ok.disabled = picked.length === 0;
    ok.textContent = picked.length ? `Hinzufügen (${picked.length})` : 'Hinzufügen';
    $('#pick-note').textContent = message || `${picked.length} ausgewählt – auf dem Blatt ist noch Platz für ${pickLimit - usedPlaces()}.`;
  }

  async function renderPick() {
    const token = (pickToken += 1);
    pickFilters.refresh(app.bank);
    const items = pickFilters.apply(app.bank);
    await preloadImages(items);
    if (token !== pickToken) return;
    pickList.replaceChildren(...items.map((item) => buildCard(item, { selectable: true, selected: picked.includes(item.id) })));
    $('#pick-empty').hidden = items.length > 0;
    $('#pick-empty').textContent = 'Keine Aufgaben gefunden.';
  }

  pickList.addEventListener('click', (e) => {
    const open = e.target.closest('.bank-open');
    if (!open) return;
    const id = open.dataset.id;
    if (picked.includes(id)) {
      picked = picked.filter((x) => x !== id);
    } else if (usedPlaces() + weightOf(id) > pickLimit) {
      const left = pickLimit - usedPlaces();
      updatePickNote(left > 0 ? `Es passen nur noch ${left} Aufgaben aufs Blatt.` : 'Das Blatt ist voll.');
      return;
    } else {
      picked.push(id);
    }
    const card = open.closest('.bank-card');
    const on = picked.includes(id);
    card.classList.toggle('selected', on);
    open.setAttribute('aria-pressed', String(on));
    card.querySelector('.bank-pick-mark').textContent = on ? '✓' : '';
    updatePickNote();
  });

  $('#pick-ok').addEventListener('click', () => {
    const items = picked.map((id) => app.bank.find((i) => i.id === id)).filter(Boolean);
    const done = pickResolve;
    pickResolve = null;
    pickDialog.close();
    done?.(items);
  });
  pickDialog.addEventListener('close', () => {
    const done = pickResolve;
    pickResolve = null;
    done?.(null);
  });

  /** Öffnet die Auswahl. Gibt die gewählten Bank-Aufgaben (in Auswahl-Reihenfolge) zurück oder null. `room` = freie Plätze auf dem Blatt. */
  async function pick({ room }) {
    if (room <= 0) {
      toast('Das Blatt ist voll.');
      return null;
    }
    await app.refreshBank();
    if (!app.bank.length) {
      toast('Die Aufgabenbank ist noch leer. Speichere Aufgaben mit „In Bank speichern“.');
      return null;
    }
    picked = [];
    pickLimit = room;
    pickFilters.reset();
    await renderPick();
    updatePickNote();
    pickDialog.showModal();
    return new Promise((resolve) => {
      pickResolve = resolve;
    });
  }

  // --- „In Bank speichern“ ------------------------------------------------------------------
  const saveDialog = $('#dlg-tobank');
  let saveResolve = null;

  $('#tb-ok').addEventListener('click', () => {
    const done = saveResolve;
    saveResolve = null;
    saveDialog.close();
    done?.({ klassenstufe: $('#tb-grade').value, thema: $('#tb-topic').value, tags: parseTags($('#tb-tags').value) });
  });
  saveDialog.addEventListener('close', () => {
    const done = saveResolve;
    saveResolve = null;
    done?.(null);
  });

  /** Fragt Klassenstufe/Thema/Schlagwörter ab und legt eine Kopie der Aufgabe in der Bank an. */
  async function saveTask(task, sheet) {
    const template = Boolean(task.generator);
    if (!template && !task.text.trim() && !task.imageId) {
      toast('Die Aufgabe ist noch leer.');
      return null;
    }
    await app.refreshBank();
    if (template ? findTemplate(app.bank, task.generator) : findDuplicate(app.bank, task.text, task.imageId)) {
      // Im Auswahl-Dialog (modal) wäre ein Toast verdeckt – dort zeigt der Aufrufer selbst eine Meldung.
      toast(template ? 'Diese Zufallsvorlage ist schon in der Aufgabenbank.' : 'Diese Aufgabe ist schon in der Aufgabenbank.');
      return null;
    }
    refreshTopicList();
    $('#tb-grade').value = gradeFromClass(sheet.klasse) || app.settings.lastBankKlassenstufe || '';
    $('#tb-topic').value = app.settings.lastBankThema || '';
    $('#tb-tags').value = '';
    $('#tobank-preview').innerHTML = markupToHtml(task.text);
    const answer = new Promise((resolve) => {
      saveResolve = resolve;
    });
    saveDialog.showModal();
    const meta = await answer;
    if (!meta) return null;
    const item = newBankItem({ text: task.text, imageId: task.imageId, solution: task.solution, generator: task.generator ?? null, ...meta });
    await app.store.saveBankItem(item);
    app.bank = [item, ...app.bank];
    app.noteChange();
    await app.setSettings({ lastBankKlassenstufe: item.klassenstufe, lastBankThema: item.thema });
    toast('In der Aufgabenbank gespeichert.');
    return item;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.addEventListener('pagehide', flushSave);

  return { show, leave, clear, pick, saveTask, flush: flushSave };
}
