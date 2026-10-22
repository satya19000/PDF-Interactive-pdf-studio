# PDF Interactive Studio

Static browser application. Run `npm ci` and `npm run build` to restore bundled JavaScript dependencies, then serve `dist/` with a static web server. No API keys or backend are required. Files are processed in memory and are not uploaded. Reloading clears the queue and generated files.

## Features
- Quiz mode accepts multiple files or a browser-selected folder. By default it converts each source separately and puts a PDF download button on that file’s queue row. Duplicate filenames from different subfolders receive distinct output names. Optional combined mode keeps continuous question numbering in one PDF.
- An older `-quiz.pdf` with five repeated answer pages per MCQ can be uploaded alone in separate mode to rebuild it with one answer page per MCQ. In combined mode, an older base quiz is rebuilt before appending new files. Modern base quizzes retain their pages and continue numbering. The original quiz title is retained.
- `Q-1` and similar question headers, answer letters, and answer text on the next line are recognized; long explanations continue on linked pages
- Scanned PDF pages are read with locally bundled English OCR, with page-by-page progress and an MCQ count. Paired PASTEST exports with numbered library headers preserve every odd-page question image and its following answer image, including tables and symbols OCR cannot read; output count must equal half the source page count. Five clickable option rows link to one answer/explanation page.
- Text-based past-paper exports with unnumbered stems and separate A–E option labels are read in visual page order. The corresponding highlighted answer and explanation are carried into the new quiz, including explanations continued on the next source page.
- BMJ OnExamination answer-key extraction checks highlighted answer rows; questions without a reliable key export with “No answer for this question”
- Source figures tagged Photographic are preserved on linked figure pages without the printed options
- Per-file count gate: numbered text banks, BMJ question headers, and paired PASTEST exports must match their independently detected source question count before export. Unverifiable layouts fail with a visible file error, and other files in the batch continue.
- Clickable source-page index with internal PDF links
- Editable AcroForm notes and page-review checkboxes
- Individual PDF downloads and a ZIP of successful outputs
- Original PDF pages and existing form fields retained
- DOCX text and raster images; PPTX text and raster images; spreadsheets as cell values; plain text, HTML text and common raster images

## Limitations
No parser can guarantee finding every MCQ in arbitrary unnumbered scans. Separate mode refuses to export a PDF when its source question count cannot be verified, rather than presenting a partial PDF as complete. Quiz mode requires recognizable questions and choices, with selectable text or a sufficiently clear English scan. The paired PASTEST image layout keeps source question and answer pixels and does not depend on OCR text. Other scanned layouts use OCR, which can take a long time and may misread text. Unrecognized layouts are skipped and reported, even if the source visually contains MCQs. An unknown key stays unknown in the PDF; it is never guessed. The source answer key may still need independent checking before clinical study use. Color extraction is specific to BMJ and PASTEST's highlighted rows. Figures not tagged Photographic may be omitted. All choices link to one answer page per question. Correct choices are green and incorrect choices are red there; the PDF does not remember which choice was tapped. Long explanations continue on linked pages. Very long question stems may not fit a page; long explanations continue on linked pages. Reflowed legacy text is rasterized for Unicode support, so it is not selectable/searchable. Office layouts, charts and vector artwork are not preserved. Digital signatures do not survive modification. Encrypted PDFs are rejected. Browser memory determines practical file limits; there is no artificial size limit.

Original-layout mode is explicitly labeled as keeping source pages and notes. Its optional choice markers are ungraded, and its output is named `-original-layout.pdf`. Use New quiz PDF mode for fresh questions and red/green feedback.

## Verification
`npm ci`, `node test.cjs`, and `node batch-test.cjs` run integration checks using jsdom and a native canvas adapter. Tests write fixtures in temporary operating-system directories. The 31-page PDF test verifies existing field retention, review boxes, notes fields and index pages. The batch test verifies separate per-file outputs, mismatched-count blocking, skipped files, merged questions, and repeated continuation with modern clickable answers intact; a 63-page real question bank also yielded 169 questions and 167 answer keys through the PDF.js text path. Browser visual QA was unavailable in this environment.

## Dependencies
Vendor copies from pinned npm packages: pdf-lib, JSZip, Mammoth, SheetJS, Tesseract.js and its WebAssembly core. English language data is bundled in `dist/vendor/ocr-lang/`. License files are in `dist/vendor/`. No remote scripts or analytics.

## Local CBT practice (development branch)
After a verified quiz conversion, section 04 can start an unofficial timed paper from the questions extracted in that browser. A full paper uses 100 questions and 180 minutes; custom tests can use 1–100 questions. Paper 2 excludes the latest completed Paper 1 questions if enough remain. Each source file acts as a subject filter; incorrect and bookmarked filters use locally saved papers. The navigator, answers, flags, bookmarks, active index, deadline and completed results are stored in IndexedDB. Atomic IndexedDB transactions and attempt revisions prevent one tab from overwriting another tab’s newer answers. Each answer is saved after selection; refresh resumes a saved paper. Incomplete answer keys, explanations or option sets are excluded from timed practice and counted. Image-only paired source questions enter practice only when their original answer images and answer key are present; those images appear in review.

This is browser-local practice, not a secure or official MRCP examination. The answer key necessarily exists in the client and IndexedDB; the clock uses device time and cannot be trusted for high-stakes scoring. Clearing browser data removes history, and large scanned figures can exhaust the device storage quota. There is no login, server, administrator configuration or shared question database in this static Site. A separate private Site is used for preview. The existing PDF quiz, notes, original-layout and combine flows are unchanged.

Run `node --test tests/exam-*.test.mjs`, `node test.cjs`, and `node batch-test.cjs` for automated checks. Browser visual inspection and real-device storage pressure testing remain pending. The previous live commit is the rollback point recorded in `docs/cbt-audit.md`.

CBT preview: https://pdf-cbt-preview.badesatya65.chatgpt.site (private, main website awaits approval).

## Folder batches and downloads
Choose a folder (including nested folders), select multiple files, or drop folders into the upload area. Files are converted sequentially and each successful result receives its own PDF and automatic download request. Failures and non-MCQ files remain visible while later files continue. Browser permission may be required for multiple downloads; in supported desktop browsers, Choose download folder writes each result directly to a selected directory without overwriting existing files. Individual downloads and a ZIP remain available. Directory drag-and-drop drains every readEntries batch, including folders with more than 100 entries. Modern PDFs already created by this app retain every original page in separate-file mode.

## Failed files saved for later repair
Conversion errors and skipped originals are separated into a Failed files panel. Their original bytes, relative folder path, conversion mode, error and available source/extracted MCQ counts are saved automatically in browser IndexedDB. Refreshing restores the list. A downloadable ZIP contains unchanged originals under originals/, plus failure-report.json and retry instructions. If browser storage is full or unavailable, files remain available in memory and the UI explicitly requests a ZIP backup before refresh. Retry failed files processes only those originals while preserving successful PDF results. After successful conversion, that file's saved failure is removed. Retry repeats conversion; it does not invent missing questions or silently repair content.
