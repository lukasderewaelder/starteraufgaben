// Dialog „Zufallsaufgaben“: Typ wählen, Zahlenraum/Dezimalstellen u. a. einstellen, Vorschau mit Lösungen, neu würfeln.
import {
  MAX_ITEMS,
  buildTasks,
  checkSpec,
  defaultSpec,
  describeSpec,
  generatorGroups,
  getGenerator,
  normalizeParams,
  normalizeSpec,
  paramVisible,
  randomSeed,
  rollItems,
  taskCount,
} from './generators/index.js';
import { findTemplate } from './bank.js';
import { markupToHtml } from './markup.js';
import { $ } from './ui.js';

const NO_RESULT = 'Mit diesen Einstellungen lässt sich keine passende Aufgabe erzeugen – bitte den Zahlenraum anpassen.';
const MODES = {
  add: { title: 'Zufallsaufgaben hinzufügen', confirm: 'Hinzufügen' },
  'edit-task': { title: 'Zufallsaufgabe ändern', confirm: 'Übernehmen' },
  template: { title: 'Zufallsvorlage', confirm: 'Speichern' },
};

export function createGeneratorDialog(app) {
  const dialog = $('#dlg-gen');
  const typeSelect = $('#gen-type');
  const paramsBox = $('#gen-params');
  const countInput = $('#gen-count');
  const layoutSelect = $('#gen-layout');
  const layoutRow = $('#gen-layout-row');
  const preview = $('#gen-preview');
  const note = $('#gen-note');
  const okButton = $('#gen-ok');
  const templateButton = $('#gen-template');
  let state = null;
  let timer = null;

  for (const [groupName, list] of generatorGroups()) {
    const group = document.createElement('optgroup');
    group.label = groupName;
    for (const g of list) group.append(new Option(g.grades ? `${g.label} (Kl. ${g.grades})` : g.label, g.id));
    typeSelect.append(group);
  }

  // --- Einstellungen als Formular ------------------------------------------------------------
  const controlId = (key) => `gen-p-${key}`;

  function buildField(p) {
    const wrap = document.createElement('div');
    wrap.dataset.key = p.key;
    if (p.kind === 'bool') {
      wrap.className = 'field';
      const label = document.createElement('label');
      label.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = controlId(p.key);
      input.dataset.key = p.key;
      label.append(input, document.createTextNode(` ${p.label}`));
      wrap.append(label);
      return wrap;
    }
    wrap.className = 'field';
    if (p.kind === 'multi') {
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = p.label;
      const bar = document.createElement('div');
      bar.className = 'tagbar';
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', p.label);
      for (const [value, text] of p.options) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'pill-btn';
        chip.dataset.key = p.key;
        chip.dataset.value = value;
        chip.textContent = text;
        bar.append(chip);
      }
      wrap.append(label, bar);
      return wrap;
    }
    const label = document.createElement('label');
    label.htmlFor = controlId(p.key);
    label.textContent = p.label;
    let input;
    if (p.kind === 'select') {
      input = document.createElement('select');
      for (const [value, text] of p.options) input.add(new Option(text, value));
    } else {
      input = document.createElement('input');
      input.type = 'number';
      input.inputMode = 'numeric';
      input.step = '1';
      input.min = String(p.min);
      input.max = String(p.max);
    }
    input.id = controlId(p.key);
    input.dataset.key = p.key;
    wrap.append(label, input);
    if (p.hint) {
      const hint = document.createElement('small');
      hint.className = 'muted';
      hint.textContent = p.hint;
      wrap.append(hint);
    }
    return wrap;
  }

  function buildParamForm() {
    paramsBox.replaceChildren();
    const def = getGenerator(state.spec.type);
    let row = null;
    let rowName = null;
    for (const p of def.params) {
      const field = buildField(p);
      if (p.row) {
        if (rowName !== p.row) {
          row = document.createElement('div');
          row.className = 'field-row';
          paramsBox.append(row);
          rowName = p.row;
        }
        row.append(field);
      } else {
        rowName = null;
        paramsBox.append(field);
      }
    }
  }

  /** Zeigt die (bereinigten) Werte in den Feldern, blendet Felder mit nicht erfüllter Bedingung aus. */
  function syncControls({ skip = null } = {}) {
    const def = getGenerator(state.spec.type);
    const params = normalizeParams(def, state.spec.params);
    for (const p of def.params) {
      const wrap = paramsBox.querySelector(`[data-key="${p.key}"]`);
      if (wrap) wrap.hidden = !paramVisible(p, params);
      if (p.kind === 'multi') {
        paramsBox.querySelectorAll(`.pill-btn[data-key="${p.key}"]`).forEach((chip) => {
          chip.setAttribute('aria-pressed', String(params[p.key].includes(chip.dataset.value)));
        });
        continue;
      }
      const input = $(`#${controlId(p.key)}`, paramsBox);
      if (!input || input === skip) continue;
      if (p.kind === 'bool') input.checked = Boolean(params[p.key]);
      else input.value = String(params[p.key]);
    }
    const spec = currentSpec();
    typeSelect.value = spec.type;
    if (countInput !== skip) countInput.value = String(spec.count);
    layoutSelect.value = spec.layout;
    countInput.max = String(state.mode === 'add' && spec.layout === 'single' ? Math.max(1, Math.min(MAX_ITEMS, state.room)) : MAX_ITEMS);
    layoutRow.hidden = state.locked;
  }

  // --- Würfeln und Vorschau ------------------------------------------------------------------
  function currentSpec() {
    const spec = normalizeSpec(state.spec);
    if (state.locked) Object.assign(spec, { count: 1, layout: 'single' });
    if (state.mode === 'add' && spec.layout === 'single') spec.count = Math.min(spec.count, Math.max(1, state.room));
    return spec;
  }

  function regenerate() {
    const spec = currentSpec();
    while (state.seeds.length < MAX_ITEMS) state.seeds.push(randomSeed());
    state.problem = checkSpec(spec);
    state.items = state.problem ? [] : rollItems(spec, state.seeds);
    renderPreview(spec);
  }

  function renderPreview(spec) {
    const def = getGenerator(spec.type);
    preview.replaceChildren();
    let message = state.problem;
    if (!message && state.items.some((it) => !it)) message = NO_RESULT;
    if (!message && state.mode === 'add' && taskCount(spec) > state.room) message = `Es passen nur noch ${state.room} Aufgaben aufs Blatt.`;
    note.className = message ? 'result-error' : 'muted';
    note.textContent = message ?? describeSpec(spec);
    okButton.disabled = Boolean(message);
    templateButton.disabled = Boolean(state.problem) || state.items.some((it) => !it);
    const tasks = state.mode === 'add' ? taskCount(spec) : 1;
    okButton.textContent = state.mode === 'add' ? `${MODES.add.confirm} (${tasks} Aufgabe${tasks === 1 ? '' : 'n'})` : MODES[state.mode].confirm;
    if (state.problem) return;

    const instruction = document.createElement('div');
    instruction.className = 'gen-instruction task-preview';
    instruction.innerHTML = markupToHtml(def.instruction(normalizeParams(def, spec.params)));
    preview.append(instruction);
    const labelled = spec.count > 1;
    state.items.forEach((item, i) => {
      if (!item) return;
      const row = document.createElement('div');
      row.className = 'gen-item';
      const label = document.createElement('span');
      label.className = 'gen-label';
      label.textContent = labelled ? (spec.layout === 'parts' ? `${'abcdefgh'[i]})` : `${i + 1}.`) : '';
      const body = document.createElement('div');
      const text = document.createElement('div');
      text.className = 'task-preview gen-text';
      text.innerHTML = markupToHtml(item.text);
      const solution = document.createElement('div');
      solution.className = 'gen-solution';
      solution.innerHTML = `Lösung: ${markupToHtml(item.solution)}`;
      body.append(text, solution);
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'btn btn-icon gen-again';
      again.dataset.index = String(i);
      again.textContent = '↻';
      again.setAttribute('aria-label', `Aufgabe ${i + 1} neu würfeln`);
      again.title = 'Diese Aufgabe neu würfeln';
      row.append(label, body, again);
      preview.append(row);
    });
  }

  const scheduleRegenerate = () => {
    clearTimeout(timer);
    timer = setTimeout(regenerate, 120);
  };

  // --- Ereignisse ----------------------------------------------------------------------------
  const fixParams = () => {
    state.spec.params = normalizeParams(getGenerator(state.spec.type), state.spec.params);
  };

  paramsBox.addEventListener('input', (e) => {
    const input = e.target;
    if (input.type !== 'number' || input.value === '') return;
    state.spec.params[input.dataset.key] = Number(input.value);
    scheduleRegenerate();
  });
  paramsBox.addEventListener('change', (e) => {
    const input = e.target;
    const key = input.dataset?.key;
    if (!key) return;
    if (input.type === 'checkbox') state.spec.params[key] = input.checked;
    else if (input.tagName === 'SELECT') state.spec.params[key] = input.value;
    else if (input.value !== '') state.spec.params[key] = Number(input.value);
    fixParams();
    syncControls();
    clearTimeout(timer);
    regenerate();
  });
  paramsBox.addEventListener('click', (e) => {
    const chip = e.target.closest('.pill-btn[data-key]');
    if (!chip) return;
    const { key, value } = chip.dataset;
    const current = new Set(normalizeParams(getGenerator(state.spec.type), state.spec.params)[key]);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    state.spec.params[key] = [...current];
    fixParams();
    syncControls();
    regenerate();
  });

  typeSelect.addEventListener('change', () => {
    const type = typeSelect.value;
    const remembered = normalizeSpec(app.settings.generatorMemory?.[type]) ?? defaultSpec(type);
    state.spec = remembered;
    state.seeds = [];
    buildParamForm();
    syncControls();
    regenerate();
  });
  countInput.addEventListener('input', () => {
    if (countInput.value === '') return;
    state.spec.count = Number(countInput.value);
    scheduleRegenerate();
  });
  countInput.addEventListener('change', () => {
    state.spec = currentSpec();
    syncControls();
    regenerate();
  });
  layoutSelect.addEventListener('change', () => {
    state.spec.layout = layoutSelect.value;
    state.spec = currentSpec();
    syncControls();
    regenerate();
  });
  $('#gen-reroll').addEventListener('click', () => {
    state.seeds = [];
    regenerate();
  });
  preview.addEventListener('click', (e) => {
    const again = e.target.closest('.gen-again');
    if (!again) return;
    state.seeds[Number(again.dataset.index)] = randomSeed();
    regenerate();
  });

  const remember = (spec) =>
    app.setSettings({
      generatorMemory: { ...(app.settings.generatorMemory ?? {}), [spec.type]: spec },
      lastGeneratorType: spec.type,
    });

  okButton.addEventListener('click', () => {
    const spec = currentSpec();
    if (state.problem || state.items.some((it) => !it)) return;
    const done = state.resolve;
    state.resolve = null;
    remember(spec).catch((err) => console.warn(err));
    dialog.close();
    done?.({ spec, tasks: buildTasks(spec, state.items) });
  });

  templateButton.addEventListener('click', async () => {
    const spec = currentSpec();
    if (state.problem || state.items.some((it) => !it)) return;
    await app.refreshBank();
    if (findTemplate(app.bank, spec)) {
      // Meldungen außerhalb dieses (modalen) Dialogs wären verdeckt, daher hier im Dialog zeigen.
      note.className = 'muted';
      note.textContent = 'Diese Zufallsvorlage ist schon in der Aufgabenbank.';
      return;
    }
    const [sample] = buildTasks(spec, state.items);
    const saved = await app.saveToBank({ text: sample.text, imageId: null, solution: '', generator: spec }, state.sheet ?? { klasse: '' });
    if (saved) {
      remember(spec).catch((err) => console.warn(err));
      note.className = 'muted';
      note.textContent = 'Als Vorlage in der Aufgabenbank gespeichert.';
    }
  });

  dialog.addEventListener('close', () => {
    clearTimeout(timer);
    const done = state?.resolve;
    if (state) state.resolve = null;
    done?.(null);
  });

  /**
   * Öffnet den Dialog. Gibt { spec, tasks } zurück oder null (abgebrochen).
   * mode: 'add' (Aufgaben ans Blatt hängen; room = freie Plätze), 'edit-task' (Einstellungen einer Aufgabe ändern),
   * 'template' (Bank-Vorlage anlegen/ändern). `sheet` liefert die Klasse für die Vorbelegung beim Speichern in die Bank.
   */
  function open({ mode = 'add', spec = null, room = MAX_ITEMS, sheet = null } = {}) {
    if (dialog.open) return Promise.resolve(null);
    const memory = app.settings.generatorMemory ?? {};
    const start =
      normalizeSpec(spec) ??
      normalizeSpec(memory[app.settings.lastGeneratorType]) ??
      defaultSpec(app.settings.lastGeneratorType) ??
      defaultSpec('arith');
    state = {
      mode,
      room,
      sheet,
      spec: start,
      seeds: [],
      items: [],
      problem: null,
      resolve: null,
      locked: mode === 'edit-task' && start.layout === 'single',
    };
    $('#gen-title').textContent = MODES[mode].title;
    templateButton.hidden = mode === 'template';
    typeSelect.value = start.type;
    buildParamForm();
    syncControls();
    regenerate();
    dialog.showModal();
    return new Promise((resolve) => {
      state.resolve = resolve;
    });
  }

  return { open };
}
