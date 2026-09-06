#!/usr/bin/env node
/*
 * Speak the film's caption track and lay it onto one narration audio bed.
 *
 *   node tools/build-narration.mjs                 # build ants/narration.mp3
 *   node tools/build-narration.mjs --report        # measure only, write nothing
 *
 * The caption track in ants/scene.js is the single source of truth: each line
 * is synthesised with Piper and placed at exactly the timestamp its caption
 * appears, so the voice and the on-screen words always agree.
 *
 * Requires Piper (`pip install piper-tts`) and a voice model. Point --voice at
 * an .onnx file; by default it looks for the one recorded in VOICE below,
 * downloading it from the Piper voice repository if it is missing.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* The narrator. Cori reads unhurried and lands the dry lines well; the film's
   spelling is British, so a British voice keeps "ladybird" and "parlour" honest. */
const VOICE = 'en_GB-cori-high';
const VOICE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/high/';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const flag = (n) => argv.includes('--' + n);

const REPORT_ONLY = flag('report');
const LENGTH_SCALE = arg('length-scale', '0.96');
const VOICE_DIR = path.resolve(REPO, arg('voice-dir', 'tools/voices'));
const OUT = path.resolve(REPO, arg('out', 'ants/narration.mp3'));
const WORK = path.join(VOICE_DIR, '..', '.narration-work');

/* ------------------------------------------------------- the caption track -- */

/* scene.js only touches a canvas inside its draw functions, so it loads fine
   in a bare context with art.js beside it. */
function loadFilm() {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['ants/art.js', 'ants/scene.js']) {
    vm.runInContext(readFileSync(path.join(REPO, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.AntFilm;
}

/* ------------------------------------------------------------------ piper -- */

function ensureVoice() {
  const onnx = path.join(VOICE_DIR, VOICE + '.onnx');
  if (existsSync(onnx)) return onnx;
  mkdirSync(VOICE_DIR, { recursive: true });
  console.log('· fetching the ' + VOICE + ' voice …');
  for (const ext of ['.onnx', '.onnx.json']) {
    execFileSync('curl', ['-sSL', '--max-time', '600', '-o', onnx.replace('.onnx', '') + ext, VOICE_URL + VOICE + ext]);
  }
  return onnx;
}

function speak(text, file, model) {
  execFileSync('python3', [
    '-m', 'piper', '-m', model, '-f', file,
    '--length-scale', LENGTH_SCALE,
    '--sentence-silence', '0.22',
    /* Piper varies phoneme durations run to run by default, which would make
       the caption timings drift out from under the voice. Pinning this makes
       synthesis reproducible, so what gets measured is what gets built. */
    '--noise-w-scale', '0'
  ], { input: text, stdio: ['pipe', 'ignore', 'pipe'] });
}

/* --------------------------------------------------------------- wav bits -- */

/* Walk the RIFF chunks rather than assuming a 44-byte header. */
function readWav(file) {
  const b = readFileSync(file);
  let rate = 22050, bits = 16, channels = 1, data = null;
  let p = 12;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') {
      channels = b.readUInt16LE(p + 10);
      rate = b.readUInt32LE(p + 12);
      bits = b.readUInt16LE(p + 22);
    } else if (id === 'data') {
      data = b.subarray(p + 8, p + 8 + size);
    }
    p += 8 + size + (size % 2);
  }
  if (!data) throw new Error('no data chunk in ' + file);
  if (bits !== 16) throw new Error('expected 16-bit audio in ' + file);
  return { rate, channels, samples: new Int16Array(data.buffer, data.byteOffset, Math.floor(data.length / 2)) };
}

function writeWav(file, samples, rate) {
  const header = Buffer.alloc(44);
  const bytes = samples.length * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);            /* PCM */
  header.writeUInt16LE(1, 22);            /* mono */
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(bytes, 40);
  writeFileSync(file, Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, bytes)]));
}

function findFfmpeg() {
  try {
    const p = execFileSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' }).trim();
    if (p) return p;
  } catch { /* fall through */ }
  return execFileSync('sh', [
    '-c', 'python3 -c "import imageio_ffmpeg,sys;sys.stdout.write(imageio_ffmpeg.get_ffmpeg_exe())"'
  ], { encoding: 'utf8' }).trim();
}

/* ------------------------------------------------------------------- main -- */

const film = loadFilm();
const caps = film.captions;
const model = ensureVoice();

mkdirSync(WORK, { recursive: true });
console.log(`· voice:  ${VOICE} at length-scale ${LENGTH_SCALE}`);
console.log(`· lines:  ${caps.length} across ${film.duration}s\n`);

const clips = [];
let rate = 22050;
let overruns = 0;

for (let i = 0; i < caps.length; i++) {
  const c = caps[i];
  const wav = path.join(WORK, 'line-' + String(i).padStart(2, '0') + '.wav');
  speak(c.text, wav, model);
  const { rate: r, samples } = readWav(wav);
  rate = r;
  const dur = samples.length / r;
  clips.push({ cap: c, samples, dur });

  /* how much room this line has before the next one starts talking */
  const next = caps[i + 1];
  const room = (next ? next.start : film.duration) - c.start;
  const slack = room - dur;
  if (slack < 0.25) {
    overruns++;
    console.log(
      `  line ${String(i).padStart(2)}  ${dur.toFixed(1)}s of speech in ${room.toFixed(1)}s ` +
      `(${slack < 0 ? 'overruns by ' + (-slack).toFixed(1) + 's' : 'only ' + slack.toFixed(2) + 's clear'})\n` +
      `           "${c.text}"`
    );
  }
}

const spoken = clips.reduce((a, c) => a + c.dur, 0);
console.log(`\n· ${spoken.toFixed(0)}s of speech in a ${film.duration}s film` +
  `, ${overruns} line(s) tight or overrunning`);

if (REPORT_ONLY) {
  rmSync(WORK, { recursive: true, force: true });
  process.exit(overruns ? 1 : 0);
}

/* Lay every clip onto one silent bed at its caption's timestamp.
   Piper's synthesis is mildly stochastic, so a line can come back a fraction
   longer than it measured when the timing was set. Nudge such a line later
   rather than letting the narrator talk over herself — a tenth of a second of
   drift against the caption is invisible, two voices at once is not. */
const bed = new Int16Array(Math.ceil(film.duration * rate));
const FADE = Math.round(rate * 0.006);   /* 6ms, enough to kill the edge clicks */
const BREATH = 0.18;
let freeAt = 0;
let nudged = 0;

for (const clip of clips) {
  const wanted = clip.cap.start;
  clip.at = Math.max(wanted, freeAt);
  if (clip.at - wanted > 0.02) nudged++;
  freeAt = clip.at + clip.dur + BREATH;
}
if (nudged) console.log(`· nudged ${nudged} line(s) later to keep the narration from overlapping`);

for (const { at: startAt, samples } of clips) {
  const at = Math.round(startAt * rate);
  for (let j = 0; j < samples.length; j++) {
    const k = at + j;
    if (k >= bed.length) break;
    let s = samples[j];
    if (j < FADE) s = Math.round(s * (j / FADE));
    else if (j > samples.length - FADE) s = Math.round(s * ((samples.length - j) / FADE));
    const sum = bed[k] + s;
    bed[k] = sum > 32767 ? 32767 : sum < -32768 ? -32768 : sum;
  }
}

const master = path.join(WORK, 'narration.wav');
writeWav(master, bed, rate);

const ffmpeg = findFfmpeg();
mkdirSync(path.dirname(OUT), { recursive: true });
execFileSync(ffmpeg, [
  '-y', '-v', 'error', '-i', master,
  '-codec:a', 'libmp3lame', '-q:a', '4', '-ar', '44100',
  OUT
]);

rmSync(WORK, { recursive: true, force: true });

const kb = (readFileSync(OUT).length / 1024).toFixed(0);
console.log(`\n· wrote ${path.relative(REPO, OUT)} (${kb} KB, ${film.duration}s)`);
console.log('  mux it into the video with:');
console.log(`    node tools/render-video.mjs --audio ${path.relative(REPO, OUT)}`);
