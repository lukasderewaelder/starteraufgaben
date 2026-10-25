// Schreibt Dateiliste und Versionskennung in sw.js (zwischen den Marken ">>> precache" / "<<< precache").
// Aufruf: node tools/precache.mjs          -> sw.js aktualisieren
//         node tools/precache.mjs --check  -> Exit-Code 1, wenn sw.js veraltet ist
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const swPath = join(root, 'sw.js');

// Was zur laufenden App gehört (alles andere – Tests, Doku, Werkzeuge – nicht).
const ENTRY_FILES = ['index.html', 'manifest.webmanifest'];
const ENTRY_DIRS = ['assets', 'src', 'vendor'];
const SKIP_NAME = /^(LICENSE.*|README.*|\.DS_Store|Thumbs\.db)$/i;
const TEXT_EXT = /\.(html|css|js|mjs|json|webmanifest|svg|txt|md)$/i;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return SKIP_NAME.test(entry.name) ? [] : [full];
  });
}

export function collectAssets() {
  const files = [
    ...ENTRY_FILES.map((f) => join(root, f)),
    ...ENTRY_DIRS.flatMap((d) => walk(join(root, d))),
  ];
  return files
    .filter((f) => statSync(f).isFile())
    .map((f) => relative(root, f).split(sep).join('/'))
    .sort();
}

export function buildBlock() {
  const paths = collectAssets();
  const hash = createHash('sha256');
  for (const p of paths) {
    let data = readFileSync(join(root, p));
    if (TEXT_EXT.test(p)) data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
    hash.update(p).update('\0').update(data).update('\0');
  }
  const version = hash.digest('hex').slice(0, 10);
  const list = ['./', ...paths.map((p) => `./${p}`)];
  return [
    '// >>> precache',
    `const VERSION = '${version}';`,
    'const ASSETS = [',
    ...list.map((p) => `  '${p}',`),
    '];',
    '// <<< precache',
  ].join('\n');
}

const BLOCK_RE = /\/\/ >>> precache[\s\S]*?\/\/ <<< precache/;

export function currentAndExpected() {
  const sw = readFileSync(swPath, 'utf8').replace(/\r\n/g, '\n');
  if (!BLOCK_RE.test(sw)) throw new Error('Marken ">>> precache" fehlen in sw.js');
  const expected = sw.replace(BLOCK_RE, buildBlock());
  return { sw, expected };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { sw, expected } = currentAndExpected();
  if (process.argv.includes('--check')) {
    if (sw !== expected) {
      console.error('sw.js ist veraltet. Bitte "node tools/precache.mjs" ausführen.');
      process.exit(1);
    }
    console.log('sw.js ist aktuell.');
  } else if (sw !== expected) {
    writeFileSync(swPath, expected, 'utf8');
    console.log(`sw.js aktualisiert (${collectAssets().length} Dateien).`);
  } else {
    console.log('sw.js war schon aktuell.');
  }
}
