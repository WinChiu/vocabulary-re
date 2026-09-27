import { normalize, validateCard, wordsOf } from './core.js';
export function fieldFor(header) {
  const h = normalize(header);
  if (/example|sentence|例句/.test(h)) return 'example_en';
  if (/^(pos|part of speech|詞性)$/.test(h)) return 'pos';
  if (/^(forms?|型態|變化)$/.test(h)) return 'forms';
  if (/^(related|相關字?)$/.test(h)) return 'related';
  if (/^(category|categories|type|類別|分類)$/.test(h)) return 'category';
  if (/note|備註|筆記/.test(h)) return 'note';
  if (/mean|zh|chinese|意思|中文/.test(h)) return 'meaning_zh';
  if (
    /word|english|swedish|svenska|單字|英文|瑞典文/.test(h) ||
    /^(en|sv)$/.test(h)
  )
    return 'word_en';
  return null;
}
export function prepareImport(rows, cards = []) {
  if (!rows.length)
    return { entries: [], valid: [], duplicates: 0, invalid: 0 };
  const [headers, ...body] = rows;
  const seen = new Set(cards.flatMap(wordsOf).map(normalize));
  const entries = [];
  body.forEach((cells, index) => {
    if (!cells.some((c) => String(c ?? '').trim())) return;
    const raw = { example_en: [] },
      extra = [];
    headers.forEach((h, i) => {
      const field = fieldFor(h),
        v = String(cells[i] ?? '').trim();
      if (field === 'example_en') {
        if (v) raw.example_en.push(v);
      } else if (field) raw[field] = v;
      else if (v) extra.push([String(h), v]);
    });
    const { value, error } = validateCard(raw);
    const duplicate =
      !error && wordsOf(value).some((w) => seen.has(normalize(w)));
    if (!error && !duplicate)
      wordsOf(value).forEach((w) => seen.add(normalize(w)));
    entries.push({
      row: index + 2,
      value,
      extra,
      status: error ? 'invalid' : duplicate ? 'duplicate' : 'ready',
      reason:
        error ||
        (duplicate
          ? 'Already in the library or this file.'
          : 'Ready to import'),
    });
  });
  return {
    entries,
    valid: entries.filter((e) => e.status === 'ready').map((e) => e.value),
    duplicates: entries.filter((e) => e.status === 'duplicate').length,
    invalid: entries.filter((e) => e.status === 'invalid').length,
  };
}
let scriptPromise;
export async function parseCSV(file) {
  if (!/\.csv$/i.test(file.name)) throw new Error('Choose a .csv file.');
  scriptPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    const timer = setTimeout(() => s.onerror(), 10000);
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => {
      clearTimeout(timer);
      scriptPromise = null;
      s.remove();
      reject(
        new Error(
          'Could not load the CSV reader. Check your connection and try again.',
        ),
      );
    };
    document.head.append(s);
  });
  await scriptPromise;
  const book = window.XLSX.read(await file.text(), {
    type: 'string',
    raw: true,
  });
  return window.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
    header: 1,
    defval: '',
    raw: false,
  });
}
