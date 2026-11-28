# Validation — 24 November 2026

Based on the uploaded PDF-Interactive-pdf-studio-cfa2898.zip.

- Regenerated package-lock.json using npm install --package-lock-only --no-audit --no-fund --ignore-scripts.
- Installed into a separate folder without a shared node_modules using npm ci --no-audit --no-fund --ignore-scripts.
- npm run build: passed.
- npm test: passed unit, integration, batch and format suites.
- @pdf-lib/fontkit 1.1.1 installed; conditional embedded-font integration assertions executed.
- pdfjs-dist 4.10.38 installed.
- paired-test.cjs with PAST PAPERS (47).pdf: passed, 99/99 MCQs, parts of 40/40/19 questions on true A4.

Installation lifecycle scripts were disabled. Browser/visual validation and exhaustive format coverage are not implied by these automated tests. Unsupported scripts retain the original-file fallback; this is not full multilingual PDF reconstruction.

No GitHub push or website deployment was performed.

## Follow-up local server check

Corrected scripts/serve.cjs MIME types for ES modules (.mjs), WebAssembly, TrueType fonts and PDFs. Previously .mjs was served as application/octet-stream with nosniff, which prevents browser module loading. Browser automation could not launch because the environment denied socket creation; end-to-end browser/visual checks remain unverified.
