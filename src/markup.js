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

/**
 * Deutsches Dezimalkomma: „3,5“ soll in der Formel wie ein Komma zwischen Ziffern aussehen und nicht wie
 * „3, 5“ mit Leerraum (so setzt TeX ein Komma sonst als Satzzeichen). Der gespeicherte Text bleibt unverändert.
 */
export function germanDecimal(latex) {
  return latex.replace(/(\d),(?=\d)/g, '$1{,}');
}

// Befehle, deren {…}-Argument kein Zahlenwert zum Gruppieren ist (Text, Maße, Zeichencodes).
const NO_GROUP_ARG = new Set(['text', 'textrm', 'textbf', 'textit', 'textsf', 'texttt', 'hspace', 'hskip', 'kern', 'mspace', 'mskip', 'rule', 'char', 'phantom', 'color', 'href', 'url']);

/** Index hinter der zu `open` gehörenden schließenden Klammer (oder Ende des Textes). */
function endOfGroup(text, open, closeChar) {
  const openChar = text[open];
  let depth = 0;
  for (let j = open; j < text.length; j += 1) {
    if (text[j] === '\\') j += 1;
    else if (text[j] === openChar) depth += 1;
    else if (text[j] === closeChar && (depth -= 1) === 0) return j + 1;
  }
  return text.length;
}

/**
 * Tausendertrenner: Ganzzahlen ab `minDigits` Stellen bekommen ein kleines Leerzeichen (`\,`) in Dreierblöcken,
 * „1234567“ -> „1\,234\,567“. Nicht verändert werden Nachkommastellen (hinter `,`/`.`), Hochzahlen und Indizes,
 * Text und Maße (`\text{…}`, `\hspace{…}`), Zahlen direkt hinter Buchstaben und bereits getrennte Zahlen.
 * Der gespeicherte Text bleibt unverändert – das passiert nur beim Anzeigen.
 */
export function groupThousands(latex, { minDigits = 5 } = {}) {
  let out = '';
  let i = 0;
  while (i < latex.length) {
    const ch = latex[i];
    if (ch === '\\') {
      const name = latex.slice(i + 1).match(/^[A-Za-z]+/)?.[0] ?? latex[i + 1] ?? '';
      let end = i + 1 + name.length;
      if (NO_GROUP_ARG.has(name)) {
        let k = end;
        while (latex[k] === ' ') k += 1;
        if (latex[k] === '{') end = endOfGroup(latex, k, '}');
        else if (latex[k] === '"') end = k + 1 + (latex.slice(k + 1).match(/^[0-9A-Fa-f]*/)?.[0].length ?? 0);
      } else if (name === 'sqrt' && latex[end] === '[') {
        end = endOfGroup(latex, end, ']');
      }
      out += latex.slice(i, end);
      i = end;
    } else if (ch === '^' || ch === '_') {
      let end = i + 1;
      if (latex[end] === '{') end = endOfGroup(latex, end, '}');
      else if (latex[end] === '\\') end += 1 + (latex.slice(end + 1).match(/^[A-Za-z]+/)?.[0].length || 1);
      else end += 1;
      out += latex.slice(i, end);
      i = end;
    } else if (/\d/.test(ch)) {
      const run = latex.slice(i).match(/^\d+/)[0];
      const prev = out.slice(-1);
      const decimalPart = prev === ',' || prev === '.' || out.endsWith('{,}');
      const afterLetter = /[A-Za-z]/.test(prev);
      out += run.length >= minDigits && !decimalPart && !afterLetter ? run.replace(/\B(?=(\d{3})+$)/g, '\\,') : run;
      i += run.length;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

// Einstellungen des Formelsatzes (siehe „Voreinstellungen“): automatischer Tausendertrenner und Formelschrift wie das Blatt.
const options = { thousands: true, matchFont: true };
export function setMarkupOptions(next) {
  Object.assign(options, next);
}

// Zeichen, die Comic Neue direkt hat, sollen auch so erscheinen: Malpunkt U+00B7 (KaTeX nähme U+22C5), „≠“ als ein Zeichen
// (KaTeX klebt sonst ein „/“ über das „=“, das zu einer anderen Schrift nicht passt).
const MATCH_FONT_MACROS = { '\\cdot': '\\mathbin{\\char"B7}', '\\ne': '\\mathrel{\\char"2260}', '\\neq': '\\mathrel{\\char"2260}' };

/** Standard-Formelsatz über KaTeX (falls geladen), sonst der Quelltext. */
export function defaultRenderMath(latex, display) {
  const katex = globalThis.katex;
  if (!katex) return escapeHtml(display ? `$$${latex}$$` : `$${latex}$`);
  const source = options.thousands ? groupThousands(latex) : latex;
  return katex.renderToString(germanDecimal(source), {
    throwOnError: false,
    displayMode: display,
    output: 'html',
    strict: 'ignore',
    macros: options.matchFont ? { ...MATCH_FONT_MACROS } : {},
  });
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

/**
 * Zerlegt den Text in Text- und Formelstücke: [{ type: 'text', value } | { type: 'math', latex, display, open, close, start, end }].
 * start/end sind die Positionen der ganzen Formel samt Begrenzern im Quelltext (end exklusiv).
 */
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
        parts.push({ type: 'math', latex: text.slice(i + 2, end), display: true, open: '$$', close: '$$', start: i, end: end + 2 });
        i = end + 2;
      } else {
        buf += '$$';
        i += 2;
      }
    } else if (text[i] === '$') {
      const end = findInlineEnd(text, i + 1);
      if (end > i + 1) {
        flush();
        parts.push({ type: 'math', latex: text.slice(i + 1, end), display: false, open: '$', close: '$', start: i, end: end + 1 });
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
        parts.push({
          type: 'math',
          latex: text.slice(i + 2, end),
          display,
          open: display ? '\\[' : '\\(',
          close: display ? '\\]' : '\\)',
          start: i,
          end: end + 2,
        });
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
