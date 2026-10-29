// Abgleich zwischen Geräten über eine gemeinsame Datei (z. B. in OneDrive) – die Logik ohne Oberfläche.
// Ablauf: Datei lesen (parseBackup) -> planFromFile (Vorschau) -> applyPlan (lokal speichern) -> buildSyncFile (zurückschreiben).
import { MARK_MAX_AGE, base64ToBlob, buildBackup, conflictBankItems, conflictSheets, marksOf, planSync } from './backup.js';
import { imageIdsOfBank } from './bank.js';
import { imageIdsOf } from './model.js';

/** Alles, was in die Sync-Datei gehört, aus dem lokalen Speicher: Blätter, Bank, benutzte Bilder, Löschmarken. */
export async function collectAll(store) {
  const [sheets, bank, folders, deleted] = await Promise.all([store.listSheets(), store.listBank(), store.listFolders(), store.listDeleted()]);
  const ids = new Set([...sheets.flatMap(imageIdsOf), ...imageIdsOfBank(bank)]);
  const images = (await Promise.all([...ids].map((id) => store.getImage(id)))).filter(Boolean);
  return { sheets, bank, folders, images, deleted };
}

/** Der aktuelle lokale Stand als Sicherungsdatei-Inhalt (Objekt; mit JSON.stringify zu Text machen). */
export async function buildSyncFile(store, now = Date.now()) {
  return buildBackup({ ...(await collectAll(store)), now });
}

const EMPTY = Object.freeze({ sheets: [], bank: [], folders: [], deleted: [], images: [] });

/** Plan für Blätter, Bank und Ordner. `parsed`: Ergebnis von parseBackup oder null (Datei leer bzw. neu). */
export async function planFromFile(store, parsed, lastSyncAt = 0) {
  const incoming = parsed ?? EMPTY;
  const [sheets, bank, folders, deleted] = await Promise.all([store.listSheets(), store.listBank(), store.listFolders(), store.listDeleted()]);
  return {
    sheets: planSync(sheets, incoming.sheets, { marks: marksOf(deleted, 'sheet'), incomingMarks: marksOf(incoming.deleted, 'sheet'), lastSyncAt }),
    bank: planSync(bank, incoming.bank, { marks: marksOf(deleted, 'bank'), incomingMarks: marksOf(incoming.deleted, 'bank'), lastSyncAt }),
    // Ordner sind nur ein Name: bei Änderung auf beiden Seiten gewinnt der neuere, ohne Konflikt-Kopie (lastSyncAt 0)
    folders: planSync(folders, incoming.folders ?? [], { marks: marksOf(deleted, 'folder'), incomingMarks: marksOf(incoming.deleted, 'folder'), lastSyncAt: 0 }),
  };
}

const NO_CHANGES = Object.freeze({ add: [], update: [], remove: [], conflicts: [], localNewer: [], keptByMark: [], marks: [], same: 0 });

/** Was würde sich hier ändern? Zahlen für die Vorschau. */
export function countPlan(plan) {
  const part = (p) => ({
    add: p.add.length,
    update: p.update.length,
    remove: p.remove.length,
    conflicts: p.conflicts.length,
    localNewer: p.localNewer.length,
    keptByMark: p.keptByMark.length,
    same: p.same,
  });
  const sheets = part(plan.sheets);
  const bank = part(plan.bank);
  const folders = part(plan.folders ?? NO_CHANGES);
  const changes = sheets.add + sheets.update + sheets.remove + bank.add + bank.update + bank.remove + folders.add + folders.update + folders.remove;
  return { sheets, bank, folders, changes, conflicts: sheets.conflicts + bank.conflicts };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Vorschau als Zeilen für die Anzeige. */
export function describePlan(plan) {
  const { sheets, bank, folders } = countPlan(plan);
  const lines = [];
  const folder = (n, text) => n && lines.push(`${plural(n, 'Ordner', 'Ordner')} ${text}`);
  folder(folders.add, 'neu aus der Datei');
  folder(folders.update, 'aus der Datei neuer – werden aktualisiert');
  folder(folders.remove, 'in der Datei gelöscht – werden hier gelöscht');
  const sheet = (n, text) => n && lines.push(`${plural(n, 'Blatt', 'Blätter')} ${text}`);
  const task = (n, text) => n && lines.push(`${plural(n, 'Aufgabe', 'Aufgaben')} der Bank ${text}`);
  sheet(sheets.add, 'neu aus der Datei');
  sheet(sheets.update, 'aus der Datei neuer – werden aktualisiert');
  sheet(sheets.remove, 'in der Datei gelöscht – werden hier gelöscht');
  sheet(sheets.localNewer, 'hier neuer – gehen in die Datei');
  sheet(sheets.keptByMark, 'hier gelöscht – bleiben gelöscht');
  sheet(sheets.conflicts, 'auf beiden Seiten geändert – die ältere Fassung bleibt als „Konflikt“-Kopie');
  task(bank.add, 'neu aus der Datei');
  task(bank.update, 'aus der Datei neuer – werden aktualisiert');
  task(bank.remove, 'in der Datei gelöscht – werden hier gelöscht');
  task(bank.localNewer, 'hier neuer – gehen in die Datei');
  task(bank.keptByMark, 'hier gelöscht – bleiben gelöscht');
  task(bank.conflicts, 'auf beiden Seiten geändert – die ältere Fassung bleibt als Kopie (Schlagwort „Konflikt“)');
  return lines;
}

/**
 * Wendet den Plan lokal an. `parsed` liefert die Bilder der Datei. Gibt die neu gespeicherten Bilder zurück
 * ({ id, blob }), damit die Oberfläche ihre Vorschau-Zwischenspeicher auffrischen kann.
 */
export async function applyPlan(store, plan, parsed, { now = Date.now() } = {}) {
  const sheetCopies = conflictSheets(plan.sheets.conflicts, now);
  const bankCopies = conflictBankItems(plan.bank.conflicts, now);
  const sheets = [...plan.sheets.add, ...plan.sheets.update, ...sheetCopies];
  const bank = [...plan.bank.add, ...plan.bank.update, ...bankCopies];

  const needed = new Set([...sheets.flatMap(imageIdsOf), ...imageIdsOfBank(bank)]);
  const savedImages = [];
  for (const img of parsed?.images ?? []) {
    if (!needed.has(img.id)) continue;
    const blob = base64ToBlob(img.data, img.type);
    await store.saveImage({ id: img.id, blob, width: img.width, height: img.height });
    savedImages.push({ id: img.id, blob });
  }
  const folderPlan = plan.folders ?? NO_CHANGES;
  for (const folder of [...folderPlan.add, ...folderPlan.update]) await store.saveFolder(folder); // zuerst: Blätter verweisen darauf
  for (const sheet of sheets) await store.saveSheet(sheet);
  for (const item of bank) await store.saveBankItem(item);
  for (const { item, deletedAt } of plan.sheets.remove) await store.deleteSheet(item.id, { deletedAt });
  for (const { item, deletedAt } of plan.bank.remove) await store.deleteBankItem(item.id, { deletedAt });
  for (const { item, deletedAt } of folderPlan.remove) await store.deleteFolder(item.id, { deletedAt });
  for (const { id, deletedAt } of plan.sheets.marks) await store.saveDeleted('sheet', id, deletedAt);
  for (const { id, deletedAt } of plan.bank.marks) await store.saveDeleted('bank', id, deletedAt);
  for (const { id, deletedAt } of folderPlan.marks) await store.saveDeleted('folder', id, deletedAt);
  await store.pruneDeleted(MARK_MAX_AGE, now);
  return { savedImages, copies: sheetCopies.length + bankCopies.length };
}
