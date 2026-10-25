// Bilder für Aufgaben: verkleinern (spart Speicher und Export-Zeit auf dem iPad) und als Blob-URL bereitstellen.
import { uid } from './model.js';

const MAX_EDGE = 1400;
const PNG_LIMIT = 1_500_000; // größere PNGs werden zu JPEG

function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht umgewandelt werden'))), type, quality);
  });
}

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return createImageBitmap(file);
  }
}

/** Liest eine Bilddatei, verkleinert sie auf höchstens 1400 px Kantenlänge und gibt { id, blob, width, height } zurück. */
export async function prepareImage(file) {
  const bitmap = await decode(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let blob = file.type === 'image/png' ? await toBlob(canvas, 'image/png') : null;
  if (!blob || blob.size > PNG_LIMIT) blob = await toBlob(canvas, 'image/jpeg', 0.9);
  canvas.width = 0;
  canvas.height = 0;
  return { id: uid(), blob, width, height };
}

const urls = new Map();

/** Blob-URL für eine Bild-ID (zwischengespeichert); undefined, wenn das Bild fehlt. */
export async function imageUrl(store, id) {
  if (urls.has(id)) return urls.get(id);
  const row = await store.getImage(id);
  if (!row?.blob) return undefined;
  const url = URL.createObjectURL(row.blob);
  urls.set(id, url);
  return url;
}

export function cachedImageUrl(id) {
  return urls.get(id);
}

export function rememberImage(id, blob) {
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob));
}
