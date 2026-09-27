export const MODES = {
  flip_en: 'Flip card · Word → ZH',
  flip_zh: 'Flip card · ZH → Word',
  spelling: 'Spelling',
  fill_blank: 'Cloze',
  inflection: 'Inflection drill',
};
// Modes only offered for some languages (inflection tables are Swedish-only).
export const modeAvailable = (mode, language) =>
  mode !== 'inflection' || language === 'sv';
export const LANGUAGES = {
  en: { name: 'English', collection: 'cards', speech: 'en-US' },
  sv: { name: 'Svenska', collection: 'cards_sv', speech: 'sv-SE' },
};
export const escapeHTML = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
export const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ');
export const isPhrase = (word) => String(word).trim().split(/\s+/).length > 1;
export const isBypass = (search) =>
  ['1', 'true'].includes(new URLSearchParams(search).get('auth_bypass'));
export const testUser = () => ({
  displayName: 'Testing Bypass',
  email: 'test-bypass@local',
});
export function toDate(value) {
  return value?.toDate ? value.toDate() : value ? new Date(value) : null;
}
export function initialStats() {
  return {
    state: 'NEW',
    success_streak: 0,
    interval_days: 0,
    next_review_date: null,
    mastered_at: null,
    demotions: [],
    total_attempts: 0,
    correct_attempts: 0,
    consecutive_correct: 0,
    last_reviewed_at: null,
    last_wrong_at: null,
    mode_stats: Object.fromEntries(
      Object.keys(MODES).map((m) => [m, { attempts: 0, correct: 0 }]),
    ),
  };
}
export function statsOf(card) {
  const base = initialStats(),
    s = card.review_stats || {};
  return { ...base, ...s, mode_stats: { ...base.mode_stats, ...s.mode_stats } };
}
export function isDue(card, now = new Date()) {
  const date = toDate(statsOf(card).next_review_date);
  return !date || date <= now;
}
export function summary(cards, now = new Date()) {
  return {
    due: cards.filter((c) => statsOf(c).state !== 'NEW' && isDue(c, now))
      .length,
    ...Object.fromEntries(
      ['NEW', 'LEARNING', 'MASTERED'].map((s) => [
        s,
        cards.filter((c) => statsOf(c).state === s).length,
      ]),
    ),
  };
}
export function categories(cards) {
  return [
    ...new Set(cards.map((c) => (c.category || '').trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}
export function sortCards(cards) {
  return [...cards].sort(
    (a, b) =>
      (toDate(b.created_at)?.getTime() || 0) -
        (toDate(a.created_at)?.getTime() || 0) || a.id.localeCompare(b.id),
  );
}
export function filterCards(cards, f = {}, now = new Date()) {
  return sortCards(cards).filter((c) => {
    const status = statsOf(c).state;
    return (
      (!f.starred || c.is_starred) &&
      (!f.status || f.status === 'ALL' || status === f.status) &&
      (!f.type ||
        f.type === 'ALL' ||
        isPhrase(c.word_en) === (f.type === 'phrase')) &&
      (!f.category ||
        f.category === 'ALL' ||
        (f.category === 'UNCATEGORIZED'
          ? !(c.category || '').trim()
          : c.category === f.category)) &&
      (!f.due || f.status === 'NEW' || isDue(c, now)) &&
      (!f.search ||
        normalize([...wordsOf(c), c.meaning_zh, c.note].join(' ')).includes(
          normalize(f.search),
        ))
    );
  });
}
export function shuffle(cards, random = Math.random) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export const POS = ['n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'interj.', 'phr.'];
const list = (value) =>
  (Array.isArray(value) ? value : String(value ?? '').split(/[,，;；\n]/))
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
const uniqueWords = (values, exclude = '') => {
  const seen = new Set([normalize(exclude)]);
  return list(values).filter((v) => {
    const key = normalize(v);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
export function sensesOf(card) {
  if (Array.isArray(card?.senses) && card.senses.length)
    return card.senses.map((s) => ({
      pos: s?.pos || '',
      meaning_zh: s?.meaning_zh || '',
      example_en: s?.example_en || [],
    }));
  return [
    {
      pos: card?.pos || '',
      meaning_zh: card?.meaning_zh || '',
      example_en: card?.example_en || [],
    },
  ];
}
export const formatMeaning = (senses) =>
  senses.length === 1 && !senses[0].pos
    ? senses[0].meaning_zh
    : senses.map((s) => [s.pos, s.meaning_zh].filter(Boolean).join(' ')).join(' / ');
// Labelled inflection table per part of speech (used for Swedish, where the
// forms are irregular enough to be worth learning). Stored on a card as
// { "n.": { gender: "en", definite: "artikeln", ... }, "v.": {...} }.
// A cell may hold alternatives separated by "/" (sa/sade).
export const INFLECTIONS = {
  'n.': [
    ['gender', 'Gender'],
    ['definite', 'Definite'],
    ['plural', 'Plural'],
    ['definite_plural', 'Definite plural'],
  ],
  'v.': [
    ['present', 'Present'],
    ['past', 'Past'],
    ['supine', 'Supine'],
    ['imperative', 'Imperative'],
  ],
  'adj.': [
    ['neuter', 'Neuter (-t)'],
    ['plural', 'Plural (-a)'],
  ],
};
export const GENDERS = ['en', 'ett'];
// Keeps only tables for parts of speech the card actually has.
function normalizeInflection(raw, posList) {
  const out = {};
  for (const [pos, fields] of Object.entries(INFLECTIONS)) {
    if (!posList.includes(pos)) continue;
    const row = {};
    for (const [key] of fields) {
      const v = String(raw?.[pos]?.[key] ?? '').trim();
      if (key === 'gender' ? GENDERS.includes(v) : v) row[key] = v;
    }
    if (Object.keys(row).length) out[pos] = row;
  }
  return out;
}
export const inflectedForms = (card) =>
  Object.values(card.inflection || {}).flatMap((row) =>
    Object.entries(row)
      .filter(([key]) => key !== 'gender')
      .flatMap(([, v]) => String(v).split('/'))
      .map((v) => v.trim())
      .filter(Boolean),
  );
// Every filled cell of a card's inflection table, as a drill question.
export function inflectionCells(card) {
  return Object.entries(INFLECTIONS).flatMap(([pos, fields]) =>
    fields
      .filter(([key]) => card.inflection?.[pos]?.[key])
      .map(([key, label]) => {
        const value = card.inflection[pos][key];
        return {
          pos,
          key,
          label,
          value,
          answers: value.split('/').map(normalize).filter(Boolean),
        };
      }),
  );
}
export const wordsOf = (card) => [
  ...new Set([card.word_en, ...(card.forms || []), ...inflectedForms(card)]),
];
export function validateCard(raw, cards = [], excludeId = null) {
  const word_en = String(raw.word_en || '').trim();
  const senses = sensesOf(raw)
    .map((s) => ({
      pos: POS.includes(String(s.pos).trim()) ? String(s.pos).trim() : '',
      meaning_zh: String(s.meaning_zh || '').trim(),
      example_en: (s.example_en || [])
        .map(String)
        .map((v) => v.trim())
        .filter(Boolean),
    }))
    .filter((s, i, all) => all.length === 1 || s.meaning_zh || s.example_en.length);
  const value = {
    word_en,
    meaning_zh: formatMeaning(senses),
    category: String(raw.category || '').trim(),
    note: String(raw.note || '').trim(),
    example_en: senses.flatMap((s) => s.example_en),
    senses,
    forms: uniqueWords(raw.forms, word_en),
    related: uniqueWords(raw.related, word_en),
    inflection: normalizeInflection(raw.inflection, senses.map((s) => s.pos)),
    is_starred: !!raw.is_starred,
  };
  const taken = new Map();
  for (const c of cards)
    if (c.id !== excludeId)
      for (const w of wordsOf(c)) taken.set(normalize(w), c.word_en);
  const clash = wordsOf(value).find((w) => taken.has(normalize(w)));
  let error = '';
  if (!word_en || senses.some((s) => !s.meaning_zh))
    error = 'Word and meaning are required.';
  else if (senses.some((s) => s.example_en.length < 1 || s.example_en.length > 5))
    error = 'Add between 1 and 5 non-empty examples.';
  else if (normalize(word_en) === normalize(taken.get(normalize(word_en)) ?? ''))
    error = 'This word already exists in your library.';
  else if (clash)
    error = `"${clash}" is already in your library under "${taken.get(normalize(clash))}".`;
  return { value, error };
}
export function applyResult(card, pass, mode, now = new Date()) {
  const s = structuredClone(statsOf(card));
  const weight = mode.startsWith('flip') ? 0.5 : 1;
  s.total_attempts += weight;
  s.correct_attempts += pass ? weight : 0;
  s.consecutive_correct = pass ? s.consecutive_correct + 1 : 0;
  s.last_reviewed_at = new Date(now);
  if (!pass) s.last_wrong_at = new Date(now);
  const m = s.mode_stats[mode];
  s.mode_stats[mode] = {
    attempts: m.attempts + weight,
    correct: m.correct + (pass ? weight : 0),
  };
  if (isDue(card, now)) {
    if (pass) {
      s.success_streak++;
      const steps = [0, 1, 3, 7, 14, 30];
      s.interval_days =
        steps[Math.min(Math.max(steps.indexOf(s.interval_days), 0) + 1, 5)];
      if (s.success_streak >= 3 && s.interval_days >= 14) {
        s.state = 'MASTERED';
        s.mastered_at ||= new Date(now);
      } else if (s.state === 'NEW') s.state = 'LEARNING';
    } else {
      if (s.state === 'MASTERED') s.demotions.push(now.toISOString());
      s.state = 'LEARNING';
      s.success_streak = 0;
      s.interval_days = 1;
    }
    const next = new Date(now);
    next.setDate(next.getDate() + s.interval_days);
    next.setHours(0, 0, 0, 0);
    s.next_review_date = next;
  }
  return s;
}
