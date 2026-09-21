export async function dictionary(word, { signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 6000);
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim().toLowerCase())}`,
      { signal: controller.signal },
    );
    if (!response.ok) return null;
    const items = await response.json();
    const first = items[0];
    if (!first) return null;
    const meanings = items.flatMap((i) => i.meanings || []);
    const groups = new Map();
    for (const m of meanings) {
      const defs = groups.get(m.partOfSpeech) || [];
      groups.set(
        m.partOfSpeech,
        [
          ...new Set([...defs, ...m.definitions.map((d) => d.definition)]),
        ].slice(0, 2),
      );
    }
    return {
      phonetic:
        first.phonetic || first.phonetics?.find((p) => p.text)?.text || '',
      synonyms: [
        ...new Set(
          meanings.flatMap((m) => [
            ...(m.synonyms || []),
            ...m.definitions.flatMap((d) => d.synonyms || []),
          ]),
        ),
      ].slice(0, 5),
      definitions: [...groups],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
export const speechLanguage = (lang) => (lang === 'sv' ? 'sv-SE' : 'en-US');
export const ttsURL = (text, lang) =>
  `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang === 'sv' ? 'sv' : 'en'}&q=${encodeURIComponent(text)}`;
const isMobileBrowser = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
function waitForVoices(synth, timeout = 800) {
  return new Promise((resolve) => {
    const existing = synth.getVoices();
    if (existing.length) return resolve(existing);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener('voiceschanged', finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', finish, { once: true });
    setTimeout(finish, timeout);
  });
}
async function nativeSpeech(text, lang) {
  if (!('speechSynthesis' in window)) throw new Error('Speech unavailable');
  const synth = window.speechSynthesis;
  const lang_ = speechLanguage(lang);
  const voices = await waitForVoices(synth);
  const voice =
    voices.find((v) => v.lang === lang_) ||
    voices.find((v) => v.lang?.startsWith(lang)) ||
    null;
  if (!voice) console.warn('No matching speech voice is available.');
  return new Promise((resolve, reject) => {
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = lang_;
    if (voice) speech.voice = voice;
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      ok ? resolve() : reject(new Error('Speech unavailable'));
    };
    // Chrome can silently drop speak() called right after cancel(); onend is
    // also unreliable, so treat "started" (or a short grace period) as success
    // instead of waiting for the utterance to actually finish.
    speech.onstart = () => finish(true);
    speech.onerror = () => finish(false);
    synth.cancel();
    setTimeout(() => {
      try {
        synth.speak(speech);
      } catch {
        finish(false);
      }
    }, 0);
    setTimeout(() => finish(true), 1200);
  });
}
function googleSpeech(text, lang) {
  const audio = new Audio(ttsURL(text, lang));
  audio.preload = 'auto';
  audio.playsInline = true;
  // Resolve once playback starts rather than once it ends, so a slow or
  // stalled network stream can't hang the caller.
  return audio.play();
}
export async function speak(text, lang) {
  const engines = isMobileBrowser()
    ? [nativeSpeech, googleSpeech]
    : [googleSpeech, nativeSpeech];
  for (const engine of engines) {
    try {
      await engine(text, lang);
      return;
    } catch {}
  }
  throw new Error('Audio Unavailable');
}
