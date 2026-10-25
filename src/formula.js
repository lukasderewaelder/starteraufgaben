// Formel-Dialog mit dem visuellen Editor MathLive. Die Bibliothek (~0,8 MB) wird erst beim ersten Öffnen geladen.
import { cleanLatex } from './text-tools.js';
import { $ } from './ui.js';

// Zahlen-Tastatur für den deutschen Unterricht: Bruch-Taste mit Bruchstrich statt „÷“, Malpunkt, „:“ als
// Geteilt-Zeichen, Dezimalkomma, Prozent, Quadrat/Hochzahl/Wurzel. Die übrigen Ebenen sind die von MathLive.
const KEY_SPACER = '[separator-5]';
const NUMERIC_DE = {
  label: '123',
  labelClass: 'MLK__tex-math',
  tooltip: 'Zahlen',
  rows: [
    [
      { latex: 'x', variants: ['y', 'z', 'a', 'b', 'c', 't', 'x^2', 'x_{#?}', { latex: 'f(#?)', class: 'small' }] },
      { latex: 'n', variants: ['m', 'k', 'p', 'q'] },
      KEY_SPACER,
      '[7]',
      '[8]',
      '[9]',
      {
        latex: '\\frac{#@}{#?}',
        label: 'a⁄b',
        class: 'big-op hide-shift',
        tooltip: 'Bruch',
        variants: [{ latex: '#?\\frac{#?}{#?}', label: '<small>2 a⁄b</small>', tooltip: 'Gemischte Zahl' }, '\\div', '/'],
      },
      KEY_SPACER,
      { latex: ':', label: ':', class: 'big-op hide-shift', tooltip: 'geteilt', variants: ['\\div'] },
      { latex: '\\%', class: 'big-op hide-shift', tooltip: 'Prozent', variants: ['^{\\circ}', '\\permille'] },
      { latex: '\\pi', variants: ['e', '\\infty', '\\sin', '\\cos', '\\tan'] },
    ],
    [
      { label: '&lt;', latex: '<', class: 'hide-shift' },
      { label: '&gt;', latex: '>', class: 'hide-shift' },
      KEY_SPACER,
      '[4]',
      '[5]',
      '[6]',
      { latex: '\\cdot', label: '&middot;', class: 'big-op hide-shift', tooltip: 'mal', variants: ['\\times'] },
      KEY_SPACER,
      { latex: '#@^2', class: 'hide-shift', tooltip: 'Quadrat' },
      { latex: '#@^{#0}', class: 'hide-shift', tooltip: 'Hochzahl' },
      { latex: '\\sqrt{#0}', class: 'hide-shift', tooltip: 'Wurzel', variants: [{ latex: '\\sqrt[3]{#0}', class: 'small' }, { latex: '\\sqrt[#0]{#?}', class: 'small' }] },
    ],
    [
      '[(]',
      '[)]',
      KEY_SPACER,
      '[1]',
      '[2]',
      '[3]',
      '[-]',
      KEY_SPACER,
      { latex: '\\le', class: 'hide-shift' },
      { latex: '\\ge', class: 'hide-shift' },
      { latex: '\\neq', class: 'hide-shift' },
    ],
    [
      { label: '[backspace]', width: 2 },
      KEY_SPACER,
      '[0]',
      { latex: ',', label: ',', class: 'big-op hide-shift', tooltip: 'Komma', variants: ['.', ';'] },
      '[=]',
      '[+]',
      KEY_SPACER,
      '[left]',
      '[right]',
      { label: '[action]', width: 1 },
    ],
  ],
};
const LAYOUTS = [NUMERIC_DE, 'symbols', 'alphabetic', 'greek'];
let loading = null;

function loadMathlive() {
  loading ??= import('../vendor/mathlive/mathlive.min.mjs')
    .then(({ MathfieldElement }) => {
      MathfieldElement.fontsDirectory = null; // Schriften liefert KaTeX (gleiche Dateien)
      MathfieldElement.soundsDirectory = null;
      try {
        MathfieldElement.locale = 'de';
      } catch {
        // Sprache ist optional
      }
      try {
        if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.layouts = LAYOUTS;
      } catch (err) {
        console.warn('Eigene Tastatur nicht möglich, nutze die Standard-Tastatur:', err);
        window.mathVirtualKeyboard.layouts = ['numeric', 'symbols', 'alphabetic', 'greek'];
      }
      return MathfieldElement;
    })
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}

const readLatex = (field) => cleanLatex(field.getValue('latex-expanded'));

// Der Dialog ist bewusst NICHT modal (show() statt showModal()): ein modaler Dialog liegt in der obersten Ebene des
// Browsers, und MathLive kann die Bildschirmtastatur dort nicht am unteren Bildschirmrand platzieren. Stattdessen
// dimmt ein eigener Hintergrund (#math-overlay) die Seite, und der Rest der App ist solange „inert“.
const BACKGROUND = ['.topbar', '.workspace', '#view-library', '#view-bank'];

export function createFormulaDialog() {
  const dialog = $('#dlg-math');
  const overlay = $('#math-overlay');
  const host = $('#math-host');
  const ok = $('#math-ok');
  const large = $('#math-large');
  let field = null;
  let resolve = null;

  const finish = (result) => {
    const done = resolve;
    resolve = null;
    done?.(result);
  };
  const setBackgroundInert = (inert) => BACKGROUND.forEach((s) => document.querySelectorAll(s).forEach((e) => (e.inert = inert)));

  ok.addEventListener('click', () => {
    const latex = field ? readLatex(field) : '';
    finish(latex ? { latex, large: large.checked } : null);
    dialog.close();
  });
  overlay.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    window.mathVirtualKeyboard?.hide({ animate: false });
    overlay.hidden = true;
    setBackgroundInert(false);
    finish(null);
  });

  /**
   * Öffnet den Dialog. Gibt { latex, large } zurück oder null (abgebrochen).
   * `latex` ist der Inhalt zum Bearbeiten (ohne \displaystyle), `large` der Zustand der Größe-Option.
   */
  async function edit({ latex = '', large: wasLarge = false, title = 'Formel einfügen', confirm = 'Einfügen' } = {}) {
    if (dialog.open) return null;
    $('#math-title').textContent = title;
    ok.textContent = confirm;
    ok.disabled = true;
    large.checked = wasLarge;
    if (!field) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = 'Lade Formel-Editor …';
      host.replaceChildren(note);
    }
    const answer = new Promise((res) => {
      resolve = res;
    });
    overlay.hidden = false;
    setBackgroundInert(true);
    dialog.show();
    try {
      const MathfieldElement = await loadMathlive();
      if (!field) {
        field = new MathfieldElement();
        field.setAttribute('aria-label', 'Formel');
        const refresh = () => {
          ok.disabled = !readLatex(field);
        };
        // „input“ allein reicht nicht für jede Eingabeart (z. B. Tasten der Bildschirmtastatur) – daher auch diese.
        for (const type of ['input', 'change', 'keyup', 'pointerup']) field.addEventListener(type, refresh);
      }
      host.replaceChildren(field);
      field.value = latex;
      ok.disabled = !latex;
      field.focus();
    } catch (err) {
      console.error(err);
      const note = document.createElement('p');
      note.className = 'result-error';
      note.textContent = 'Der Formel-Editor konnte nicht geladen werden. Du kannst Formeln auch direkt mit $…$ tippen (Voreinstellungen).';
      host.replaceChildren(note);
    }
    return answer;
  }

  return { edit };
}
