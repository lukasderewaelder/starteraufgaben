// Textfeld-Werkzeuge für die Formatleiste: reine Funktionen auf (text, start, end) -> { text, start, end }.

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

/** Fügt Text an der Auswahl ein (ersetzt sie) und setzt den Cursor dahinter. */
export function insertAt(text, start, end, insert) {
  return { text: text.slice(0, start) + insert + text.slice(end), start: start + insert.length, end: start + insert.length };
}
