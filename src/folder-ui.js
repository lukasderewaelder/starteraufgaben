// Klassen-Ordner in der Bibliothek: Reiter-Leiste, Dialog zum Anlegen/Umbenennen/Löschen und „In Ordner verschieben“.
import { FOLDER_ALL, FOLDER_NONE, cleanFolderName, folderCounts, folderForClass, nameTaken, validSelection } from './folders.js';
import { $ } from './ui.js';

/** `onChange`: die Bibliothek neu zeichnen. */
export function createFolderUi(app, { onChange }) {
  const bar = $('#lib-folders');
  const dialog = $('#dlg-folder');
  const nameInput = $('#folder-name');
  const error = $('#folder-error');
  const deleteButton = $('#folder-delete');
  const okButton = $('#folder-ok');
  const pickDialog = $('#dlg-folderpick');
  let editing = null;
  let afterCreate = null;

  const pill = (label, pressed, onClick, extra = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `pill-btn ${extra}`.trim();
    b.textContent = label;
    if (pressed !== null) b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', onClick);
    return b;
  };

  async function select(selection) {
    await app.setLibraryFolder(selection);
    onChange();
  }

  /** Die Reiter: Alle · jeder Ordner · Ohne Ordner · + Ordner · (bei gewähltem Ordner) Ordner bearbeiten. */
  function renderBar() {
    const counts = folderCounts(app.sheets, app.folders);
    const selection = validSelection(app.settings.libraryFolder, app.folders);
    const items = [];
    if (app.folders.length) {
      items.push(pill(`Alle (${counts.all})`, selection === FOLDER_ALL, () => select(FOLDER_ALL)));
      for (const folder of app.folders) {
        items.push(pill(`${folder.name} (${counts.byFolder.get(folder.id) ?? 0})`, selection === folder.id, () => select(folder.id)));
      }
      items.push(pill(`Ohne Ordner (${counts.none})`, selection === FOLDER_NONE, () => select(FOLDER_NONE)));
    }
    items.push(pill(app.folders.length ? '+ Ordner' : '+ Klassen-Ordner anlegen', null, () => openDialog(null), 'is-add'));
    const current = app.currentFolder();
    if (current) items.push(pill('Ordner bearbeiten …', null, () => openDialog(current), 'is-add'));
    bar.replaceChildren(...items);
  }

  // --- Anlegen / Umbenennen / Löschen -------------------------------------------------------------
  /** `then(folder)`: wird nach dem Anlegen mit dem neuen Ordner aufgerufen (z. B. um ein Blatt hineinzulegen). */
  function openDialog(folder, { then = null } = {}) {
    editing = folder;
    afterCreate = then;
    $('#folder-title').textContent = folder ? 'Ordner bearbeiten' : 'Neuer Ordner';
    nameInput.value = folder?.name ?? '';
    error.textContent = '';
    deleteButton.hidden = !folder;
    okButton.textContent = folder ? 'Speichern' : 'Anlegen';
    dialog.showModal();
    nameInput.focus();
    nameInput.select();
  }

  async function save() {
    const name = cleanFolderName(nameInput.value);
    if (!name) {
      error.textContent = 'Bitte einen Namen eingeben, z. B. „7b“.';
      return;
    }
    if (nameTaken(app.folders, name, editing?.id)) {
      error.textContent = `Es gibt schon einen Ordner „${name}“.`;
      return;
    }
    dialog.close();
    if (editing) {
      await app.renameFolder(editing, name);
    } else {
      const folder = await app.createFolder(name);
      if (afterCreate) await afterCreate(folder);
      else await app.setLibraryFolder(folder.id); // der neue Ordner ist gleich geöffnet
    }
    onChange();
  }

  okButton.addEventListener('click', save);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  });
  deleteButton.addEventListener('click', async () => {
    const folder = editing;
    dialog.close();
    if (folder) await app.deleteFolder(folder);
  });

  // --- Blatt verschieben ------------------------------------------------------------------------
  function pick(sheet) {
    const suggestion = folderForClass(app.folders, sheet.klasse);
    $('#folderpick-title').textContent = `Nr. ${sheet.number} · ${sheet.title}`;
    const choose = async (folderId) => {
      pickDialog.close();
      await app.moveSheet(sheet, folderId);
      onChange();
    };
    const option = (label, folderId, { primary = false } = {}) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'btn btn-primary' : 'btn';
      b.dataset.folder = folderId ?? '';
      b.textContent = label;
      if ((sheet.folderId ?? null) === folderId) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => choose(folderId));
      return b;
    };
    const buttons = app.folders.map((folder) => {
      const here = folder.id === sheet.folderId ? ' ✓' : '';
      const fits = suggestion?.id === folder.id ? ' – passt zur Klasse' : '';
      return option(`${folder.name}${here}${fits}`, folder.id, { primary: Boolean(fits) });
    });
    const none = option(`Ohne Ordner${sheet.folderId ? '' : ' ✓'}`, null);
    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'btn';
    create.textContent = '+ Neuer Ordner …';
    create.addEventListener('click', () => {
      pickDialog.close();
      openDialog(null, { then: (folder) => app.moveSheet(sheet, folder.id) });
    });
    $('#folderpick-list').replaceChildren(...buttons, none, create);
    pickDialog.showModal();
  }

  return { renderBar, pick, openDialog };
}
