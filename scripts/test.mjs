// Ejecuta las pruebas de src/**/*.test.ts: las empaqueta con esbuild y las corre con el runner nativo de Node.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const tests = walk('src').filter((f) => f.endsWith('.test.ts'));
if (!tests.length) { console.log('No hay pruebas.'); process.exit(0); }
fs.rmSync('.test-build', { recursive: true, force: true });
await build({ entryPoints: tests, outdir: '.test-build', bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'warning' });
const built = walk('.test-build').filter((f) => f.endsWith('.mjs'));
const r = spawnSync(process.execPath, ['--test', ...built], { stdio: 'inherit' });
fs.rmSync('.test-build', { recursive: true, force: true });
process.exit(r.status ?? 1);
