export const MODES = {
  flip_en: 'Flip card · EN → ZH',
  flip_zh: 'Flip card · ZH → EN',
  spelling: 'Spelling',
  fill_blank: 'Cloze',
};
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
        normalize([c.word_en, c.meaning_zh, c.note].join(' ')).includes(
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
export function validateCard(raw, cards = [], excludeId = null) {
  const value = {
    word_en: String(raw.word_en || '').trim(),
    meaning_zh: String(raw.meaning_zh || '').trim(),
    category: String(raw.category || '').trim(),
    note: String(raw.note || '').trim(),
    example_en: (raw.example_en || [])
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean),
    is_starred: !!raw.is_starred,
  };
  let error = '';
  if (!value.word_en || !value.meaning_zh)
    error = 'Word and meaning are required.';
  else if (value.example_en.length < 1 || value.example_en.length > 5)
    error = 'Add between 1 and 5 non-empty examples.';
  else if (
    cards.some(
      (c) =>
        c.id !== excludeId && normalize(c.word_en) === normalize(value.word_en),
    )
  )
    error = 'This word already exists in your library.';
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
