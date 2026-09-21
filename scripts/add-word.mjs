#!/usr/bin/env node
// CLI for the "add-word" skill: writes a vocabulary card straight to Firestore,
// bypassing the browser/Google-login flow the app itself uses.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { LANGUAGES, categories, validateCard, initialStats } from '../js/core.js';

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
    if (key === 'starred') {
      flags.starred = true;
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

function db() {
  const serviceAccount = loadServiceAccount();
  initializeApp({ credential: cert(serviceAccount) });
  return getFirestore();
}

async function runList(flags) {
  const language = flags.lang;
  if (!LANGUAGES[language])
    return fail(`Unknown language "${language}". Use "en" or "sv".`);
  const firestore = db();
  const snapshot = await firestore.collection(LANGUAGES[language].collection).get();
  const cards = snapshot.docs.map((d) => d.data());
  console.log(JSON.stringify({ ok: true, categories: categories(cards) }));
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

  const firestore = db();
  const collectionRef = firestore.collection(LANGUAGES[language].collection);
  const snapshot = await collectionRef.get();
  const existing = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  const { value, error } = validateCard(input, existing);
  if (error) return fail(error);

  const docRef = await collectionRef.add({
    ...value,
    review_stats: initialStats(),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  console.log(JSON.stringify({ ok: true, id: docRef.id, language, card: value }));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  if (command === 'categories') return runList(flags);
  if (command === 'add') return runAdd(flags, rest);
  fail('Usage: add-word.mjs add [--json <json> | --lang --word --meaning --category --note --example ... --starred]\n       add-word.mjs categories --lang <en|sv>');
}

main().catch((err) => fail(err.message));
