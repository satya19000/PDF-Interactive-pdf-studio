# PDF Interactive Studio

Convert documents and images into PDFs with clickable page navigation, editable notes and review checkboxes. File contents are processed locally in the browser, without uploads or API keys.

## Run locally

Requires Node.js 20 or later.

```sh
npm ci
npm run build
npm start
```

Open http://localhost:3000. The build copies pinned browser libraries and their licenses from installed dependencies into `dist/vendor/`. Serve the completed `dist/` folder with any static host. There is no server-side conversion service.

## Features

- Batch file conversion with per-file error reporting
- Clickable source-page index and reading worksheets
- Editable PDF AcroForm notes and page-review checkboxes
- Individual downloads or a ZIP of successful conversions
- Preservation of original PDF pages and existing form fields
- DOCX text and images, PPTX slide text and raster images, spreadsheet cell values, plain text, HTML text and common image formats

## Supported inputs

PDF, DOCX, PPTX, XLSX, XLS, CSV, TSV, TXT, MD, JSON, HTML, HTM, PNG, JPG, JPEG, WebP, BMP and GIF.

## Limitations

Office documents are reflowed: complex formatting, charts and vector artwork are not preserved. Reflowed text is rasterized for Unicode support and is not searchable. Images and scans remain images; no OCR is provided. Animated images use the first frame. Password-protected PDFs are rejected. Modifying a digitally signed PDF invalidates its signature, so use an unsigned copy.

There is no AI question generation, automatic answer scoring or embedded media support. Browser memory determines practical file limits; no artificial size limit is imposed. Fillable fields work best in Adobe Acrobat Reader. Use English for worksheet titles and form notes; standard PDF form fonts do not cover every writing system. Reloading the page clears files and outputs.

## Tests

```sh
npm test
```

Integration tests use jsdom and a native canvas adapter. They cover a 31-page PDF, preservation of an existing form field, new notes and checkboxes, text and CSV conversion, invalid PDF rejection, a mixed conversion queue and ZIP generation. Temporary test PDFs are written to `tmp/qa/`. Full browser visual testing is not included.

## Static hosting

Install command: `npm ci`  
Build command: `npm run build`  
Output directory: `dist`

## Dependencies

pdf-lib, JSZip, Mammoth and SheetJS. Dependency versions are locked in `package-lock.json`. Their license files are copied with the browser bundles. No remote scripts or analytics are used.
