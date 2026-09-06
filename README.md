# Truck Inspector Pro — Future UI

Two standalone GitHub Pages apps in one repository:

- **`index.html` — Truck Inspector Pro.** Completes the Clark Pest Control monthly truck inspection and exports the original two-page PDF layout.
- **`fish.html` — NorCal Bite Index.** A live fishing bite score for the nearest Northern California water, built around the salmon runs.

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
4. Drag in everything from inside the extracted folder: `index.html`, `fish.html`, `styles.css`, `fish.css`, `README.md`, the `js` folder, and the `assets` folder.
5. Commit the files.
6. Open **Settings → Pages** and choose **Deploy from a branch**, branch **main**, folder **/(root)**.

Do not upload only the ZIP as a repository file. GitHub Pages needs the extracted files at the repository root.

## Important

Keep the whole `js` folder and the whole `assets` folder. Preview and Export need `js/pdf-lib.min.js`, `js/template.js`, and the PDF template assets.

---

# NorCal Bite Index — `fish.html`

A bite score for the closest fishing area, covering the Northern California coast, the coastal inlets and bays, the inland river systems and the lakes. The model is built around **salmon running into the inland rivers**, and it changes shape depending on where you are: a river run is scored on different things than an ocean troll or a surf session.

Everything runs in the browser. There is no server, no account and no API key, and nothing is uploaded — your spot and units are remembered on your device only.

## What it reads

| Source | What comes from it |
| --- | --- |
| [USGS NWIS](https://waterdata.usgs.gov/nwis/rt) | River temperature, discharge, stage and turbidity from the actual gauge nearest your spot |
| [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/) | Tide predictions, and station water temperature where the sensor exists |
| [Open-Meteo](https://open-meteo.com/) | Barometric pressure, wind and gusts, cloud, rain, sea surface temperature and swell |
| Computed in the page | Sun and moon position, sunrise and sunset, moon phase, solunar periods — so light and solunar still work with no network |

66 spots are built in, each wired to the real gauge and tide station that covers it — from Freeport, Verona and Sailor Bar to Klamath Glen, Hoopa, Scotia, the Farallones, Clear Lake and Ocean Beach. Tap **Nearest to me** or search the list.

## How the score works

Each factor scores 0–1 and is combined by a weight profile chosen from the species and the kind of water. On a river run, the heaviest weights are run timing, the flow trend and river temperature; on the open coast they are the temperature break, swell and upwelling; in the surf, tide dominates.

Two behaviours worth knowing:

- **Run timing gates the migratory species.** If the fish are not in the system yet, the score collapses no matter how good the water looks — an empty river in perfect shape is still an empty river.
- **Missing data lowers confidence, it does not fake a number.** A factor with no reading is dropped and the remaining weights are renormalised, and the confidence figure tells you how much of the model actually had data.

Water temperature comes from the best available source and is labelled: **Gauge** (a real USGS sensor), **NOAA station**, **Satellite SST**, or **Modeled** — a fallback from ten days of air temperature, calibrated against the live gauges at ten NorCal spots to a mean error of about 2.6 °F and counted at half weight.

Ocean, bay and surf spots also get a separate **fishability** readout for wind and swell. It is deliberately kept apart from the bite score, because a hot bite on a dangerous day is still a dangerous day.

## What it is not

It has no idea whether anyone is catching. There are no creel counts and no reports in it. Use it to compare hours and days, not as a promise.

**Regulations are deliberately not encoded.** Seasons, closures and limits change every year, and a stale rule shown as fact is worse than none. Run timing describes when fish are usually present, not when it is legal to fish for them — check [current CDFW regulations](https://wildlife.ca.gov/Fishing/Inland/Regulations).

## Files

`fish.html`, `fish.css`, and in `js/`: `fish-astro.js` (sun and moon), `fish-species.js` (species and run curves), `fish-spots.js` (the spot registry), `fish-model.js` (scoring), `fish-data.js` (live data) and `fish-ui.js` (rendering). Reference data ships as JavaScript rather than JSON so the page also works opened directly from disk. The only outside asset is the Google Fonts stylesheet, which falls back to system faces if it cannot load.
