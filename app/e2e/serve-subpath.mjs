/**
 * Serves app/dist from a repository-style SUBPATH, exactly as GitHub Pages
 * does for a project site. Anything that only works at the domain root — a
 * bare "/assets/…" href, a BrowserRouter deep link — fails here, which is the
 * point (PLAN gotcha P, test 47).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../dist');
const BASE = process.env.SUBPATH ?? '/cmmc-self-assessment';
const PORT = Number(process.env.PORT ?? 4317);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('outside base');
    return;
  }
  let rel = url.pathname.slice(BASE.length) || '/';
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // Deliberately NO SPA fallback. GitHub Pages does not have one either, so a
    // missing asset must surface as a real 404 in the test.
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(PORT, () => {
  console.log(`serving ${ROOT} at http://localhost:${PORT}${BASE}/`);
});
