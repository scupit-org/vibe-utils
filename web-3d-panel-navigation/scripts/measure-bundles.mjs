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
// transitively pulls three (including the three-backend SkyboxHost, which
// depends on THREE.WebGLRenderer) will contain this substring.
const THREE_LEAK_MARKERS = [/THREE\.WebGL/];

// Nav core: the CSS3DRenderer emits a distinctive template literal we can
// fingerprint. Survives minification because it's a string literal.
const NAV_CORE_MARKERS = [/translate3d\(-50%,-50%,0\)/];

// Path helpers — esbuild on Windows still wants forward slashes inside
// generated source strings.
const indexPath = path.join(rootDir, 'src', 'index.ts').replace(/\\/g, '/');
const liteIndexPath = path.join(rootDir, 'src', 'backends', 'lite', 'index.ts').replace(/\\/g, '/');
const threeIndexPath = path.join(rootDir, 'src', 'backends', 'three', 'index.ts').replace(/\\/g, '/');

const ENTRIES = [
  // ---------------------------------------------------------------------------
  // Lite group — Phase 3 backend abstraction over the in-house math/scene-graph
  // and the lite WebGL skybox subpath. None of these should contain three.
  // ---------------------------------------------------------------------------
  {
    label: 'ZoomPlaneNavigator only (CSS3D, no skybox)',
    key: 'nav-only',
    group: 'lite',
    // The main entry now exports zero backend-specific code. A meaningful
    // navigator measurement must construct one with `liteBackend`.
    source: [
      `import { ZoomPlaneNavigator } from '${indexPath}';`,
      `import { liteBackend } from '${liteIndexPath}';`,
      `console.log(ZoomPlaneNavigator, liteBackend);`,
    ].join('\n') + '\n',
    mustNotContain: [...THREE_LEAK_MARKERS],
    budgetBytes: 55 * 1024,
  },
  {
    label: 'ZoomPlaneNavigator + lite gradient',
    key: 'nav-lite-gradient',
    group: 'lite',
    source: [
      `import { ZoomPlaneNavigator } from '${indexPath}';`,
      `import { liteBackend, createGradientSkybox } from '${liteIndexPath}';`,
      `console.log(ZoomPlaneNavigator, liteBackend, createGradientSkybox);`,
    ].join('\n') + '\n',
    mustNotContain: [...THREE_LEAK_MARKERS],
    budgetBytes: 70 * 1024,
  },
  {
    label: 'ZoomPlaneNavigator + lite starfield',
    key: 'nav-lite-starfield',
    group: 'lite',
    source: [
      `import { ZoomPlaneNavigator } from '${indexPath}';`,
      `import { liteBackend, createStarfieldSkybox } from '${liteIndexPath}';`,
      `console.log(ZoomPlaneNavigator, liteBackend, createStarfieldSkybox);`,
    ].join('\n') + '\n',
    mustNotContain: [...THREE_LEAK_MARKERS],
    budgetBytes: 75 * 1024,
  },
  {
    label: 'Lite gradient only (LiteSkyboxHost direct)',
    key: 'lite-gradient',
    group: 'lite',
    // True standalone-skybox consumers reach for `LiteSkyboxHost` directly
    // rather than the `liteBackend` factory object. The backend object can't
    // be tree-shaken property-by-property, so importing only the host class
    // is how downstream sites avoid paying for CSS3DRenderer / navigator
    // primitives they don't use.
    source: [
      `import { LiteSkyboxHost, createGradientSkybox } from '${liteIndexPath}';`,
      `console.log(LiteSkyboxHost, createGradientSkybox);`,
    ].join('\n') + '\n',
    mustNotContain: [...THREE_LEAK_MARKERS, ...NAV_CORE_MARKERS],
    budgetBytes: 15 * 1024,
  },
  {
    label: 'Lite starfield only (LiteSkyboxHost direct)',
    key: 'lite-starfield',
    group: 'lite',
    source: [
      `import { LiteSkyboxHost, createStarfieldSkybox } from '${liteIndexPath}';`,
      `console.log(LiteSkyboxHost, createStarfieldSkybox);`,
    ].join('\n') + '\n',
    mustNotContain: [...THREE_LEAK_MARKERS, ...NAV_CORE_MARKERS],
    budgetBytes: 20 * 1024,
  },

  // ---------------------------------------------------------------------------
  // Three-backed group — the three-backend subpath pulls in three's
  // WebGLRenderer / Scene / Camera / math primitives. These bundles are
  // expected to contain three; the standalone-skybox variants must NOT
  // contain nav-core (verifies the three-backend factories don't drag the
  // navigator in transitively).
  // ---------------------------------------------------------------------------
  {
    label: 'ZoomPlaneNavigator only (three backend, no skybox)',
    key: 'nav-three-only',
    group: 'three',
    source: [
      `import { ZoomPlaneNavigator } from '${indexPath}';`,
      `import { threeBackend } from '${threeIndexPath}';`,
      `console.log(ZoomPlaneNavigator, threeBackend);`,
    ].join('\n') + '\n',
    mustContain: [...THREE_LEAK_MARKERS],
    mustNotContain: [],
    budgetBytes: 600 * 1024,
  },
  {
    label: 'ZoomPlaneNavigator + three gradient',
    key: 'nav-three-gradient',
    group: 'three',
    source: [
      `import { ZoomPlaneNavigator } from '${indexPath}';`,
      `import { threeBackend, createGradientSkybox } from '${threeIndexPath}';`,
      `console.log(ZoomPlaneNavigator, threeBackend, createGradientSkybox);`,
    ].join('\n') + '\n',
    mustContain: [...THREE_LEAK_MARKERS],
    mustNotContain: [],
    budgetBytes: 600 * 1024,
  },
  {
    label: 'ZoomPlaneNavigator + three starfield',
    key: 'nav-three-starfield',
    group: 'three',
    source: [
      `import { ZoomPlaneNavigator } from '${indexPath}';`,
      `import { threeBackend, createStarfieldSkybox } from '${threeIndexPath}';`,
      `console.log(ZoomPlaneNavigator, threeBackend, createStarfieldSkybox);`,
    ].join('\n') + '\n',
    mustContain: [...THREE_LEAK_MARKERS],
    mustNotContain: [],
    budgetBytes: 600 * 1024,
  },
  {
    label: 'Three gradient only (SkyboxHost direct)',
    key: 'three-gradient',
    group: 'three',
    // Mirrors the lite "direct" pattern: standalone-skybox consumers import
    // the host class itself rather than the threeBackend factory object.
    source: [
      `import { SkyboxHost, createGradientSkybox } from '${threeIndexPath}';`,
      `console.log(SkyboxHost, createGradientSkybox);`,
    ].join('\n') + '\n',
    mustContain: [...THREE_LEAK_MARKERS],
    mustNotContain: [...NAV_CORE_MARKERS],
    budgetBytes: 560 * 1024,
  },
  {
    label: 'Three starfield only (SkyboxHost direct)',
    key: 'three-starfield',
    group: 'three',
    source: [
      `import { SkyboxHost, createStarfieldSkybox } from '${threeIndexPath}';`,
      `console.log(SkyboxHost, createStarfieldSkybox);`,
    ].join('\n') + '\n',
    mustContain: [...THREE_LEAK_MARKERS],
    mustNotContain: [...NAV_CORE_MARKERS],
    budgetBytes: 560 * 1024,
  },
];

// Lite/three entry pairs for the side-by-side comparison block. Each pair
// names a logical "shape" (e.g. nav + starfield) so the reader can read the
// delta and ratio without cross-referencing keys.
const PAIRS = [
  { label: 'Nav only (no skybox)', lite: 'nav-only', three: 'nav-three-only' },
  { label: 'Nav + gradient', lite: 'nav-lite-gradient', three: 'nav-three-gradient' },
  { label: 'Nav + starfield', lite: 'nav-lite-starfield', three: 'nav-three-starfield' },
  { label: 'Gradient only', lite: 'lite-gradient', three: 'three-gradient' },
  { label: 'Starfield only', lite: 'lite-starfield', three: 'three-starfield' },
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

// =============================================================================
// Output: grouped table
// =============================================================================

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
const LABEL_W = 56;
const BYTES_W = 18;
const KB_W = 6;

function printGroup(title, group) {
  const groupResults = results.filter((r) => r.group === group);
  if (groupResults.length === 0) return;
  console.log(`=== ${title} ===`);
  console.log(pad('Entry', LABEL_W) + pad('Minified bytes', BYTES_W) + 'KB');
  console.log('-'.repeat(LABEL_W + BYTES_W + KB_W));
  for (const r of groupResults) {
    console.log(
      pad(r.label, LABEL_W) +
        pad(r.bytes.toLocaleString('en-US'), BYTES_W) +
        (r.bytes / 1024).toFixed(1)
    );
  }
  console.log('');
}

printGroup('Lite renderers', 'lite');
printGroup('Three-backed renderers', 'three');

// =============================================================================
// Output: lite vs three comparison
// =============================================================================

const PAIR_LABEL_W = 24;
const PAIR_COL_W = 12;

function findResult(key) {
  return results.find((r) => r.key === key);
}

console.log('=== Lite vs three comparison ===');
console.log(
  pad('Pair', PAIR_LABEL_W) +
    pad('Lite', PAIR_COL_W) +
    pad('Three', PAIR_COL_W) +
    pad('Delta', PAIR_COL_W) +
    'Ratio'
);
console.log('-'.repeat(PAIR_LABEL_W + PAIR_COL_W * 3 + 8));
for (const pair of PAIRS) {
  const lite = findResult(pair.lite);
  const three = findResult(pair.three);
  if (!lite || !three) continue;
  const delta = three.bytes - lite.bytes;
  const ratio = three.bytes / lite.bytes;
  console.log(
    pad(pair.label, PAIR_LABEL_W) +
      pad((lite.bytes / 1024).toFixed(1) + ' KB', PAIR_COL_W) +
      pad((three.bytes / 1024).toFixed(1) + ' KB', PAIR_COL_W) +
      pad((delta / 1024).toFixed(1) + ' KB', PAIR_COL_W) +
      ratio.toFixed(1) + 'x'
  );
}
console.log('');

await rm(tmpDir, { recursive: true, force: true });

// =============================================================================
// Assertions
// =============================================================================

const failures = [];

// Size budgets — Phase 2/3 floor measurements with headroom for navigator growth.
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
  for (const marker of r.mustNotContain ?? []) {
    if (marker.test(r.content)) {
      failures.push(
        `${r.label}: contains forbidden marker ${marker} — indicates tree-shaking failure or unintended dependency.`
      );
    }
  }
  for (const marker of r.mustContain ?? []) {
    if (!marker.test(r.content)) {
      failures.push(
        `${r.label}: missing required marker ${marker} — sanity check that the expected dependency was bundled failed.`
      );
    }
  }
}

if (failures.length === 0) {
  console.log('OK: all bundle assertions passed.');
} else {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
