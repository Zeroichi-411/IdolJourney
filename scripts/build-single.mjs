// Node.js なしで遊べる、ダブルクリックで開ける1ファイル版 HTML を生成する
// (index.html の <head> を流用し、スクリプトと CSS を埋め込む)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
  outdir: 'out',
});

const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';

const template = readFileSync('index.html', 'utf8');
const moduleTag = /<script type="module" src="\/src\/main\.ts"><\/script>/;
if (!moduleTag.test(template)) throw new Error('index.html に main.ts の script タグが見つかりません');

const html = template
  .replace('</head>', () => `  <style>${css}</style>\n  </head>`)
  .replace(moduleTag, () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);

mkdirSync('play', { recursive: true });
writeFileSync('play/IdolJourney.html', html);
console.log(`play/IdolJourney.html (${(html.length / 1024).toFixed(1)} KB)`);
