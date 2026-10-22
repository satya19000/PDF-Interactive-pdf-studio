# PDF Interactive Studio CBT audit — 19 October 2026

- Existing architecture: static Sites deployment (`dist/`), vanilla JavaScript, PDF.js, pdf-lib, JSZip, Mammoth, SheetJS and local Tesseract. All files and OCR stay in the visitor's browser. No backend, database, login or administrative identity exists.
- Existing work: `dist/app.js` handles the file queue, verified MCQ extraction, one-PDF-per-file generation, combined quiz reconstruction and original-layout conversion; `dist/quiz.mjs` holds parsers, answer keys, explanations and image capture; `dist/study.mjs` handles colourful notes. Keep these routines intact.
- Risks: some source images remain unsupported by parsers; extraction can reject unverifiable counts; IndexedDB may fail in private browsing or for very large image-rich exams; a static client cannot protect its answer key or enforce a trusted deadline. No existing uploaded content was moved or deleted.
- Implementation scope: opt-in browser-local CBT practice from successfully verified conversion inputs. The eligible-question gate rejects incomplete five-option items and preserves the source's original explanation and figure pixels. No claim of official affiliation.
- Rollback: Site source main at `f0eddbaf3ff32f2d72d354d945ba1ec1031136af` is the untouched live baseline. The implementation is on `feature/pdf-cbt-practice`; do not deploy to production before review.
- Production-grade follow-up: introduce an authenticated server-side exam service and database, server-side answer keys/scoring and deadline enforcement, account-bound attempts, administrator controls, storage limits, and a separate staging environment. Those capabilities need an approved architecture expansion beyond this static Site.

## Completion checks

- `npm test`: all 10 CBT core/store/UI cases pass, including refresh/resume, fixed deadlines, expiry, duplicate starts/submissions, conflicting tabs and storage failure; existing PDF, OCR and batch/continuation integration checks pass.
- Test fixtures use temporary OS directories. `fake-indexeddb` is a test-only dependency; the deployed app has no added runtime dependencies.
- Browser visual QA is unavailable because the managed browser-control plugin is not exposed. Device-clock changes and client inspection can affect this local practice mode.
- Configuration supports 1–100 questions, 5–240 minutes, source-file filters, incorrect/bookmarked questions and separate papers. It preserves original extracted options, explanations and image answer pages.
- Incorrect/bookmarked questions can be reused from stored attempts after refresh without re-uploading a file. Atomic transactions replace the initial tab lease implementation.

- Private preview deployed successfully: https://pdf-cbt-preview.badesatya65.chatgpt.site . The original public Site remains at its live baseline.
- GitHub checkout builds now pin the existing PDF.js vendor version (5.6.205) and expose the existing vendor restoration script as `npm run build`; regenerated vendor files match the original bytes.
