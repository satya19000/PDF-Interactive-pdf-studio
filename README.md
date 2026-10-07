# PDF Interactive Studio

Static, private-by-default browser application. Serve `dist/` with a static web server. No API keys or backend are required. Files are processed in memory and are not uploaded. Reloading clears the queue and generated files.

## Features
- Quiz mode scans uploaded files, skips files without recognized MCQs, and combines the remaining questions into one PDF with continuous numbering and a heading on every 150%-sized page
- Upload one previously exported `-quiz.pdf` alongside new source files to append their questions. The original quiz pages, answer feedback, and clickable options stay in place; new questions continue its numbering. A continued quiz can be uploaded again for a later batch. The original quiz title is retained.
- `Q-1` and similar question headers, answer letters, and answer text on the next line are recognized; long explanations continue on linked pages
- Scanned PDF pages are read with locally bundled English OCR, with page-by-page progress and an MCQ count. Pages with selectable headers but image-only questions are included. Five shaded option rows and a green answer row are recognized in the PASTEST layout.
- BMJ OnExamination answer-key extraction checks highlighted answer rows; questions without a reliable key export with “No answer for this question”
- Source figures tagged Photographic are preserved on linked figure pages without the printed options
- Batch quiz merging with per-file included, skipped, or failed status
- Clickable source-page index with internal PDF links
- Editable AcroForm notes and page-review checkboxes
- Individual PDF downloads and a ZIP of successful outputs
- Original PDF pages and existing form fields retained
- DOCX text and raster images; PPTX text and raster images; spreadsheets as cell values; plain text, HTML text and common raster images

## Limitations
Quiz mode requires recognizable questions and choices, with selectable text or a sufficiently clear English scan. The PASTEST five-row image layout is supported without printed question numbers or option letters. OCR can take a long time on large batches and may misread text. Unrecognized layouts are skipped and reported, even if the source visually contains MCQs. An unknown key stays unknown in the PDF; it is never guessed. The source answer key may still need independent checking before clinical study use. Color extraction is specific to BMJ and PASTEST's highlighted rows. Figures not tagged Photographic may be omitted. Quiz feedback uses ordinary PDF page links rather than PDF JavaScript, so the selected option is colored on the result page. Very long question stems may not fit a page; long explanations continue on linked pages. Reflowed legacy text is rasterized for Unicode support, so it is not selectable/searchable. Office layouts, charts and vector artwork are not preserved. Digital signatures do not survive modification. Encrypted PDFs are rejected. Browser memory determines practical file limits; there is no artificial size limit.

## Verification
`npm ci`, `node test.cjs`, and `node batch-test.cjs` run integration checks using jsdom and a native canvas adapter. Tests write only temporary fixtures beneath `/workspace/scratch/d84423f2b585/qa`. The 31-page PDF test verifies existing field retention, review boxes, notes fields and index pages. The batch test verifies skipped files, merged questions, and repeated continuation with old clickable answers intact; a 63-page real question bank also yielded 169 questions and 167 answer keys through the PDF.js text path. Browser visual QA was unavailable in this environment.

## Dependencies
Vendor copies from pinned npm packages: pdf-lib, JSZip, Mammoth, SheetJS, Tesseract.js and its WebAssembly core. English language data is bundled in `dist/vendor/ocr-lang/`. License files are in `dist/vendor/`. No remote scripts or analytics.
