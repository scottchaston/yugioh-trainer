/**
 * Bundle the built app (dist/) into one self-contained HTML file with inline CSS/JS,
 * so it can be opened directly from disk or hosted as a single page.
 * Usage: npm run build && node scripts/build-single.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const assets = join(dist, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');

// Full standalone page (open from disk)
const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Yu-Gi-Oh! Practice Table</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js.replace(/<\/script>/g, '<\\/script>')}</script>
</body>
</html>
`;
mkdirSync(join(dist, 'single'), { recursive: true });
writeFileSync(join(dist, 'single', 'practice-table.html'), full);

// Body-only fragment (for hosts that wrap the page themselves)
const fragment = `<title>Yu-Gi-Oh! Practice Table</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script>/g, '<\\/script>')}</script>
`;
writeFileSync(join(dist, 'single', 'practice-table.fragment.html'), fragment);
console.log('Wrote dist/single/practice-table.html and practice-table.fragment.html');
