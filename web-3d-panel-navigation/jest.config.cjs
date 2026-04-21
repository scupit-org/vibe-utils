module.exports = {
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': '<rootDir>/scripts/jest-esbuild-transform.cjs',
  },
};
