#!/usr/bin/env node
/*
 * Flatten ants/index.html into one self-contained HTML file, for publishing
 * somewhere that takes a single file (a Claude Artifact, a gist, an email).
 *
 *   node tools/build-artifact.mjs [--out build/ant-ranchers.html]
 *
 * The output is a document fragment, not a full page: no doctype, <html>,
 * <head> or <body>, because the artifact host supplies those. Everything the
 * page needs is inlined except the Google Fonts stylesheet, which stays as a
 * link — that host is on the artifact content-security policy allowlist.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const outArg = argv.indexOf('--out');
const OUT = path.resolve(REPO, outArg === -1 ? 'build/ant-ranchers.html' : argv[outArg + 1]);

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
body = body.replace(
  /<p>Drawn frame by frame[\s\S]*?<\/p>/,
  '<p>Drawn frame by frame in a canvas — no video file, no images, just maths.</p>'
);

if (/<script|href="ants\.css"/.test(body)) {
  throw new Error('unexpected script or stylesheet reference left in the body');
}

const out = [
  `<title>${title}</title>`,
  ...fontLinks,
  '<style>',
  css.trim(),
  '</style>',
  body,
  ...scripts.map((s) => '<script>\n' + s.trim() + '\n</script>')
].join('\n');

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, out);

console.log(`wrote ${path.relative(REPO, OUT)}  (${(out.length / 1024).toFixed(0)} KB)`);
console.log(`  title:   ${title}`);
console.log(`  inlined: ants.css + art.js + scene.js + player.js`);
console.log(`  linked:  ${fontLinks.length} font stylesheet reference(s)`);
