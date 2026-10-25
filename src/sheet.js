// Arbeitsblatt: baut das DOM des Blatts aus einem Blatt-Modell und passt die Vorschau an.
import { autoFit } from './fit.js';
import { pageSize } from './formats.js';
import { markupToHtml } from './markup.js';
import { effectiveSolutionStyle } from './model.js';

export const SOLUTION_STYLES = {
  leer: 'Leer',
  kariert: 'Kariert',
  liniert: 'Liniert',
  punkte: 'Punkteraster',
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE');
}

function el(tag, className, content, field) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  if (field) node.dataset.field = field;
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID_COLOR = '#cbd5e1';
const DOT_COLOR = '#94a3b8';

/**
 * Hintergrundmuster des Lösungsfelds als Inline-SVG (kein CSS-Verlauf: html2canvas kachelt Verläufe
 * nicht zuverlässig). Das SVG ist so groß wie das größtmögliche Feld; das Feld schneidet per overflow zu.
 */
function patternSvg(style, size) {
  const { u } = size;
  const w = Math.ceil(size.w / 2);
  const h = size.h;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'sol-svg');
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('aria-hidden', 'true');

  if (style === 'kariert' || style === 'liniert') {
    const step = (style === 'kariert' ? 40 : 50) * u;
    const parts = [];
    for (let y = style === 'kariert' ? step : 47 * u; y < h; y += step) parts.push(`M0 ${y.toFixed(1)}H${w}`);
    if (style === 'kariert') for (let x = step; x < w; x += step) parts.push(`M${x.toFixed(1)} 0V${h}`);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', parts.join(''));
    path.setAttribute('stroke', GRID_COLOR);
    path.setAttribute('stroke-width', (2 * u).toFixed(2));
    path.setAttribute('fill', 'none');
    svg.append(path);
  } else {
    const step = 40 * u;
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', x.toFixed(1));
        dot.setAttribute('cy', y.toFixed(1));
        dot.setAttribute('r', (3 * u).toFixed(2));
        dot.setAttribute('fill', DOT_COLOR);
        svg.append(dot);
      }
    }
  }
  return svg;
}

function buildTaskCell(task, index, ctx) {
  const cell = el('div', 'cell cell-task');
  cell.dataset.index = String(index);
  const body = el('div', 'task-body');
  const text = el('div', 'task-text');
  text.innerHTML = markupToHtml(task.text);
  body.append(text);
  const url = task.imageId ? ctx.imageUrl?.(task.imageId) : undefined;
  if (url) {
    const img = el('img', 'task-image');
    img.alt = '';
    img.src = url;
    body.append(img);
  }
  cell.append(el('span', 'task-nr', `${index + 1}.`), body);
  return cell;
}

/**
 * Füllt `host` (das Element mit der Klasse `sheet`) mit dem Blatt und passt die Schrift an.
 * `ctx.imageUrl(id)` liefert die (bereits geladene) Blob-URL eines Bildes.
 * Gibt { size, fit } zurück; fit = Ergebnis von autoFit().
 */
function buildHead(sheet) {
  const head = el('div', 'sheet-head');
  const left = el('div', 'sheet-head-left');
  left.append(el('h1', 'sheet-title', sheet.title, 'title'));
  if (sheet.instructions?.trim()) {
    const instr = el('div', 'sheet-instr', undefined, 'instructions');
    instr.innerHTML = markupToHtml(sheet.instructions);
    left.append(instr);
  }

  const right = el('div', 'sheet-head-right');
  const meta = [
    sheet.klasse && el('span', '', `Klasse ${sheet.klasse}`, 'klasse'),
    sheet.date && el('span', '', formatDate(sheet.date), 'date'),
  ].filter(Boolean);
  if (meta.length) {
    const metaEl = el('div', 'sheet-meta');
    metaEl.append(...meta);
    right.append(metaEl);
  }
  if (sheet.zeit?.trim()) right.append(el('div', 'sheet-zeit', sheet.zeit, 'zeit'));
  right.append(el('div', 'sheet-num', sheet.number, 'number'));
  head.append(left, right);
  return head;
}

export function renderSheet(host, sheet, ctx = {}) {
  const size = pageSize(sheet.format);
  host.style.width = `${size.w}px`;
  host.style.height = `${size.h}px`;
  host.style.setProperty('--u', String(size.u));
  host.replaceChildren();

  const frame = el('div', 'sheet-frame');
  const head = buildHead(sheet);

  const grid = el('div', 'sheet-grid');
  // Jede Zeile bekommt ihren Anteil (Zeilenhöhe 1×/1,5×/2×), wächst aber bei viel Inhalt mit – wie eine Tabellenzeile.
  grid.style.gridTemplateRows = ['auto', ...sheet.tasks.map((t) => `minmax(min-content, ${t.weight || 1}fr)`)].join(' ');
  grid.append(el('div', 'cell cell-head', 'Aufgaben'), el('div', 'cell cell-head', 'Lösungen'));
  sheet.tasks.forEach((task, index) => {
    const style = effectiveSolutionStyle(sheet, task);
    const solution = el('div', `cell cell-sol sol-${style}`);
    solution.dataset.index = String(index);
    if (style !== 'leer') solution.append(patternSvg(style, size));
    grid.append(buildTaskCell(task, index, ctx), solution);
  });

  frame.append(head, grid);
  host.append(frame);
  return { size, fit: autoFit(host) };
}

/** Baut nur die Kopfzeile neu (beim Tippen in Titel, Nummer …) und passt neu an. */
export function patchHeader(host, sheet) {
  host.querySelector('.sheet-head')?.replaceWith(buildHead(sheet));
  return autoFit(host);
}

/** Aktualisiert nur den Text einer Aufgabe (beim Tippen; Bilder bleiben unberührt) und passt neu an. */
export function patchTaskText(host, sheet, index) {
  const target = host.querySelector(`.cell-task[data-index="${index}"] .task-text`);
  if (!target) return null;
  target.innerHTML = markupToHtml(sheet.tasks[index].text);
  return autoFit(host);
}

/** Skaliert das Blatt per transform in den Vorschau-Rahmen. Gibt den Skalierungsfaktor zurück. */
export function fitPreview(wrapper, host, size, pad = 16) {
  const avail = Math.max(wrapper.clientWidth - pad * 2, 100);
  const scale = Math.min(avail / size.w, 1);
  host.style.transform = `scale(${scale})`;
  host.style.left = `${pad}px`;
  host.style.top = `${pad}px`;
  wrapper.style.height = `${size.h * scale + pad * 2}px`;
  return scale;
}
