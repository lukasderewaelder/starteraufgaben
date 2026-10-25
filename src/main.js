// Meilenstein 0 (Technik-Test): ein festes Beispielblatt, PDF-Export, Formel-Editor und Diagnose.
import { FORMATS, DEFAULT_FORMAT } from './formats.js';
import { renderSheet, fitPreview, SOLUTION_STYLES } from './sheet.js';
import { createPdf, pdfFile, canSharePdf, sharePdf, downloadPdf, openPdf, safeFilename } from './export-pdf.js';
import { collectDiagnostics, diagnosticsToText } from './diagnose.js';

const $ = (selector) => document.querySelector(selector);

const SAMPLE_TASKS = [
  { text: 'Berechne:\n$7 \\cdot 5$', solutionStyle: 'leer' },
  { text: 'Runde die Zahl 388 auf Hunderter.', solutionStyle: 'kariert' },
  { text: 'Wie viele Sekunden hat eine Minute?', solutionStyle: 'liniert' },
  { text: 'Vereinfache: $\\frac{3}{4} + \\frac{1}{8}$', solutionStyle: 'punkte' },
  { text: 'Wie viel sind 25 % von 80?', solutionStyle: 'leer' },
  { text: 'Schreibe als Dezimalzahl: $\\frac{3}{5}$', solutionStyle: 'kariert' },
  { text: 'Welche der Figuren sind Dreiecke?', solutionStyle: 'leer' },
];

const sheet = {
  title: 'Starteraufgaben',
  number: '1',
  instructions: 'Löse die Aufgaben in den ersten 5 Minuten.',
  date: new Date().toISOString().slice(0, 10),
  klasse: '7b',
  zeit: '5 Min.',
  format: DEFAULT_FORMAT,
  solutionDefault: 'leer',
  taskCount: 4,
  tasks: [],
};

function syncTasks() {
  while (sheet.tasks.length < sheet.taskCount) {
    sheet.tasks.push({ weight: 1, ...SAMPLE_TASKS[sheet.tasks.length] });
  }
  sheet.tasks.length = sheet.taskCount;
}

const sheetEl = $('#sheet');
const wrapper = $('#preview-wrapper');
let lastExport = null;
let size;

function redraw() {
  syncTasks();
  size = renderSheet(sheetEl, sheet);
  fitPreview(wrapper, sheetEl, size);
  $('#out-count').value = String(sheet.taskCount);
}

new ResizeObserver(() => size && fitPreview(wrapper, sheetEl, size)).observe(wrapper);

// --- Einstellungen -------------------------------------------------------------------------
const selFormat = $('#sel-format');
for (const f of Object.values(FORMATS)) selFormat.add(new Option(f.label, f.id));
selFormat.value = sheet.format;
selFormat.addEventListener('change', () => {
  sheet.format = selFormat.value;
  redraw();
});

const selSolution = $('#sel-solution');
for (const [id, label] of Object.entries(SOLUTION_STYLES)) selSolution.add(new Option(label, id));
selSolution.value = sheet.solutionDefault;
selSolution.addEventListener('change', () => {
  sheet.solutionDefault = selSolution.value;
  sheet.tasks.forEach((t) => delete t.solutionStyle);
  redraw();
});

const txtTask1 = $('#txt-task1');
txtTask1.addEventListener('input', () => {
  sheet.tasks[0].text = txtTask1.value;
  requestAnimationFrame(redraw);
});

$('#btn-fewer').addEventListener('click', () => {
  sheet.taskCount = Math.max(3, sheet.taskCount - 1);
  redraw();
});
$('#btn-more').addEventListener('click', () => {
  sheet.taskCount = Math.min(7, sheet.taskCount + 1);
  redraw();
});

// --- PDF -------------------------------------------------------------------------------------
const btnPdf = $('#btn-pdf');
const pdfResult = $('#pdf-result');

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2).replace('.', ',')} MB`;
}

function actionButton(label, onClick, primary = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = primary ? 'btn btn-primary' : 'btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function showPdfResult(res, file) {
  const box = document.createElement('div');
  box.className = 'box';
  const info = document.createElement('p');
  info.textContent = `PDF fertig: ${mb(file.size)}, ${(res.ms / 1000).toFixed(1).replace('.', ',')} s, Auflösung ${res.scale}×.`;
  const actions = document.createElement('div');
  actions.className = 'actions';
  // Teilen braucht eine frische Nutzeraktion – deshalb ein eigener Knopf statt Auto-Aufruf nach dem Rendern.
  if (canSharePdf(file)) {
    actions.append(
      actionButton('Teilen …', async () => {
        try {
          info.textContent = `Teilen: ${await sharePdf(file)}.`;
        } catch (err) {
          info.textContent = `Teilen nicht möglich (${err.message}). Bitte „Herunterladen“ nehmen.`;
        }
      }, true),
    );
  }
  actions.append(
    actionButton('Herunterladen', () => downloadPdf(res.blob, file.name), !canSharePdf(file)),
    actionButton('Öffnen', () => openPdf(res.blob)),
  );
  box.append(info, actions);
  pdfResult.replaceChildren(box);
}

function showPdfError(err) {
  const box = document.createElement('div');
  box.className = 'box error';
  box.textContent = `PDF konnte nicht erstellt werden: ${err.message}`;
  pdfResult.replaceChildren(box);
}

btnPdf.addEventListener('click', async () => {
  btnPdf.disabled = true;
  btnPdf.textContent = 'Erstelle PDF …';
  pdfResult.replaceChildren();
  try {
    const res = await createPdf(sheetEl, sheet.format);
    lastExport = res;
    const name = `${safeFilename(`${sheet.title}_${sheet.number}`)}.pdf`;
    showPdfResult(res, pdfFile(res.blob, name));
  } catch (err) {
    showPdfError(err);
  } finally {
    btnPdf.disabled = false;
    btnPdf.textContent = 'PDF erstellen';
    refreshDiagnostics();
  }
});

// --- Formel-Editor ---------------------------------------------------------------------------
const btnMath = $('#btn-math');
const mathArea = $('#math-area');
let mathField = null;

btnMath.addEventListener('click', async () => {
  btnMath.disabled = true;
  btnMath.textContent = 'Lade Formel-Editor …';
  try {
    const t0 = performance.now();
    const { MathfieldElement } = await import('../vendor/mathlive/mathlive.min.mjs');
    // Schriften liefert KaTeX bereits (gleiche Dateien); Töne brauchen wir nicht.
    MathfieldElement.fontsDirectory = null;
    MathfieldElement.soundsDirectory = null;
    MathfieldElement.locale = 'de';
    mathField = new MathfieldElement();
    mathField.addEventListener('input', () => {
      $('#math-latex').textContent = mathField.value || '–';
    });
    $('#math-host').append(mathField);
    mathArea.hidden = false;
    btnMath.hidden = true;
    mathField.focus();
    console.info(`MathLive geladen in ${Math.round(performance.now() - t0)} ms`);
  } catch (err) {
    btnMath.disabled = false;
    btnMath.textContent = 'Formel-Editor starten (Fehler – nochmal versuchen)';
    console.error(err);
  }
});

$('#btn-math-insert').addEventListener('click', () => {
  const latex = mathField?.value?.trim();
  if (!latex) return;
  const task = sheet.tasks[0];
  task.text = `${task.text.replace(/\s+$/, '')}\n$${latex}$`;
  txtTask1.value = task.text;
  mathField.value = '';
  $('#math-latex').textContent = '–';
  redraw();
});

// --- Diagnose --------------------------------------------------------------------------------
const diagList = $('#diag-list');
let diagRows = [];

async function refreshDiagnostics() {
  diagRows = await collectDiagnostics(lastExport);
  diagList.replaceChildren(
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
  const text = diagnosticsToText(diagRows);
  try {
    await navigator.clipboard.writeText(text);
    $('#diag-copied').hidden = false;
    setTimeout(() => ($('#diag-copied').hidden = true), 3000);
  } catch {
    window.prompt('Diagnose kopieren:', text);
  }
});

// --- Service Worker / Updates ----------------------------------------------------------------
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Lokal entwickeln ohne Cache-Überraschungen; zum Testen des Offline-Betriebs ?sw=1 anhängen.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (local && !location.search.includes('sw=1')) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  const banner = $('#update-banner');
  let reloading = false;

  const offerUpdate = (worker) => {
    banner.hidden = false;
    $('#btn-update').onclick = () => worker.postMessage('SKIP_WAITING');
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // erste Installation: kein Neuladen nötig
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        if (worker.state === 'activated') refreshDiagnostics();
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((err) => console.warn('Service Worker nicht registriert:', err));
}

// --- Start -----------------------------------------------------------------------------------
redraw();
txtTask1.value = sheet.tasks[0].text;
setupServiceWorker();
refreshDiagnostics();
