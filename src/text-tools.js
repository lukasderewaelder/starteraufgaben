// Textfeld-Werkzeuge für die Formatleiste: reine Funktionen auf (text, start, end) -> { text, start, end }.
import { splitMath } from './markup.js';

/** Fett/Kursiv/Unterstrichen: Auswahl mit Markierung umschließen bzw. die Markierung wieder entfernen. */
export function toggleWrap(text, start, end, marker) {
  const n = marker.length;
  const selected = text.slice(start, end);
  if (selected.length >= 2 * n && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(n, selected.length - n);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  if (text.slice(start - n, start) === marker && text.slice(end, end + n) === marker && start >= n) {
    return { text: text.slice(0, start - n) + selected + text.slice(end + n), start: start - n, end: end - n };
  }
  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    start: start + n,
    end: end + n,
  };
}

function lineBounds(text, start, end) {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const stop = text.indexOf('\n', end);
  return { from, to: stop === -1 ? text.length : stop };
}

const SUB = /^([a-z])\)\s+/;
const ITEM = /^[-•]\s+/;

/** Nächster Teilaufgaben-Buchstabe nach der letzten „x) “-Zeile vor `pos` (a, wenn es noch keine gibt). */
export function nextSubLabel(text, pos = text.length) {
  let last = null;
  for (const line of text.slice(0, pos).split('\n')) {
    const m = line.match(SUB);
    if (m) last = m[1];
  }
  return last ? String.fromCharCode(Math.min(last.charCodeAt(0) + 1, 'z'.charCodeAt(0))) : 'a';
}

function mapLines(text, start, end, transform) {
  const { from, to } = lineBounds(text, start, end);
  const lines = text.slice(from, to).split('\n');
  const result = transform(lines, from);
  const joined = result.join('\n');
  const delta = joined.length - (to - from);
  return {
    text: text.slice(0, from) + joined + text.slice(to),
    start: Math.min(start, from + joined.length),
    end: end + delta,
  };
}

/** Teilaufgaben a), b), … für die markierten Zeilen ein- bzw. ausschalten. */
export function toggleSubtasks(text, start, end) {
  return mapLines(text, start, end, (lines, from) => {
    const allSub = lines.every((l) => SUB.test(l));
    if (allSub) return lines.map((l) => l.replace(SUB, ''));
    let letter = nextSubLabel(text, from);
    return lines.map((l) => {
      const bare = l.replace(SUB, '').replace(ITEM, '');
      const out = `${letter}) ${bare}`;
      letter = String.fromCharCode(Math.min(letter.charCodeAt(0) + 1, 'z'.charCodeAt(0)));
      return out;
    });
  });
}

/** Aufzählungspunkte „- “ für die markierten Zeilen ein- bzw. ausschalten. */
export function toggleList(text, start, end) {
  return mapLines(text, start, end, (lines) => {
    const allItem = lines.every((l) => ITEM.test(l));
    if (allItem) return lines.map((l) => l.replace(ITEM, ''));
    return lines.map((l) => `- ${l.replace(SUB, '').replace(ITEM, '')}`);
  });
}

/** Die Formel, in der Cursor/Auswahl liegt (echt innerhalb der Begrenzer oder genau die ganze Formel); sonst null. */
export function findMathAt(text, start, end) {
  for (const part of splitMath(text)) {
    if (part.type !== 'math') continue;
    const inside = start > part.start && end < part.end;
    const whole = start === part.start && end === part.end;
    if (inside || whole) return part;
  }
  return null;
}

/** Entfernt Platzhalter-Felder des Formel-Editors (\placeholder{…}), die KaTeX nicht kennt. */
export function cleanLatex(latex) {
  return String(latex)
    .replace(/\\placeholder(\[[^\]]*\])?\{[^{}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Der Editor schreibt Ein-Ziffern-Argumente ohne Klammern (\frac34, \sqrt2): für Menschen und Textfeld lesbarer mit Klammern.
    .replace(/\\(d?t?frac)\s*(\d)\s*(\d)(?!\d)/g, '\\$1{$2}{$3}')
    .replace(/\\(d?t?frac)\s*(\d)\s*\{/g, '\\$1{$2}{')
    .replace(/\\(d?t?frac)\s*(\{[^{}]*\})\s*(\d)(?!\d)/g, '\\$1$2{$3}')
    .replace(/\\sqrt\s*(\d)(?!\d)/g, '\\sqrt{$1}');
}

/**
 * Setzt eine Formel in den Text: eine vorhandene (`hit` aus findMathAt) wird ersetzt – mit ihren Begrenzern –,
 * sonst wird `$…$` hinter der Auswahl eingefügt (mit Leerzeichen, wenn sonst Wörter zusammenklebten).
 * `large` setzt \displaystyle davor (Brüche in voller Höhe).
 */
export function putFormula(text, start, end, latex, { hit = null, large = false } = {}) {
  const body = large && !latex.startsWith('\\displaystyle') ? `\\displaystyle ${latex}` : latex;
  if (hit) {
    const wrapped = `${hit.open}${body}${hit.close}`;
    const caret = hit.start + wrapped.length;
    return { text: text.slice(0, hit.start) + wrapped + text.slice(hit.end), start: caret, end: caret };
  }
  const before = end > 0 && !/[\s([{„"]/.test(text[end - 1]) ? ' ' : '';
  const after = end < text.length && /[A-Za-zÄÖÜäöüß0-9]/.test(text[end]) ? ' ' : '';
  const wrapped = `${before}$${body}$${after}`;
  const caret = end + wrapped.length - after.length;
  return { text: text.slice(0, end) + wrapped + text.slice(end), start: caret, end: caret };
}

/** Ohne visuellen Editor: `$…$` um die Auswahl legen bzw. ein leeres Paar mit Cursor dazwischen einfügen. */
export function wrapMath(text, start, end) {
  const selected = text.slice(start, end);
  return {
    text: `${text.slice(0, start)}$${selected}$${text.slice(end)}`,
    start: start + 1,
    end: start + 1 + selected.length,
  };
}

/** Fügt Text an der Auswahl ein (ersetzt sie) und setzt den Cursor dahinter. */
export function insertAt(text, start, end, insert) {
  return { text: text.slice(0, start) + insert + text.slice(end), start: start + insert.length, end: start + insert.length };
}
