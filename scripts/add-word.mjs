#!/usr/bin/env node
// CLI for the "add-word" skill: writes a vocabulary card straight to Firestore,
// bypassing the browser/Google-login flow the app itself uses.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { LANGUAGES, categories, validateCard, initialStats, normalize } from '../js/core.js';
import { loadCards } from './card-cache.mjs';

function fail(message) {
  console.log(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function parseFlags(argv) {
  const flags = { example: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'starred' || key === 'allow-partial' || key === 'offline' || key === 'refresh') {
      flags[key] = true;
      continue;
    }
    if (key === 'example') {
      flags.example.push(argv[++i]);
      continue;
    }
    flags[key] = argv[++i];
  }
  return flags;
}

function loadServiceAccount() {
  const keyPath =
    process.env.JUST_WORD_SERVICE_ACCOUNT ||
    path.join(os.homedir(), '.config', 'just-word', 'service-account.json');
  let raw;
  try {
    raw = readFileSync(keyPath, 'utf8');
  } catch {
    throw new Error(
      `Could not read service account key at "${keyPath}". Set the JUST_WORD_SERVICE_ACCOUNT env var or place your Firebase service account JSON there.`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Service account key at "${keyPath}" is not valid JSON.`);
  }
}

let firestoreInstance;
function db() {
  if (!firestoreInstance) {
    const serviceAccount = loadServiceAccount();
    initializeApp({ credential: cert(serviceAccount) });
    firestoreInstance = getFirestore();
  }
  return firestoreInstance;
}

// Cards come from the local cache (backups/cache-<lang>.json), synced
// incrementally; --offline skips Firestore entirely (read-only commands only).
function cards(language, flags, { allowOffline = false } = {}) {
  return loadCards(language, () => db().collection(LANGUAGES[language].collection), {
    offline: allowOffline && !!flags.offline,
    refresh: !!flags.refresh,
  });
}

async function runList(flags) {
  const language = flags.lang;
  if (!LANGUAGES[language])
    return fail(`Unknown language "${language}". Use "en" or "sv".`);
  const store = await cards(language, flags, { allowOffline: true });
  console.log(JSON.stringify({ ok: true, categories: categories(store.cards), sync: store.sync }));
}

async function runDump(flags) {
  const language = flags.lang;
  if (!LANGUAGES[language])
    return fail(`Unknown language "${language}". Use "en" or "sv".`);
  const store = await cards(language, flags, { allowOffline: true });
  const list = store.cards
    .map((c) => ({
      id: c.id,
      word_en: c.word_en,
      category: c.category || '',
      meaning_zh: c.meaning_zh,
    }))
    .sort((a, b) => normalize(a.word_en).localeCompare(normalize(b.word_en)));
  console.log(JSON.stringify({ ok: true, count: list.length, cards: list, sync: store.sync }));
}

async function runBulkCategory(flags) {
  const language = flags.lang;
  if (!LANGUAGES[language])
    return fail(`Unknown language "${language}". Use "en" or "sv".`);
  if (flags.json === undefined)
    return fail('Provide --json \'{"word": "category", ...}\' mapping every word to its new category.');

  let map;
  try {
    map = JSON.parse(flags.json);
  } catch {
    return fail('--json must be valid JSON.');
  }

  const store = await cards(language, flags);
  const firestore = db();
  const collectionRef = firestore.collection(LANGUAGES[language].collection);
  const existing = store.cards;

  const byWord = new Map(existing.map((c) => [normalize(c.word_en), c]));
  const mappedWords = new Set(Object.keys(map).map(normalize));
  const unmapped = existing.filter((c) => !mappedWords.has(normalize(c.word_en)));
  if (!flags['allow-partial'] && unmapped.length) {
    return fail(
      `${unmapped.length} card(s) have no entry in --json and --allow-partial was not set: ` +
        JSON.stringify(unmapped.map((c) => c.word_en)),
    );
  }

  let batch = firestore.batch();
  let ops = 0;
  let updated = 0;
  const notFound = [];
  for (const [word, category] of Object.entries(map)) {
    const card = byWord.get(normalize(word));
    if (!card) {
      notFound.push(word);
      continue;
    }
    batch.update(collectionRef.doc(card.id), {
      category: String(category || '').trim(),
      updated_at: FieldValue.serverTimestamp(),
    });
    store.upsert({ id: card.id, category: String(category || '').trim() });
    updated++;
    ops++;
    if (ops === 450) {
      await batch.commit();
      batch = firestore.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  store.save();

  const counts = {};
  for (const card of store.cards) {
    const c = (card.category || '').trim() || '(none)';
    counts[c] = (counts[c] || 0) + 1;
  }

  console.log(JSON.stringify({ ok: true, language, updated, notFound, counts, sync: store.sync }));
}

async function runAdd(flags, argv) {
  let input;
  if (flags.json !== undefined) {
    input = JSON.parse(flags.json);
  } else if (argv.length === 0) {
    input = JSON.parse(await readStdin());
  } else {
    input = {
      language: flags.lang,
      word_en: flags.word,
      meaning_zh: flags.meaning,
      category: flags.category || '',
      note: flags.note || '',
      example_en: flags.example,
      is_starred: !!flags.starred,
    };
  }

  const language = input.language;
  if (!LANGUAGES[language])
    return fail(`Unknown language "${language}". Use "en" or "sv".`);

  const store = await cards(language, flags);
  const { value, error } = validateCard(input, store.cards);
  if (error) return fail(error);

  const docRef = await db().collection(LANGUAGES[language].collection).add({
    ...value,
    review_stats: initialStats(),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  store.upsert({ id: docRef.id, ...value, review_stats: initialStats() });
  store.save();

  console.log(JSON.stringify({ ok: true, id: docRef.id, language, card: value, sync: store.sync }));
}

async function runFind(flags) {
  const language = flags.lang;
  if (!LANGUAGES[language])
    return fail(`Unknown language "${language}". Use "en" or "sv".`);
  if (!flags.word) return fail('Provide --word to search for.');

  const store = await cards(language, flags, { allowOffline: true });
  const all = store.cards;
  const query = normalize(flags.word);
  const exact = all.filter((c) => normalize(c.word_en) === query);
  const matches = exact.length
    ? exact
    : all.filter((c) => normalize(c.word_en).includes(query));

  console.log(JSON.stringify({ ok: true, matches, sync: store.sync }));
}

async function runUpdate(flags) {
  const language = flags.lang;
  if (!LANGUAGES[language])
    return fail(`Unknown language "${language}". Use "en" or "sv".`);

  const store = await cards(language, flags);
  const collectionRef = db().collection(LANGUAGES[language].collection);
  const existing = store.cards;

  let id = flags.id;
  if (!id) {
    if (!flags.word)
      return fail('Provide --id (from "find") or --word to identify the card to update.');
    const match = existing.find((c) => normalize(c.word_en) === normalize(flags.word));
    if (!match) return fail(`No card found for word "${flags.word}".`);
    id = match.id;
  }
  const current = existing.find((c) => c.id === id);
  if (!current) return fail(`No card with id "${id}" in this language.`);

  let patch;
  if (flags.json !== undefined) {
    patch = JSON.parse(flags.json);
  } else {
    patch = {};
    if (flags.meaning !== undefined) patch.meaning_zh = flags.meaning;
    if (flags.category !== undefined) patch.category = flags.category;
    if (flags.note !== undefined) patch.note = flags.note;
    if (flags.example.length) patch.example_en = flags.example;
    if (flags.starred !== undefined) patch.is_starred = !!flags.starred;
  }

  const merged = { ...current, ...patch };
  const { value, error } = validateCard(merged, existing, id);
  if (error) return fail(error);

  await collectionRef.doc(id).update({
    ...value,
    updated_at: FieldValue.serverTimestamp(),
  });
  store.upsert({ id, ...value });
  store.save();

  console.log(JSON.stringify({ ok: true, id, language, card: value, sync: store.sync }));
}

async function runDelete(flags) {
  const language = flags.lang;
  if (!LANGUAGES[language])
    return fail(`Unknown language "${language}". Use "en" or "sv".`);

  const store = await cards(language, flags);
  const collectionRef = db().collection(LANGUAGES[language].collection);
  const existing = store.cards;

  let id = flags.id;
  if (!id) {
    if (!flags.word)
      return fail('Provide --id (from "find") or --word to identify the card to delete.');
    const query = normalize(flags.word);
    const exact = existing.filter((c) => normalize(c.word_en) === query);
    const matches = exact.length
      ? exact
      : existing.filter((c) => normalize(c.word_en).includes(query));
    if (matches.length === 0) return fail(`No card found for word "${flags.word}".`);
    if (matches.length > 1)
      return fail(
        `Multiple cards match "${flags.word}" — pass --id to pick one: ` +
          JSON.stringify(matches.map((c) => ({ id: c.id, word_en: c.word_en }))),
      );
    id = matches[0].id;
  }
  const current = existing.find((c) => c.id === id);
  if (!current) return fail(`No card with id "${id}" in this language.`);

  await collectionRef.doc(id).delete();
  store.remove(id);
  store.save();

  console.log(
    JSON.stringify({
      ok: true,
      id,
      language,
      deleted: {
        word_en: current.word_en,
        meaning_zh: current.meaning_zh,
        category: current.category || '',
      },
      sync: store.sync,
    }),
  );
}

async function runBackup(flags) {
  const requested = flags.lang || 'all';
  const langs = requested === 'all' ? Object.keys(LANGUAGES) : [requested];
  for (const l of langs) {
    if (!LANGUAGES[l]) return fail(`Unknown language "${l}". Use "en", "sv", or "all".`);
  }

  // A backup is an explicit full snapshot, so it always does a full read
  // (which also refreshes the local cache).
  const snapshot_by_lang = {};
  for (const l of langs) {
    snapshot_by_lang[l] = (await cards(l, { refresh: true })).cards;
  }

  const exportedAt = new Date().toISOString();
  const payload = {
    exported_at: exportedAt,
    languages: Object.fromEntries(
      langs.map((l) => [l, { collection: LANGUAGES[l].collection, count: snapshot_by_lang[l].length, cards: snapshot_by_lang[l] }]),
    ),
  };

  const outPath =
    flags.out ||
    path.join('backups', `backup-${requested}-${exportedAt.replace(/[:.]/g, '-')}.json`);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(
    JSON.stringify({
      ok: true,
      path: outPath,
      counts: Object.fromEntries(langs.map((l) => [l, snapshot_by_lang[l].length])),
    }),
  );
}

async function runBulkAdd(flags) {
  const language = flags.lang;
  if (!LANGUAGES[language])
    return fail(`Unknown language "${language}". Use "en" or "sv".`);
  if (flags.json === undefined)
    return fail('Provide --json \'[{"word_en":"...","meaning_zh":"...","example_en":["..."],...}, ...]\'.');

  let entries;
  try {
    entries = JSON.parse(flags.json);
  } catch {
    return fail('--json must be valid JSON.');
  }
  if (!Array.isArray(entries)) return fail('--json must be a JSON array of card objects.');

  const store = await cards(language, flags);
  const firestore = db();
  const collectionRef = firestore.collection(LANGUAGES[language].collection);
  const existing = store.cards;

  const added = [];
  const skipped = [];
  let batch = firestore.batch();
  let ops = 0;

  for (const raw of entries) {
    const { value, error } = validateCard(raw, existing);
    if (error) {
      skipped.push({ word_en: raw.word_en || '(missing)', reason: error });
      continue;
    }
    const docRef = collectionRef.doc();
    batch.set(docRef, {
      ...value,
      review_stats: initialStats(),
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    added.push({ id: docRef.id, word_en: value.word_en });
    existing.push({ id: docRef.id, ...value });
    store.upsert({ id: docRef.id, ...value, review_stats: initialStats() });
    ops++;
    if (ops === 450) {
      await batch.commit();
      batch = firestore.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  store.save();

  console.log(JSON.stringify({ ok: true, language, addedCount: added.length, added, skipped, sync: store.sync }));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  if (command === 'categories') return runList(flags);
  if (command === 'list') return runDump(flags);
  if (command === 'add') return runAdd(flags, rest);
  if (command === 'find') return runFind(flags);
  if (command === 'update') return runUpdate(flags);
  if (command === 'delete') return runDelete(flags);
  if (command === 'backup') return runBackup(flags);
  if (command === 'bulk-category') return runBulkCategory(flags);
  if (command === 'bulk-add') return runBulkAdd(flags);
  fail('Usage: add-word.mjs add [--json <json> | --lang --word --meaning --category --note --example ... --starred]\n       add-word.mjs categories --lang <en|sv> [--offline]\n       add-word.mjs list --lang <en|sv> [--offline]\n       add-word.mjs find --lang <en|sv> --word <text> [--offline]\n       (any command: --refresh forces a full re-read into the local cache)\n       add-word.mjs update --lang <en|sv> (--id <id> | --word <text>) [--json <json> | --meaning --category --note --example ... --starred]\n       add-word.mjs delete --lang <en|sv> (--id <id> | --word <text>)\n       add-word.mjs backup [--lang <en|sv|all>] [--out <path>]\n       add-word.mjs bulk-category --lang <en|sv> --json \'{"word": "category", ...}\' [--allow-partial]\n       add-word.mjs bulk-add --lang <en|sv> --json \'[{"word_en":"...","meaning_zh":"...","example_en":["..."]}, ...]\'');
}

main().catch((err) => fail(err.message));
