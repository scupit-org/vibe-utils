module.exports = {
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Default to `node` — the pure-math tests, the parser tests, and the
  // url-hash-sync tests all assume a non-DOM environment (url-hash-sync.test
  // actively reassigns `globalThis.window`, which jsdom refuses to allow).
  // Tests that genuinely need a DOM opt into jsdom per-file with the
  // `@jest-environment jsdom` docblock at the top of the file (see
  // src/backends/backend-parity.test.ts).
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': '<rootDir>/scripts/jest-esbuild-transform.cjs',
  },
};
