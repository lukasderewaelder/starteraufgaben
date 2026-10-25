// Abschnitt „Abgleich“ im Sicherungsdialog. Am PC (Edge/Chrome) wird eine Datei im OneDrive-Ordner verknüpft und direkt
// gelesen und zurückgeschrieben; am iPad (kein Dateizugriff im Browser) wählt man die Datei aus „Dateien“ aus und
// speichert die zusammengeführte Datei mit „Ersetzen“ zurück. Die Logik steckt in sync.js, hier ist nur die Bedienung.
import { SYNC_FILENAME, afterBackup, parseBackup } from './backup.js';
import { rememberImage } from './images.js';
import { applyPlan, buildSyncFile, describePlan, planFromFile } from './sync.js';
import { $, fileDeliverable, mb, toast } from './ui.js';

const PICKER_TYPES = [{ description: 'Sync-Datei', accept: { 'application/json': ['.json'] } }];
const canUseFiles = () => typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';

async function hasPermission(handle) {
  const mode = { mode: 'readwrite' };
  if ((await handle.queryPermission?.(mode)) === 'granted') return true;
  return (await handle.requestPermission?.(mode)) === 'granted';
}

async function writeToHandle(handle, json) {
  const writable = await handle.createWritable();
  await writable.write(json);
  await writable.close();
}

/** `ui`: { showResult, showHome, button } aus backup-ui.js. */
export function createSyncUi(app, ui) {
  const section = $('#sync-section');
  const info = $('#sync-info');
  const buttons = $('#sync-buttons');
  const last = $('#sync-last');
  const fileInput = $('#sync-file');

  const lastText = () => {
    const at = app.settings.lastSyncAt;
    return at ? `Letzter Abgleich: ${new Date(at).toLocaleString('de-DE')}` : 'Noch nicht abgeglichen.';
  };

  /** Der Abschnitt im Startbild des Dialogs; bei der Sicherung eines einzelnen Blatts ausgeblendet. */
  function renderHome({ hidden = false } = {}) {
    section.hidden = hidden;
    if (hidden) return;
    last.textContent = lastText();
    const handle = app.settings.syncHandle;
    if (canUseFiles()) {
      if (handle) {
        info.textContent = `Verknüpft mit „${handle.name}“. Ein Klick liest die Datei, führt beide Stände zusammen und schreibt sie zurück – OneDrive bringt sie aufs andere Gerät.`;
        buttons.replaceChildren(ui.button('Abgleichen', () => runLinked(handle), true), ui.button('Verknüpfung lösen', unlink));
      } else {
        info.textContent = `Lege in deinem OneDrive-Ordner eine Sync-Datei an („${SYNC_FILENAME}“) oder wähle die vorhandene. Am zweiten Gerät machst du dasselbe.`;
        buttons.replaceChildren(ui.button('Vorhandene Sync-Datei wählen …', () => link('open'), true), ui.button('Neue Sync-Datei anlegen …', () => link('new')));
      }
    } else {
      info.textContent = `„Abgleichen“ öffnet die Dateien-App: wähle dort „${SYNC_FILENAME}“ aus OneDrive. Danach speicherst du die zusammengeführte Datei am selben Ort mit „Ersetzen“ zurück.`;
      buttons.replaceChildren(
        ui.button('Abgleichen …', () => fileInput.click(), true),
        ui.button('Neue Sync-Datei erstellen', () => preview('', deliverByShare)),
      );
    }
  }

  /** Die Verknüpfung merken; geht das nicht dauerhaft (Browser kann das Handle nicht ablegen), gilt sie bis zum Neuladen. */
  async function rememberHandle(handle) {
    try {
      await app.setSettings({ syncHandle: handle });
    } catch (err) {
      console.warn('Sync-Datei kann nicht dauerhaft gemerkt werden:', err);
    }
  }

  async function unlink() {
    await rememberHandle(null);
    renderHome();
  }

  async function link(how) {
    let handle;
    try {
      [handle] = how === 'open'
        ? await window.showOpenFilePicker({ types: PICKER_TYPES, multiple: false })
        : [await window.showSaveFilePicker({ suggestedName: SYNC_FILENAME, types: PICKER_TYPES })];
    } catch (err) {
      if (err?.name !== 'AbortError') ui.showResult(`Die Datei konnte nicht gewählt werden: ${err.message}`, { error: true });
      return;
    }
    await rememberHandle(handle);
    await runLinked(handle);
  }

  // --- PC: verknüpfte Datei -------------------------------------------------------------------
  async function runLinked(handle) {
    try {
      if (!(await hasPermission(handle))) {
        ui.showResult('Der Zugriff auf die Datei wurde nicht erlaubt. Ohne Erlaubnis kann nicht abgeglichen werden.', { error: true });
        return;
      }
      const text = await (await handle.getFile()).text();
      await preview(text, async (json) => {
        await writeToHandle(handle, json);
        return `Abgeglichen und in „${handle.name}“ gespeichert (${mb(json.length)}).`;
      });
    } catch (err) {
      console.error(err);
      const gone = err?.name === 'NotFoundError' || err?.name === 'NotAllowedError';
      ui.showResult(
        gone
          ? 'Die Datei wurde verschoben oder gelöscht. Löse die Verknüpfung und wähle die Datei neu.'
          : `Der Abgleich ist fehlgeschlagen: ${err.message}`,
        { error: true, buttons: gone ? [ui.button('Verknüpfung lösen', async () => { await unlink(); ui.showHome(); })] : [] },
      );
    }
  }

  // --- iPad: Datei aus „Dateien“ wählen, Ergebnis teilen ---------------------------------------
  function deliverByShare(json) {
    const blob = new Blob([json], { type: 'application/json' });
    const delivery = fileDeliverable(blob, SYNC_FILENAME);
    const done = async () => app.setSettings({ lastSyncAt: Date.now(), ...afterBackup() });
    const buttons = [];
    // Teilen braucht eine frische Nutzeraktion – deshalb ein eigener Knopf.
    if (delivery.canShare) {
      buttons.push(
        ui.button(
          'In Dateien / OneDrive sichern …',
          async () => {
            try {
              if (await delivery.share()) {
                await done();
                toast('Sync-Datei gesichert.');
              }
            } catch (err) {
              $('#backup-status').textContent = `Teilen nicht möglich (${err.message}). Bitte „Herunterladen“ nehmen.`;
            }
          },
          true,
        ),
      );
    }
    buttons.push(
      ui.button(
        'Herunterladen',
        async () => {
          delivery.download();
          await done();
          toast('Datei wird heruntergeladen.');
        },
        !delivery.canShare,
      ),
    );
    return { text: `Zusammengeführt. Speichere „${SYNC_FILENAME}“ jetzt wieder in OneDrive und wähle „Ersetzen“ (${mb(blob.size)}).`, buttons, pending: true };
  }

  // --- gemeinsam: Vorschau, bestätigen, anwenden --------------------------------------------------
  /** `deliver(json)` schreibt die Datei zurück (liefert den Ergebnistext) oder gibt { text, buttons, pending } zurück. */
  async function preview(text, deliver) {
    ui.showResult('Lese Datei …');
    await app.flush();
    let parsed = null;
    if (text.trim()) {
      parsed = parseBackup(text);
      if (!parsed.ok) {
        ui.showResult(parsed.error, { error: true });
        return;
      }
    }
    const plan = await planFromFile(app.store, parsed, app.settings.lastSyncAt);
    const lines = describePlan(plan);
    const notes = [...(parsed?.warnings ?? [])];
    if (!app.settings.lastSyncAt && parsed) {
      notes.push('Erster Abgleich auf diesem Gerät: Gibt es ein Blatt auf beiden Seiten, gewinnt die neuere Fassung.');
    }
    const head = lines.length ? `Der Abgleich bewirkt:\n${lines.join('\n')}` : 'Beide Stände stimmen überein – die Datei wird auf den aktuellen Stand gebracht.';
    ui.showResult(head, {
      warnings: notes,
      buttons: [ui.button('Abgleichen', () => apply(plan, parsed, deliver), true)],
    });
  }

  async function apply(plan, parsed, deliver) {
    ui.showResult('Gleiche ab …');
    try {
      const applied = await applyPlan(app.store, plan, parsed);
      for (const { id, blob } of applied.savedImages) rememberImage(id, blob);
      await app.refreshSheets();
      await app.refreshBank();
      app.onLibraryChanged();
      const json = JSON.stringify(await buildSyncFile(app.store));
      const result = await deliver(json);
      const delivered = typeof result === 'string' ? { text: result } : result;
      if (!delivered.pending) await app.setSettings({ lastSyncAt: Date.now(), ...afterBackup() });
      ui.showResult(delivered.text, { buttons: delivered.buttons ?? [], warnings: applied.copies ? [`${applied.copies} „Konflikt“-Kopie(n) angelegt – bitte durchsehen und eine Fassung löschen.`] : [] });
    } catch (err) {
      console.error(err);
      ui.showResult(
        `Der Abgleich ist unterbrochen worden: ${err.message}. Änderungen aus der Datei sind hier schon übernommen – bitte noch einmal abgleichen.`,
        { error: true },
      );
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      await preview(await file.text(), deliverByShare);
    } catch (err) {
      ui.showResult(`Die Datei konnte nicht gelesen werden: ${err.message}`, { error: true });
    }
  });

  return { renderHome };
}
