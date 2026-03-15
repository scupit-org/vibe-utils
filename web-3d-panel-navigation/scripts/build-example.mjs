import { mkdir, rm, writeFile } from 'node:fs/promises';
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

