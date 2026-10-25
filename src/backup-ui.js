// Dialog „Sicherung“: Datei erstellen (alle Blätter oder eines) und Sicherungsdatei einspielen.
import {
  afterBackup,
  asCopies,
  backupFilename,
  base64ToBlob,
  buildBackup,
  parseBackup,
  planImport,
} from './backup.js';
import { rememberImage } from './images.js';
import { imageIdsOf } from './model.js';
import { $, fileDeliverable, mb, toast } from './ui.js';

export function createBackupUi(app) {
  const dialog = $('#dlg-backup');
  const home = $('#backup-home');
  const status = $('#backup-status');
  const notes = $('#backup-notes');
  const actions = $('#backup-actions');
  const fileInput = $('#backup-file');
  let scope = { sheets: null }; // null = alles; sonst Liste der zu sichernden Blätter

  const button = (label, onClick, primary = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = primary ? 'btn btn-primary' : 'btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  function showHome() {
    const single = scope.sheets;
    $('#backup-title').textContent = single ? `Blatt Nr. ${single[0].number} als Datei sichern` : 'Sicherung';
    home.hidden = false;
    $('#backup-make').textContent = single ? 'Datei erstellen' : 'Sicherung erstellen';
    $('[for="backup-file"]').hidden = Boolean(single);
    status.textContent = '';
    notes.hidden = true;
    actions.replaceChildren();
    const last = app.settings.lastBackupAt;
    $('#backup-last').textContent = single ? '' : last ? `Letzte Sicherung: ${new Date(last).toLocaleString('de-DE')}` : 'Es gibt noch keine Sicherung.';
  }

  function showResult(text, { warnings = [], buttons = [], error = false } = {}) {
    home.hidden = true;
    status.className = error ? 'result-error' : '';
    status.textContent = text;
    notes.replaceChildren(
      ...warnings.map((w) => {
        const li = document.createElement('li');
        li.textContent = w;
        return li;
      }),
    );
    notes.hidden = !warnings.length;
    actions.replaceChildren(...buttons, button('Zurück', showHome));
  }

  async function open({ sheets = null } = {}) {
    await app.flush();
    scope = { sheets };
    showHome();
    if (!dialog.open) dialog.showModal();
  }

  // --- Erstellen ----------------------------------------------------------------------------
  async function make() {
    showResult('Erstelle Datei …');
    actions.replaceChildren();
    try {
      await app.refreshSheets();
      const sheets = scope.sheets ? scope.sheets.map((s) => app.sheets.find((x) => x.id === s.id) ?? s) : app.sheets;
      if (!sheets.length) {
        showResult('Es gibt noch keine Blätter zum Sichern.', { error: true });
        return;
      }
      const images = (await Promise.all([...new Set(sheets.flatMap(imageIdsOf))].map((id) => app.store.getImage(id)))).filter(Boolean);
      const backup = await buildBackup({ sheets, images });
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const name = backupFilename(scope.sheets ? { scope: 'sheet', sheet: sheets[0] } : { scope: 'all' });
      const delivery = fileDeliverable(blob, name);
      const full = !scope.sheets;
      const markDone = () => (full ? app.setSettings(afterBackup()) : Promise.resolve());
      const buttons = [];
      // Teilen braucht eine frische Nutzeraktion – deshalb ein eigener Knopf statt Auto-Aufruf nach dem Erstellen.
      if (delivery.canShare) {
        buttons.push(
          button(
            'Teilen / In Dateien sichern …',
            async () => {
              try {
                if (await delivery.share()) {
                  await markDone();
                  toast('Sicherung geteilt.');
                }
              } catch (err) {
                status.textContent = `Teilen nicht möglich (${err.message}). Bitte „Herunterladen“ nehmen.`;
              }
            },
            true,
          ),
        );
      }
      buttons.push(
        button(
          'Herunterladen',
          async () => {
            delivery.download();
            await markDone();
            toast('Datei wird heruntergeladen.');
          },
          !delivery.canShare,
        ),
      );
      const imageNote = images.length ? `, ${images.length} Bild${images.length === 1 ? '' : 'er'}` : '';
      showResult(`${name} – ${sheets.length} Blatt/Blätter${imageNote}, ${mb(blob.size)}`, { buttons });
    } catch (err) {
      console.error(err);
      showResult(`Die Sicherung konnte nicht erstellt werden: ${err.message}`, { error: true });
    }
  }

  // --- Einspielen ---------------------------------------------------------------------------
  async function importFile(file) {
    showResult('Lese Datei …');
    actions.replaceChildren();
    let parsed;
    try {
      parsed = parseBackup(await file.text());
    } catch (err) {
      showResult(`Die Datei konnte nicht gelesen werden: ${err.message}`, { error: true });
      return;
    }
    if (!parsed.ok) {
      showResult(parsed.error, { error: true });
      return;
    }
    await app.refreshSheets();
    const plan = planImport(app.sheets, parsed.sheets);
    const lines = [];
    if (plan.add.length) lines.push(`${plan.add.length} neue(s) Blatt/Blätter`);
    if (plan.update.length) lines.push(`${plan.update.length} Blatt/Blätter, die in der Datei neuer sind (werden aktualisiert)`);
    if (plan.same) lines.push(`${plan.same} unverändert`);
    if (plan.localNewer.length) lines.push(`${plan.localNewer.length} Blatt/Blätter, die hier neuer sind (bleiben unverändert)`);
    const changes = plan.add.length + plan.update.length;

    const apply = async (withCopies) => {
      showResult('Spiele ein …');
      actions.replaceChildren();
      try {
        const wanted = [...plan.add, ...plan.update, ...(withCopies ? asCopies(plan.localNewer) : [])];
        const needed = new Set(wanted.flatMap(imageIdsOf));
        for (const img of parsed.images) {
          if (!needed.has(img.id)) continue;
          const blob = base64ToBlob(img.data, img.type);
          await app.store.saveImage({ id: img.id, blob, width: img.width, height: img.height });
          rememberImage(img.id, blob);
        }
        for (const sheet of wanted) await app.store.saveSheet(sheet);
        await app.refreshSheets();
        app.onLibraryChanged();
        showResult(`Fertig: ${wanted.length} Blatt/Blätter eingespielt.`, { warnings: parsed.warnings });
      } catch (err) {
        console.error(err);
        showResult(`Beim Einspielen ist ein Fehler aufgetreten: ${err.message}`, { error: true });
      }
    };

    const buttons = [];
    if (changes) buttons.push(button(`Einspielen (${changes})`, () => apply(false), true));
    if (plan.localNewer.length) buttons.push(button('Hier neuere als Kopien dazunehmen', () => apply(true), !changes));
    showResult(changes || plan.localNewer.length ? `Die Datei enthält:\n${lines.join('\n')}` : 'Alle Blätter der Datei sind schon vorhanden.', {
      warnings: parsed.warnings,
      buttons,
    });
  }

  $('#backup-make').addEventListener('click', make);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) await importFile(file);
  });
  dialog.addEventListener('close', () => app.onBackupClosed?.());

  return { open };
}
