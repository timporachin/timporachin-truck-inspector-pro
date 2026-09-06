#!/usr/bin/env node
/*
 * Render ants/index.html to a real video file.
 *
 * The film is a pure function of time, so this walks the timeline frame by
 * frame in headless Chromium, screenshots the canvas, and pipes the PNGs
 * straight into ffmpeg. No intermediate files, and the output is exactly what
 * the player shows on screen.
 *
 *   node tools/render-video.mjs
 *   node tools/render-video.mjs --fps 30 --out ants/ant-aphid-farming.mp4
 *   node tools/render-video.mjs --start 55 --end 78 --out /tmp/parlour.mp4
 *   node tools/render-video.mjs --scale 2 --out ants/ant-aphid-farming-1440p.mp4
 *
 * Requirements: Playwright with Chromium, and an ffmpeg built with libx264.
 * If ffmpeg is missing, install one with:  pip install imageio-ffmpeg
 * (Playwright's own bundled ffmpeg is a stripped VP8-only build and cannot
 * produce H.264, so it is deliberately not used here.)
 */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Playwright is installed globally in this environment; fall back to a normal
   resolve so the script also works in a project that installs it locally. */
function loadPlaywright() {
  for (const base of ['/opt/node22/lib/node_modules/', path.join(REPO, 'node_modules/'), import.meta.url]) {
    try {
      return createRequire(base)('playwright');
    } catch { /* try the next one */ }
  }
  throw new Error('Could not load playwright. Install it with: npm i -D playwright');
}

/* ------------------------------------------------------------------ args -- */

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? dflt : argv[i + 1];
};
const flag = (name) => argv.includes('--' + name);

const FPS = Number(arg('fps', 30));
const SCALE = Number(arg('scale', 1));
const CRF = arg('crf', '20');
const PRESET = arg('preset', 'medium');
const OUT = path.resolve(REPO, arg('out', 'ants/ant-aphid-farming.mp4'));
const START = arg('start') == null ? null : Number(arg('start'));
const END = arg('end') == null ? null : Number(arg('end'));
/* PNG keeps the caption text crisp going into the encoder; JPEG is roughly
   twice as fast and good enough for checking timing on a preview render. */
const JPEG = flag('jpeg');
const JPEG_Q = Number(arg('quality', 0.95));
/* an audio track to lay under the picture; build one with build-narration.mjs */
const AUDIO = arg('audio') == null ? null : path.resolve(REPO, arg('audio'));

if (!Number.isFinite(FPS) || FPS <= 0) throw new Error('--fps must be a positive number');
if (!Number.isFinite(SCALE) || SCALE < 1 || SCALE > 4) throw new Error('--scale must be 1-4');

/* ---------------------------------------------------------------- ffmpeg -- */

function findFfmpeg() {
  try {
    const p = execFileSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' }).trim();
    if (p) return p;
  } catch { /* not on PATH */ }

  const viaPython = (install) => {
    const cmd = install
      ? 'pip install --quiet --disable-pip-version-check imageio-ffmpeg >/dev/null 2>&1; '
      : '';
    try {
      return execFileSync('sh', [
        '-c', cmd + 'python3 -c "import imageio_ffmpeg,sys;sys.stdout.write(imageio_ffmpeg.get_ffmpeg_exe())"'
      ], { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  };

  let p = viaPython(false);
  if (p && existsSync(p)) return p;

  console.log('· no ffmpeg found, fetching one via imageio-ffmpeg …');
  p = viaPython(true);
  if (p && existsSync(p)) return p;

  throw new Error(
    'No usable ffmpeg. Install one (apt install ffmpeg) or run: pip install imageio-ffmpeg'
  );
}

/* --------------------------------------------------------- static server -- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4'
};

function serve(root) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let rel = decodeURIComponent(req.url.split('?')[0]);
        if (rel.endsWith('/')) rel += 'index.html';
        const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
        if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* ------------------------------------------------------------------ main -- */

const ffmpeg = findFfmpeg();
console.log('· ffmpeg:     ' + ffmpeg);

const { chromium } = loadPlaywright();
const { server, port } = await serve(REPO);

const W = 1280 * SCALE, H = 720 * SCALE;
const browser = await chromium.launch();
let ffProc;

try {
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`http://127.0.0.1:${port}/ants/index.html?render=1&scale=${SCALE}`,
    { waitUntil: 'load' });
  await page.waitForFunction(() => window.filmReady === true, null, { timeout: 15000 });

  const duration = await page.evaluate(() => window.filmDuration);
  const from = START == null ? 0 : Math.max(0, START);
  const to = END == null ? duration : Math.min(duration, END);
  const frames = Math.max(1, Math.round((to - from) * FPS));

  console.log(`· film:       ${duration.toFixed(1)}s`);
  console.log(`· rendering:  ${from.toFixed(1)}s to ${to.toFixed(1)}s at ${FPS}fps (${frames} frames, ${W}x${H})`);
  console.log(`· out:        ${OUT}`);

  await mkdir(path.dirname(OUT), { recursive: true });

  if (AUDIO && !existsSync(AUDIO)) {
    throw new Error('no audio file at ' + AUDIO + ' — build one with tools/build-narration.mjs');
  }
  if (AUDIO) console.log('· audio:      ' + AUDIO);

  ffProc = spawn(ffmpeg, [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(FPS),
    '-i', '-',
    ...(AUDIO ? ['-i', AUDIO] : []),
    '-c:v', 'libx264',
    '-preset', PRESET,
    '-crf', String(CRF),
    '-pix_fmt', 'yuv420p',
    /* the narration bed is cut to the film's length, so let the picture end
       the file rather than trusting the audio's exact duration */
    ...(AUDIO ? ['-c:a', 'aac', '-b:a', '128k', '-map', '0:v:0', '-map', '1:a:0', '-shortest'] : []),
    '-movflags', '+faststart',
    OUT
  ], { stdio: ['pipe', 'ignore', 'pipe'] });

  let ffErr = '';
  ffProc.stderr.on('data', (d) => { ffErr += d.toString(); if (ffErr.length > 8000) ffErr = ffErr.slice(-8000); });

  const done = new Promise((resolve, reject) => {
    ffProc.on('error', reject);
    ffProc.on('close', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg exited ' + code + '\n' + ffErr)));
  });
  /* a broken pipe here surfaces through the close handler above */
  ffProc.stdin.on('error', () => {});

  const t0 = Date.now();

  /* Draw and encode inside the page in a single round trip. Playwright's own
     screenshot path goes through the compositor and costs ~430ms a frame here;
     encoding the canvas directly is about four times faster. */
  for (let i = 0; i < frames; i++) {
    const t = from + i / FPS;
    const dataUrl = await page.evaluate(({ tt, mime, q }) => {
      window.renderFrame(tt);
      return document.getElementById('film').toDataURL(mime, q);
    }, { tt: t, mime: JPEG ? 'image/jpeg' : 'image/png', q: JPEG ? JPEG_Q : undefined });

    const frame = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    if (!ffProc.stdin.write(frame)) {
      await new Promise((res) => ffProc.stdin.once('drain', res));
    }

    if (i % 60 === 0 || i === frames - 1) {
      const pct = ((i + 1) / frames * 100).toFixed(1).padStart(5);
      const el = (Date.now() - t0) / 1000;
      const eta = i > 4 ? ((el / (i + 1)) * (frames - i - 1)).toFixed(0) + 's left' : '';
      process.stdout.write(`\r  ${pct}%  frame ${i + 1}/${frames}  ${eta}      `);
    }
  }
  process.stdout.write('\n');

  ffProc.stdin.end();
  await done;

  if (pageErrors.length) {
    console.error('! page errors during render:\n  ' + pageErrors.join('\n  '));
  }

  /* report what actually landed on disk */
  const probe = ffmpeg.replace(/ffmpeg(-[\w.-]+)?$/, 'ffprobe$1');
  if (existsSync(probe)) {
    try {
      console.log('\n' + execFileSync(probe, [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate,pix_fmt,nb_frames',
        '-show_entries', 'format=duration,size', '-of', 'default=nw=1', OUT
      ], { encoding: 'utf8' }).trim());
    } catch { /* probing is a nicety, not a requirement */ }
  } else {
    /* `ffmpeg -i` reports on stderr and exits non-zero by design */
    try {
      execFileSync(ffmpeg, ['-hide_banner', '-i', OUT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      const line = String(e.stderr || '').split('\n').filter((l) => /Stream|Duration/.test(l));
      if (line.length) console.log('\n' + line.join('\n').trim());
    }
  }

  console.log('\n· done in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
} finally {
  await browser.close();
  server.close();
  if (ffProc && !ffProc.killed && ffProc.exitCode === null) ffProc.kill();
}
