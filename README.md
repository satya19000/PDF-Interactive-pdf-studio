# PDF Interactive Studio

Static, private-by-default browser application. Serve `dist/` with a static web server. No API keys or backend are required. Files are processed in memory and are not uploaded. Reloading clears the queue and generated files.

## Features
- Quiz mode combines uploaded question banks into one PDF with continuous numbering and a heading on every 150%-sized page; each choice links to a red/green result page
- Scanned PDF pages are read with locally bundled English OCR, with page-by-page progress
- BMJ OnExamination answer-key extraction checks highlighted answer rows; questions without a reliable key export with “No answer for this question”
- Source figures tagged Photographic are preserved on linked figure pages without the printed options
- Batch quiz merging and per-file extraction errors
- Clickable source-page index with internal PDF links
- Editable AcroForm notes and page-review checkboxes
- Individual PDF downloads and a ZIP of successful outputs
- Original PDF pages and existing form fields retained
- DOCX text and raster images; PPTX text and raster images; spreadsheets as cell values; plain text, HTML text and common raster images

## Limitations
Quiz mode requires recognized numbered questions and A–E choices, with selectable text or a sufficiently clear English scan. OCR can take a long time on large batches and may misread text. Other layouts may not be extracted; a text-based PDF with an unrecognized layout gets a distinct error instead of a false OCR suggestion. An unknown key stays unknown in the PDF; it is never guessed. The source answer key may still need independent checking before clinical study use. Color extraction is specific to BMJ's highlighted rows. Figures not tagged Photographic may be omitted. Quiz feedback uses ordinary PDF page links rather than PDF JavaScript, so the selected option is colored on the result page. Long questions or explanations may need shortening. Reflowed legacy text is rasterized for Unicode support, so it is not selectable/searchable. Office layouts, charts and vector artwork are not preserved. Digital signatures do not survive modification. Encrypted PDFs are rejected. Browser memory determines practical file limits; there is no artificial size limit.

## Verification
`npm ci` then `node test.cjs` runs integration checks using jsdom and a native canvas adapter. Tests write only temporary fixtures beneath `/workspace/scratch/d84423f2b585/qa`. The original 31-page PDF test verifies existing field retention, 31 review boxes, two notes fields and multiple index pages. Browser visual QA was unavailable in this environment.

## Dependencies
Vendor copies from pinned npm packages: pdf-lib, JSZip, Mammoth, SheetJS, Tesseract.js and its WebAssembly core. English language data is bundled in `dist/vendor/ocr-lang/`. License files are in `dist/vendor/`. No remote scripts or analytics.
