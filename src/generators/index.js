// Zufallsaufgaben: Einstellungen prüfen, Aufgaben würfeln und zu Blatt-Aufgaben zusammensetzen. Reine Funktionen.
import { GENERATOR_LIST } from './defs.js';
import { makeRng, randomSeed } from './rng.js';

export { randomSeed } from './rng.js';

export const MAX_ITEMS = 8;
const LETTERS = 'abcdefgh';

export const GENERATORS = GENERATOR_LIST;
const BY_ID = new Map(GENERATOR_LIST.map((g) => [g.id, g]));

export const getGenerator = (id) => BY_ID.get(id) ?? null;

/** Typen nach Gruppen für die Auswahl: [[Gruppenname, [Typ, …]], …] in Reihenfolge der Definition. */
export function generatorGroups() {
  const groups = new Map();
  for (const g of GENERATOR_LIST) groups.set(g.group, [...(groups.get(g.group) ?? []), g]);
  return [...groups.entries()];
}

/** Bringt rohe Einstellungen in die gültige Form (Grenzen, Auswahlwerte, von ≤ bis). */
export function normalizeParams(def, raw) {
  const out = {};
  for (const p of def.params) {
    const v = raw?.[p.key];
    if (p.kind === 'int') {
      const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Math.round(Number(v)) : NaN;
      out[p.key] = Number.isFinite(n) ? Math.min(p.max, Math.max(p.min, n)) : p.default;
    } else if (p.kind === 'bool') {
      out[p.key] = typeof v === 'boolean' ? v : p.default;
    } else if (p.kind === 'select') {
      out[p.key] = p.options.some(([value]) => value === v) ? v : p.default;
    } else if (p.kind === 'multi') {
      const list = Array.isArray(v) ? p.options.map(([value]) => value).filter((value) => v.includes(value)) : [];
      out[p.key] = list.length ? list : [...p.default];
    }
  }
  if ('min' in out && 'max' in out && out.min > out.max) [out.min, out.max] = [out.max, out.min];
  return out;
}

/** Wird die Einstellung unter den aktuellen Werten angezeigt? (`when: { schlüssel: [erlaubte Werte] }`) */
export const paramVisible = (param, params) => !param.when || Object.entries(param.when).every(([key, allowed]) => allowed.includes(params[key]));

export function defaultSpec(type) {
  const def = getGenerator(type);
  if (!def) return null;
  return { type, params: normalizeParams(def, {}), count: def.defaults.count, layout: def.defaults.layout };
}

/** Macht beliebige (z. B. importierte) Daten zu einer gültigen Beschreibung { type, params, count, layout } oder null. */
export function normalizeSpec(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const def = getGenerator(raw.type);
  if (!def) return null;
  const count = Math.round(Number(raw.count));
  return {
    type: def.id,
    params: normalizeParams(def, raw.params),
    count: Number.isFinite(count) ? Math.min(MAX_ITEMS, Math.max(1, count)) : def.defaults.count,
    layout: raw.layout === 'single' || raw.layout === 'parts' ? raw.layout : def.defaults.layout,
  };
}

export const specsEqual = (a, b) => JSON.stringify(normalizeSpec(a)) === JSON.stringify(normalizeSpec(b));

/** Hinweis, wenn die Einstellungen sich nicht sinnvoll umsetzen lassen (sonst null). */
export function checkSpec(spec) {
  const def = getGenerator(spec.type);
  return def?.check ? def.check(normalizeParams(def, spec.params)) : null;
}

/** Wie viele Aufgaben auf dem Blatt entstehen: einzeln = Anzahl, mit Teilaufgaben = 1. */
export const taskCount = (spec) => (spec.layout === 'single' ? spec.count : 1);

/**
 * Würfelt die Einzelaufgaben. `seeds[i]` bestimmt Aufgabe i; Wiederholungen innerhalb eines Satzes werden vermieden.
 * Gibt eine Liste zurück; Einträge sind null, wenn mit den Einstellungen keine Aufgabe möglich ist.
 */
export function rollItems(spec, seeds) {
  const def = getGenerator(spec.type);
  if (!def) return [];
  const params = normalizeParams(def, spec.params);
  const seen = new Set();
  const items = [];
  for (let i = 0; i < spec.count; i += 1) {
    const base = seeds?.[i] ?? randomSeed();
    let found = null;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const candidate = def.item(makeRng((base + attempt * 7919) >>> 0), params);
      if (!candidate) break;
      found = candidate;
      if (!seen.has(candidate.text)) break;
    }
    if (found) seen.add(found.text);
    items.push(found);
  }
  return items;
}

/** Setzt gewürfelte Einzelaufgaben zu Blatt-Aufgaben zusammen: [{ text, solution, generator }]. */
export function buildTasks(spec, items) {
  const def = getGenerator(spec.type);
  const params = normalizeParams(def, spec.params);
  const instruction = def.instruction(params);
  const clean = items.filter(Boolean);
  if (spec.layout === 'single' || clean.length === 1) {
    return clean.map((it) => ({
      text: `${instruction} ${it.text}`,
      solution: it.solution,
      generator: { ...spec, params, count: 1, layout: 'single' },
    }));
  }
  return [
    {
      text: `${instruction}\n${clean.map((it, i) => `${LETTERS[i]}) ${it.text}`).join('\n')}`,
      solution: clean.map((it, i) => `${LETTERS[i]}) ${it.solution}`).join('\n'),
      generator: { ...spec, params, count: clean.length, layout: 'parts' },
    },
  ];
}

/** Würfelt mit frischen Zufallswerten und liefert { tasks, items, error }. */
export function generateTasks(spec, seeds) {
  const normalized = normalizeSpec(spec);
  if (!normalized) return { tasks: [], items: [], error: 'Unbekannter Aufgabentyp.' };
  const problem = checkSpec(normalized);
  if (problem) return { tasks: [], items: [], error: problem };
  const items = rollItems(normalized, seeds);
  if (!items.length || items.some((it) => !it)) {
    return { tasks: [], items, error: 'Mit diesen Einstellungen lässt sich keine passende Aufgabe erzeugen – bitte den Zahlenraum anpassen.' };
  }
  return { tasks: buildTasks(normalized, items), items, error: null };
}

/** Neue Zufallswerte für eine Aufgabe, die schon eine Beschreibung hat („Neu würfeln“). */
export function rollTask(spec) {
  const { tasks, error } = generateTasks(spec);
  return error ? null : tasks[0];
}

/** Kurze Beschreibung für Anzeigen: „Brüche kürzen · Zahlenraum 2–60 · 3 Teilaufgaben“. */
export function describeSpec(spec) {
  const def = getGenerator(spec.type);
  if (!def) return 'Unbekannter Aufgabentyp';
  const p = normalizeParams(def, spec.params);
  const parts = [def.label];
  if ('min' in p && 'max' in p) parts.push(`Zahlenraum ${p.min}–${p.max}`);
  if ('decimals' in p && p.decimals > 0 && def.params.find((x) => x.key === 'decimals' && paramVisible(x, p))) {
    parts.push(`${p.decimals} Dezimalstelle${p.decimals === 1 ? '' : 'n'}`);
  }
  parts.push(spec.layout === 'single' ? (spec.count === 1 ? '1 Aufgabe' : `${spec.count} einzelne Aufgaben`) : `${spec.count} Teilaufgaben`);
  return parts.join(' · ');
}
