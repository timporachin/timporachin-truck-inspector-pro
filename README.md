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
