#!/usr/bin/env node
// 27 Miles to Canada: single-file concatenation build.
// node build.js -> index.html (GitHub Pages) + fragment.html (embeddable version).
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
/* THE manifest: the one load-bearing fragment list. CSS/body/JS derive from it
   by extension, in this order. Add a fragment here and only here. */
const parts = [
  '01-tokens.css',
  '02-base.css',
  '03-stage.css',
  '04-story.css',
  '11-profile.css',
  '05-body.html',
  '06-data.js',
  '07-scene.js',
  '11-profile.js',
  '08-scroll.js',
  '10-autoplay.js',
  '09-boot.js',
];

const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const css = parts.filter(f => f.endsWith('.css')).map(read).join('\n\n');
const body = parts.filter(f => f.endsWith('.html')).map(read).join('\n\n');
const js = parts.filter(f => f.endsWith('.js')).map(read).join('\n\n');

/* One module script. three.js is imported from ./vendor/three.module.min.js by the scene
   (a dynamic import, so a failed load leaves the page working without the 3D view).
   Data is fetched at run time from ./data/ with relative URLs. */
const fragment = `<style>\n${css}\n</style>\n${body}\n<script type="module">\n${js}\n</script>`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>27 Miles to Canada · Climb Mount Lemmon</title>
<meta name="description" content="Climb 6,288 feet through six biotic communities on Arizona's Catalina Highway, on the real road and the real terrain.">
<meta property="og:title" content="27 Miles to Canada">
<meta property="og:description" content="Six biotic communities. 28 measured miles. One desert drive.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://tgilbert14.github.io/ddl-27-miles/">
<meta property="og:image" content="https://tgilbert14.github.io/ddl-27-miles/og.png">
<meta property="og:image:width" content="1731">
<meta property="og:image:height" content="909">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://tgilbert14.github.io/ddl-27-miles/og.png">
<meta name="theme-color" content="#0e1b2a">
<link rel="canonical" href="https://tgilbert14.github.io/ddl-27-miles/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap">
<link rel="modulepreload" href="./vendor/three.module.min.js">
<script>document.documentElement.classList.add("js");</script>
</head>
<body>
${fragment}
</body>
</html>`;

// Placeholder failsafe: a surviving __MARKER__ means a broken inject; fail the build.
const leftover = page.match(/__[A-Z][A-Z0-9_]+__/g);
if (leftover) {
  console.error('BUILD FAILED: surviving placeholders:', [...new Set(leftover)].join(', '));
  process.exit(1);
}

fs.writeFileSync(path.join(__dirname, 'index.html'), page);
fs.writeFileSync(path.join(__dirname, 'fragment.html'), fragment);
const kb = (n) => (Buffer.byteLength(n, 'utf8') / 1024).toFixed(1) + ' KB';
console.log(`built: index.html ${kb(page)} · fragment.html ${kb(fragment)} · css ${kb(css)} · js ${kb(js)}`);
