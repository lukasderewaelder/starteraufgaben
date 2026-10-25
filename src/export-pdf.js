// PDF-Export: Blatt -> Canvas (html2canvas) -> JPEG -> PDF-Seite exakter Größe (jsPDF).
// Der Export arbeitet auf einem Klon im html2canvas-iframe; das sichtbare Blatt bleibt unberührt.
import { pageSize } from './formats.js';

const LIBS = {
  html2canvas: 'vendor/html2canvas/html2canvas.min.js',
  jspdf: 'vendor/jspdf/jspdf.umd.min.js',
};
const loading = new Map();

export class PdfExportError extends Error {}

function loadScript(src) {
  const url = new URL(src, new URL('../', import.meta.url)).href;
  if (!loading.has(url)) {
    loading.set(
      url,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = () => {
          loading.delete(url);
          reject(new PdfExportError(`Bibliothek konnte nicht geladen werden: ${src}`));
        };
        document.head.append(s);
      }),
    );
  }
  return loading.get(url);
}

async function ensureLibs() {
  if (!window.html2canvas) await loadScript(LIBS.html2canvas);
  if (!window.jspdf?.jsPDF) await loadScript(LIBS.jspdf);
}

/** Stark verkleinerte Kopie auf Helligkeitsunterschiede prüfen (iOS liefert bei zu großen Canvas leere Bilder). */
function looksBlank(canvas) {
  const probe = document.createElement('canvas');
  probe.width = 96;
  probe.height = 60;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  return max - min < 40;
}

async function renderCanvas(sheetEl, size, scales) {
  let lastError;
  for (const scale of scales) {
    try {
      const canvas = await window.html2canvas(sheetEl, {
        scale,
        width: size.w,
        height: size.h,
        windowWidth: size.w,
        windowHeight: size.h,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (doc) => {
          const clone = doc.getElementById(sheetEl.id);
          if (!clone) return;
          // Klon aus Vorschau-Rahmen lösen: ungeskaliert, links oben, nichts anderes im Bild.
          Array.from(doc.body.children).forEach((child) => {
            if (child !== clone) child.style.display = 'none';
          });
          doc.body.append(clone);
          doc.body.style.margin = '0';
          doc.documentElement.style.background = '#fff';
          clone.style.position = 'absolute';
          clone.style.left = '0px';
          clone.style.top = '0px';
          clone.style.transform = 'none';
          clone.style.margin = '0';
          clone.querySelectorAll('.is-overflow').forEach((c) => c.classList.remove('is-overflow')); // Warnmarken gehören nicht aufs Papier
        },
      });
      if (!canvas.width || !canvas.height) throw new PdfExportError('Leeres Bild (Größe 0)');
      if (looksBlank(canvas)) throw new PdfExportError('Leeres Bild (nur eine Farbe)');
      return { canvas, scale };
    } catch (err) {
      lastError = err;
    }
  }
  throw new PdfExportError(
    `Das Blatt konnte nicht in ein Bild umgewandelt werden (${lastError?.message ?? 'unbekannter Fehler'}).`,
  );
}

/**
 * Erzeugt das PDF. Gibt { blob, scale, ms, canvasPx } zurück.
 * Skalierungen werden der Reihe nach versucht (hohe Auflösung zuerst), damit schwächere Geräte
 * statt eines leeren PDFs eine gröbere Fassung bekommen.
 */
export async function createPdf(sheetEl, formatId, { quality = 0.92, scales = [2, 1.5, 1] } = {}) {
  const started = performance.now();
  const size = pageSize(formatId);
  await ensureLibs();
  if (document.fonts?.ready) await document.fonts.ready;

  const { canvas, scale } = await renderCanvas(sheetEl, size, scales);
  const canvasPx = `${canvas.width}×${canvas.height}`;
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [size.mmW, size.mmH], compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', quality), 'JPEG', 0, 0, size.mmW, size.mmH, undefined, 'FAST');
    const blob = pdf.output('blob');
    return { blob, scale, ms: Math.round(performance.now() - started), canvasPx };
  } finally {
    canvas.width = 0; // Speicher auf dem iPad sofort freigeben
    canvas.height = 0;
  }
}

export function safeFilename(name) {
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'Starteraufgaben';
}

export function pdfFile(blob, filename) {
  return new File([blob], filename, { type: 'application/pdf' });
}

export function canSharePdf(file) {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Muss direkt aus einem Tipp/Klick aufgerufen werden (Safari verlangt eine frische Nutzeraktion). */
export async function sharePdf(file) {
  try {
    await navigator.share({ files: [file], title: file.name });
    return 'geteilt';
  } catch (err) {
    if (err?.name === 'AbortError') return 'abgebrochen';
    throw err;
  }
}

export function downloadPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function openPdf(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}

/** Setzt die Papiergröße für den Druckdialog (Chrome/Edge am PC; Safari am iPad ignoriert sie teilweise). */
export function applyPrintPageSize(formatId) {
  const size = pageSize(formatId);
  let style = document.getElementById('print-page-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'print-page-style';
    document.head.append(style);
  }
  style.textContent = `@page { size: ${size.mmW}mm ${size.mmH}mm; margin: 0; }`;
}

export function printSheet(formatId) {
  applyPrintPageSize(formatId);
  window.print();
}
