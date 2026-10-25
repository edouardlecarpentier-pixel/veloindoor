// Prépare le dossier www/ (fichiers web + module Bluetooth natif) avant "cap add android".
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
for (const f of ['index.html', 'ble.js', 'export.js', 'import.js', 'send.js', 'video.js', 'manifest.json']) {
  cpSync(f, 'www/' + f);
}
await build({
  entryPoints: ['src/native-ble.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  outfile: 'www/native-ble.js',
});
console.log('www/ prêt');
