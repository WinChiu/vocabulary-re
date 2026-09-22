---
name: bulk-add-words
description: Add several new English or Swedish vocabulary words to the Just Word app's Firestore library in one batch (e.g. "add these 15 words", importing a word list). Use when the user gives you multiple new words/phrases at once — not for a single word (use add-word) or editing existing ones (use update-word).
---

# Bulk Add Words

Adds several new vocabulary cards to Firestore in one batch, using
[scripts/add-word.mjs](../../../scripts/add-word.mjs)'s `bulk-add`
command. Shares the same service account setup as the `add-word` skill —
see that skill's prerequisite section if `bulk-add` fails with a "Could
not read service account key" error.

Use this instead of calling the `add-word` skill in a loop once you have
more than a handful of words to add — one batched Firestore write instead
of N round-trips, and one review step instead of N.

## Steps

1. **Determine the language** (`en` or `sv`) for the whole batch — ask if
   unclear. All words in one `bulk-add` call must be the same language; if
   the user gave a mixed list, split it into two calls.

2. **Look up existing categories** so new cards reuse existing category
   names instead of creating near-duplicates:

   ```bash
   node scripts/add-word.mjs categories --lang en
   ```

3. **Draft every card.** For each word, fill in the same fields as
   `add-word`:
   - `word_en` — required.
   - `meaning_zh` — required; generate it yourself if not supplied.
   - `category` — optional but recommended; reuse an existing one from
     step 2 when it fits.
   - `note` — optional.
   - `example_en` — 1–5 example sentences in the word's own language;
     generate 1–2 if the user didn't supply any. Required.
   - `is_starred` — only true if asked.

4. **Show the whole drafted batch to the user and get confirmation**
   before writing — same reasoning as `add-word`, just for N words at
   once. A table or numbered list (word → meaning) is usually enough; you
   don't need to show every example sentence unless the user wants to
   review them.

5. **Write it** as a JSON array:

   ```bash
   node scripts/add-word.mjs bulk-add --lang en --json '[
     {"word_en":"tacit","meaning_zh":"心照不宣的、默許的","category":"人格互動","example_en":["There was a tacit agreement not to discuss the topic."]},
     {"word_en":"braising","meaning_zh":"燉（肉）","category":"飲食烹飪","example_en":["The beef was slow-cooked by braising it in red wine."]}
   ]'
   ```

6. **Report the result**:
   - `{"ok":true,"addedCount":N,"added":[...],"skipped":[...]}` → confirm
     how many were added; if `skipped` is non-empty, tell the user which
     words were skipped and why (each entry is validated the same way as
     `add-word` — missing word/meaning, 0 or >5 examples, or already
     exists in the library).
   - `{"ok":false,"error":"..."}` → surface the error verbatim (this means
     the whole call failed before any writes, e.g. malformed `--json`).

## Notes

- Reads go through the local cache (`backups/cache-<lang>.json`) with an
  incremental sync, not a full collection read — see the add-word skill's
  "Firestore reads & the local cache" section for `--offline` /
  `--refresh` and the `sync` field in every result.
- `bulk-add` syncs the cache once before validating, so the duplicate
  check costs a few reads regardless of batch size or library size.
- Validation happens per-word: one bad entry (e.g. missing meaning) is
  skipped and reported, it does **not** block the rest of the batch from
  being added.
- Duplicate detection checks both against the existing library and
  against other words earlier in the same batch — you can't accidentally
  add the same word twice in one call.
- `review_stats` is initialized fresh for every added card, same as
  `add-word` — there's no history to preserve for a brand-new word.
- For a handful of words (say, 1–3), plain `add-word` is simpler; reach
  for `bulk-add` once the list is long enough that one shared
  confirmation step is clearly better than several.
