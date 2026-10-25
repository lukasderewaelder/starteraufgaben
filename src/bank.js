// Aufgabenbank: Datenmodell, Filter und Hilfen. Reine Funktionen (kein DOM, kein Speicher) – gut testbar.
import { normalizeSpec } from './generators/index.js';
import { uid } from './model.js';

export const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];

/** Vorschläge für das Feld „Thema“ (zusätzlich zu den schon benutzten). */
export const SUGGESTED_TOPICS = [
  'Grundrechenarten',
  'Kopfrechnen',
  'Runden',
  'Größen und Einheiten',
  'Brüche',
  'Dezimalzahlen',
  'Prozentrechnung',
  'Terme und Gleichungen',
  'Potenzen und Wurzeln',
  'Geometrie',
  'Flächen und Umfang',
  'Körper und Volumen',
  'Daten und Zufall',
  'Textaufgaben',
];

const LIMITS = { text: 5000, topic: 80, tag: 30, tags: 12 };

/**
 * `generator`: bei Vorlagen die Beschreibung der Zufallsaufgabe (siehe generators/index.js), sonst null.
 * Bei Vorlagen ist `text` nur ein Beispiel; beim Einfügen ins Blatt werden neue Zahlen gewürfelt.
 */
export function newBankItem({ text = '', imageId = null, klassenstufe = '', thema = '', tags = [], solution = '', generator = null, now = Date.now() } = {}) {
  return {
    id: uid(),
    text,
    imageId,
    generator: normalizeSpec(generator),
    klassenstufe: GRADES.includes(klassenstufe) ? klassenstufe : '',
    thema: String(thema).trim().slice(0, LIMITS.topic),
    tags: cleanTags(tags),
    solution,
    createdAt: now,
    updatedAt: now,
  };
}

function cleanTags(tags) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tag = String(raw).trim().replace(/\s+/g, ' ').slice(0, LIMITS.tag);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

/** Schlagwörter aus einem Eingabefeld: getrennt durch Komma, Semikolon oder Zeilenumbruch. */
export function parseTags(input) {
  return cleanTags(String(input ?? '').split(/[,;\n]/));
}

/** Macht beliebige (z. B. importierte) Daten zu einer gültigen Aufgabe oder gibt null zurück. */
export function normalizeBankItem(raw, { now = Date.now() } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 100) : uid(),
    text: typeof raw.text === 'string' ? raw.text.slice(0, LIMITS.text) : '',
    imageId: typeof raw.imageId === 'string' && raw.imageId ? raw.imageId : null,
    generator: normalizeSpec(raw.generator),
    klassenstufe: GRADES.includes(raw.klassenstufe) ? raw.klassenstufe : '',
    thema: typeof raw.thema === 'string' ? raw.thema.trim().slice(0, LIMITS.topic) : '',
    tags: cleanTags(raw.tags),
    solution: typeof raw.solution === 'string' ? raw.solution.slice(0, LIMITS.text) : '',
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

/** „7b“ -> „7“, „10 a“ -> „10“; sonst leer. */
export function gradeFromClass(klasse) {
  const m = String(klasse ?? '').match(/^\s*(\d{1,2})/);
  return m && GRADES.includes(m[1]) ? m[1] : '';
}

const fold = (s) => String(s).toLowerCase();

/** Alle Suchwörter müssen in Text, Thema oder Schlagwörtern vorkommen. */
export function matchesQuery(item, query) {
  const words = fold(query ?? '').split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold([item.text, item.thema, ...item.tags].join('\n'));
  return words.every((w) => haystack.includes(w));
}

/** Filter: leere Werte bedeuten „alle“. */
export function filterBank(items, { query = '', klassenstufe = '', thema = '', tag = '' } = {}) {
  return items.filter(
    (item) =>
      (!klassenstufe || item.klassenstufe === klassenstufe) &&
      (!thema || item.thema === thema) &&
      (!tag || item.tags.some((t) => fold(t) === fold(tag))) &&
      matchesQuery(item, query),
  );
}

/** Neueste zuerst. */
export const sortBank = (items) => [...items].sort((a, b) => b.updatedAt - a.updatedAt);

/** Werte für die Filter: benutzte Klassenstufen (aufsteigend), Themen und Schlagwörter (alphabetisch, mit Anzahl). */
export function facets(items) {
  const klassen = new Set();
  const themen = new Map();
  const tags = new Map();
  for (const item of items) {
    if (item.klassenstufe) klassen.add(item.klassenstufe);
    if (item.thema) themen.set(item.thema, (themen.get(item.thema) ?? 0) + 1);
    for (const tag of item.tags) {
      const key = fold(tag);
      const entry = tags.get(key) ?? { tag, count: 0 };
      entry.count += 1;
      tags.set(key, entry);
    }
  }
  const byName = (a, b) => a.localeCompare(b, 'de');
  return {
    klassenstufen: [...klassen].sort((a, b) => Number(a) - Number(b)),
    themen: [...themen.keys()].sort(byName),
    tags: [...tags.values()].sort((a, b) => byName(a.tag, b.tag)),
  };
}

/** Themenvorschläge: benutzte zuerst, dann die übrigen Standard-Themen. */
export function topicSuggestions(items) {
  const used = facets(items).themen;
  return [...used, ...SUGGESTED_TOPICS.filter((t) => !used.includes(t))];
}

/** Gibt eine Aufgabe mit gleichem Text und Bild zurück (damit „In Bank speichern“ nichts doppelt anlegt). Vorlagen zählen nicht. */
export function findDuplicate(items, text, imageId = null) {
  const norm = (t) => String(t).replace(/\s+/g, ' ').trim();
  return items.find((i) => !i.generator && norm(i.text) === norm(text) && (i.imageId ?? null) === (imageId ?? null)) ?? null;
}

/** Gibt eine Vorlage mit denselben Einstellungen zurück (die Zufallszahlen im Beispieltext spielen keine Rolle). */
export function findTemplate(items, spec) {
  const key = JSON.stringify(normalizeSpec(spec));
  return items.find((i) => i.generator && JSON.stringify(i.generator) === key) ?? null;
}

export const imageIdsOfBank = (items) => items.map((i) => i.imageId).filter(Boolean);
