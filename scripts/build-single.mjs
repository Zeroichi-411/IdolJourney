// Node.js なしで遊べる、ダブルクリックで開ける1ファイル版 HTML を生成する
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

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

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<title>IdolJourney</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;

mkdirSync('play', { recursive: true });
writeFileSync('play/IdolJourney.html', html);
console.log(`play/IdolJourney.html (${(html.length / 1024).toFixed(1)} KB)`);
