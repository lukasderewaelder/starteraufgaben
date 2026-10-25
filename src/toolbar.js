// Formatleiste für Aufgabentexte (fett, kursiv, Teilaufgaben, Liste, Formel) – gemeinsam für Blatt-Editor und Aufgabenbank.
import { findMathAt, putFormula, toggleList, toggleSubtasks, toggleWrap, wrapMath } from './text-tools.js';

const TOOLS = {
  bold: (v, s, e) => toggleWrap(v, s, e, '**'),
  italic: (v, s, e) => toggleWrap(v, s, e, '*'),
  underline: (v, s, e) => toggleWrap(v, s, e, '__'),
  sub: toggleSubtasks,
  list: toggleList,
};

/**
 * Verdrahtet die Knöpfe (data-tool) in `toolbar` mit `textarea`. Änderungen lösen ein „input“-Ereignis am Textfeld aus,
 * damit der Aufrufer (Vorschau, Speichern, Rückgängig) wie bei normalem Tippen reagiert.
 * `isActive()` sagt, ob das Textfeld noch zum selben Gegenstand gehört (z. B. nach dem Schließen eines Dialogs).
 */
export function wireTextToolbar({ toolbar, textarea, app, isActive = () => true }) {
  function applyToText(result, { focus = true } = {}) {
    textarea.value = result.text;
    textarea.setSelectionRange(result.start, result.end);
    if (focus) textarea.focus();
    textarea.dispatchEvent(new Event('input'));
  }

  // Formel einfügen oder ändern: liegt der Cursor in einer Formel, wird diese im Editor geöffnet.
  async function formulaTool() {
    const { value, selectionStart: start, selectionEnd: end } = textarea;
    if (!app.settings.formulaEditor) {
      applyToText(wrapMath(value, start, end));
      return;
    }
    const hit = findMathAt(value, start, end);
    const wasLarge = Boolean(hit?.latex.trimStart().startsWith('\\displaystyle'));
    const result = await app.formula.edit({
      latex: hit ? hit.latex.replace(/^\s*\\displaystyle\s*/, '') : '',
      large: wasLarge,
      title: hit ? 'Formel ändern' : 'Formel einfügen',
      confirm: hit ? 'Übernehmen' : 'Einfügen',
    });
    if (!result || !isActive()) return;
    // Der Dialog sperrt die Seite, der Text kann sich währenddessen nicht ändern; die Auswahl bleibt im Feld erhalten.
    applyToText(putFormula(textarea.value, start, end, result.latex, { hit, large: result.large }), { focus: false });
  }

  toolbar.querySelectorAll('[data-tool]').forEach((button) => {
    // Fokus im Textfeld lassen, damit am iPad die Tastatur offen bleibt.
    button.addEventListener('pointerdown', (e) => e.preventDefault());
    button.addEventListener('click', () => {
      if (button.dataset.tool === 'math') {
        formulaTool();
        return;
      }
      const tool = TOOLS[button.dataset.tool];
      if (tool) applyToText(tool(textarea.value, textarea.selectionStart, textarea.selectionEnd));
    });
  });
}
