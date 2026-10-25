// Kleine gemeinsame Helfer für die Oberfläche.

export const $ = (selector, root = document) => root.querySelector(selector);

/** Füllt ein <select>; `withDefault` fügt vorn einen Eintrag mit leerem Wert ein. */
export function fill(select, entries, withDefault) {
  select.replaceChildren();
  if (withDefault) select.add(new Option(withDefault, ''));
  for (const [value, label] of entries) select.add(new Option(label, value));
}

export const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2).replace('.', ',')} MB`;

let toastTimer = null;

/** Kurze Meldung unten; optional mit Knopf (z. B. „Rückgängig“). */
export function toast(text, { action, onAction, ms = 6000 } = {}) {
  $('#toast-text').textContent = text;
  const button = $('#toast-action');
  button.hidden = !action;
  button.textContent = action ?? '';
  button.onclick = () => {
    $('#toast').hidden = true;
    onAction?.();
  };
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('#toast').hidden = true;
  }, ms);
}

/** Schließen-Knöpfe ([data-close]) und Klick auf den Hintergrund für alle <dialog>. */
export function wireDialogs() {
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) {
        dialog.close();
      } else if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (outside) dialog.close();
      }
    });
  });
}

/** Teilt eine Datei über das Teilen-Menü (wenn möglich) oder lädt sie herunter. */
export function fileDeliverable(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  const canShare = typeof navigator.canShare === 'function' && (() => {
    try {
      return navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  })();
  return {
    file,
    canShare,
    async share() {
      try {
        await navigator.share({ files: [file], title: name });
        return true;
      } catch (err) {
        if (err?.name === 'AbortError') return false;
        throw err;
      }
    },
    download() {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };
}
