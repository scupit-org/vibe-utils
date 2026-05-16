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

// Type-declaration shims.
//
// esbuild bundles each entry into a flat `dist/<name>.js`, but it doesn't
// emit `.d.ts` files. We need types to resolve in two distinct scenarios:
//
//   1. npm consumers using the package's `exports` map (e.g.
//      `import from '@scupit/web-3d-panel-navigation/lite-backend'`).
//      That path is already wired in package.json's `exports.*.types`
//      fields, which point directly at the source `.ts` entry — fine.
//
//   2. Relative-path consumers (`import from '../dist/lite-backend.js'`),
//      which TypeScript resolves by looking for an adjacent `<name>.d.ts`.
//      Until now no such file existed, so example builds would have
//      silently lost type safety against the dist bundles.
//
// The shim approach: for each entry, emit a tiny `dist/<name>.d.ts` that
// re-exports from the source-of-truth `.ts` file under `src/`. Since the
// package's `files` list includes both `dist` and `src`, the shim's relative
// reference resolves correctly when installed via npm too. There's only one
// types declaration per entry on disk (the source); the shim is a redirect,
// not a copy, so contract drift between bundle and types is impossible.
const DTS_SHIMS = [
  { outFile: 'index.d.ts', sourcePath: '../src/index' },
  { outFile: 'render-contract.d.ts', sourcePath: '../src/render-contract' },
  { outFile: 'lite-backend.d.ts', sourcePath: '../src/backends/lite' },
  { outFile: 'three-backend.d.ts', sourcePath: '../src/backends/three' },
];

for (const shim of DTS_SHIMS) {
  await writeFile(
    path.join(distDir, shim.outFile),
    `export * from '${shim.sourcePath}';\n`,
  );
}

const css = sass.compile(path.join(rootDir, 'src', 'styles.scss'));
await writeFile(path.join(distDir, 'styles.css'), css.css);
