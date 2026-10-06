# PDF Interactive Studio

Static, private-by-default browser application. Serve `dist/` with a static web server. No API keys or backend are required. Files are processed in memory and are not uploaded. Reloading clears the queue and generated files.

## Features
- New quiz PDF mode rebuilds text-based question banks without printed ticks or answers; each choice links to a red/green result page with the correct answer and explanation
- BMJ OnExamination answer-key extraction checks highlighted answer rows; uncertain keys and explanations are shown for review before export
- Source figures tagged Photographic are preserved on linked figure pages without the printed options
- Batch PDF conversion and per-file errors
- Clickable source-page index with internal PDF links
- Editable AcroForm notes and page-review checkboxes
- Individual PDF downloads and a ZIP of successful outputs
- Original PDF pages and existing form fields retained
- DOCX text and raster images; PPTX text and raster images; spreadsheets as cell values; plain text, HTML text and common raster images

## Limitations
Quiz mode requires selectable text and recognized question/answer structure. Scans need OCR. Layouts other than the supported structured A–E format and BMJ OnExamination may need editing or cannot be extracted. Review the question bank against the source before relying on its keys; color extraction is specific to BMJ's highlighted rows. Figures not tagged Photographic might require manual review. Quiz feedback uses ordinary PDF page links rather than PDF JavaScript, so the selected option is colored on the result page. Long questions or explanations may need shortening. Reflowed legacy text is rasterized for Unicode support, so it is not selectable/searchable. Office layouts, charts and vector artwork are not preserved. Digital signatures do not survive modification. Encrypted PDFs are rejected. Browser memory determines practical file limits; there is no artificial size limit.

## Verification
`npm ci` then `node test.cjs` runs integration checks using jsdom and a native canvas adapter. Tests write only temporary fixtures beneath `/workspace/scratch/d84423f2b585/qa`. The original 31-page PDF test verifies existing field retention, 31 review boxes, two notes fields and multiple index pages. Browser visual QA was unavailable in this environment.

## Dependencies
Vendor copies from pinned npm packages: pdf-lib, JSZip, Mammoth, SheetJS. Corresponding license files are in `dist/vendor/`. No remote scripts or analytics.
