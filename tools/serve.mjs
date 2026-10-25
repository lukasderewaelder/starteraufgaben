// Minimaler statischer Server für die lokale Entwicklung: node tools/serve.mjs [port]
// Liefert nie aus dem Browser-Cache (Cache-Control: no-store), damit Änderungen sofort sichtbar sind.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
};

/** Startet den Server; Port 0 wählt einen freien Port. Gibt { server, port } zurück. */
export function startServer(port = 4173) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
      if (rel.split(sep).includes('..')) throw Object.assign(new Error('forbidden'), { code: 403 });
      let file = join(root, rel);
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(err.code === 403 ? 403 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nicht gefunden');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, () => resolve({ server, port: server.address().port }));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { port } = await startServer(Number(process.argv[2] ?? process.env.PORT ?? 4173));
  console.log(`http://localhost:${port}/`);
}
