// Datenmodell: Blätter und Aufgaben. Reine Funktionen (kein DOM, kein Speicher) – gut testbar.
import { DEFAULT_FORMAT, FORMATS } from './formats.js';

export const SCHEMA_VERSION = 1;
export const SOLUTION_STYLE_IDS = ['leer', 'kariert', 'liniert', 'punkte'];
export const WEIGHTS = [1, 1.5, 2];
export const MAX_TASKS = 12;

const LIMITS = { title: 200, short: 60, instructions: 2000, text: 5000 };

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const DEFAULT_SETTINGS = Object.freeze({
  defaultFormat: DEFAULT_FORMAT,
  defaultSolutionStyle: 'leer',
  formulaEditor: true, // Formel-Knopf öffnet den visuellen Editor (MathLive); aus = `$…$` selbst tippen
  // Sicherungs-Erinnerung (siehe backup.js)
  lastBackupAt: 0,
  changesSinceBackup: 0,
  firstChangeAt: 0,
  reminderSnoozedUntil: 0,
});

export function newTask(text = '') {
  return { id: uid(), text, imageId: null, solutionStyle: null, weight: 1, solution: '' };
}

export function newSheet({ number = '1', settings = DEFAULT_SETTINGS, taskTexts = ['', '', '', ''], now = Date.now() } = {}) {
  return {
    id: uid(),
    schemaVersion: SCHEMA_VERSION,
    title: 'Starteraufgaben',
    number: String(number),
    instructions: '',
    date: todayIso(new Date(now)),
    klasse: '',
    zeit: '',
    format: FORMATS[settings.defaultFormat] ? settings.defaultFormat : DEFAULT_FORMAT,
    solutionDefault: SOLUTION_STYLE_IDS.includes(settings.defaultSolutionStyle) ? settings.defaultSolutionStyle : 'leer',
    tasks: taskTexts.map((t) => newTask(t)),
    createdAt: now,
    updatedAt: now,
  };
}

/** Das Lösungsfeld einer Aufgabe: eigener Stil oder der Standard des Blatts. */
export function effectiveSolutionStyle(sheet, task) {
  return task.solutionStyle && SOLUTION_STYLE_IDS.includes(task.solutionStyle) ? task.solutionStyle : sheet.solutionDefault;
}

function str(value, max, fallback = '') {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

/** Macht beliebige (z. B. importierte) Daten zu einem gültigen Blatt oder gibt null zurück. */
export function normalizeSheet(raw, { now = Date.now() } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const tasks = Array.isArray(raw.tasks) ? raw.tasks.slice(0, MAX_TASKS) : [];
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 100) : uid(),
    schemaVersion: SCHEMA_VERSION,
    title: str(raw.title, LIMITS.title, 'Starteraufgaben'),
    number: str(raw.number, LIMITS.short, '1'),
    instructions: str(raw.instructions, LIMITS.instructions),
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date ?? '') ? raw.date : '',
    klasse: str(raw.klasse, LIMITS.short),
    zeit: str(raw.zeit, LIMITS.short),
    format: FORMATS[raw.format] ? raw.format : DEFAULT_FORMAT,
    solutionDefault: SOLUTION_STYLE_IDS.includes(raw.solutionDefault) ? raw.solutionDefault : 'leer',
    tasks: tasks.map((t) => ({
      id: typeof t?.id === 'string' && t.id ? t.id.slice(0, 100) : uid(),
      text: str(t?.text, LIMITS.text),
      imageId: typeof t?.imageId === 'string' && t.imageId ? t.imageId : null,
      solutionStyle: SOLUTION_STYLE_IDS.includes(t?.solutionStyle) ? t.solutionStyle : null,
      weight: WEIGHTS.includes(t?.weight) ? t.weight : 1,
      solution: str(t?.solution, LIMITS.text),
    })),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

/** Nächste Blattnummer: größte vorhandene Zahl + 1 (nicht-numerische Nummern werden ignoriert). */
export function nextNumber(sheets) {
  const nums = sheets.map((s) => Number.parseInt(s.number, 10)).filter(Number.isFinite);
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

export function duplicateSheet(sheet, { number, now = Date.now() } = {}) {
  const copy = structuredClone(sheet);
  copy.id = uid();
  copy.number = String(number ?? sheet.number);
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.tasks.forEach((t) => {
    t.id = uid();
  });
  return copy;
}

export function duplicateTask(task) {
  return { ...structuredClone(task), id: uid() };
}

/** Verschiebt eine Aufgabe; gibt den neuen Index zurück (unverändert bei ungültigem Ziel). */
export function moveTask(sheet, from, to) {
  if (from === to || to < 0 || to >= sheet.tasks.length || from < 0 || from >= sheet.tasks.length) return from;
  const [task] = sheet.tasks.splice(from, 1);
  sheet.tasks.splice(to, 0, task);
  return to;
}

export function imageIdsOf(sheet) {
  return sheet.tasks.map((t) => t.imageId).filter(Boolean);
}
