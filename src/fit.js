// Auto-Anpassung: verkleinert die Schrift der Aufgaben gleichmäßig (Faktor --fit), bis alles aufs Blatt passt.
// Die Zeilen wachsen mit ihrem Inhalt (minmax(min-content, Nfr)); zu viel Inhalt drückt die letzten Zeilen über den Rand.

const MIN_FIT = 0.7;
const STEPS = 7;

const tooWide = (cell) => cell.scrollWidth > cell.clientWidth + 1;

/**
 * Setzt --fit am Blatt. Gibt { fit, overflow, cells } zurück; `cells` sind die Indizes der Aufgaben,
 * die auch bei der kleinsten Schrift nicht passen (diese bekommen die Klasse is-overflow).
 */
export function autoFit(host, { min = MIN_FIT } = {}) {
  const grid = host.querySelector('.sheet-grid');
  const cells = [...host.querySelectorAll('.cell-task')];
  cells.forEach((c) => c.classList.remove('is-overflow'));
  if (!grid) return { fit: 1, overflow: false, cells: [] };

  const tooTall = () => grid.scrollHeight > grid.clientHeight + 1;
  const overflowing = () => tooTall() || cells.some(tooWide);

  host.style.setProperty('--fit', '1');
  if (!overflowing()) return { fit: 1, overflow: false, cells: [] };

  host.style.setProperty('--fit', String(min));
  if (overflowing()) {
    // Betroffen sind Aufgaben, die zu breit sind oder deren Zeile über den unteren Rand hinausragt.
    const limit = grid.getBoundingClientRect().bottom;
    const bad = cells.filter((c) => tooWide(c) || c.getBoundingClientRect().bottom > limit + 1);
    bad.forEach((c) => c.classList.add('is-overflow'));
    return { fit: min, overflow: true, cells: bad.map((c) => Number(c.dataset.index)) };
  }

  let lo = min; // passt sicher
  let hi = 1; // passt nicht
  for (let i = 0; i < STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    host.style.setProperty('--fit', mid.toFixed(3));
    if (overflowing()) hi = mid;
    else lo = mid;
  }
  host.style.setProperty('--fit', lo.toFixed(3));
  return { fit: lo, overflow: false, cells: [] };
}
