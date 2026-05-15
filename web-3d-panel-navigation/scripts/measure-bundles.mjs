import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(os.tmpdir(), `web-3d-panel-bundles-${Date.now()}`);
await mkdir(tmpDir, { recursive: true });

// Regex markers checked against minified consumer bundles. Each must be
// minify-resilient — match string literals that survive identifier mangling.
//
// Three.js leak: `THREE.WebGL` is a substring of warning prefixes embedded as
// string literals inside three's source (e.g. "THREE.WebGLRenderer: ..."),
// so it survives minification of three.module.min.js. Any consumer that
// transitively pulls three (including the legacy SkyboxHost, which depends on
// THREE.WebGLRenderer) will contain this substring.
const THREE_LEAK_MARKERS = [/THREE\.WebGL/];

// Nav core: the CSS3DRenderer emits a distinctive template literal we can
// fingerprint. Survives minification because it's a string literal.
const NAV_CORE_MARKERS = [/translate3d\(-50%,-50%,0\)/];

const ENTRIES = [
  {
    label: 'ZoomPlaneNavigator only (CSS3D, no skybox)',
    key: 'nav-only',
    source: `import { ZoomPlaneNavigator } from '${path.join(rootDir, 'src', 'index.ts').replace(/\\/g, '/')}';\nconsole.log(ZoomPlaneNavigator);\n`,
    // The navigator entry pulls in src/index.ts which re-exports the legacy
    // three-backed skybox; tree-shaking must drop those.
    mustNotContain: [...THREE_LEAK_MARKERS],
    budgetBytes: 55 * 1024,
  },
  {
    label: 'ZoomPlaneNavigator + lite gradient',
    key: 'nav-lite-gradient',
    source: [
      `import { ZoomPlaneNavigator } from '${path.join(rootDir, 'src', 'index.ts').replace(/\\/g, '/')}';`,
      `import { LiteSkyboxHost, createGradientSkybox } from '${path.join(rootDir, 'src', 'skybox', 'lite', 'index.ts').replace(/\\/g, '/')}';`,
      `console.log(ZoomPlaneNavigator, LiteSkyboxHost, createGradientSkybox);`,
    ].join('\n') + '\n',
    mustNotContain: [...THREE_LEAK_MARKERS],
    budgetBytes: 70 * 1024,
  },
  {
    label: 'ZoomPlaneNavigator + lite starfield',
    key: 'nav-lite-starfield',
    source: [
      `import { ZoomPlaneNavigator } from '${path.join(rootDir, 'src', 'index.ts').replace(/\\/g, '/')}';`,
      `import { LiteSkyboxHost, createStarfieldSkybox } from '${path.join(rootDir, 'src', 'skybox', 'lite', 'index.ts').replace(/\\/g, '/')}';`,
      `console.log(ZoomPlaneNavigator, LiteSkyboxHost, createStarfieldSkybox);`,
    ].join('\n') + '\n',
    mustNotContain: [...THREE_LEAK_MARKERS],
    budgetBytes: 75 * 1024,
  },
  {
    label: 'Lite gradient only',
    key: 'lite-gradient',
    source: [
      `import { LiteSkyboxHost, createGradientSkybox } from '${path.join(rootDir, 'src', 'skybox', 'lite', 'index.ts').replace(/\\/g, '/')}';`,
      `console.log(LiteSkyboxHost, createGradientSkybox);`,
    ].join('\n') + '\n',
    mustNotContain: [...THREE_LEAK_MARKERS, ...NAV_CORE_MARKERS],
    budgetBytes: 15 * 1024,
  },
  {
    label: 'Lite starfield only',
    key: 'lite-starfield',
    source: [
      `import { LiteSkyboxHost, createStarfieldSkybox } from '${path.join(rootDir, 'src', 'skybox', 'lite', 'index.ts').replace(/\\/g, '/')}';`,
      `console.log(LiteSkyboxHost, createStarfieldSkybox);`,
    ].join('\n') + '\n',
    mustNotContain: [...THREE_LEAK_MARKERS, ...NAV_CORE_MARKERS],
    budgetBytes: 20 * 1024,
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
    // No `external` — measure the full closed bundle including any deps that
    // might leak. The budgets and content checks below assume a closed bundle.
    logLevel: 'silent',
  });
  const content = await readFile(outFile, 'utf8');
  results.push({ ...entry, bytes: content.length, content });
}

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
console.log(pad('Entry', 56) + pad('Minified bytes', 18) + 'KB');
console.log('-'.repeat(56 + 18 + 6));
for (const r of results) {
  console.log(pad(r.label, 56) + pad(r.bytes.toLocaleString('en-US'), 18) + (r.bytes / 1024).toFixed(1));
}

await rm(tmpDir, { recursive: true, force: true });

// =============================================================================
// Assertions
// =============================================================================

const failures = [];

// Size budgets — Phase 2 floor measurements with headroom for navigator growth.
for (const r of results) {
  if (r.bytes > r.budgetBytes) {
    failures.push(
      `${r.label}: ${r.bytes.toLocaleString('en-US')} bytes exceeds ${(r.budgetBytes / 1024).toFixed(0)} KB budget.`
    );
  }
}

// Content checks — substrings that would indicate tree-shaking failure or
// three.js leak into a bundle that should be three-free.
for (const r of results) {
  for (const marker of r.mustNotContain) {
    if (marker.test(r.content)) {
      failures.push(
        `${r.label}: contains forbidden marker ${marker} — indicates tree-shaking failure or unintended dependency.`
      );
    }
  }
}

console.log('');
if (failures.length === 0) {
  console.log('OK: all Phase 2 bundle assertions passed.');
} else {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
