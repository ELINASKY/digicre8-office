# DigiCre8 Office

A creative productivity suite: Writer, Sheets, Slides, Publisher and PDF in one desktop app.

## Run it locally
```
npm install
npm start
```

## Build the Windows installer
Locally: `npm run dist` (creates `dist/DigiCre8 Office Setup 0.1.0.exe`).

On GitHub: push the repo, then either
- run the "Build Windows installer" workflow from the Actions tab, or
- tag a release: `git tag v0.1.0 && git push origin v0.1.0` (the .exe is attached to the release).

Add `build/icon.ico` (256x256) before your first public release for a branded installer icon.

## Roadmap
1. Shell and design system (this repo): launcher, tabs, ribbon, themes, open/save  
2. Writer: swap the basic editor for TipTap, add .docx import/export, headers, images, PDF export  
3. Sheets: grid, formula engine, charts, .xlsx  
4. Slides: slide canvas, themes, .pptx export  
5. Publisher and PDF tools  
6. Auto-update, code signing, settings and templates

## Project layout
- `main.js`: Electron main process (window, file dialogs, settings, recent files)
- `preload.js`: safe bridge between the UI and the main process
- `src/`: the interface (`index.html`, `styles.css`, `renderer.js`)
