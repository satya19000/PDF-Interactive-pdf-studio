# PDF Interactive Studio

Browser-local question-bank conversion. Serve `dist/`; document bytes are not sent to a server. No API key is required.

## Conversion pipeline

1. Detect the source layout and retain source question/page identifiers.
2. Extract question/options separately from the answer and complete discussion.
3. Clean reconstructed text of non-Latin/non-Greek scripts and interface glyphs while preserving clinical symbols and units. This is script filtering, not general language detection.
4. Validate each record independently. Invalid records are reported; valid questions remain exportable.
5. Generate true A4 (595.28 × 841.89 pt), selectable native 14 pt question pages. Answers start after all question/options pages. Every option links to the same answer page.
6. Report complete/partial coverage separately. Unknown answers are never guessed.

Printed timer-based past-paper banks have a source-aware parser, including split-page explanations, four/five-option variations and native investigations tables. Existing structured text, DOCX lists, spreadsheet tables, BMJ and paired screenshot paths remain available.

## Workflow

Upload multiple files or a folder including subfolders. Convert all files sequentially or convert one selected file. Large image banks are split into parts with continuous numbering. Preview, manually download individual outputs or a ZIP, and optionally combine ordered quiz files.

Outputs show a creation timestamp. A download request removes that output; after all outputs for an upload have been requested, its queue data is released. This does not delete files on the user's computer. Browsers cannot confirm the final save, so check Downloads.

## Honest limitations

- No parser can guarantee every MCQ in every arbitrary document. Partial exports include a coverage report and a separate source/reference fallback.
- A4 source/reference copies are **not interactive quizzes**. They may retain mixed question/answer layouts and non-English image lettering. They are clearly labeled, never reported as a successful English reconstruction.
- Reconstructed text is script-filtered; languages using Latin letters are not reliably distinguished. Preserved raster images are not automatically language-sanitized.
- Screenshot lettering is not native 14 pt. Enlargement cannot restore missing source detail. Unsupported/encrypted/corrupt files may only permit an original download.
- Standard PDF links do not remember which answer the student selected.
- Browser memory and OCR quality set practical limits. No universal size or error-free conversion promise is made.

## Build and tests

`npm ci && npm run build && npm test`

`node printed-bank-test.cjs "/path/to/MRCP_Past_Paper_May_2015_VERIFIED-A4-formatted.pdf"` runs the real May layout integration assertions (100 questions/keys, complete discussions, A4, native 14 pt, language filtering and links).

`node --expose-gc paired-test.cjs "/path/to/PAST PAPERS (47).pdf" 99` tests paired screenshot preservation.

Vendor dependencies and English OCR assets are bundled in `dist/vendor/`. License files are included. Keep user PDFs and generated study outputs out of the public repository.

See `docs/MASTER_REQUIREMENTS.md` for the authoritative user requirements and the pre-repair audit. That audit records the baseline, not the current implementation status.
