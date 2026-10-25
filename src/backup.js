// Sicherung als Datei: Blätter + Bilder -> JSON und zurück. Reine Logik (kein DOM) bis auf Blob/atob, die auch Node kennt.
import { duplicateSheet, imageIdsOf, normalizeSheet } from './model.js';

export const BACKUP_FORMAT = 'starteraufgaben-sicherung';
export const BACKUP_VERSION = 1;
export const LIMITS = { fileChars: 200 * 1024 * 1024, sheets: 5000, images: 2000, imageBytes: 12 * 1024 * 1024 };

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

/** `images`: [{ id, blob, width, height }] – es werden nur die von den Blättern benutzten gesichert. */
export async function buildBackup({ sheets, images, now = Date.now() }) {
  const used = new Set(sheets.flatMap(imageIdsOf));
  const wanted = images.filter((i) => used.has(i.id) && i.blob);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    sheets: structuredClone(sheets),
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

/** Liest eine Sicherungsdatei (Text) und prüft sie gründlich. Gibt { ok, sheets, images, warnings } oder { ok: false, error }. */
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
  const rawImages = Array.isArray(data.images) ? data.images : [];
  if (rawSheets.length > LIMITS.sheets || rawImages.length > LIMITS.images) return fail('Die Sicherung enthält unplausibel viele Einträge.');

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
  if (badSheets) warnings.push(`${badSheets} unlesbare(s) Blatt/Blätter wurden übersprungen.`);
  if (missingImages) warnings.push(`${missingImages} fehlende(s) Bild(er) werden als „kein Bild“ übernommen.`);
  if (!byId.size) return fail('Die Sicherung enthält kein lesbares Blatt.');

  return { ok: true, sheets: [...byId.values()], images, warnings };
}

/** Was passiert beim Einspielen? Gleiche Blatt-ID: das neuere (nach updatedAt) gewinnt. */
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
