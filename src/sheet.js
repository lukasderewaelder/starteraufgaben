// Arbeitsblatt: baut das DOM des Blatts aus einem Blatt-Modell und passt die Vorschau an.
import { pageSize } from './formats.js';

export const SOLUTION_STYLES = {
  leer: 'Leer',
  kariert: 'Kariert',
  liniert: 'Liniert',
  punkte: 'Punkteraster',
};

const MATH_DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '$', right: '$', display: false },
  { left: '\\(', right: '\\)', display: false },
  { left: '\\[', right: '\\]', display: true },
];

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function textToHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE');
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
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

/** Füllt `host` (das Element mit der Klasse `sheet`) mit dem Blatt. */
export function renderSheet(host, sheet) {
  const size = pageSize(sheet.format);
  host.style.width = `${size.w}px`;
  host.style.height = `${size.h}px`;
  host.style.setProperty('--u', String(size.u));
  host.replaceChildren();

  const frame = el('div', 'sheet-frame');

  const head = el('div', 'sheet-head');
  const left = el('div', 'sheet-head-left');
  left.append(el('h1', 'sheet-title', sheet.title));
  if (sheet.instructions?.trim()) {
    const instr = el('div', 'sheet-instr');
    instr.innerHTML = textToHtml(sheet.instructions);
    left.append(instr);
  }
  const right = el('div', 'sheet-head-right');
  const meta = [sheet.klasse && `Klasse ${sheet.klasse}`, formatDate(sheet.date)].filter(Boolean);
  if (meta.length) {
    const metaEl = el('div', 'sheet-meta');
    meta.forEach((m) => metaEl.append(el('span', '', m)));
    right.append(metaEl);
  }
  if (sheet.zeit?.trim()) right.append(el('div', 'sheet-zeit', sheet.zeit));
  right.append(el('div', 'sheet-num', sheet.number));
  head.append(left, right);

  const grid = el('div', 'sheet-grid');
  const rows = sheet.tasks.map((t) => `minmax(0, ${t.weight || 1}fr)`);
  grid.style.gridTemplateRows = ['auto', ...rows].join(' ');
  grid.append(el('div', 'cell cell-head', 'Aufgaben'), el('div', 'cell cell-head', 'Lösungen'));

  sheet.tasks.forEach((task, index) => {
    const cell = el('div', 'cell cell-task');
    cell.dataset.index = String(index);
    const body = el('div', 'task-body');
    body.innerHTML = textToHtml(task.text);
    cell.append(el('span', 'task-nr', `${index + 1}.`), body);
    const style = task.solutionStyle || sheet.solutionDefault || 'leer';
    const solution = el('div', `cell cell-sol sol-${style}`);
    if (style !== 'leer') solution.append(patternSvg(style, size));
    grid.append(cell, solution);
  });

  frame.append(head, grid);
  host.append(frame);

  if (window.renderMathInElement) {
    window.renderMathInElement(host, { delimiters: MATH_DELIMITERS, throwOnError: false });
  }
  return size;
}

/** Skaliert das Blatt per transform in den Vorschau-Rahmen. */
export function fitPreview(wrapper, host, size, pad = 16) {
  const avail = Math.max(wrapper.clientWidth - pad * 2, 100);
  const scale = Math.min(avail / size.w, 1);
  host.style.transform = `scale(${scale})`;
  host.style.left = `${pad}px`;
  host.style.top = `${pad}px`;
  wrapper.style.height = `${size.h * scale + pad * 2}px`;
  return scale;
}
