// Klassen-Ordner für die Bibliothek: ein Blatt liegt in höchstens einem Ordner (`sheet.folderId`), Ordner haben eine Ebene.
// Reine Funktionen (kein DOM, kein Speicher) – gut testbar.
import { uid } from './model.js';

export const MAX_FOLDER_NAME = 40;
export const FOLDER_ALL = 'all'; // Auswahl in der Bibliothek: alle Blätter
export const FOLDER_NONE = 'none'; // … nur Blätter ohne Ordner

const clean = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME);

/** Ordnername wie er gespeichert wird: Leerraum zusammengezogen, höchstens 40 Zeichen. */
export const cleanFolderName = clean;

export function newFolder({ name = '', now = Date.now() } = {}) {
  return { id: uid(), name: clean(name), createdAt: now, updatedAt: now };
}

/** Macht beliebige (z. B. importierte) Daten zu einem gültigen Ordner oder gibt null zurück. */
export function normalizeFolder(raw, { now = Date.now() } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = clean(raw.name);
  if (!name) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 100) : uid(),
    name,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

/** Name für Vergleiche: „7 B“, „7b“ und „7B“ sind derselbe Ordner. */
export const folderKey = (name) => clean(name).toLowerCase().replace(/\s+/g, '');

/** Ordner alphabetisch, Zahlen als Zahlen („5a“ vor „10c“). */
export function sortFolders(folders) {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' }) || a.createdAt - b.createdAt);
}

/** Gibt es schon einen Ordner mit diesem Namen (ohne den Ordner `exceptId`)? */
export const nameTaken = (folders, name, exceptId = null) => {
  const key = folderKey(name);
  return folders.some((f) => f.id !== exceptId && folderKey(f.name) === key);
};

/** Der Ordner, dessen Name zum Feld „Klasse / Kurs“ eines Blatts passt (oder null). */
export function folderForClass(folders, klasse) {
  const key = folderKey(klasse);
  return key ? (folders.find((f) => folderKey(f.name) === key) ?? null) : null;
}

/** Der Ordner eines Blatts; ein Verweis auf einen nicht (mehr) vorhandenen Ordner zählt als „kein Ordner“. */
export const folderOf = (sheet, folders) => (sheet.folderId ? (folders.find((f) => f.id === sheet.folderId) ?? null) : null);

/** Blätter für die Auswahl der Bibliothek: FOLDER_ALL, FOLDER_NONE oder eine Ordner-ID. */
export function sheetsIn(sheets, folders, selection) {
  if (selection === FOLDER_ALL || !selection) return sheets;
  if (selection === FOLDER_NONE) return sheets.filter((s) => !folderOf(s, folders));
  return sheets.filter((s) => s.folderId === selection);
}

/** Zahlen für die Reiter: { all, none, byFolder: Map(id -> Anzahl) }. */
export function folderCounts(sheets, folders) {
  const byFolder = new Map(folders.map((f) => [f.id, 0]));
  let none = 0;
  for (const sheet of sheets) {
    if (byFolder.has(sheet.folderId)) byFolder.set(sheet.folderId, byFolder.get(sheet.folderId) + 1);
    else none += 1;
  }
  return { all: sheets.length, none, byFolder };
}

/** Ist die gespeicherte Auswahl noch gültig? Sonst „Alle“. */
export const validSelection = (selection, folders) =>
  selection === FOLDER_NONE || (selection && folders.some((f) => f.id === selection)) ? selection : FOLDER_ALL;
