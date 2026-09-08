# Truck Inspector Pro — Future UI

A standalone GitHub Pages app for completing the Clark Pest Control monthly truck inspection and exporting the original two-page PDF layout.

## Included and tested

- High-tech responsive interface for desktop, iPhone, and Android
- Real form controls with device autosave
- Section-level and whole-form “Mark remaining OK” controls
- Multi-select respirator choices
- N/A choices for Appearance, Clean & organized, All other application equipment — Clean, B&Gs Clean, and B&Gs Working
- Local PDF preview and download with no outside CDN dependency
- Vector-drawn PDF checkmarks that work with the bundled PDF font
- Original PDF template and placement map retained

## Put it on GitHub Pages

1. Extract the ZIP on your computer.
2. Open the extracted folder.
3. In your GitHub repository, choose **Add file → Upload files**.
4. Drag in everything from inside the extracted folder: `index.html`, `styles.css`, `README.md`, the `js` folder, and the `assets` folder.
5. Commit the files.
6. Open **Settings → Pages** and choose **Deploy from a branch**, branch **main**, folder **/(root)**.

Do not upload only the ZIP as a repository file. GitHub Pages needs the extracted files at the repository root.

## Important

Keep the whole `js` folder and the whole `assets` folder. Preview and Export need `js/pdf-lib.min.js`, `js/template.js`, and the PDF template assets.

---

# Ant Ranchers

Also in this repository, and completely separate from the inspection app: a two-minute
animated short about how ants farm aphids — carrying them off a rose stem, keeping them
underground, stroking their abdomens with their antennae to draw honeydew, and tearing
the legs off ladybirds that come for the herd. Every behaviour in it is real; the page
under the player says which bits are which.

It comes in three forms, so anyone can open it without an account, an install, or a
GitHub login:

| | What it is | When to use it |
| --- | --- | --- |
| `ants/ant-ranchers.html` | The whole player — film, narration and all — as **one file**, 1.4 MB | Email it, put it on a USB stick, double-click it. Works offline in any browser. |
| `ants/ant-aphid-farming.mp4` | 2:18, 1280×720, 30 fps, H.264 + AAC, 13 MB | Best quality. Uploading, presenting, keeping. |
| `ants/ant-aphid-farming-small.mp4` | The same film at a lower bitrate, 5 MB | Anywhere with an attachment limit. Looks the same on a phone or laptop. |

Or open `ants/` as a normal web page (on GitHub Pages, `/ants/`): play, pause, scrub, jump
by chapter, and switch on **Narrate** for the spoken commentary.

Both videos have sound, and the captions are burned into the picture as well, so the film
still reads with the volume off.

Nothing here touches the inspection app. It is its own folder with its own stylesheet,
and the app's `index.html`, `styles.css`, `js/` and `assets/` are untouched.

## How it is built

There is no video source and no image assets. The film is drawn into a canvas by
`AntFilm.drawFrame(ctx, t)`, a **pure function of time** — no wall clock, and every bit
of texture and jitter comes from a seeded PRNG. That is what lets the web player and the
offline renderer produce byte-identical frames for the same timestamp.

| File | What it is |
| --- | --- |
| `ants/art.js` | Drawing primitives: ants, aphids, ladybirds, plants, soil, callouts, effects |
| `ants/scene.js` | The film — eight scenes, the camera, the caption track, `drawFrame` |
| `ants/player.js` | The player: clock, transport, chapters, narration, `?render=1` mode |
| `ants/index.html`, `ants/ants.css` | The page |
| `tools/build-artifact.mjs` | Flattens the page into the one-file version |
| `ants/narration.mp3` | The spoken commentary, one clip per caption on a single bed |
| `tools/render-video.mjs` | Walks the timeline in headless Chromium and encodes the MP4 |
| `tools/build-narration.mjs` | Speaks the caption track with Piper and lays out the audio |

## Re-rendering the video

```sh
node tools/build-narration.mjs                           # ants/narration.mp3
node tools/render-video.mjs --audio ants/narration.mp3   # the whole film, with sound
node tools/render-video.mjs --start 57 --end 84 --jpeg   # one scene, quick preview
node tools/render-video.mjs --scale 2 --out ants/1440p.mp4

node tools/render-video.mjs --audio ants/narration.mp3 \
  --crf 30 --preset slow --out ants/ant-aphid-farming-small.mp4   # the email-sized one
node tools/build-artifact.mjs --standalone                        # the one-file version
```

Needs Playwright with Chromium, and an ffmpeg built with libx264. If there is no ffmpeg
on `PATH` the script fetches one with `pip install imageio-ffmpeg`. Playwright's own
bundled ffmpeg is a stripped VP8-only build and deliberately is not used.

The narration needs Piper (`pip install piper-tts`); the voice model downloads itself on
first run. Piper varies phoneme durations between runs by default, which would let the
voice drift out from under the captions, so synthesis is pinned with `--noise-w-scale 0`
and is reproducible.

Changing anything in `ants/art.js` or `ants/scene.js` changes the film, so re-run the
renderer to bring `ants/ant-aphid-farming.mp4` back in step with the page. Changing a
caption changes what is spoken, so rebuild the narration too.
