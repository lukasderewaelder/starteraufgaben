// Mini-Markup für Aufgabentexte -> HTML. Reine Funktion; der Formelsatz wird per Callback eingesetzt.
//
//   $…$ / $$…$$ / \(…\) / \[…\]   Formeln (LaTeX), \$ = ein echtes Dollarzeichen
//   **fett**   *kursiv*   __unterstrichen__
//   a) Text    Teilaufgabe (Buchstabe + Klammer am Zeilenanfang)
//   - Text     Aufzählung
//
// Der Text wird immer zuerst HTML-escaped; nur die hier erzeugten Tags gelangen ins Ergebnis.

const PH_START = '';
const PH_END = '';

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Standard-Formelsatz über KaTeX (falls geladen), sonst der Quelltext. */
export function defaultRenderMath(latex, display) {
  const katex = globalThis.katex;
  if (!katex) return escapeHtml(display ? `$$${latex}$$` : `$${latex}$`);
  return katex.renderToString(latex, { throwOnError: false, displayMode: display, output: 'html', strict: 'ignore' });
}

// Sucht das Ende einer Inline-Formel ab `from`; Rückgabe -1, wenn keines existiert (oder ein Zeilenumbruch dazwischen liegt).
function findInlineEnd(text, from) {
  for (let j = from; j < text.length; j += 1) {
    const ch = text[j];
    if (ch === '\\') j += 1;
    else if (ch === '\n') return -1;
    else if (ch === '$') return j;
  }
  return -1;
}

/** Zerlegt den Text in Text- und Formelstücke: [{ type: 'text', value } | { type: 'math', latex, display }]. */
export function splitMath(text) {
  const parts = [];
  let buf = '';
  const flush = () => {
    if (buf) parts.push({ type: 'text', value: buf });
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('\\$', i)) {
      buf += '$';
      i += 2;
    } else if (text.startsWith('$$', i)) {
      const end = text.indexOf('$$', i + 2);
      if (end > i + 2) {
        flush();
        parts.push({ type: 'math', latex: text.slice(i + 2, end), display: true });
        i = end + 2;
      } else {
        buf += '$$';
        i += 2;
      }
    } else if (text[i] === '$') {
      const end = findInlineEnd(text, i + 1);
      if (end > i + 1) {
        flush();
        parts.push({ type: 'math', latex: text.slice(i + 1, end), display: false });
        i = end + 1;
      } else {
        buf += '$';
        i += 1;
      }
    } else if (text.startsWith('\\(', i) || text.startsWith('\\[', i)) {
      const display = text[i + 1] === '[';
      const end = text.indexOf(display ? '\\]' : '\\)', i + 2);
      if (end > i + 2) {
        flush();
        parts.push({ type: 'math', latex: text.slice(i + 2, end), display });
        i = end + 2;
      } else {
        buf += text[i];
        i += 1;
      }
    } else {
      buf += text[i];
      i += 1;
    }
  }
  flush();
  return parts;
}

function inline(escaped) {
  return escaped
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)(.+?)(?<=\S)__/g, '<u>$1</u>')
    .replace(/(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])/g, '<em>$1</em>');
}

function renderLine(line) {
  const sub = line.match(/^([a-z])\)\s+(.*)$/);
  if (sub) {
    return `<div class="ln sub"><span class="lbl">${sub[1]})</span><span class="txt">${inline(escapeHtml(sub[2]))}</span></div>`;
  }
  const item = line.match(/^[-•]\s+(.*)$/);
  if (item) {
    return `<div class="ln li"><span class="lbl">•</span><span class="txt">${inline(escapeHtml(item[1]))}</span></div>`;
  }
  if (line.trim() === '') return '<div class="ln blank"><br></div>';
  return `<div class="ln">${inline(escapeHtml(line))}</div>`;
}

export function markupToHtml(text, { renderMath = defaultRenderMath } = {}) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n').replaceAll(PH_START, '').replaceAll(PH_END, '');
  const math = [];
  const withPlaceholders = splitMath(source)
    .map((part) => {
      if (part.type === 'text') return part.value;
      math.push(renderMath(part.latex, part.display));
      return `${PH_START}${math.length - 1}${PH_END}`;
    })
    .join('');
  const html = withPlaceholders.split('\n').map(renderLine).join('');
  return html.replace(new RegExp(`${PH_START}(\\d+)${PH_END}`, 'g'), (_, n) => math[Number(n)]);
}
