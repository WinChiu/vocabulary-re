import {
  escapeHTML as e,
  isBypass,
  testUser,
  filterCards,
  shuffle,
  validateCard,
  LANGUAGES,
} from './core.js';
import { MockStore, callWithTimeout } from './data.js';
import { ReviewSession, clozeFor } from './review.js';
import { parseCSV, prepareImport } from './import.js';
import { dictionary, speak } from './services.js';
import * as V from './views.js';
import { watchKeyboardViewport } from './viewport.js';
watchKeyboardViewport();
const root = document.querySelector('#app');
const emptyDraft = () => ({
  word_en: '',
  meaning_zh: '',
  category: '',
  note: '',
  example_en: [''],
  is_starred: false,
});
const defaultFilters = () => ({
  search: '',
  status: 'ALL',
  type: 'word',
  category: 'ALL',
  starred: false,
});
let storedLanguage = 'en';
try {
  storedLanguage = localStorage.getItem('just-word-language-mode') || 'en';
} catch {}
const state = {
  bypass: isBypass(location.search),
  user: null,
  page: 'today',
  language: LANGUAGES[storedLanguage] ? storedLanguage : 'en',
  cards: [],
  settings: {
    type: 'word',
    starred: false,
    status: 'ALL',
    category: 'ALL',
    limit: 10,
    due: true,
    mode: 'flip_en',
  },
  filters: defaultFilters(),
  libraryPage: 1,
  customOpen: false,
  previewId: null,
  previewIds: [],
  editingId: null,
  draft: emptyDraft(),
  importPreview: null,
  importEntries: null,
  session: null,
  sync: null,
  busy: false,
  loading: false,
  loadError: '',
};
let store,
  authModule,
  authSetup,
  requestVersion = 0,
  dictionaryController,
  toastTimer,
  answerTimer;
function toast(message) {
  const node = document.querySelector('#toast');
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('visible'), 5500);
}
async function handleError(error) {
  console.error(error);
  if (error.code === 'permission-denied') {
    const email = state.user?.email || '';
    if (authModule) await authModule.logout();
    state.user = null;
    renderLogin(`Access denied for ${email}. This account is not authorized.`);
  } else toast(error.message || 'Something went wrong. Please try again.');
}
function renderLogin(error = '') {
  dictionaryController?.abort();
  root.innerHTML = V.loginView(error);
}
function candidates() {
  const all = filterCards(state.cards, state.settings);
  state.available =
    state.settings.mode === 'fill_blank'
      ? all.filter((c) => clozeFor(c, state.language))
      : all;
  state.excluded = all.length - state.available.length;
}
function render() {
  dictionaryController?.abort();
  if (!state.user) {
    renderLogin();
    return;
  }
  candidates();
  let body = '';
  if (state.loading)
    body =
      '<div class="empty"><span class="loader"></span><h2>Gathering your words…</h2></div>';
  else if (state.loadError)
    body = `<div class="empty"><h2>Your words couldn’t load.</h2><p>${e(state.loadError)}</p>${V.button('reload', 'Try again', 'primary')}</div>`;
  else
    switch (state.page) {
      case 'settings':
        body = V.settingsView(state);
        break;
      case 'today':
        body = V.todayView(state);
        break;
      case 'library':
        body = V.libraryView(state, filterCards(state.cards, state.filters));
        break;
      case 'form':
        body = V.formView(state);
        break;
      case 'preview': {
        const card = state.cards.find((c) => c.id === state.previewId);
        if (!card) {
          state.page = 'library';
          render();
          return;
        }
        body = V.previewView(state, card);
        break;
      }
      case 'import':
        body = V.importView(state);
        break;
      case 'review':
        body = V.reviewView(state);
        break;
      case 'result':
        body = V.resultView(state);
        break;
    }
  root.innerHTML = V.shell(state, body);
  if (state.busy)
    root
      .querySelectorAll('button,input,select,textarea')
      .forEach((el) => (el.disabled = true));
  if (
    state.page === 'preview' &&
    !state.loading &&
    !state.loadError &&
    state.language === 'en'
  )
    loadDictionary();
  if (state.page === 'review') document.querySelector('#answer')?.focus();
  if (state.page === 'today') animateCounts();
}
function animateCounts() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const nodes = [...root.querySelectorAll('[data-count]')];
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / 650, 1);
    nodes.forEach((n) => {
      if (n.isConnected)
        n.textContent = String(
          Math.round(Number(n.dataset.count) * (1 - (1 - progress) ** 3)),
        );
    });
    if (progress < 1 && nodes.some((n) => n.isConnected))
      requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
async function loadDictionary() {
  const id = state.previewId,
    card = state.cards.find((c) => c.id === id);
  dictionaryController = new AbortController();
  const signal = dictionaryController.signal;
  const data = await dictionary(card.word_en, { signal });
  if (
    !data ||
    signal.aborted ||
    state.previewId !== id ||
    state.page !== 'preview'
  )
    return;
  document.querySelector('#dictionary-phonetic').textContent = data.phonetic;
  const abbreviations = {
    noun: 'n.',
    verb: 'v.',
    adjective: 'adj.',
    adverb: 'adv.',
    pronoun: 'pron.',
    preposition: 'prep.',
    conjunction: 'conj.',
    interjection: 'interj.',
  };
  document.querySelector('#dictionary-content').innerHTML =
    `${data.synonyms.length ? `<div class="synonyms"><span class="eyebrow">NEARBY WORDS</span><p>${data.synonyms.map((s) => `<span>${e(s)}</span>`).join('')}</p></div>` : ''}${data.definitions.length ? `<details class="definitions"><summary>Other definitions ${V.icon('caret-down')}</summary>${data.definitions.map(([part, defs]) => `<p><strong>${e(abbreviations[part] || part)}</strong> ${defs.map(e).join('<br>')}</p>`).join('')}</details>` : ''}`;
}
async function loadCards() {
  const version = ++requestVersion,
    lang = state.language;
  state.loading = true;
  state.loadError = '';
  render();
  try {
    const cards = await store.list(lang);
    if (version !== requestVersion) return;
    state.cards = cards;
  } catch (error) {
    if (version !== requestVersion) return;
    state.loadError = error.message;
    await handleError(error);
  } finally {
    if (version === requestVersion) {
      state.loading = false;
      if (state.user) render();
    }
  }
}
async function ensureAuth() {
  if (authModule) return authModule;
  if (authSetup) return authSetup;
  authSetup = (async () => {
    try {
      const module = await callWithTimeout(import('./firebase.js'), 10000);
      authModule = module;
      store = new module.FirebaseStore();
      await module.initializeAuth(async (user) => {
        state.user = user;
        if (user) {
          state.page = 'today';
          await loadCards();
        } else renderLogin();
      });
      return module;
    } catch (error) {
      authSetup = null;
      authModule = null;
      throw error;
    }
  })();
  return authSetup;
}
function confirmDialog(title, message, confirmText = 'Confirm') {
  const dialog = document.querySelector('#confirm-dialog'),
    previous = document.activeElement;
  dialog.innerHTML = `<form method="dialog"><span class="dialog-symbol">${V.icon('question')}</span><h2 id="dialog-title">${e(title)}</h2><p>${e(message)}</p><div class="form-actions"><button value="cancel" class="secondary">Cancel</button><button value="confirm" class="primary">${e(confirmText)}</button></div></form>`;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => {
        previous?.focus();
        resolve(dialog.returnValue === 'confirm');
      },
      { once: true },
    );
  });
}
async function canLeave() {
  if (state.page === 'review') return exitReview();
  if (state.page === 'result' && state.sync !== 'saved') {
    toast('Save your session with Retry saving before leaving.');
    return false;
  }
  return true;
}
async function navigate(page) {
  if (!(await canLeave())) return;
  state.page = page;
  render();
  document.querySelector('#main')?.focus();
  window.scrollTo(0, 0);
}
async function exitReview() {
  if (
    !(await confirmDialog(
      'Leave this session?',
      'Your progress in this session will not be saved.',
      'Leave session',
    ))
  )
    return false;
  clearTimeout(answerTimer);
  state.session = null;
  state.page = 'today';
  return true;
}
function captureDraft() {
  const form = document.querySelector('#card-form');
  if (!form) return;
  const data = new FormData(form);
  state.draft = {
    word_en: data.get('word_en'),
    meaning_zh: data.get('meaning_zh'),
    category: data.get('category'),
    note: data.get('note'),
    example_en: data.getAll('example'),
    is_starred: data.has('is_starred'),
  };
}
async function saveCard(form) {
  captureDraft();
  const { value, error } = validateCard(
    state.draft,
    state.cards,
    state.editingId,
  );
  if (error) {
    document.querySelector('#form-error').textContent = error;
    return;
  }
  state.busy = true;
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  submit.textContent = 'Saving…';
  form
    .querySelectorAll('input,textarea,button')
    .forEach((el) => (el.disabled = true));
  try {
    await store.save(state.language, state.editingId, value);
    toast(state.editingId ? 'Word updated.' : 'Word added.');
    state.editingId = null;
    state.draft = emptyDraft();
    state.page = 'today';
    state.busy = false;
    await loadCards();
  } catch (error) {
    state.busy = false;
    form
      .querySelectorAll('input,textarea,button')
      .forEach((el) => (el.disabled = false));
    submit.textContent = state.editingId ? 'Update word' : 'Save word';
    document.querySelector('#form-error').textContent = error.message;
    await handleError(error);
  } finally {
    state.busy = false;
  }
}
async function star(id) {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  const old = card.is_starred;
  card.is_starred = !old;
  state.busy = true;
  render();
  try {
    await store.save(state.language, id, { is_starred: card.is_starred });
  } catch (error) {
    card.is_starred = old;
    await handleError(error);
  } finally {
    state.busy = false;
    if (state.user) render();
  }
}
async function remove(id) {
  const card = state.cards.find((c) => c.id === id);
  if (
    !card ||
    !(await confirmDialog(
      'Delete this word?',
      `“${card.word_en}” and its review history will be permanently removed.`,
      'Delete word',
    ))
  )
    return;
  state.busy = true;
  render();
  try {
    await store.remove(state.language, id);
    state.page = 'library';
    toast('Word deleted.');
    state.busy = false;
    await loadCards();
  } catch (error) {
    await handleError(error);
  } finally {
    state.busy = false;
    if (state.user) render();
  }
}
function startReview() {
  candidates();
  if (!state.available.length) {
    toast('No cards match these settings. Try a different filter.');
    return;
  }
  state.session = new ReviewSession(
    shuffle(state.available).slice(0, state.settings.limit),
    state.settings.mode,
    state.language,
  );
  state.page = 'review';
  state.sync = null;
  render();
  window.scrollTo(0, 0);
}
async function finishCard(pass) {
  clearTimeout(answerTimer);
  state.session.finishCard(pass);
  if (state.session.done) {
    state.page = 'result';
    await syncSession();
  } else render();
}
async function syncSession() {
  state.sync = 'saving';
  render();
  try {
    await store.updateStats(state.language, state.session.cards);
    for (const c of state.session.cards) {
      const actual = state.cards.find((x) => x.id === c.id);
      if (actual) actual.review_stats = structuredClone(c.review_stats);
    }
    state.sync = 'saved';
  } catch (error) {
    state.sync = 'failed';
    await handleError(error);
  }
  if (state.user) render();
}
function answer(form) {
  const session = state.session;
  if (session.revealed || state.busy) return;
  const input = form.querySelector('input');
  if (!input.value.trim()) {
    input.focus();
    return;
  }
  const feedback = document.querySelector('#answer-feedback');
  if (session.check(input.value)) {
    state.busy = true;
    input.classList.add('correct');
    input.disabled = true;
    document.querySelector('[form="answer-form"]').disabled = true;
    feedback.textContent = session.wrong
      ? 'That’s it. We’ll revisit this word soon.'
      : 'Correct.';
    answerTimer = setTimeout(() => {
      state.busy = false;
      finishCard(true);
    }, 650);
  } else {
    input.classList.remove('wrong');
    void input.offsetWidth;
    input.classList.add('wrong');
    input.setAttribute('aria-invalid', 'true');
    feedback.textContent = 'Not quite. Try again, or reveal the answer.';
    input.select();
  }
}
async function importFile(file) {
  if (!file) return;
  state.busy = true;
  try {
    const rows = await parseCSV(file);
    state.importPreview = prepareImport(rows, state.cards);
    state.importEntries = state.importPreview.valid.map((c) => ({
      ...c,
      id: crypto.randomUUID(),
    }));
  } catch (error) {
    await handleError(error);
  } finally {
    state.busy = false;
    render();
  }
}
async function confirmImport() {
  if (!state.importEntries?.length) return;
  state.busy = true;
  render();
  const node = document.querySelector('[data-action="confirm-import"]');
  node.textContent = 'Importing…';
  try {
    await store.importCards(state.language, state.importEntries);
    toast(
      `Imported ${state.importEntries.length} words. Skipped ${state.importPreview.duplicates} duplicates and ${state.importPreview.invalid} invalid rows.`,
    );
    state.importPreview = null;
    state.importEntries = null;
    state.page = 'today';
    state.busy = false;
    await loadCards();
  } catch (error) {
    state.busy = false;
    render();
    document.querySelector('#import-error').textContent =
      `${error.message} Some batches may already be saved. Retry uses the same IDs to avoid duplicate words.`;
  } finally {
    state.busy = false;
  }
}
const actions = {
  async login() {
    const btn = root.querySelector('[data-action="login"]');
    btn.disabled = true;
    try {
      const auth = await ensureAuth();
      await auth.login();
    } catch (error) {
      const messages = {
        'auth/popup-blocked':
          'Your browser blocked the sign-in window. Allow popups and open this app directly in Safari or Chrome.',
        'auth/popup-closed-by-user':
          'Sign-in was cancelled. Try again in Safari or Chrome.',
        'auth/operation-not-supported-in-this-environment':
          'Open this app directly in Safari or Chrome to sign in.',
        'auth/unauthorized-domain':
          'This site is not an authorized Firebase domain. Add it in Firebase Authentication settings.',
      };
      renderLogin(
        messages[error.code] ||
          'Google sign-in is not configured or could not connect. Add your Firebase configuration and try again in Safari or Chrome.',
      );
    }
  },
  async logout() {
    if (!(await canLeave())) return;
    if (state.bypass) {
      state.user = null;
      state.bypass = false;
      state.cards = [];
      store = null;
      history.replaceState({}, '', location.pathname);
      renderLogin();
    } else await authModule.logout();
  },
  today: () => navigate('today'),
  settings: () => navigate('settings'),
  library: () => navigate('library'),
  reload: () => loadCards(),
  async add() {
    if (!(await canLeave())) return;
    state.editingId = null;
    state.draft = emptyDraft();
    await navigate('form');
  },
  async edit(el) {
    const card = state.cards.find((c) => c.id === el.dataset.id);
    state.editingId = card.id;
    state.draft = structuredClone(card);
    if (!state.draft.example_en.length) state.draft.example_en = [''];
    await navigate('form');
  },
  star: (el) => star(el.dataset.id),
  delete: (el) => remove(el.dataset.id),
  async preview(el) {
    state.previewId = el.dataset.id;
    state.previewIds = filterCards(state.cards, state.filters).map((c) => c.id);
    await navigate('preview');
  },
  'previous-word': () => movePreview(-1),
  'next-word': () => movePreview(1),
  async speak(el) {
    el.disabled = true;
    try {
      await speak(
        state.cards.find((c) => c.id === state.previewId).word_en,
        state.language,
      );
    } catch (error) {
      toast(error.message);
    } finally {
      el.disabled = false;
    }
  },
  'prev-page': () => {
    state.libraryPage--;
    render();
  },
  'next-page': () => {
    state.libraryPage++;
    render();
  },
  'reset-filters': () => {
    state.filters = defaultFilters();
    state.libraryPage = 1;
    render();
  },
  'add-example': () => {
    captureDraft();
    if (state.draft.example_en.length < 5) state.draft.example_en.push('');
    render();
    document
      .querySelectorAll('[name="example"]')
      .item(state.draft.example_en.length - 1)
      ?.focus();
  },
  'remove-example': (el) => {
    captureDraft();
    if (state.draft.example_en.length > 1)
      state.draft.example_en.splice(Number(el.dataset.index), 1);
    render();
  },
  async import() {
    state.importPreview = null;
    state.importEntries = null;
    await navigate('import');
  },
  'cancel-import': () => {
    state.importPreview = null;
    state.importEntries = null;
    render();
  },
  'confirm-import': () => confirmImport(),
  start: () => startReview(),
  flip: () => {
    state.session.revealed = true;
    render();
  },
  pass: () => finishCard(true),
  fail: () => finishCard(false),
  'dont-know': () => {
    state.session.wrong = true;
    state.session.revealed = true;
    render();
  },
  'next-card': () => finishCard(false),
  'exit-review': async () => {
    if (await exitReview()) {
      state.busy = false;
      render();
    }
  },
  'retry-sync': () => syncSession(),
  finish: () => {
    state.session = null;
    state.page = 'today';
    render();
  },
};
function movePreview(direction) {
  const ids = state.previewIds.filter((id) =>
    state.cards.some((c) => c.id === id),
  );
  const index = ids.indexOf(state.previewId);
  state.previewId = ids[(index + direction + ids.length) % ids.length];
  render();
}
root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  event.preventDefault();
  if (state.busy || state.loading) return;
  try {
    await actions[target.dataset.action]?.(target);
  } catch (error) {
    await handleError(error);
  }
});
root.addEventListener('submit', (event) => {
  event.preventDefault();
  if (state.busy) return;
  if (event.target.id === 'card-form') saveCard(event.target);
  if (event.target.id === 'answer-form') answer(event.target);
});
root.addEventListener(
  'toggle',
  (event) => {
    if (event.target.matches('.customize'))
      state.customOpen = event.target.open;
  },
  true,
);
root.addEventListener('change', async (event) => {
  const el = event.target;
  if (state.busy) return;
  if (el.id === 'language') {
    if (
      state.page === 'review' ||
      (state.page === 'result' && state.sync !== 'saved')
    ) {
      el.value = state.language;
      toast('Finish or exit your review before changing languages.');
      return;
    }
    state.language = el.value;
    try {
      localStorage.setItem('just-word-language-mode', state.language);
    } catch {}
    state.filters = defaultFilters();
    state.settings.category = 'ALL';
    state.libraryPage = 1;
    state.page = ['today', 'library', 'settings'].includes(state.page)
      ? state.page
      : 'today';
    state.cards = [];
    await loadCards();
  } else if (el.closest('#settings-form')) {
    const f = state.settings;
    f[el.name] =
      el.type === 'checkbox'
        ? el.checked
        : el.name === 'starred'
          ? el.value === 'true'
          : el.name === 'limit'
            ? Number(el.value)
            : el.value;
    if (f.type === 'phrase' && f.mode === 'fill_blank') f.mode = 'flip_en';
    state.customOpen = true;
    render();
  } else if (el.closest('#library-filters') && el.name !== 'search') {
    state.filters[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    state.libraryPage = 1;
    render();
  } else if (el.id === 'csv-file') await importFile(el.files[0]);
});
root.addEventListener('input', (event) => {
  const el = event.target;
  if (el.name === 'search') {
    const pos = el.selectionStart;
    state.filters.search = el.value;
    state.libraryPage = 1;
    render();
    const next = root.querySelector('[name="search"]');
    next.focus();
    next.setSelectionRange(pos, pos);
  }
});
document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]')) return;
  if (
    event.key === 'Enter' &&
    state.page === 'review' &&
    !state.session.mode.startsWith('flip') &&
    state.session.revealed &&
    !state.busy
  ) {
    event.preventDefault();
    finishCard(false);
  }
  if (
    event.key === '/' &&
    state.page === 'library' &&
    !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)
  ) {
    event.preventDefault();
    root.querySelector('[name="search"]')?.focus();
  }
});
window.addEventListener('beforeunload', (event) => {
  if (
    state.page === 'review' ||
    (state.page === 'result' && state.sync !== 'saved') ||
    state.busy
  ) {
    event.preventDefault();
    event.returnValue = '';
  }
});
if (state.bypass) {
  store = new MockStore();
  state.user = testUser();
  await loadCards();
} else {
  renderLogin();
  try {
    await ensureAuth();
  } catch {
    renderLogin();
  }
}
