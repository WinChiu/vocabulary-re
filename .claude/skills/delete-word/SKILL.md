---
name: delete-word
description: Permanently delete an existing English or Swedish vocabulary word (and its review history) from the Just Word app's Firestore library. Use when the user asks to remove, delete, or get rid of a word or phrase in this repo — not for editing one (use update-word for that).
---

# Delete Word

Permanently removes one vocabulary card from Firestore, using
[scripts/add-word.mjs](../../../scripts/add-word.mjs)'s `delete` command.
Shares the same service account setup as the `add-word` skill — see that
skill's prerequisite section if `delete` fails with a "Could not read
service account key" error.

This is destructive: deleting a card also deletes its `review_stats`
(mastery level, streaks, next review date). There is no undo other than
restoring from a `backup-library` export (see that skill) or re-adding the
word from scratch with fresh review history.

## Steps

1. **Determine the language** (`en` or `sv`) — ask if unclear.

2. **Find the card first** so you can show the user exactly what would be
   removed, and so ambiguous words get disambiguated before anything is
   deleted:

   ```bash
   node scripts/add-word.mjs find --lang en --word tacit
   ```

   - Zero matches → tell the user, stop.
   - Multiple matches → ask the user which one they mean.
   - One match → proceed to confirmation.

3. **Confirm with the user before deleting.** Show the word, its meaning,
   and (if non-trivial) its review progress (`review_stats.state`,
   `total_attempts`) so they know if they're throwing away learning
   history, not just a typo'd entry. This is an irreversible action —
   always get an explicit yes, never infer permission from "clean up my
   library" style requests without naming which words.

4. **Delete it**:

   ```bash
   node scripts/add-word.mjs delete --lang en --word tacit
   ```

   Use `--id <id>` instead of `--word` when you already have it from step
   2 and want to avoid any re-lookup ambiguity (recommended once you've
   already disambiguated in step 2).

5. **Report the result**:
   - `{"ok":true,"id":"...","deleted":{"word_en":"...","meaning_zh":"...","category":"..."}}`
     → confirm what was removed.
   - `{"ok":false,"error":"..."}` → surface the error verbatim.

## Notes

- Consider suggesting a `backup-library` export first if the user is about
  to delete several words at once, or if this is the first destructive
  operation you're doing on their library this session.
- For fixing a mistake (wrong spelling, wrong meaning) use `update-word`
  instead — delete+re-add resets `review_stats` and loses review history,
  which `update` avoids.
- This skill only deletes one card per invocation by design — there is no
  bulk-delete command. If the user wants to remove many words at once,
  confirm the full list with them explicitly, then call `delete` once per
  word.
