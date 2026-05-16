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
    // Treated as the "full functionality, lite backend" use case for the
    // per-file breakdown table emitted at the end of this script.
    perFileBreakdown: true,
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
  const buildResult = await esbuild.build({
    entryPoints: [entryFile],
    outfile: outFile,
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    // No `external` — measure the full closed bundle including any deps that
    // might leak. The budgets and content checks below assume a closed bundle.
    metafile: entry.perFileBreakdown === true,
    logLevel: 'silent',
  });
  const content = await readFile(outFile, 'utf8');
  results.push({
    ...entry,
    bytes: content.length,
    content,
    outFile,
    metafile: buildResult.metafile,
  });
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

// =============================================================================
// Output: per-file breakdown for flagged entries
// =============================================================================
//
// For each entry that opted in via `perFileBreakdown: true`, render a table of
// every input file in the closed bundle alongside:
//   * Bundle bytes — esbuild metafile `bytesInOutput`, i.e. the file's
//     post-tree-shake contribution to the bundle. Measured BEFORE minify, so
//     these will NOT sum to the closed minified total reported above.
//   * Self min   — `esbuild.transform({ minify: true })` of the file's source
//     in isolation. Represents what the file weighs on its own, with no
//     tree-shaking and no dependency context.
//
// The two numbers are intentionally complementary: bundle bytes ranks who-pays
// what in a real consumer bundle; self min provides a stable per-file
// reference that doesn't move when unrelated callers add or drop imports.

const srcRoot = path.resolve(rootDir, 'src');

function isUnderSrc(p) {
  const resolved = path.resolve(rootDir, p);
  const rel = path.relative(srcRoot, resolved);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function srcRelative(p) {
  const resolved = path.resolve(rootDir, p);
  return path.relative(rootDir, resolved).replace(/\\/g, '/');
}

const FILE_W = 56;
const NUM_W = 14;

for (const r of results) {
  if (!r.perFileBreakdown || !r.metafile) continue;

  const outputKey = Object.keys(r.metafile.outputs).find(
    (k) => path.resolve(rootDir, k) === path.resolve(r.outFile),
  );
  if (!outputKey) continue;
  const inputsMap = r.metafile.outputs[outputKey].inputs ?? {};

  const rows = [];
  let bundleTotal = 0;
  let selfTotal = 0;
  for (const [inputPath, info] of Object.entries(inputsMap)) {
    if (!isUnderSrc(inputPath)) continue;
    const absPath = path.resolve(rootDir, inputPath);
    const source = await readFile(absPath, 'utf8');
    const transformed = await esbuild.transform(source, {
      minify: true,
      loader: 'ts',
      format: 'esm',
      target: 'es2022',
      logLevel: 'silent',
    });
    const selfBytes = Buffer.byteLength(transformed.code, 'utf8');
    rows.push({
      file: srcRelative(inputPath),
      bundleBytes: info.bytesInOutput,
      selfBytes,
    });
    bundleTotal += info.bytesInOutput;
    selfTotal += selfBytes;
  }
  rows.sort((a, b) => b.bundleBytes - a.bundleBytes);

  console.log(`=== Per-file breakdown: ${r.label} ===`);
  console.log(
    'Bundle bytes = post-tree-shake, pre-minify contribution to the closed bundle.',
  );
  console.log(
    'Self min     = isolated `esbuild.transform({ minify: true })` of the file alone.',
  );
  console.log(
    `Neither column sums to the closed minified total (${r.bytes.toLocaleString('en-US')} bytes).`,
  );
  console.log('');
  console.log(pad('File', FILE_W) + pad('Bundle bytes', NUM_W) + pad('Self min', NUM_W));
  console.log('-'.repeat(FILE_W + NUM_W * 2));
  for (const row of rows) {
    console.log(
      pad(row.file, FILE_W) +
        pad(row.bundleBytes.toLocaleString('en-US'), NUM_W) +
        pad(row.selfBytes.toLocaleString('en-US'), NUM_W),
    );
  }
  console.log('-'.repeat(FILE_W + NUM_W * 2));
  console.log(
    pad(`Total (${rows.length} files)`, FILE_W) +
      pad(bundleTotal.toLocaleString('en-US'), NUM_W) +
      pad(selfTotal.toLocaleString('en-US'), NUM_W),
  );
  console.log('');
}

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
