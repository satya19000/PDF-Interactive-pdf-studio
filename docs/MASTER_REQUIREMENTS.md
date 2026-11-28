# PDF Interactive Studio: audit and authoritative requirements

Date: 28 November 2026. Owner: Satya.

## Outcome

The current project does not yet satisfy all the requested conversion requirements. UI improvements and the January 2015 screenshot-bank repair do not establish correctness for other document layouts. The supplied May 2015 output demonstrates a different unsupported layout.

This is an audit and requirements record, not a completed repair. No website deployment or GitHub update is included in this audit.

## Evidence from the supplied May 2015 output

File: `MRCP_Past_Paper_May_2015_VERIFIED-A4-formatted.pdf`.

- 303 pages; zero PDF links.
- Creator metadata: `PDF Interactive Studio - A4 formatted copy`.
- This is a non-interactive preservation/formatting fallback, not a successful interactive quiz.
- Page 2 contains an Arabic dedication. Page 3 also contains Arabic-script text. English-only filtering has not been applied.
- Page 4 contains the first question, options, the correct-answer label and the beginning of the explanation on the same page. Page 5 continues option discussions and includes navigation/statistics clutter. Page 6 includes further website UI.
- The supplied source visibly identifies E, Tachycardia, as the first question's answer. This is a reading of the supplied answer, not an independent medical verification.
- Text extraction finds 100 pages containing an Explanation heading. These are useful question-boundary candidates, not by themselves an independently verified complete MCQ count.
- Running the current parsers directly on this supplied output yields: visual parser 89 questions; BMJ parser 0; MyPastest parser 0; structured parser 0.
- Of the 89 visual-parser records, nine have an unknown answer, at source pages 7, 28, 40, 67, 160, 199, 235, 277 and 280.
- The first parsed explanation contains only the initial correct-answer paragraph. The source also contains discussions of the incorrect options and continuation text; these are not present in that parsed explanation.

The original pre-conversion May PDF and its conversion log were not supplied in this turn. Consequently the exact exception that initially triggered this particular fallback cannot be identified conclusively. The fallback's identity and current parser defects are directly reproducible from the supplied file.

## Findings and priority

| Priority | Finding | Evidence and consequence |
| --- | --- | --- |
| Critical | English-only policy is absent | There is no central language-cleaning stage before parsing, rendering and fallback. Font glyph coverage is not language filtering. Arabic survives in the supplied output. |
| Critical | A4 preservation does not produce an interactive question bank | `formattedFallback()` copies/scales whole source pages. It does not separate questions from answers, remove printed keys, identify answers, or add option links. |
| Critical | Explanation extraction discards content | `parseVisualOptionBank()` stops collecting explanation text at the next option-letter row. It only looks at the next source page when the first explanation detail is empty, not when a non-empty explanation continues. |
| High | Layout assumptions exclude questions | `parseVisualOptionBank()` requires exactly five A-E options, limits coordinates and expects an Explanation heading near the options. It finds only 89 records in this supplied document. |
| High | Answer matching is brittle | The visual parser expects an exact option-text/letter match after Explanation. Nine parsed records in this file have no answer. It must not guess those answers. |
| High | Some whole-part export gates remain | `buildQuizPdf()` rejects the entire supplied question array when `validateQuiz()` finds one invalid record. Unsupported glyph handling can also throw after rendering. Valid questions need isolation from invalid ones. |
| High | True 14 pt is not enforced across fallback paths | The fallback uses the mere presence of XObjects to avoid reflow. Form XObjects may contain selectable text, not only images. Scaling an embedded source page does not change its lettering to 14 pt. |
| High | Counts do not constitute end-to-end completeness | The visual path assigns page count as an estimate and records no reliable missing-question list. Number of pages is not number of MCQs; this file has 303 pages and 100 Explanation-heading pages. |
| High | Language and layout requirements are untested | Existing tests passing did not detect this May layout or the absence of English-only filtering. A January screenshot regression does not test this layout. |
| Medium | Memory remains a practical limitation | Fallback loads/saves/embeds whole PDFs, potentially creating multiple representations. Large screenshot testing required native-renderer cache management. No universal browser-memory guarantee is justified. |
| Medium | Generic success presentation can confuse users | Ready outputs can include an interactive quiz, a partial quiz, a report and a non-interactive fallback. These need unmistakably separate success/partial/source-preserved statuses. |
| Medium | Existing interactive-file preservation bypasses new formatting policy | An unchanged existing quiz may retain non-English material, unsuitable fonts or answer layout. Preservation must be visibly distinguished from policy-compliant rebuilding. |
| Medium | Progress and queue cleanup have edge cases | Some progress calculations still use total queue length when converting one selected item. Removing a queue row does not necessarily release associated outputs. These need explicit lifecycle tests. |
| Medium | README is stale and contradictory | It describes removed modes, strict count blocking and old tests. This conflicts with current partial-export and fallback behaviour and can misdirect future development. |

## Authoritative user requirements

These consolidate the latest instructions in this project. Later explicit changes override earlier conflicting requests. Do not silently revert these requirements when adding UI features.

### 1. Project boundary and privacy

1. Work on PDF Interactive Studio only. Do not mix it with MRCP Study Studio, Interactive Word Studio or DocMorph.
2. Upgrade the existing project. Preserve unrelated work and keep rollback/version history.
3. Do not add OpenAI comparison, AI review, paid APIs or compulsory manual review. OpenAI comparison was explicitly removed.
4. Processing remains browser-local unless the user expressly authorizes a different architecture. Do not transmit document bytes to third parties.

### 2. English-only content

5. Final study outputs must contain English content only. Remove non-English passages/pages and incidental foreign-language UI/header material, including Arabic.
6. Do not confuse this with ASCII-only conversion: preserve clinical numbers, doses, units, Greek medical symbols, superscripts, degree signs, mathematical operators, tables and relevant figures.
7. Apply the policy to every final-output path: reconstructed text, image-preserving questions, explanations, figures and fallback copies. A font that can display Arabic is not permission to retain it.
8. Non-English text embedded inside an image requires region-aware OCR/redaction or an explicitly incomplete, unsanitized preservation fallback. Do not claim an English-only result when filtering cannot be verified.
9. Record intentionally removed non-English regions/pages separately from accidentally missing educational content.

### 3. Required question/answer layout

10. Show a clean question and its options before the answer. Do not reveal printed ticks, answer keys or explanations on the question page.
11. Keep question/options together on one A4 page where legible. Long questions/tables may continue onto the next page without clipping or loss.
12. The answer and explanation start on the next page after the complete question/options block.
13. Every option links to the same answer page for that question. Standard PDF GoTo links are sufficient; do not promise that an ordinary PDF remembers which option the student selected.
14. Show the correct answer prominently once, with its letter and full option text when reliably extracted. Use green for the correct option and light red/red for incorrect options on answer pages.
15. Include the complete explanation and all option-specific discussions, once and in source order. Do not repeat the same answer/explanation separately for each clickable option.
16. Long explanations continue over as many pages as needed. Add return/next navigation without breaking destinations across continuation pages or parts.
17. If no reliable answer exists, show exactly `No answer for this question.` Do not invent an answer or explanation. A required review workflow is not wanted.

### 4. Typography, page size and figures

18. Use true A4 pages: 595.28 by 841.89 PDF points, approximately 210 by 297 mm.
19. Reconstructed body text must be genuinely 14 pt, readable and selectable/searchable where technically possible. Do not achieve apparent enlargement by changing the page size away from A4.
20. Include a subject/file heading; use the entered heading or the source filename. Keep formatting uniform, spacing compact and margins consistent.
21. Preserve question-related diagrams, ECGs, tables and explanation figures. Enlarge proportionally without distortion; do not indiscriminately capture logos, navigation, peer-response panels, sidebars or unrelated graphics.
22. Preserve clarity. Do not claim that enlargement restores detail absent from the source image.
23. A preserved screenshot's embedded lettering is not reconstructed 14 pt text. Label image-preserving output honestly and track this limitation until proper reconstruction is implemented.

### 5. Completeness, source exceptions and fallback

24. Target zero silently missed MCQs. Detect question boundaries independently from extracted records, retain stable source IDs/page mapping, and reconcile every candidate.
25. Support inline options, lowercase/bracketed labels, trailing answer keys, Word lists, spreadsheet tables, four/five-option exceptions, split-page questions, covers and scanned or mixed PDFs.
26. Avoid rigid even/odd page assumptions. Covers and explanation continuations change the page sequence.
27. When some questions cannot be converted, export the valid questions and preserve unresolved MCQs/source regions as a separate clearly identified download with a report. Do not throw away all valid content because one item is invalid.
28. A preservation fallback may contain an unseparated question and answer because it is an unconverted source; it must never be presented as a completed interactive quiz or a policy-compliant final study PDF.
29. Unknown source count is not permission to stop all downloads. Show known/estimated/unresolved counts honestly; never present unverified coverage as 100%.
30. Where the source itself is inconsistent, preserve the exception and explain it. Example: January Q68 has four visible question options but five on the answer page. Do not invent a missing option or silently discard that MCQ.
31. Corrupt, encrypted or unsupported files cannot be guaranteed to convert. Keep a clear original-download/error path; no absolute 'every file without errors' promise.

### 6. Multi-file workflow and downloads

32. Accept one file, multiple files and folders including subfolders. Retain paths to distinguish duplicate filenames.
33. Provide a prominent `Convert all N files` button. One click processes the entire queue automatically, sequentially; a failure in one file must not stop later files.
34. Keep individual `Convert this file` / `Convert again` controls. Reprocessing one file must not erase other results.
35. Each source has its own downloadable result(s). Split large/image-heavy outputs into manageable numbered parts with continuous question numbers; do not merge unrelated inputs automatically.
36. Provide manual individual downloads and Download all as ZIP. Automatic downloads are not wanted.
37. Provide Preview beside each PDF, with inline viewing, Close, Open in new tab and Download. Preview alone must not remove the output or original upload.
38. Show output creation date/time in the user's local time zone.
39. After a download request, remove that output from the ready list. After all associated outputs are requested, release its source upload and extracted data from the queue. Keep pending files intact. Never delete the PC original.
40. Browser download completion cannot be verified through a normal download link. Explain that cleanup follows the request, not confirmed disk persistence.
41. Preserve minimal failure/retry information separately, with original/report download options where needed; do not silently retain large originals indefinitely. Allow cancellation and clear progress by file and page.

### 7. Combining and acceptance

42. Keep a separate optional combine function after individual conversion/download. Allow ordering; renumber continuously where quiz metadata permits, and preserve internal links/images/explanations.
43. If metadata is unavailable, offer an honestly labelled page-preserving merge rather than claiming successful question renumbering.
44. Do not restore removed colourful-notes or original-pages output-mode choices without asking. Internal preservation fallback is different from exposing those modes as final quiz choices.
45. Before claiming completion, test the actual failing documents, not only Try a sample. Validate source coverage, answer association, every explanation continuation, English-only content, A4/14 pt where applicable, link destinations and memory lifecycle.
46. Separate automated parsing/PDF checks, rendered-page inspection and actual browser end-to-end verification. Do not describe one as proof of the others.

## Repair sequence recommended after this audit

1. Establish a region-aware intermediate representation: question stem, options, correct key, each explanation section, clinical tables/figures, source page/box, and excluded UI/language regions.
2. Add English-only cleaning before rendering. Preserve medical symbols; do not use glyph support as language detection.
3. Rework the May printed-past-paper parser to recover whole question blocks across pages. Remove the hard five-option and narrow-coordinate assumptions; recover each explanation section once.
4. Isolate invalid records before PDF generation so supported questions remain exportable. Produce a source-mapped unresolved-items report and clearly separated preservation download.
5. Add explicit output status categories: interactive complete, interactive partial, formatted-only, original unsanitized. Do not use one generic success presentation for all four.
6. Add these as regression fixtures: May 2015 mixed question/explanation pages; Arabic dedication and mixed-script headers; January 2015 cover plus 100 screenshot pairs including Q68; the earlier 99-pair bank; missing/conflicting answer keys; long tables; multi-file conversion; preview/download cleanup.
7. Update README to match the authoritative requirements, then run automated checks and inspect representative generated pages before a separately authorized repair release.

## Scope of this audit

Inspected the supplied May PDF visually and via metadata/text/link extraction; exercised the current parser functions on its 303 pages; reviewed parsing, image extraction, PDF generation, language/font handling, fallback, output status, batch progress, preview and download lifecycle code; reviewed README and available tests. This is not a penetration test or a guarantee for arbitrary documents. No new browser end-to-end validation was performed in this audit.

The existing `npm test` suite was rerun during this audit and passed its unit, integration, batch and format suites. That is evidence of regression-suite execution, not evidence that the May layout or English-only acceptance requirements pass. The failing real-file observations above remain unresolved.
