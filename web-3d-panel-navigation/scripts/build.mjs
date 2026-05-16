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

const sharedEsbuildOptions = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  external: ['three']
};

await esbuild.build({
  ...sharedEsbuildOptions,
  entryPoints: [path.join(rootDir, 'src', 'index.ts')],
  outfile: path.join(distDir, 'index.js'),
});

await esbuild.build({
  ...sharedEsbuildOptions,
  entryPoints: [path.join(rootDir, 'src', 'render-contract', 'index.ts')],
  outfile: path.join(distDir, 'render-contract.js'),
});

await esbuild.build({
  ...sharedEsbuildOptions,
  entryPoints: [path.join(rootDir, 'src', 'backends', 'lite', 'index.ts')],
  outfile: path.join(distDir, 'lite-backend.js'),
});

await esbuild.build({
  ...sharedEsbuildOptions,
  entryPoints: [path.join(rootDir, 'src', 'backends', 'three', 'index.ts')],
  outfile: path.join(distDir, 'three-backend.js'),
});

const css = sass.compile(path.join(rootDir, 'src', 'styles.scss'));
await writeFile(path.join(distDir, 'styles.css'), css.css);
