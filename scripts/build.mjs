// Build de FinanzasPro: minifica, versiona con hash, autohospeda librerías y deja todo en dist/.
// Uso: npm run build
import { transform, build as esbuild } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const NM = path.join(ROOT, 'node_modules');
const A = '_assets'; // carpeta con archivos con hash -> cache inmutable de 1 año

const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
const rel = (p) => path.relative(ROOT, p);

rm(DIST); mkdir(path.join(DIST, A));
const report = [];
const logical = {};  // ruta lógica en el código fuente -> ruta pública con hash

function emit(code, logicalPath, name, ext) {
  const buf = Buffer.isBuffer(code) ? code : Buffer.from(code, 'utf8');
  const file = `${name}.${hash(buf)}.${ext}`;
  fs.writeFileSync(path.join(DIST, A, file), buf);
  logical[logicalPath] = `/${A}/${file}`;
  report.push({ file: `${A}/${file}`, raw: buf.length, gz: zlib.gzipSync(buf).length });
}
const stripMap = (s) => s.replace(/\n?\/\/# sourceMappingURL=.*$/gm, '');
const read = (p) => fs.readFileSync(p);

// 1) Librerías de terceros: autohospedadas desde node_modules (versiones fijadas en package-lock.json)
const vendor = [
  ['/vendor/chart.js',            'chart.js/dist/chart.umd.min.js',                'chart',            'js'],
  ['/vendor/supabase.js',         '@supabase/supabase-js/dist/umd/supabase.js',    'supabase',         'js'],
  ['/vendor/xlsx.js',             'xlsx/dist/xlsx.full.min.js',                    'xlsx',             'js'],
  ['/vendor/jspdf.js',            'jspdf/dist/jspdf.umd.min.js',                   'jspdf',            'js'],
  ['/vendor/jspdf-autotable.js',  'jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'jspdf-autotable', 'js'],
  ['/vendor/pdf.mjs',             'pdfjs-dist/legacy/build/pdf.min.mjs',           'pdf',              'mjs'],
  ['/vendor/pdf.worker.mjs',      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',    'pdf.worker',       'mjs'],
];
for (const [lp, src, name, ext] of vendor) emit(stripMap(read(path.join(NM, src)).toString('utf8')), lp, name, ext);

// pdf.js carga estas carpetas por URL cuando las necesita (fuentes estándar y decodificadores wasm)
for (const d of ['standard_fonts', 'wasm']) {
  fs.cpSync(path.join(NM, 'pdfjs-dist', d), path.join(DIST, 'vendor', 'pdfjs', d), { recursive: true });
}

// 2) Código propio de la app
// Escala tipográfica: el 52 % del texto original era < 12,5 px (ilegible en paneles OLED y en modo claro).
// Se aplica SOLO al código original (styles.css, app.js, app/index.html); theme.css ya usa la escala nueva.
// 9–10 px → 12 · 11 → 12,5 · desde 12 px: +8 % redondeado a 0,5. No toca los tamaños numéricos de Chart.js.
const scaleFonts = (text) => text.replace(/(font-size:\s*)(\d+(?:\.\d+)?)px/gi, (m, pre, n) => {
  const s = parseFloat(n);
  if (s >= 36) return m;
  const out = s < 11 ? 12 : s < 12 ? 12.5 : Math.round(s * 1.08 * 2) / 2;
  return `${pre}${out}px`;
});
const min = async (file, loader, pre = (x) => x) => (await transform(pre(read(path.join(ROOT, file)).toString('utf8')), {
  loader, minify: true, target: 'es2020', legalComments: 'none',
  // Sin format/bundle: esbuild conserva los nombres globales (los onclick="..." dependen de ellos)
})).code;

const rewrite = (text) => Object.entries(logical).reduce((t, [k, v]) => t.split(k).join(v), text);

emit(await min('app/styles.css', 'css', scaleFonts), 'styles.css', 'styles', 'css');
emit(await min('app/theme.css', 'css'), 'theme.css', 'theme', 'css');
// lazy-libs.js contiene rutas /vendor/... que hay que reescribir ANTES de calcular su hash
emit(rewrite(await min('app/lazy-libs.js', 'js')), 'lazy-libs.js', 'lazy-libs', 'js');
emit(await min('app/ui-polish.js', 'js'), 'ui-polish.js', 'ui-polish', 'js');
// Núcleo de cálculos (src/core): se carga antes que app.js y queda como window.FPCore
const coreBundle = await esbuild({
  entryPoints: [path.join(ROOT, 'src/core/global.ts')], bundle: true, write: false, minify: true,
  format: 'iife', target: 'es2020', legalComments: 'none', logLevel: 'warning',
});
emit(coreBundle.outputFiles[0].text, 'core.js', 'core', 'js');

// Islas React (TypeScript): React + componentes en un solo archivo minificado, con hash
const islands = await esbuild({
  entryPoints: [path.join(ROOT, 'src/react/main.tsx')], bundle: true, write: false, minify: true,
  format: 'iife', target: 'es2020', jsx: 'automatic', legalComments: 'none', logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
});
emit(islands.outputFiles[0].text, 'islands.js', 'islands', 'js');
emit(await min('app/app.js', 'js', scaleFonts), 'app.js', 'app', 'js');

// 3) HTML: reescribe referencias a archivos con hash
for (const f of ['index.html', 'contacto.html', 'privacidad.html', 'terminos.html', 'app/index.html']) {
  let html = read(path.join(ROOT, f)).toString('utf8');
  if (f === 'app/index.html') html = scaleFonts(html);
  html = rewrite(html)
    .replace(/(href|src)="(styles\.css|theme\.css|app\.js|lazy-libs\.js|ui-polish\.js|islands\.js|core\.js)"/g, (m, attr, name) => `${attr}="${logical[name]}"`);
  mkdir(path.dirname(path.join(DIST, f)));
  fs.writeFileSync(path.join(DIST, f), html);
}

// 4) Archivos estáticos
fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
if (fs.existsSync(path.join(ROOT, 'CNAME'))) fs.copyFileSync(path.join(ROOT, 'CNAME'), path.join(DIST, 'CNAME'));
if (fs.existsSync(path.join(ROOT, 'public'))) fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });

// 5) Verificaciones: todo archivo referenciado existe y no quedó ninguna ruta lógica sin reescribir
let errors = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(DIST).filter(p => /\.(html|js)$/.test(p) && !p.includes(`${path.sep}vendor${path.sep}`) && !path.basename(p).startsWith('pdf') && !/xlsx|jspdf|chart|supabase/.test(path.basename(p)))) {
  const text = fs.readFileSync(f, 'utf8');
  for (const lp of Object.keys(logical).filter(k => k.startsWith('/vendor/'))) {
    if (text.includes(lp)) { console.error(`✗ ${rel(f)} aún contiene ${lp}`); errors++; }
  }
  if (f.endsWith('.html')) {
    for (const m of text.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)) {
      if (!fs.existsSync(path.join(DIST, m[1]))) { console.error(`✗ ${rel(f)} referencia ${m[1]} que no existe`); errors++; }
    }
  }
}
// Los handlers onclick="fn(" dependen de funciones globales: comprobar que siguen existiendo tras minificar
const appSrc = read(path.join(ROOT, 'app/app.js')).toString('utf8') + read(path.join(ROOT, 'app/index.html')).toString('utf8');
const appOut = fs.readFileSync(path.join(DIST, logical['app.js']), 'utf8');
const handlerNames = new Set([...appSrc.matchAll(/\bon(?:click|change|input|keydown|keyup|blur|focus|submit)="\s*(?:event\.[a-zA-Z]+\(\);\s*)?([A-Za-z_$][\w$]*)\(/g)].map(m => m[1]));
const builtins = new Set(['alert', 'confirm', 'event', 'if', 'this', 'document', 'window', 'console', 'setTimeout', 'prompt', 'stopPropagation', 'preventDefault']);
let missing = [];
for (const n of handlerNames) {
  if (builtins.has(n)) continue;
  const declared = new RegExp(`(?:function\\s+${n}\\b|window\\.${n}\\s*=|\\b(?:var|let|const)\\s+${n}\\b|\\b${n}\\s*=\\s*(?:async\\s*)?(?:function|\\())`).test(appOut);
  if (!declared) missing.push(n);
}
console.log(`Handlers inline revisados: ${handlerNames.size}${missing.length ? ' — SIN DECLARAR: ' + missing.join(', ') : ' — todos presentes ✓'}`);
if (missing.length) errors++;

// 6) Reporte de tamaños
console.log('\nArchivo'.padEnd(46) + 'crudo'.padStart(10) + 'gzip'.padStart(10));
for (const r of report) console.log(r.file.padEnd(45) + `${(r.raw / 1024).toFixed(0)} KB`.padStart(10) + `${(r.gz / 1024).toFixed(0)} KB`.padStart(10));
if (errors) { console.error(`\n✗ Build con ${errors} error(es)`); process.exit(1); }
console.log('\n✓ Build listo en dist/');
