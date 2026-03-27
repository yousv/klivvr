const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProduction = process.env.NODE_ENV === 'production';

const options = {
  entryPoints: {
    app: './src/app.ts',
  },
  outdir: './public',
  bundle: false,
  minify: isProduction,
  sourcemap: !isProduction,
  target: 'ES2020',
  platform: 'browser',
  format: 'iife',
  logLevel: 'info',
};

if (isWatch) {
  esbuild.build({ ...options, watch: true }).catch(() => process.exit(1));
} else {
  esbuild.build(options).catch(() => process.exit(1));
}
