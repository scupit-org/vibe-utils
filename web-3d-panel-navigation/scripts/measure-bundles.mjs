import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(os.tmpdir(), `web-3d-panel-bundles-${Date.now()}`);
await mkdir(tmpDir, { recursive: true });

const ENTRIES = [
  {
    label: 'ZoomPlaneNavigator only (CSS3D, no skybox)',
    source: `import { ZoomPlaneNavigator } from '${path.join(rootDir, 'src', 'index.ts').replace(/\\/g, '/')}';\nconsole.log(ZoomPlaneNavigator);\n`,
  },
  {
    label: 'ZoomPlaneNavigator + lite gradient',
    source: [
      `import { ZoomPlaneNavigator } from '${path.join(rootDir, 'src', 'index.ts').replace(/\\/g, '/')}';`,
      `import { LiteSkyboxHost, createGradientSkybox } from '${path.join(rootDir, 'src', 'skybox', 'lite', 'index.ts').replace(/\\/g, '/')}';`,
      `console.log(ZoomPlaneNavigator, LiteSkyboxHost, createGradientSkybox);`,
    ].join('\n') + '\n',
  },
  {
    label: 'ZoomPlaneNavigator + lite starfield (Phase 1 acceptance entry)',
    source: [
      `import { ZoomPlaneNavigator } from '${path.join(rootDir, 'src', 'index.ts').replace(/\\/g, '/')}';`,
      `import { LiteSkyboxHost, createStarfieldSkybox } from '${path.join(rootDir, 'src', 'skybox', 'lite', 'index.ts').replace(/\\/g, '/')}';`,
      `console.log(ZoomPlaneNavigator, LiteSkyboxHost, createStarfieldSkybox);`,
    ].join('\n') + '\n',
  },
  {
    label: 'Lite gradient only',
    source: [
      `import { LiteSkyboxHost, createGradientSkybox } from '${path.join(rootDir, 'src', 'skybox', 'lite', 'index.ts').replace(/\\/g, '/')}';`,
      `console.log(LiteSkyboxHost, createGradientSkybox);`,
    ].join('\n') + '\n',
  },
  {
    label: 'Lite starfield only',
    source: [
      `import { LiteSkyboxHost, createStarfieldSkybox } from '${path.join(rootDir, 'src', 'skybox', 'lite', 'index.ts').replace(/\\/g, '/')}';`,
      `console.log(LiteSkyboxHost, createStarfieldSkybox);`,
    ].join('\n') + '\n',
  },
];

const results = [];
for (let i = 0; i < ENTRIES.length; i++) {
  const entry = ENTRIES[i];
  const entryFile = path.join(tmpDir, `entry-${i}.ts`);
  const outFile = path.join(tmpDir, `out-${i}.js`);
  await writeFile(entryFile, entry.source);
  await esbuild.build({
    entryPoints: [entryFile],
    outfile: outFile,
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    // No `external` — measure the full closed bundle including three.
    logLevel: 'silent',
  });
  const bytes = (await readFile(outFile)).length;
  results.push({ label: entry.label, bytes });
}

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
console.log(pad('Entry', 56) + pad('Minified bytes', 18) + 'KB');
console.log('-'.repeat(56 + 18 + 6));
for (const r of results) {
  console.log(pad(r.label, 56) + pad(r.bytes.toLocaleString('en-US'), 18) + (r.bytes / 1024).toFixed(1));
}

await rm(tmpDir, { recursive: true, force: true });

const phase1Entry = results.find((r) => r.label.includes('Phase 1 acceptance'));
if (phase1Entry) {
  const PHASE1_LIMIT_BYTES = 290 * 1024;
  if (phase1Entry.bytes > PHASE1_LIMIT_BYTES) {
    console.error(`\nFAIL: Phase 1 acceptance entry is ${phase1Entry.bytes} bytes, over the ${PHASE1_LIMIT_BYTES}-byte (290 KB) budget.`);
    process.exit(1);
  } else {
    console.log(`\nOK: Phase 1 acceptance entry is under the 290 KB budget.`);
  }
}
