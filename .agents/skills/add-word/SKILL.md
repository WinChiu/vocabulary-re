---
name: add-word
description: Add a new English or Swedish vocabulary word (with Chinese meaning, examples, category, note) to the Just Word app's Firestore library. Use when the user asks to add, create, or import a new word or phrase into their vocabulary app in this repo.
---

# Add Word

Adds one vocabulary card directly to Firestore, using the same schema and
validation the app itself uses ([js/core.js](../../../js/core.js) —
`LANGUAGES`, `validateCard`, `initialStats`). This bypasses the browser
Google-login flow entirely by using a Firebase service account key, via
[scripts/add-word.mjs](../../../scripts/add-word.mjs).

## Prerequisite (one-time, per machine)

The script needs a Firebase service account key. Check whether it's set up
before doing anything else:

```bash
node -e "require('fs').accessSync(process.env.JUST_WORD_SERVICE_ACCOUNT || require('os').homedir()+'/.config/just-word/service-account.json')" && echo OK
```

If this fails, stop and tell the user to:
1. Go to Firebase Console → Project Settings → Service accounts → Generate new private key.
2. Save the downloaded JSON at `~/.config/just-word/service-account.json`
   (or anywhere else, then set `JUST_WORD_SERVICE_ACCOUNT=/path/to/key.json`
   in their shell profile).
3. Never commit this file or place it inside the repo.

Do not attempt to generate or download this key yourself.

## Firestore reads & the local cache

The user wants to keep Firestore read usage (billed per document) low.
`scripts/add-word.mjs` therefore keeps a local copy of each collection at
`backups/cache-<lang>.json` (gitignored) and never re-reads the whole
collection on every command:

- **First run per language** (no cache yet): one full read, cache written.
- **Every later run**: fetches only cards with `updated_at` newer than the
  last sync (edits/reviews made in the app included), plus one `count()`
  query to detect cards deleted elsewhere. Typically a handful of reads.
  A count mismatch triggers one automatic full re-read.
- **`--offline`** (`categories`, `list`, `find` only): reads the cache
  with **zero** Firestore calls. Use it when the user just wants to browse
  or look something up and slightly stale data is fine. It errors if no
  cache exists yet — then run once without it.
- **`--refresh`** (any command): forces a full re-read. Only use it if
  the cache looks wrong; it costs one read per card.
- Write commands (`add`, `update`, `delete`, `bulk-*`) always do the
  cheap incremental sync first (ignore `--offline`), so duplicate checks
  are against current data, then mirror their own writes into the cache
  and move the sync marker past them, so the next sync doesn't re-read
  (and bill) what this script just wrote.
- For many edits at once use `bulk-update` (see `update-word`), never a
  loop of single `update`/`add` calls — each call costs its own sync.
- Every JSON result includes a `sync` field (`mode`: `offline` /
  `incremental` / `full`, approximate `reads`) — mention it if the user
  asks about usage, and flag it if you see unexpected `full` syncs.

Don't write ad-hoc scripts that call `collection(...).get()` to look at the
library — use these commands (or `--offline`) instead.

## Steps

1. **Determine the language.** If the user doesn't say explicitly, ask
   whether the word is English or Swedish — this decides `en` vs `sv`,
   which maps to a different Firestore collection (`cards` vs `cards_sv`).

2. **Look up existing categories** so the new card reuses an existing
   category name instead of creating a near-duplicate:

   ```bash
   node scripts/add-word.mjs categories --lang en
   ```

   Returns `{"ok":true,"categories":["...","..."],"sync":{...}}`. Adding
   `--offline` is fine here if the cache exists — the category list rarely
   changes, and the `add` step syncs before its duplicate check anyway.

3. **Draft the card.** Fill in every field:
   - `word_en` — the **base form** (lemma), e.g. `propel` when the user
     gives `propelled` (required). Say so in the draft when you changed
     it, and put the given form in `forms`. Exception: keep the given
     form when it is its own dictionary entry (e.g. `emerging` adj.).
   - `senses` — one entry per part of speech, each
     `{"pos": "...", "meaning_zh": "...", "example_en": ["..."]}`:
     - `pos` — one of `n.` `v.` `adj.` `adv.` `prep.` `conj.` `pron.`
       `interj.` `phr.` (English codes; `""` if unsure).
     - `meaning_zh` — Traditional Chinese meaning for that part of
       speech (required). Generate it yourself if not supplied.
     - `example_en` — 1 to 5 example sentences **in the word's own
       language** (English for an English word, Swedish for a Swedish
       word) that use the word in that part of speech. Generate 1–2
       natural ones if the user didn't provide any. Required.
     Only list parts of speech that are actually common; don't pad.
   - `forms` — inflected forms worth tracking (irregular forms, forms
     used in the examples, e.g. `["propelled","propelling"]`). Optional.
     Cloze review asks for the exact form in the sentence, so vary the
     forms across examples when it helps.
   - `related` — derived words with a different spelling that deserve
     their own card (e.g. `scrutinize` for `scrutiny`). Optional.
   - `category` — reuse one from step 2 when it fits; otherwise propose a
     short new one. Optional but recommended.
   - `note` — optional; leave empty unless useful context was given.
   - `is_starred` — only true if the user asked to star it.

   `meaning_zh` / `example_en` are derived from `senses` automatically —
   don't pass them alongside `senses`. The duplicate check also covers
   `forms`, so `propelled` is rejected if `propel` already lists it.

4. **Show the drafted card to the user and get confirmation** before
   writing anything — the meaning and examples are AI-generated and the
   word can't easily be de-duplicated later if it's added twice under
   slightly different wording.

5. **Write it**, passing the fields as a single JSON blob (safest for
   quoting/escaping — avoid the flag-per-field form when text contains
   special characters):

   ```bash
   node scripts/add-word.mjs add --json '{"language":"en","word_en":"serendipity","senses":[{"pos":"n.","meaning_zh":"意外發現美好事物的運氣","example_en":["Let curiosity lead the way to serendipity."]}],"forms":[],"related":["serendipitous"],"category":"Personal growth","note":"","is_starred":false}'
   ```

6. **Report the result** from the script's JSON output:
   - `{"ok":true,"id":"...","card":{...}}` → tell the user it was added,
     summarizing the fields actually saved.
   - `{"ok":false,"error":"..."}` → surface the error verbatim. A common
     one is "This word already exists in your library." — in that case
     tell the user instead of retrying with a tweaked spelling to force
     it through.

## Notes

- The word appears in the live app immediately (same Firestore data the
  GitHub Pages site reads) — no redeploy needed.
- This script has no per-user scoping; it writes to the same collections
  the signed-in account uses in the app.
- Don't batch many words without showing each draft first — one bad
  AI-generated example sentence is much harder to fix inside Firestore
  than to catch before writing.
