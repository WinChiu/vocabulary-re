import {
  escapeHTML as e,
  statsOf,
  summary,
  categories,
  MODES,
  LANGUAGES,
} from './core.js';
import { clozeFor } from './review.js';
export const icon = (name) =>
  `<i class="ph ph-${name}" aria-hidden="true"></i>`;
export const button = (action, label, cls = '', attrs = '') =>
  `<button type="button" data-action="${action}" class="${cls}" ${attrs}>${label}</button>`;
export const badge = (card) =>
  `<span class="badge ${statsOf(card).state.toLowerCase()}">${{ NEW: 'New', LEARNING: 'Learning', MASTERED: 'Mastered' }[statsOf(card).state]}</span>`;
export function select(name, label, options, value, disabled = false) {
  return `<label class="field">${label}<select name="${name}" ${disabled ? 'disabled' : ''}>${options.map(([v, l, d]) => `<option value="${e(v)}" ${v === String(value) ? 'selected' : ''} ${d ? 'disabled' : ''}>${e(l)}</option>`).join('')}</select></label>`;
}
const statusOptions = [
  ['ALL', 'All statuses'],
  ['NEW', 'New'],
  ['LEARNING', 'Learning'],
  ['MASTERED', 'Mastered'],
];
const categoryOptions = (cards) => [
  ['ALL', 'All categories'],
  ['UNCATEGORIZED', 'Uncategorized'],
  ...categories(cards).map((c) => [c, c]),
];
export function shell(state, body) {
  return `<div class="main-shell"><main id="main" data-page="${state.page}" tabindex="-1">${body}</main></div><nav class="bottom-nav" aria-label="Main navigation">${button('today', icon('sun')+'Today', ['today','review','result'].includes(state.page)?'nav active':'nav', ['today','review','result'].includes(state.page)?'aria-current="page"':'')}${button('library', icon('books')+'Library', ['library','form','preview','import'].includes(state.page)?'nav active':'nav', ['library','form','preview','import'].includes(state.page)?'aria-current="page"':'')}${button('settings', icon('gear-six')+'Settings', state.page==='settings'?'nav active':'nav',state.page==='settings'?'aria-current="page"':'')}</nav>`;
}
export function settingsView(state) {
  return `<div class="narrow settings-page"><div class="page-heading"><h1>Settings</h1></div><section class="settings-section"><h2>Learning language</h2><p>English and Swedish have separate word libraries and review progress.</p><label class="field">Language<select id="language" aria-label="Learning language">${Object.entries(LANGUAGES).map(([key,value])=>`<option value="${key}" ${state.language===key?'selected':''}>${value.name}</option>`).join('')}</select></label></section><section class="settings-section"><h2>Account</h2><div class="settings-account"><span class="avatar">${e((state.user?.displayName||'L')[0])}</span><div><strong>${e(state.user?.displayName||'Learner')}</strong><p>${e(state.user?.email||'')}</p></div></div>${state.bypass?'<p class="settings-notice">Demo data is stored in memory and resets when you refresh. Changes do not affect a real account.</p>':''}${button('logout',icon('sign-out')+'Sign out','secondary')}</section></div>`;
}
export function loginView(error = '') {
  return `<main id="main" class="login-page"><div class="brand"><span class="brand-icon">${icon('book-open')}</span>Just Word.</div><section class="login-panel"><h1>Sign in</h1><p class="lead">Review your English and Swedish vocabulary.</p>${button('login', icon('google-logo') + 'Continue with Google', 'primary large')}${error ? `<p class="error-banner" role="alert">${e(error)}</p>` : ''}<a class="text-link" href="?auth_bypass=1">Try the demo ${icon('arrow-up-right')}</a><small>Demo changes reset on refresh.</small></section></main>`;
}
export function todayView(state) {
  const s = summary(state.cards),
    f = state.settings;
  const available = state.available;
  const ratio = state.cards.length
    ? (s.MASTERED / state.cards.length) * 100
    : 0;
  return `<div class="page-heading"><h1>Today</h1></div><section class="today-grid"><div class="due-card"><div class="section-kicker"><span class="live-dot"></span> DUE FOR REVIEW<span>${icon('sun-horizon')}</span></div><div class="due-main">${button('start', `<span class="count" data-count="${s.due}">${s.due}</span>`, 'due-number', 'aria-label="Start today’s review"')}<div><h2>words to revisit</h2></div></div><div class="due-bottom">${button('start', 'Start today’s review ' + icon('arrow-right'), 'primary')}</div></div><aside class="growth-card"><div class="section-kicker">LIBRARY ${icon('plant')}</div><div class="garden-total"><strong data-count="${state.cards.length}">${state.cards.length}</strong><span>total words</span></div><div class="garden-track"><span style="width:${ratio}%"></span></div><div class="garden-legend"><span><i></i>${s.MASTERED} mastered</span></div></aside></section><section class="stats-grid" aria-label="Vocabulary statistics">${[
    ['NEW', 'New words', 'plant'],
    ['LEARNING', 'Learning', 'leaf'],
    ['MASTERED', 'Mastered', 'seal-check'],
  ]
    .map(
      ([key, title, ic]) =>
        `<div class="stat"><div class="stat-icon ${key.toLowerCase()}">${icon(ic)}</div><div><span>${title}</span><strong data-count="${s[key]}">${s[key]}</strong></div></div>`,
    )
    .join(
      '',
    )}</section><details class="customize" ${state.customOpen ? 'open' : ''}><summary><span>${icon('sliders-horizontal')}<strong>Session settings</strong></span>${icon('caret-down')}</summary><form id="settings-form"><div class="settings-grid">${select(
    'type',
    'Type',
    [
      ['word', 'Words'],
      ['phrase', 'Phrases'],
    ],
    f.type,
  )}${select(
    'starred',
    'Selection scope',
    [
      ['false', 'All words'],
      ['true', 'Starred only'],
    ],
    String(f.starred),
  )}${select('status', 'Status', statusOptions, f.status)}${select('category', 'Category', categoryOptions(state.cards), f.category)}${select(
    'limit',
    'Session size',
    [10, 15, 20, 25].map((n) => [String(n), `${n} words`]),
    String(f.limit),
  )}${select(
    'mode',
    'Practice mode',
    Object.entries(MODES).map(([k, v]) => [
      k,
      v,
      k === 'fill_blank' && f.type === 'phrase',
    ]),
    f.mode,
  )}</div><div class="settings-bottom"><label class="check-label"><input type="checkbox" name="due" ${f.due ? 'checked' : ''} ${f.status === 'NEW' ? 'disabled' : ''}><span>Due only</span></label><span>${available.length} words match${state.excluded ? ` · ${state.excluded} without a cloze example excluded` : ''}</span></div></form></details>`;
}
export function libraryView(state, list) {
  const f = state.filters;
  const pages = Math.max(1, Math.ceil(list.length / 15));
  const page = Math.min(state.libraryPage, pages);
  return `<div class="page-heading compact"><h1>Library</h1><div class="heading-actions">${button('import', icon('upload-simple') + 'Import CSV', 'secondary')}${button('add', icon('plus') + 'Add word', 'primary')}</div></div><section class="library-panel"><form id="library-filters"><div class="search-wrap">${icon('magnifying-glass')}<input name="search" aria-label="Search library" placeholder="Search words, meanings, or notes…" value="${e(f.search)}"><span>/</span></div><div class="filter-row">${select('status', 'Status', statusOptions, f.status)}${select(
    'type',
    'Type',
    [
      ['word', 'Words'],
      ['phrase', 'Phrases'],
    ],
    f.type,
  )}${select('category', 'Category', categoryOptions(state.cards), f.category)}<label class="check-label"><input name="starred" type="checkbox" ${f.starred ? 'checked' : ''}>${icon('star')} Starred only</label></div></form><div class="list-heading"><span>${list.length} ${f.type === 'phrase' ? 'phrases' : 'words'}</span><span>NEWEST FIRST</span></div><div class="word-list">${
    list.length
      ? list
          .slice((page - 1) * 15, page * 15)
          .map(
            (c) =>
              `<article class="word-row"><button class="word-open" data-action="preview" data-id="${e(c.id)}"><span class="word-name">${e(c.word_en)}<small>${e(c.category || 'Uncategorized')}</small></span><span class="word-meaning">${e(c.meaning_zh)}</span>${badge(c)}</button><div class="row-actions">${button('star', icon(c.is_starred ? 'star-fill' : 'star'), `icon-button ${c.is_starred ? 'starred' : ''}`, `data-id="${e(c.id)}" aria-label="${c.is_starred ? 'Unstar' : 'Star'} ${e(c.word_en)}" aria-pressed="${c.is_starred}"`)}${button('edit', icon('pencil-simple'), 'icon-button', `data-id="${e(c.id)}" aria-label="Edit ${e(c.word_en)}"`)}${button('delete', icon('trash'), 'icon-button danger', `data-id="${e(c.id)}" aria-label="Delete ${e(c.word_en)}"`)}</div></article>`,
          )
          .join('')
      : `<div class="empty">${icon('plant')}<h2>No words found</h2><p>${state.cards.length ? 'No words match these filters. Try a different search.' : 'Add a word or import a CSV to get started.'}</p>${button(state.cards.length ? 'reset-filters' : 'add', state.cards.length ? 'Clear filters' : 'Add your first word', 'secondary')}</div>`
  }</div><div class="pagination"><span>${list.length ? `${(page - 1) * 15 + 1}–${Math.min(page * 15, list.length)} of ${list.length}` : '0 words'}</span><div>${button('prev-page', icon('caret-left'), 'icon-button', `aria-label="Previous page" ${page === 1 ? 'disabled' : ''}`)}<span>Page ${page} of ${pages}</span>${button('next-page', icon('caret-right'), 'icon-button', `aria-label="Next page" ${page === pages ? 'disabled' : ''}`)}</div></div></section>`;
}
export function formView(state) {
  const c = state.draft;
  return `<div class="narrow">${button('library', icon('arrow-left') + 'Back to library', 'back-link')}<h1>${state.editingId ? 'Edit word' : 'Add word'}</h1><form id="card-form" class="form-card" novalidate><div class="two-col"><label class="field">Word <span class="required">*</span><input name="word_en" value="${e(c.word_en)}" placeholder="${state.language === 'sv' ? 'e.g. lagom' : 'e.g. serendipity'}" required autofocus></label><label class="field">Meaning <span class="required">*</span><input name="meaning_zh" value="${e(c.meaning_zh)}" placeholder="Chinese meaning" required></label></div><label class="field">Category <span class="optional">optional</span><input name="category" value="${e(c.category)}" placeholder="e.g. Everyday life" list="existing-categories"><datalist id="existing-categories">${categories(
    state.cards,
  )
    .map((c) => `<option value="${e(c)}">`)
    .join(
      '',
    )}</datalist></label><label class="field">Note <span class="optional">optional</span><textarea name="note" rows="3" placeholder="Add a note…">${e(c.note)}</textarea></label><div class="examples-header"><span>Examples <span class="required">*</span></span><small>${c.example_en.length} / 5</small></div><div class="examples-inputs">${c.example_en.map((v, i) => `<div class="example-input"><span>${String(i + 1).padStart(2, '0')}</span><textarea name="example" rows="2" aria-label="Example ${i + 1}" placeholder="${state.language === 'sv' ? 'Write a Swedish sentence…' : 'Use the word in a sentence…'}">${e(v)}</textarea>${c.example_en.length > 1 ? button('remove-example', icon('x'), 'icon-button', `data-index="${i}" aria-label="Remove example ${i + 1}"`) : ''}</div>`).join('')}</div>${c.example_en.length < 5 ? button('add-example', icon('plus') + 'Add another example', 'text-link') : ''}<label class="check-label starred-check"><input type="checkbox" name="is_starred" ${c.is_starred ? 'checked' : ''}>${icon('star')} Star this word</label><p id="form-error" class="form-error" role="alert"></p><div class="form-actions">${button('library', 'Cancel', 'secondary')}<button class="primary" type="submit">${state.editingId ? 'Update word' : 'Save word'} ${icon('arrow-right')}</button></div></form></div>`;
}
export function previewView(state, card) {
  return `<div class="narrow">${button('library', icon('arrow-left') + 'Back to library', 'back-link')}<article class="detail-card"><div class="detail-meta">${badge(card)}<span>${e(card.category || 'Uncategorized')}</span><div class="row-actions">${button('star', icon(card.is_starred ? 'star-fill' : 'star'), `icon-button ${card.is_starred ? 'starred' : ''}`, `data-id="${e(card.id)}" aria-label="${card.is_starred ? 'Unstar' : 'Star'} word"`)}${button('edit', icon('pencil-simple'), 'icon-button', `data-id="${e(card.id)}" aria-label="Edit word"`)}${button('delete', icon('trash'), 'icon-button danger', `data-id="${e(card.id)}" aria-label="Delete word"`)}</div></div><div class="detail-title"><h1>${e(card.word_en)}</h1>${button('speak', icon('speaker-high'), 'audio-button', 'aria-label="Play pronunciation"')}</div><p class="meaning">${e(card.meaning_zh)}</p><div id="dictionary-phonetic"></div>${card.note ? `<div class="note-block">${icon('note-pencil')}<p>${e(card.note)}</p></div>` : ''}<div class="detail-examples"><p class="eyebrow">IN A SENTENCE</p>${card.example_en.map((s, i) => `<div><span>${String(i + 1).padStart(2, '0')}</span><p>${e(s)}</p></div>`).join('')}</div><div id="dictionary-content"></div></article><div class="detail-navigation">${button('previous-word', icon('arrow-left') + 'Previous word', 'back-link')}${button('next-word', 'Next word ' + icon('arrow-right'), 'back-link')}</div></div>`;
}
export function importView(state) {
  const p = state.importPreview;
  return `<div class="narrow wide">${button('library', icon('arrow-left') + 'Back to library', 'back-link')}<h1>Import CSV</h1><p class="lead">Preview your CSV before importing.</p><section class="import-card"><label class="upload-area">${icon('file-csv')}<strong>Choose your CSV file</strong><span>Word, meaning, and at least one example per word.</span><input id="csv-file" type="file" accept=".csv,text/csv"><small>English, Swedish, and Chinese column headings supported</small></label><p class="import-help">Columns: <code>word, meaning, category, note, example</code><br>Add up to five example columns. Duplicate words will be skipped.</p><a href="./examples/words.csv" download class="text-link">${icon('download-simple')} Download a sample CSV</a></section>${p ? `<section class="import-preview"><h2>One last look</h2><p>${p.entries.length} rows · <strong>${p.valid.length} ready</strong> · ${p.duplicates} duplicates · ${p.invalid} invalid</p><div class="import-rows">${p.entries.map((r) => `<div><span><strong>${e(r.value.word_en || `Row ${r.row}`)}</strong><small>${e(r.value.category || 'Uncategorized')}</small>${r.extra.length ? `<small>${r.extra.map(([k, v]) => `${e(k)}: ${e(v)}`).join(' · ')}</small>` : ''}</span><span class="${r.status === 'ready' ? 'success-text' : 'muted'}">${e(r.reason)}</span></div>`).join('')}</div><p id="import-error" class="form-error" role="alert"></p><div class="form-actions">${button('cancel-import', 'Cancel preview', 'secondary')}${button('confirm-import', `Import ${p.valid.length} words ` + icon('arrow-right'), 'primary', p.valid.length ? '' : 'disabled')}</div></section>` : ''}</div>`;
}
export function reviewView(state) {
  const r = state.session,
    c = r.card;
  const flip = r.mode.startsWith('flip'),
    cloze = r.mode === 'fill_blank' ? clozeFor(c, state.language) : null;
  return `<div class="review-wrap"><div class="review-top"><span>${e(MODES[r.mode])}</span>${button('exit-review', icon('x') + 'Exit session', 'back-link')}</div><div class="review-progress"><span>WORD ${String(r.index + 1).padStart(2, '0')} <span>/ ${String(r.cards.length).padStart(2, '0')}</span></span><span>${Math.round((r.index / r.cards.length) * 100)}% complete</span></div><div class="progress-track"><span style="width:${(r.index / r.cards.length) * 100}%"></span></div><div class="review-card ${r.revealed ? 'revealed' : ''}"><span class="eyebrow">${flip ? (r.revealed ? 'ANSWER' : 'RECALL THE MEANING') : cloze ? 'FIND THE MISSING WORD' : 'SPELL THE WORD'}</span>${flip ? `<button class="flip-target" data-action="flip" aria-label="Reveal answer"><h1>${e(r.mode === 'flip_zh' && !r.revealed ? c.meaning_zh : c.word_en)}</h1>${r.revealed ? `<p class="meaning">${e(c.meaning_zh)}</p><p class="review-example">${e(r.example)}</p>` : `<span>${icon('arrows-clockwise')} Click to reveal</span>`}</button>` : `<h2 class="prompt-meaning">${e(c.meaning_zh)}</h2><p class="review-example">${cloze ? `${e(cloze.before)}<span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>${e(cloze.after)}` : e(r.example)}</p><form id="answer-form"><label class="sr-only" for="answer">Your answer</label><input id="answer" name="answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type the ${state.language === 'sv' ? 'Swedish' : 'English'} word…" ${r.revealed ? 'disabled' : ''}><p id="answer-feedback" role="status">${r.revealed ? `The answer is <strong>${e(cloze?.answer || c.word_en)}</strong>` : ''}</p></form>`}</div><div class="review-controls">${flip ? (r.revealed ? button('fail', icon('arrow-counter-clockwise') + 'I forgot', 'secondary large') + button('pass', icon('check') + 'I knew it', 'primary large') : '<span class="action-spacer" aria-hidden="true"></span>' + button('flip', 'Show answer ' + icon('arrows-clockwise'), 'primary large')) : !r.revealed ? button('dont-know', 'I don’t know', 'secondary large') + '<button class="primary large" type="submit" form="answer-form">Check answer ' + icon('arrow-right') + '</button>' : '<span class="action-spacer" aria-hidden="true"></span>' + button('next-card', 'Continue ' + icon('arrow-right'), 'primary large')}</div></div>`;
}
export function resultView(state) {
  const r = state.session,
    wrong = r.results.filter((x) => !x.pass);
  return `<div class="result-wrap"><div class="result-symbol ${wrong.length ? 'warm' : ''}">${icon(wrong.length ? 'plant' : 'seal-check')}</div><h1>Session complete</h1><div class="result-score ${wrong.length ? 'warm' : ''}"><strong>${r.results.length - wrong.length}<span> / ${r.results.length}</span></strong><p>words recalled correctly</p></div>${wrong.length ? `<section class="revisit"><h2>Worth another look</h2>${wrong.map((x) => `<span>${e(x.word)}</span>`).join('')}</section>` : ''}<p class="sync-status ${state.sync === 'failed' ? 'form-error' : ''}" role="status">${state.sync === 'saved' ? 'Your progress is saved.' : state.sync === 'failed' ? 'Sync failed. Your results are still here. Please retry before leaving.' : 'Saving your progress…'}</p><div class="result-actions">${state.sync === 'failed' ? button('retry-sync', 'Retry saving', 'primary') : button('finish', 'Back to today ' + icon('arrow-right'), 'primary', state.sync === 'saved' ? '' : 'disabled')}</div></div>`;
}
