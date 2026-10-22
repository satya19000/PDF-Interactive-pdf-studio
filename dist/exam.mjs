import {practicePool, shuffled, remaining, score, DEFAULT_COUNT, DEFAULT_MINUTES} from './exam-core.mjs';
import {createPracticeStore, PracticeConflict} from './exam-store.mjs';

// Files and answer keys stay on the device. This UI provides local practice only.
export function mountPractice({root, store = createPracticeStore(), sources = () => window.getExamSources?.() || [], now = () => Date.now()}) {
  const document = root.ownerDocument, view = document.defaultView;
  let attempts = [], current = null, timer, saving = false, disposed = false, expiryAttempted = false;
  const channel = typeof view.BroadcastChannel === 'function' ? new view.BroadcastChannel('pdf-interactive-practice') : null;
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function button(text, action, className = 'secondary') {
    const element = node('button', text, className);
    element.type = 'button'; element.onclick = action;
    return element;
  }
  function stopTimer() { view.clearInterval(timer); timer = undefined; }
  function reset() { stopTimer(); root.replaceChildren(); }
  function announce(text, error = false) {
    let status = root.querySelector('.exam-save');
    if (!status) { status = node('p', '', 'exam-save'); root.prepend(status); }
    status.setAttribute('role', 'status'); status.textContent = text;
    status.classList.toggle('exam-error', error);
  }
  function setBusy(value) {
    saving = value;
    for (const control of root.querySelectorAll('button,input,select')) control.disabled = value || control.dataset.disabled === 'true';
  }
  function image(data, alt) {
    const holder = button('', () => {
      const dialog = node('dialog', undefined, 'exam-zoom');
      const large = node('img'); large.src = data; large.alt = alt;
      dialog.append(button('Close image', () => dialog.remove()), large);
      dialog.onclick = event => { if (event.target === dialog) dialog.remove(); };
      dialog.addEventListener('cancel', () => dialog.remove());
      document.body.append(dialog);
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    }, 'exam-image-button');
    holder.setAttribute('aria-label', 'Enlarge '+alt);
    const picture = node('img'); picture.src = data; picture.alt = alt; picture.className = 'exam-image'; picture.loading = 'lazy';
    holder.append(picture); return holder;
  }
  async function refresh() {
    if (disposed || saving) return;
    try {
      attempts = await store.list();
      if (disposed) return;
      const active = attempts.find(a => a.submittedAt == null);
      if (active) {
        current = active;
        if (remaining(active, now()) === 0) { expiryAttempted = false; await mutate({}, true); }
        else showActive();
      } else if (current?.submittedAt != null) showResult(current);
      else showSetup();
    } catch (error) {
      reset(); root.append(node('p', 'Practice saving is unavailable: '+error.message, 'exam-error'), button('Retry', refresh));
    }
  }
  async function mutate(patch, submit = false) {
    if (!current || saving || disposed) return;
    const active = current;
    setBusy(true); announce(submit ? 'Saving final submission…' : 'Saving…');
    try {
      const saved = await store.update(active.id, active.revision || 0, patch, submit, now());
      current = saved;
      if (saved.submittedAt != null) { attempts = await store.list(); showResult(saved); }
      else showActive();
      announce('Saved on this device.');
      channel?.postMessage({id: saved.id, revision: saved.revision});
    } catch (error) {
      // Restore the last persisted version so a failed save is never presented as saved.
      try { current = await store.get(active.id) || active; } catch { current = active; }
      if (current.submittedAt != null) showResult(current); else showActive();
      announce(error instanceof PracticeConflict ? error.message : 'Your last action was not saved. '+error.message, true);
      if (submit) root.append(button('Retry submission', () => mutate({}, true)));
    } finally { setBusy(false); }
  }
  function confirmSubmit() {
    if (view.confirm('Submit this paper now? You can review answers afterwards; unanswered questions earn no marks.')) mutate({}, true);
  }
  function configField(label, input) {
    const field = node('label', label, 'field'); field.append(input); return field;
  }
  function showSetup() {
    reset(); current = null; expiryAttempted = false;
    const {valid, rejected} = practicePool(sources(), attempts);
    root.append(node('p', `${valid.length} eligible five-option MCQs available on this device · ${rejected.length} incomplete items excluded from timed practice`, 'exam-meta'));
    if (rejected.length) {
      const details = node('details'); details.append(node('summary', 'See excluded items'));
      for (const q of rejected) details.append(node('p', `${q.file} · ${q.id}: ${q.reason}`));
      root.append(details);
    }
    if (!valid.length) root.append(node('p', 'Convert a question bank above to begin. Timed practice requires five options, a reliable answer and the original explanation.'));
    const config = node('div', undefined, 'exam-config');
    const mode = node('select'); mode.setAttribute('aria-label', 'Question selection');
    const choices = [['mixed', 'All available files'], ...[...new Set(valid.map(q => q.source))].map(name => ['source:'+name, name]), ['incorrect', 'Previously incorrect'], ['bookmarked', 'Bookmarked']];
    for (const [value, label] of choices) { const option = node('option', label); option.value = value; mode.append(option); }
    const paper = node('select'); paper.setAttribute('aria-label', 'Paper');
    for (const value of [1, 2]) { const option = node('option', 'Paper '+value); option.value = value; paper.append(option); }
    const count = node('input'); count.type = 'number'; count.min = '1'; count.max = String(DEFAULT_COUNT); count.value = Math.min(DEFAULT_COUNT, valid.length || DEFAULT_COUNT); count.setAttribute('aria-label', 'Question count');
    const minutes = node('input'); minutes.type = 'number'; minutes.min = '5'; minutes.max = '240'; minutes.value = DEFAULT_MINUTES; minutes.setAttribute('aria-label', 'Minutes per paper');
    config.append(configField('Question selection', mode), configField('Paper', paper), configField('Questions (up to 100)', count), configField('Minutes', minutes)); root.append(config);
    const start = button('Start timed paper', async () => {
      if (saving) return;
      const amount = Number(count.value), duration = Number(minutes.value);
      if (!Number.isInteger(amount) || amount < 1 || amount > 100 || !Number.isInteger(duration) || duration < 5 || duration > 240) { announce('Choose 1–100 questions and 5–240 minutes.', true); return; }
      setBusy(true);
      try {
        const latest = await store.list();
        let pool = practicePool(sources(), latest).valid;
        if (mode.value.startsWith('source:')) pool = pool.filter(q => q.source === mode.value.slice(7));
        if (mode.value === 'incorrect') {
          const keys = new Set(latest.filter(a => a.submittedAt != null).flatMap(a => score(a).detail.filter(d => d.status === 'incorrect').map(d => d.question.key)));
          pool = pool.filter(q => keys.has(q.key));
        }
        if (mode.value === 'bookmarked') { const keys = new Set(latest.flatMap(a => a.bookmarks || [])); pool = pool.filter(q => keys.has(q.key)); }
        if (paper.value === '2') {
          const prior = latest.find(a => a.paper === 1 && a.submittedAt != null);
          if (prior) { const used = new Set(prior.questions.map(q => q.key)); pool = pool.filter(q => !used.has(q.key)); }
        }
        if (pool.length < amount) { announce(`Need ${amount} eligible questions for this selection; ${pool.length} available. Adjust the count or convert another file.`, true); return; }
        const startedAt = now();
        current = await store.start({id: crypto.randomUUID(), paper: Number(paper.value), mode: mode.value,
          questions: shuffled(pool).slice(0, amount), answers: {}, flags: [], bookmarks: [], index: 0,
          startedAt, endsAt: startedAt + duration * 60000, submittedAt: null}, startedAt);
        showActive(); announce('Paper started and saved on this device.'); channel?.postMessage({id: current.id});
      } catch (error) {
        if (error instanceof PracticeConflict) {
          attempts = await store.list(); current = attempts.find(a => a.submittedAt == null);
          if (current) showActive();
        }
        announce(error.message, true);
      } finally { setBusy(false); }
    }, 'primary');
    start.dataset.disabled = String(!valid.length); start.disabled = !valid.length; root.append(start);
    const history = node('div', undefined, 'exam-history'); history.append(node('h3', 'Previous papers'));
    const completed = attempts.filter(a => a.submittedAt != null);
    if (!completed.length) history.append(node('p', 'Completed papers will appear here on this browser.'));
    for (const a of completed) {
      const result = score(a);
      history.append(button(`Paper ${a.paper} · ${new Date(a.startedAt).toLocaleDateString()} · ${result.correct}/${result.total} · Review`, () => showResult(a)));
    }
    root.append(history);
  }
  function showActive() {
    reset();
    if (!current) { showSetup(); return; }
    if (current.submittedAt != null) { showResult(current); return; }
    const a = current, i = Math.min(Math.max(a.index || 0, 0), a.questions.length - 1), q = a.questions[i];
    const shell = node('div', undefined, 'exam-shell'), top = node('div', undefined, 'exam-top');
    const clock = node('strong', '', 'exam-timer'); clock.setAttribute('role', 'timer'); clock.setAttribute('aria-live', 'off');
    top.append(node('div', `Timed practice · Paper ${a.paper}`, 'exam-title'), clock,
      node('div', `Question ${i+1} of ${a.questions.length} · ${Object.keys(a.answers).length} answered`, 'exam-progress'));
    const progress = node('progress'); progress.max = a.questions.length; progress.value = Object.keys(a.answers).length; progress.setAttribute('aria-label', 'Questions answered');
    const warning = node('p', '', 'exam-warning'); warning.setAttribute('role', 'status');
    shell.append(top, progress, warning);
    const body = node('div', undefined, 'exam-body'), main = node('article', undefined, 'exam-question'), aside = node('aside', undefined, 'exam-aside');
    main.append(node('p', `${q.source} · Question ${i+1}`, 'exam-meta'), node('h3', q.stem));
    if (q.visualData || q.imageQuestionData) main.append(image(q.visualData || q.imageQuestionData, `Source figure for question ${i+1}`));
    const options = node('fieldset', undefined, 'exam-options'); options.append(node('legend', 'Choose one answer'));
    q.options.forEach((value, answer) => {
      const label = node('label', undefined, 'exam-option'), radio = node('input');
      radio.type = 'radio'; radio.name = 'paper-answer'; radio.checked = a.answers[i] === answer;
      radio.onchange = () => mutate({answers: {...a.answers, [i]: answer}});
      label.append(radio, node('span', String.fromCharCode(65+answer)+'. '+value)); options.append(label);
    });
    const actions = node('div', undefined, 'exam-actions');
    const previous = button('← Previous', () => mutate({index: i-1})); previous.dataset.disabled = String(i === 0); previous.disabled = i === 0;
    const next = button('Next →', () => mutate({index: i+1})); next.dataset.disabled = String(i === a.questions.length-1); next.disabled = i === a.questions.length-1;
    actions.append(previous, button('Clear response', () => { const answers = {...a.answers}; delete answers[i]; mutate({answers}); }),
      button(a.flags.includes(i) ? 'Unflag' : 'Flag for review', () => mutate({flags: a.flags.includes(i) ? a.flags.filter(n => n !== i) : [...a.flags, i]})),
      button(a.bookmarks.includes(q.key) ? 'Remove bookmark' : 'Bookmark', () => mutate({bookmarks: a.bookmarks.includes(q.key) ? a.bookmarks.filter(key => key !== q.key) : [...a.bookmarks, q.key]})), next);
    main.append(options, actions, node('p', 'Saved on this device.', 'exam-save'));
    const navigator = node('details', undefined, 'exam-navigator'); navigator.open = true;
    navigator.append(node('summary', 'Question navigator'));
    const grid = node('div', undefined, 'exam-grid');
    a.questions.forEach((_, index) => {
      const answered = a.answers[index] !== undefined, flagged = a.flags.includes(index);
      const control = button(String(index+1), () => mutate({index}), 'exam-number'+(index === i ? ' current' : '')+(flagged ? ' flagged' : '')+(answered ? ' answered' : ''));
      control.setAttribute('aria-label', `Question ${index+1}, ${answered ? 'answered' : 'unanswered'}${flagged ? ', flagged' : ''}`);
      if (index === i) control.setAttribute('aria-current', 'step'); grid.append(control);
    });
    navigator.append(grid, node('p', 'Blue = answered · Amber border = flagged · Outline = unanswered', 'exam-meta'));
    const review = node('details', undefined, 'exam-paper-review'); review.append(node('summary', 'Review paper'));
    review.append(node('p', `${a.questions.length-Object.keys(a.answers).length} unanswered · ${a.flags.length} flagged`, 'exam-meta'));
    a.questions.forEach((_, index) => {
      if (a.answers[index] === undefined || a.flags.includes(index)) review.append(button(`Question ${index+1}${a.flags.includes(index) ? ' · flagged' : ' · unanswered'}`, () => mutate({index})));
    });
    aside.append(navigator, review, button('Submit examination', confirmSubmit, 'exam-submit')); body.append(main, aside); shell.append(body); root.append(shell);
    function updateClock() {
      if (disposed || current?.id !== a.id || current.submittedAt != null) return;
      const seconds = Math.ceil(remaining(a, now()) / 1000);
      clock.textContent = `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2, '0')}`;
      const text = seconds <= 0 ? 'Time expired. Saving submission…' : seconds <= 300 ? '5 minutes or less remaining' : seconds <= 600 ? '10 minutes or less remaining' : seconds <= 1800 ? '30 minutes or less remaining' : '';
      if (warning.textContent !== text) warning.textContent = text;
      if (seconds <= 0 && !saving && !expiryAttempted) { expiryAttempted = true; mutate({}, true); }
    }
    timer = view.setInterval(updateClock, 1000); updateClock();
  }
  function showResult(a) {
    reset(); current = a;
    const result = score(a), head = node('div', undefined, 'exam-result');
    head.append(node('h3', `Paper ${a.paper} · Practice result`),
      node('p', `${result.correct} / ${result.total} correct · ${result.percent}% · ${result.attempted} attempted · ${result.incorrect} incorrect · ${result.unanswered} unanswered`),
      node('p', `Time taken: ${Math.max(0, Math.round((Math.min(a.submittedAt, a.endsAt)-a.startedAt)/60000))} minutes. Unofficial practice percentage; it is not an MRCP scaled score or pass decision.`));
    root.append(head);
    for (const [title, groups] of [['By source file', result.bySource], ['By topic', result.byTopic]]) {
      if (!groups.length) continue;
      root.append(node('h4', title)); const breakdown = node('div', undefined, 'exam-breakdown');
      for (const group of groups) breakdown.append(node('span', `${group.name}: ${group.correct}/${group.total}`)); root.append(breakdown);
    }
    const filter = node('select'); filter.setAttribute('aria-label', 'Review filter');
    for (const [value, text] of [['all', 'All questions'], ['incorrect', 'Incorrect'], ['unanswered', 'Unanswered']]) { const option = node('option', text); option.value = value; filter.append(option); }
    const list = node('div', undefined, 'exam-review'); root.append(filter, list);
    function reviewQuestions() {
      list.replaceChildren();
      for (const item of result.detail.filter(d => filter.value === 'all' || filter.value === d.status)) {
        const q = item.question, card = node('details', undefined, 'exam-review-item '+item.status);
        card.append(node('summary', `Question ${item.index+1} · ${item.status} · ${item.source}`), node('p', q.stem));
        if (q.visualData || q.imageQuestionData) card.append(image(q.visualData || q.imageQuestionData, 'Original question figure'));
        const optionList = node('ul');
        q.options.forEach((option, index) => optionList.append(node('li', `${String.fromCharCode(65+index)}. ${option}${index === item.correct ? ' · Correct answer' : ''}${index === item.selected ? ' · Your answer' : ''}`)));
        card.append(optionList, node('p', item.selected === null ? 'Your answer: Unanswered' : `Your answer: ${String.fromCharCode(65+item.selected)}. ${q.options[item.selected]}`),
          node('p', `Correct answer: ${String.fromCharCode(65+item.correct)}. ${q.options[item.correct]}`, 'exam-correct'));
        if (q.explanation) card.append(node('p', q.explanation));
        for (const data of q.imageAnswerPagesData || []) card.append(image(data, 'Original answer and explanation'));
        list.append(card);
      }
      if (!list.childElementCount) list.append(node('p', 'No questions in this review filter.'));
    }
    filter.onchange = reviewQuestions; reviewQuestions();
    root.append(button('Back to practice setup', async () => { current = null; attempts = await store.list(); showSetup(); }));
  }
  const readyHandler = () => { if (!current && !saving) refresh(); };
  view.addEventListener('quiz-ready', readyHandler);
  if (channel) channel.onmessage = () => { if (!saving) refresh(); };
  const ready = refresh();
  return {ready, refresh, destroy() { disposed = true; stopTimer(); channel?.close(); view.removeEventListener('quiz-ready', readyHandler); }};
}
const root = globalThis.document?.getElementById('examApp');
if (root) mountPractice({root});
