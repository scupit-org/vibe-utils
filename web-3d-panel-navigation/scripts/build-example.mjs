import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const exampleDir = path.join(rootDir, 'example');
const outDir = path.join(exampleDir, 'dist');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const css = sass.compile(path.join(exampleDir, 'styles.scss'));
await writeFile(path.join(outDir, 'styles.css'), css.css);

await esbuild.build({
  entryPoints: [path.join(exampleDir, 'main.ts')],
  outfile: path.join(outDir, 'main.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
});

// Copy example/index.html into dist/ with asset paths rewritten so the
// dist/ folder is hostable as-is (e.g. `./dist/main.js` -> `./main.js`).
const html = await readFile(path.join(exampleDir, 'index.html'), 'utf8');
const rewrittenHtml = html.replace(/(["'(])\.\/dist\//g, '$1./');
await writeFile(path.join(outDir, 'index.html'), rewrittenHtml);

