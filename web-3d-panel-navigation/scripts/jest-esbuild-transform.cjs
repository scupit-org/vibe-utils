const esbuild = require('esbuild');

module.exports = {
  process(sourceText, sourcePath) {
    const result = esbuild.transformSync(sourceText, {
      format: 'cjs',
      loader: 'ts',
      sourcefile: sourcePath,
      sourcemap: 'inline',
      target: 'es2022',
    });

    return { code: result.code, map: result.map };
  },
};
