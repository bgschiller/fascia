import commonjs from 'rollup-plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
// @ts-ignore
import sourceMaps from 'rollup-plugin-sourcemaps';

const pkg = require('./package.json');

const externalDeps = [
  ...Object.keys(pkg.dependencies),
  ...Object.keys(pkg.peerDependencies),
];
console.log(externalDeps);
export default {
  input: `src/index.ts`,
  output: [
    { file: pkg.main, name: 'fascia', format: 'cjs', sourcemap: true },
    { file: pkg['umd:main'], name: 'fascia', format: 'umd', sourcemap: true },
    { file: pkg.module, format: 'es', sourcemap: true },
  ],
  external: externalDeps,
  watch: {
    include: 'src/**',
  },
  plugins: [typescript({ clean: true }), commonjs(), sourceMaps()],
};
