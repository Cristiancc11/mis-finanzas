// Servidor local mínimo para probar dist/ (npm run build && npm run preview) -> http://localhost:4173
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.txt': 'text/plain', '.xml': 'application/xml', '.json': 'application/json', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const root = path.resolve('dist');
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f)) { res.writeHead(404).end('404'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(4173, () => console.log('Preview en http://localhost:4173'));
