// Prépare www/ : copie la page web VéloCompteur et y ajoute le module natif.
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
let html = readFileSync('../velocompteur/index.html', 'utf8');
// le module natif doit être chargé avant le script principal de la page
html = html.replace('<script>\n/* ================= appli Android', '<script src="native.js"></script>\n<script>\n/* ================= appli Android');
if (!html.includes('native.js')) throw new Error('Point d\'insertion de native.js introuvable');
// MapLibre embarqué : la carte démarre même sans réseau
for (const f of ['maplibre-gl.js', 'maplibre-gl.css']) cpSync(`node_modules/maplibre-gl/dist/${f}`, `www/${f}`);
html = html.replaceAll('https://unpkg.com/maplibre-gl@4.7.1/dist/', '');
if (html.includes('unpkg.com')) throw new Error('MapLibre : URL unpkg non remplacée');
writeFileSync('www/index.html', html);
await build({ entryPoints: ['src/native.js'], bundle: true, format: 'iife', minify: true, outfile: 'www/native.js' });
console.log('www/ prêt');
