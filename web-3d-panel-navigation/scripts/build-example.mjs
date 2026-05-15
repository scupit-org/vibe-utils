import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

const sharedExampleOptions = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  minify: true,
};

const TS_ENTRIES = ['main.ts', 'lite-compare.ts', 'three-skybox.ts', 'lite-skybox.ts'];
for (const entry of TS_ENTRIES) {
  const stem = entry.replace(/\.ts$/, '');
  await esbuild.build({
    ...sharedExampleOptions,
    entryPoints: [path.join(exampleDir, entry)],
    outfile: path.join(outDir, `${stem}.js`),
  });
}

// Copy example HTML pages into dist/ with asset paths rewritten so the
// dist/ folder is hostable as-is (e.g. `./dist/main.js` -> `./main.js`).
async function copyHtml(filename) {
  const html = await readFile(path.join(exampleDir, filename), 'utf8');
  const rewrittenHtml = html.replace(/(["'(])\.\/dist\//g, '$1./');
  await writeFile(path.join(outDir, filename), rewrittenHtml);
}
await copyHtml('index.html');
await copyHtml('lite-compare.html');

// Generate the skybox-variant pages from index.html. The zoom-plane DOM is
// authored once in index.html and reused — skybox variants only differ in
// title, the skybox CSS variables, and the script src they load.
const SKYBOX_VARIANT_HEAD_INJECT = `
    <style>
      :root {
        --skybox-color-a: #08101e;
        --skybox-color-b: #122340;
        --skybox-color-c: #1e3766;
        --skybox-star-color: #ffe6c8;
        --skybox-star-color-cool: #b5c9ff;
      }
    </style>
`;

const SKYBOX_VARIANTS = [
  {
    filename: 'three-skybox.html',
    title: 'web-3d-panel-navigation — three.js starfield',
    script: 'three-skybox.js',
  },
  {
    filename: 'lite-skybox.html',
    title: 'web-3d-panel-navigation — lite starfield',
    script: 'lite-skybox.js',
  },
];

const indexSource = await readFile(path.join(exampleDir, 'index.html'), 'utf8');
for (const variant of SKYBOX_VARIANTS) {
  let html = indexSource;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${variant.title}</title>`);
  // Inject the skybox CSS variables just before </head>.
  html = html.replace(/(\s*)<\/head>/, `${SKYBOX_VARIANT_HEAD_INJECT}$1</head>`);
  // Rewrite the script src to point at the variant's bundle.
  html = html.replace(/(["'(])\.\/dist\/main\.js/, `$1./dist/${variant.script}`);
  // Then apply the same `./dist/` -> `./` rewrite so the dist/ folder is hostable.
  html = html.replace(/(["'(])\.\/dist\//g, '$1./');
  await writeFile(path.join(outDir, variant.filename), html);
}

console.log(`Built example bundles to ${outDir}\n`);

// Print a size report for every artifact under the dist folder. The size delta
// between three-skybox.js and lite-skybox.js is the headline Phase 2 demo.
const REPORTED_ARTIFACTS = [
  'main.js',
  'lite-compare.js',
  'three-skybox.js',
  'lite-skybox.js',
];
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
console.log(pad('Artifact', 22) + pad('Minified bytes', 18) + 'KB');
console.log('-'.repeat(22 + 18 + 6));
for (const name of REPORTED_ARTIFACTS) {
  const filePath = path.join(outDir, name);
  try {
    const { size } = await stat(filePath);
    console.log(pad(name, 22) + pad(size.toLocaleString('en-US'), 18) + (size / 1024).toFixed(1));
  } catch {
    console.log(pad(name, 22) + 'missing');
  }
}
