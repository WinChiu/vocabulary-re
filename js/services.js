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
async function nativeSpeech(text, lang) {
  if (!('speechSynthesis' in window)) throw new Error('Speech unavailable');
  const synth = window.speechSynthesis;
  synth.cancel();
  let voices = synth.getVoices();
  if (!voices.length) {
    await new Promise((resolve) => {
      let timer;
      const ready = () => {
        clearTimeout(timer);
        synth.removeEventListener('voiceschanged', ready);
        resolve();
      };
      synth.addEventListener('voiceschanged', ready, { once: true });
      timer = setTimeout(ready, 800);
    });
    voices = synth.getVoices();
  }
  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = speechLanguage(lang);
  speech.voice =
    voices.find((v) => v.lang === speech.lang) ||
    voices.find((v) => v.lang.startsWith(lang)) ||
    null;
  if (!speech.voice) console.warn('No matching speech voice is available.');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      synth.cancel();
      reject(new Error('Speech timed out'));
    }, 10000);
    speech.onend = () => {
      clearTimeout(timer);
      resolve();
    };
    speech.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Speech unavailable'));
    };
    synth.speak(speech);
  });
}
function googleSpeech(text, lang) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(ttsURL(text, lang));
    const finish = (error) => {
      clearTimeout(timer);
      audio.pause();
      audio.removeAttribute('src');
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => finish(new Error('Audio timed out')), 10000);
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error('Audio unavailable'));
    audio.play().catch(finish);
  });
}
export async function speak(text, lang) {
  const engines = /Android|iPhone|iPad|iPod/.test(navigator.userAgent)
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
