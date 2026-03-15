import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(rootDir, 'src', 'index.ts')],
  outfile: path.join(distDir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  external: ['three'],
});

const css = sass.compile(path.join(rootDir, 'src', 'styles.scss'));
await writeFile(path.join(distDir, 'styles.css'), css.css);
