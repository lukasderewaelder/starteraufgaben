// Sicherung als Datei: Blätter + Bilder -> JSON und zurück. Reine Logik (kein DOM) bis auf Blob/atob, die auch Node kennt.
import { imageIdsOfBank, normalizeBankItem } from './bank.js';
import { normalizeFolder } from './folders.js';
import { duplicateSheet, imageIdsOf, normalizeSheet, uid } from './model.js';

export const BACKUP_FORMAT = 'starteraufgaben-sicherung';
export const BACKUP_VERSION = 3; // 2: Löschmarken (`deleted`) für den Abgleich; 3: Klassen-Ordner (`folders`); ältere Dateien bleiben lesbar
export const LIMITS = { fileChars: 200 * 1024 * 1024, sheets: 5000, bank: 20_000, images: 2000, imageBytes: 12 * 1024 * 1024, deleted: 50_000, folders: 1000 };

// Abgleich über eine gemeinsame Datei (z. B. in OneDrive): fester Name, Löschmarken werden 90 Tage aufbewahrt.
export const SYNC_FILENAME = 'Starteraufgaben_Sync.json';
export const MARK_MAX_AGE = 90 * 24 * 60 * 60 * 1000;

// Erinnerung: nach so vielen Bearbeitungen (je 10 Minuten Abstand) oder Tagen seit der ersten ungesicherten Änderung.
export const REMINDER_CHANGES = 5;
export const REMINDER_DAYS = 14;
export const SNOOZE_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;
const SESSION_GAP = 10 * 60 * 1000;

const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBlob(data, type) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * `images`: [{ id, blob, width, height }] – es werden nur die von Blättern und Bank-Aufgaben benutzten gesichert.
 * `bank` ist optional (die Sicherung eines einzelnen Blatts enthält keine Bank).
 * `deleted`: Löschmarken [{ kind: 'sheet' | 'bank' | 'folder', id, deletedAt }] – nur für den Abgleich nötig.
 * `folders`: die Klassen-Ordner der Bibliothek (die Sicherung eines einzelnen Blatts hat keine).
 */
export async function buildBackup({ sheets, bank = [], images, deleted = [], folders = [], now = Date.now() }) {
  const used = new Set([...sheets.flatMap(imageIdsOf), ...imageIdsOfBank(bank)]);
  const wanted = images.filter((i) => used.has(i.id) && i.blob);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    sheets: structuredClone(sheets),
    bank: structuredClone(bank),
    folders: structuredClone(folders),
    deleted: deleted.map(({ kind, id, deletedAt }) => ({ kind, id, deletedAt })),
    images: await Promise.all(
      wanted.map(async (i) => ({ id: i.id, type: i.blob.type, width: i.width, height: i.height, data: await blobToBase64(i.blob) })),
    ),
  };
}

export function backupFilename({ scope, sheet, now = new Date() }) {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (scope === 'sheet') {
    const title = String(sheet.title).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 50) || 'Blatt';
    return `Starteraufgaben_Blatt-${sheet.number}_${title}_${d}.json`;
  }
  return `Starteraufgaben_Sicherung_${d}.json`;
}

const fail = (error) => ({ ok: false, error });

/** Löschmarken aus einer Datei: nur gültige, je Blatt/Aufgabe die jüngste. */
function parseMarks(raw) {
  const best = new Map();
  for (const m of Array.isArray(raw) ? raw : []) {
    const ok = (m?.kind === 'sheet' || m?.kind === 'bank' || m?.kind === 'folder') && typeof m.id === 'string' && m.id && m.id.length <= 100 && Number.isFinite(m.deletedAt);
    if (!ok) continue;
    const key = `${m.kind}:${m.id}`;
    if (!best.has(key) || best.get(key).deletedAt < m.deletedAt) best.set(key, { kind: m.kind, id: m.id, deletedAt: m.deletedAt });
  }
  return [...best.values()];
}

/** Liest eine Sicherungsdatei (Text) und prüft sie gründlich. Gibt { ok, sheets, bank, folders, images, deleted, warnings } oder { ok: false, error }. */
export function parseBackup(text, { now = Date.now() } = {}) {
  if (typeof text !== 'string' || text.length > LIMITS.fileChars) return fail('Die Datei ist zu groß oder leer.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('Das ist keine gültige Sicherung (die Datei ist kein lesbares JSON).');
  }
  if (data?.format !== BACKUP_FORMAT) return fail('Das ist keine Starteraufgaben-Sicherung.');
  if (!Number.isInteger(data.version) || data.version > BACKUP_VERSION) {
    return fail('Die Sicherung stammt aus einer neueren Version der App. Bitte die App zuerst aktualisieren.');
  }

  const rawSheets = Array.isArray(data.sheets) ? data.sheets : [];
  const rawBank = Array.isArray(data.bank) ? data.bank : [];
  const rawImages = Array.isArray(data.images) ? data.images : [];
  if (rawSheets.length > LIMITS.sheets || rawBank.length > LIMITS.bank || rawImages.length > LIMITS.images || (data.deleted?.length ?? 0) > LIMITS.deleted) {
    return fail('Die Sicherung enthält unplausibel viele Einträge.');
  }
  const deleted = parseMarks(data.deleted);
  const folderById = new Map();
  for (const raw of Array.isArray(data.folders) ? data.folders.slice(0, LIMITS.folders) : []) {
    const folder = normalizeFolder(raw, { now });
    const other = folder && folderById.get(folder.id);
    if (folder && (!other || other.updatedAt < folder.updatedAt)) folderById.set(folder.id, folder);
  }

  const warnings = [];
  const images = [];
  const known = new Set();
  let badImages = 0;
  for (const raw of rawImages) {
    const ok =
      typeof raw?.id === 'string' &&
      raw.id &&
      raw.id.length <= 100 &&
      IMAGE_TYPES.includes(raw.type) &&
      typeof raw.data === 'string' &&
      raw.data.length * 0.75 <= LIMITS.imageBytes &&
      BASE64.test(raw.data);
    if (!ok) {
      badImages += 1;
      continue;
    }
    images.push({
      id: raw.id,
      type: raw.type,
      width: Number.isFinite(raw.width) ? raw.width : 0,
      height: Number.isFinite(raw.height) ? raw.height : 0,
      data: raw.data,
    });
    known.add(raw.id);
  }
  if (badImages) warnings.push(`${badImages} beschädigte(s) Bild(er) wurden übersprungen.`);

  const byId = new Map();
  let badSheets = 0;
  let missingImages = 0;
  for (const raw of rawSheets) {
    const sheet = normalizeSheet(raw, { now });
    if (!sheet) {
      badSheets += 1;
      continue;
    }
    for (const task of sheet.tasks) {
      if (task.imageId && !known.has(task.imageId)) {
        task.imageId = null;
        missingImages += 1;
      }
    }
    const other = byId.get(sheet.id);
    if (!other || other.updatedAt < sheet.updatedAt) byId.set(sheet.id, sheet);
  }

  const bankById = new Map();
  let badBank = 0;
  for (const raw of rawBank) {
    const item = normalizeBankItem(raw, { now });
    if (!item) {
      badBank += 1;
      continue;
    }
    if (item.imageId && !known.has(item.imageId)) {
      item.imageId = null;
      missingImages += 1;
    }
    const other = bankById.get(item.id);
    if (!other || other.updatedAt < item.updatedAt) bankById.set(item.id, item);
  }

  if (badSheets) warnings.push(`${badSheets} unlesbare(s) Blatt/Blätter wurden übersprungen.`);
  if (badBank) warnings.push(`${badBank} unlesbare Aufgabe(n) der Bank wurden übersprungen.`);
  if (missingImages) warnings.push(`${missingImages} fehlende(s) Bild(er) werden als „kein Bild“ übernommen.`);
  if (!byId.size && !bankById.size && !deleted.length) return fail('Die Sicherung enthält kein lesbares Blatt und keine Bank-Aufgabe.');

  return { ok: true, sheets: [...byId.values()], bank: [...bankById.values()], folders: [...folderById.values()], images, deleted, warnings };
}

/** Was passiert beim Einspielen (Blätter und Bank-Aufgaben)? Gleiche ID: das Neuere (nach updatedAt) gewinnt. */
export function planImport(local, incoming) {
  const byId = new Map(local.map((s) => [s.id, s]));
  const plan = { add: [], update: [], same: 0, localNewer: [] };
  for (const sheet of incoming) {
    const mine = byId.get(sheet.id);
    if (!mine) plan.add.push(sheet);
    else if (sheet.updatedAt > mine.updatedAt) plan.update.push(sheet);
    else if (sheet.updatedAt === mine.updatedAt) plan.same += 1;
    else plan.localNewer.push(sheet);
  }
  return plan;
}

/** Kopien lokal neuerer Blätter (neue IDs), damit nichts verloren geht, wenn beide Seiten bearbeitet wurden. */
export function asCopies(sheets, now = Date.now()) {
  return sheets.map((s) => duplicateSheet(s, { number: s.number, now }));
}

/** Dasselbe für Bank-Aufgaben. */
export function asBankCopies(items, now = Date.now()) {
  return items.map((i) => ({ ...structuredClone(i), id: uid(), createdAt: now, updatedAt: now }));
}

// --- Abgleich über eine gemeinsame Datei ---------------------------------------------------------

/** Die Löschmarken einer Art ('sheet' oder 'bank') als [{ id, deletedAt }]. */
export const marksOf = (marks, kind) => marks.filter((m) => m.kind === kind).map(({ id, deletedAt }) => ({ id, deletedAt }));

/**
 * Plan für den Abgleich mit der Datei, für eine Art von Elementen (Blätter oder Bank-Aufgaben). Wendet nichts an.
 * local/incoming: Elemente mit id + updatedAt; marks/incomingMarks: Löschmarken [{ id, deletedAt }] derselben Art;
 * lastSyncAt: wann dieses Gerät zuletzt abgeglichen hat (0 = noch nie: dann gewinnt einfach die neuere Fassung).
 * Ergebnis:
 *   add / update – Fassungen aus der Datei, die hier gespeichert werden (update ersetzt eine ältere lokale)
 *   same         – Anzahl identischer
 *   localNewer   – hier neuer: bleiben und gehen beim Zurückschreiben in die Datei
 *   keptByMark   – in der Datei vorhanden, aber hier gelöscht (Löschmarke ist neuer): bleiben gelöscht
 *   remove       – lokale Elemente, die laut Datei gelöscht wurden: [{ item, deletedAt }]
 *   marks        – Löschmarken aus der Datei, die hier noch fehlen: [{ id, deletedAt }]
 *   conflicts    – die unterlegenen Fassungen, wenn beide Seiten seit dem letzten Abgleich bearbeitet haben (als Kopie behalten)
 */
export function planSync(local, incoming, { marks = [], incomingMarks = [], lastSyncAt = 0 } = {}) {
  const mine = new Map(local.map((x) => [x.id, x]));
  const myMarks = new Map(marks.map((m) => [m.id, m.deletedAt]));
  const plan = { add: [], update: [], same: 0, localNewer: [], keptByMark: [], remove: [], marks: [], conflicts: [] };
  const bothChanged = (a, b) => lastSyncAt > 0 && Math.min(a.updatedAt, b.updatedAt) > lastSyncAt;
  for (const item of incoming) {
    const markedAt = myMarks.get(item.id);
    if (markedAt !== undefined && markedAt >= item.updatedAt) {
      plan.keptByMark.push(item);
      continue;
    }
    const m = mine.get(item.id);
    if (!m) plan.add.push(item); // auch: hier gelöscht, dort danach bearbeitet – kommt zurück
    else if (item.updatedAt > m.updatedAt) {
      plan.update.push(item);
      if (bothChanged(item, m)) plan.conflicts.push(m);
    } else if (item.updatedAt === m.updatedAt) plan.same += 1;
    else {
      plan.localNewer.push(item);
      if (bothChanged(item, m)) plan.conflicts.push(item);
    }
  }
  for (const { id, deletedAt } of incomingMarks) {
    const m = mine.get(id);
    if (m) {
      if (m.updatedAt <= deletedAt) plan.remove.push({ item: m, deletedAt }); // sonst: hier danach bearbeitet, bleibt
    } else if (!(myMarks.get(id) >= deletedAt)) plan.marks.push({ id, deletedAt });
  }
  return plan;
}

/** Konflikt-Kopien: eigene IDs, Titel bzw. Schlagwort „Konflikt“, damit man sie findet. */
export const conflictSheets = (sheets, now = Date.now()) => asCopies(sheets, now).map((s) => ({ ...s, title: `${s.title} (Konflikt)`.slice(0, 200) }));
export const conflictBankItems = (items, now = Date.now()) =>
  asBankCopies(items, now).map((i) => ({ ...i, tags: [...new Set([...i.tags, 'Konflikt'])].slice(0, 12) }));

// --- Erinnerung --------------------------------------------------------------------------------

/** Nur die geänderten Einstellungen zurückgeben (leeres Objekt = nichts zu tun). */
export function registerChange(settings, lastChangeAt, now = Date.now()) {
  const next = {};
  if (!lastChangeAt || now - lastChangeAt >= SESSION_GAP) next.changesSinceBackup = (settings.changesSinceBackup || 0) + 1;
  if (!settings.firstChangeAt) next.firstChangeAt = now;
  return next;
}

export const afterBackup = (now = Date.now()) => ({ lastBackupAt: now, changesSinceBackup: 0, firstChangeAt: 0, reminderSnoozedUntil: 0 });

export const snooze = (now = Date.now()) => ({ reminderSnoozedUntil: now + SNOOZE_DAYS * DAY });

export function backupReminder(settings, now = Date.now()) {
  const changes = settings.changesSinceBackup || 0;
  if (changes <= 0 || now < (settings.reminderSnoozedUntil || 0)) return { due: false };
  const never = !settings.lastBackupAt;
  const lastDate = never ? '' : new Date(settings.lastBackupAt).toLocaleDateString('de-DE');
  const neverText = 'Es gibt noch keine Sicherung – deine Blätter liegen nur auf diesem Gerät.';
  if (changes >= REMINDER_CHANGES) {
    return { due: true, text: never ? neverText : `Seit der letzten Sicherung (${lastDate}) wurde mehrmals bearbeitet.` };
  }
  if (settings.firstChangeAt && now - settings.firstChangeAt >= REMINDER_DAYS * DAY) {
    return { due: true, text: never ? neverText : `Seit über ${REMINDER_DAYS} Tagen nicht gesichert (letzte Sicherung: ${lastDate}).` };
  }
  return { due: false };
}
