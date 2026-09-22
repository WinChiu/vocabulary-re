---
name: update-word
description: Update fields of an existing English or Swedish vocabulary word (meaning, category, note, examples, star) in the Just Word app's Firestore library. Use when the user asks to edit, correct, update, or add an example to an existing word or phrase in this repo — not for creating a brand-new word (use add-word for that).
---

# Update Word

Edits one existing vocabulary card in place in Firestore, using
[scripts/add-word.mjs](../../../scripts/add-word.mjs)'s `find` and `update`
commands. Shares the same service account setup as the `add-word` skill —
see that skill's prerequisite section if `find`/`update` fail with a
"Could not read service account key" error.

For editing **many** cards at once (e.g. re-categorizing the whole
library), see [Bulk edits](#bulk-edits) below instead of looping `find`/
`update` per word or writing a one-off script — that path used to require
ad hoc scripts because the CLI had no bulk primitive; it now does.

## Steps

1. **Determine the language** (`en` or `sv`) the word belongs to — ask if
   unclear, since the same spelling could theoretically exist in both
   collections.

2. **Find the current card**:

   ```bash
   node scripts/add-word.mjs find --lang en --word tacit
   ```

   Returns `{"ok":true,"matches":[{...}],"sync":{...}}` — a cheap
   incremental sync, or zero Firestore calls with `--offline` if the cache
   is already fresh this session. `update` re-syncs before writing either
   way. If `matches` is empty, tell the
   user the word wasn't found — don't fall back to creating it (that's the
   `add-word` skill's job, and doing it here would be a surprise action the
   user didn't ask for). If more than one match comes back, ask the user
   which one they mean before proceeding. Note the `id` field of the
   correct match — it's needed if you fall back to word-lookup ambiguity,
   though `update` can also resolve by `--word` directly when there's
   exactly one match.

3. **Draft the change.** Only touch the fields the user actually asked to
   change; leave everything else as-is (the `update` command merges your
   patch onto the existing card, so omitted fields are preserved
   automatically — never resend the full card, only the delta). Common
   edits:
   - Fixing or refining `meaning_zh`
   - Adding/editing/removing entries in `example_en` (still 1–5 sentences,
     in the word's own language)
   - Changing `category` or `note`
   - Toggling `is_starred`

   Generate new content (a better example sentence, a refined meaning)
   yourself when the user asks for it in general terms rather than
   dictating exact text.

4. **Show old vs. new side by side and get confirmation** before writing —
   same reasoning as `add-word`: AI-drafted text should be reviewed before
   it overwrites something already in the user's library.

5. **Write it**, passing only the changed fields as JSON:

   ```bash
   node scripts/add-word.mjs update --lang en --word tacit --json '{"example_en":["There was a tacit agreement not to discuss the topic.","Her silence was a tacit admission of guilt."]}'
   ```

   Use `--id <id>` instead of `--word` when you already have it from step 2
   and want to avoid any re-lookup ambiguity.

6. **Report the result**:
   - `{"ok":true,"id":"...","card":{...}}` → confirm what changed, quoting
     the new field values.
   - `{"ok":false,"error":"..."}` → surface the error verbatim (e.g. a
     validation failure like "Add between 1 and 5 non-empty examples.").

## Notes

- Reads go through the local cache (`backups/cache-<lang>.json`) with an
  incremental sync, not a full collection read — see the add-word skill's
  "Firestore reads & the local cache" section for `--offline` /
  `--refresh` and the `sync` field in every result.
- `review_stats`, `created_at`, and the document `id` are never touched by
  `update` — only the edited fields plus `updated_at` change. Review
  progress (mastery level, next review date) survives edits.
- Renaming the word itself (`word_en`) is possible via `--json` but is
  rarely what "update" means in practice — confirm explicitly with the
  user before changing the headword rather than its meaning/examples/etc.
- Don't use this skill to fix a typo by deleting and re-adding the word —
  that would reset `review_stats` and lose review history. Always update
  in place.

## Bulk edits

When the user asks to change one field (almost always `category`) across
many or all cards in a language at once — e.g. "re-categorize my whole
library" — don't call `update` in a loop (slow, one round-trip per word)
and don't write a throwaway Firestore script (that bypasses validation and
is easy to get subtly wrong). Use the two purpose-built commands instead:

1. **Fetch every card** to see what you're working with:

   ```bash
   node scripts/add-word.mjs list --lang en
   ```

   Returns `{"ok":true,"count":N,"cards":[{"id","word_en","category","meaning_zh"},...]}`,
   sorted alphabetically. Use this instead of `find` when you need the
   whole library rather than one word. It is served from the local cache
   (incremental sync), so listing a large library does not cost one read
   per card; add `--offline` for zero reads.

2. **Decide the new value for every word** and present the classification
   scheme to the user for approval first (same reasoning as single-word
   edits: don't silently rewrite the user's library). Build a JSON object
   mapping each `word_en` to its new category.

3. **Write it back in one batch**:

   ```bash
   node scripts/add-word.mjs bulk-category --lang en --json '{"tacit":"人格互動","braising":"飲食烹飪", ...}'
   ```

   - The map must cover every card in the collection, or the command
     refuses and lists the words you missed — pass `--allow-partial` only
     if the user explicitly wants a partial pass (cards not in the map
     keep their existing category).
   - Only `category` (plus `updated_at`) changes; every other field,
     including `review_stats`, is left alone — same guarantee as `update`.
   - Returns `{"ok":true,"updated":N,"notFound":[...],"counts":{...}}`.
     `notFound` lists map keys that didn't match any card (typo guard);
     `counts` is the post-write tally per category, computed from the
     local cache mirror of the write (no full re-read) — check it against
     what you expected before reporting success.
   - This command only ever touches the `category` field. It's not a
     general bulk-patch tool — if the user needs to bulk-edit some other
     field, extend `runBulkCategory` (or add a sibling command) rather
     than reaching for an ad hoc script.
