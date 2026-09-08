#!/usr/bin/env node
/*
 * Flatten ants/index.html into one self-contained HTML file: the player, the
 * film and the narration in a single document that needs no server.
 *
 *   node tools/build-artifact.mjs               # build/ant-ranchers.html
 *   node tools/build-artifact.mjs --standalone  # ants/ant-ranchers.html
 *
 * By default the output is a document fragment — no doctype, <html>, <head> or
 * <body> — because an artifact host supplies those. --standalone wraps it in
 * the full scaffolding instead, so the file opens by double-clicking it.
 *
 * Either way everything is inlined, including the narration audio, so the file
 * works with no network. The Google Fonts stylesheet is the one exception and
 * the only link left: it is an enhancement, and the page falls back to Charter
 * and the system sans without it.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const outArg = argv.indexOf('--out');
/* --standalone emits a complete document that opens by double-clicking;
   without it the output is a fragment, which is what the artifact host wants. */
const STANDALONE = argv.includes('--standalone');
const OUT = path.resolve(REPO, outArg !== -1 ? argv[outArg + 1]
  : STANDALONE ? 'ants/ant-ranchers.html' : 'build/ant-ranchers.html');

const read = (p) => readFile(path.join(REPO, p), 'utf8');

const html = await read('ants/index.html');
const css = await read('ants/ants.css');
/* order matters: art defines the primitives, scene builds the film on them,
   player drives it. Inlining loses `defer`, so these go after the markup. */
const scripts = await Promise.all(
  ['ants/art.js', 'ants/scene.js', 'ants/player.js'].map(read)
);

function slice(source, startMark, endMark, label) {
  const a = source.indexOf(startMark);
  const b = source.indexOf(endMark, a);
  if (a === -1 || b === -1) throw new Error(`could not find the ${label} in ants/index.html`);
  return source.slice(a + startMark.length, b);
}

const title = slice(html, '<title>', '</title>', '<title>').trim();
const fontLinks = html.match(/<link rel="preconnect"[^>]*>|<link rel="stylesheet" href="https:\/\/fonts\.googleapis[^>]*>/g) || [];
let body = slice(html, '<body>', '</body>', '<body>').trim();

/* the MP4 ships with the repo, not with a single-file build */
body = body.replace(/<p class="grab">[\s\S]*?<\/p>/, '');
if (/href="ant-aphid-farming|href="ant-ranchers/.test(body)) {
  throw new Error('a link to a sibling file survived into the single-file build');
}

/* The narration has to travel inside the file too, or the Narrate button on a
   shared copy would point at a track that isn't there. */
const audioPath = path.join(REPO, 'ants/narration.mp3');
const audio = await readFile(audioPath);
body = body.replace(
  /src="narration\.mp3"/,
  'src="data:audio/mpeg;base64,' + audio.toString('base64') + '"'
);
if (body.includes('narration.mp3')) {
  throw new Error('the narration audio was not inlined');
}

if (/<script|href="ants\.css"/.test(body)) {
  throw new Error('unexpected script or stylesheet reference left in the body');
}

const head = [
  `<title>${title}</title>`,
  ...fontLinks,
  '<style>',
  css.trim(),
  '</style>'
];

const inner = [
  ...head,
  body,
  ...scripts.map((s) => '<script>\n' + s.trim() + '\n</script>')
].join('\n');

/* A standalone copy is opened straight off a disk, so it needs the document
   scaffolding the artifact host would otherwise supply, and a body background
   of its own. Everything it needs is already inline, so it works offline —
   the webfonts are the one enhancement that needs a connection, and the page
   falls back to Charter and the system sans without them. */
const out = STANDALONE
  ? [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    ...head,
    '</head>',
    '<body>',
    body,
    ...scripts.map((s) => '<script>\n' + s.trim() + '\n</script>'),
    '</body>',
    '</html>'
  ].join('\n')
  : inner;

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, out);

console.log(`wrote ${path.relative(REPO, OUT)}  (${(out.length / 1024).toFixed(0)} KB)`);
console.log(`  title:   ${title}`);
console.log(`  inlined: ants.css + art.js + scene.js + player.js + narration.mp3`);
console.log(`  linked:  ${fontLinks.length} font stylesheet reference(s)`);
