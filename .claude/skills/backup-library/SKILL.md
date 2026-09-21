---
name: backup-library
description: Export a full snapshot of the Just Word app's English and/or Swedish vocabulary library from Firestore to a local JSON file. Use before any risky or large-scale change (bulk recategorization, bulk delete, schema changes) as a safety net, or whenever the user explicitly asks to back up, export, or dump their word library.
---

# Backup Library

Dumps the raw contents of the `cards` (English) and/or `cards_sv`
(Swedish) Firestore collections to a local JSON file, using
[scripts/add-word.mjs](../../../scripts/add-word.mjs)'s `backup` command.
Shares the same service account setup as the `add-word` skill — see that
skill's prerequisite section if `backup` fails with a "Could not read
service account key" error.

## When to use this proactively

Run a backup, without being asked, before:
- Any `bulk-category` or `bulk-add` call that touches many cards at once.
- Any `delete-word` call where several words are being removed in the
  same session.
- Anything else that rewrites a large fraction of the library in one go.

Mention that you're doing it ("I'll back up the library first") rather
than doing it silently — it's a safety action, not something that needs
approval, but the user should know a recovery point exists.

## Steps

1. **Run the backup**:

   ```bash
   node scripts/add-word.mjs backup --lang en
   ```

   - `--lang` accepts `en`, `sv`, or `all` (default `all` if omitted —
     backs up both collections in one file).
   - `--out <path>` overrides the default output path. Without it, the
     file is written to `backups/backup-<lang>-<timestamp>.json` in the
     repo root (gitignored — never commit these, they're local-only and
     can contain the user's full library).

2. **Report the result**:
   - `{"ok":true,"path":"...","counts":{"en":850}}` → tell the user where
     the backup landed and how many cards it captured.
   - `{"ok":false,"error":"..."}` → surface the error verbatim.

## Notes

- The backup is a **raw dump**, not a validated export — it includes every
  field as stored (`review_stats`, `created_at`/`updated_at` as Firestore
  timestamp objects, etc.), so it's suitable for manual inspection or a
  future restore script, not for re-importing via `bulk-add` as-is (that
  command re-validates and would reset `review_stats`).
- There is currently no `restore` command — a backup file is a recovery
  reference for you or the user to act on manually (e.g. writing a
  one-off restore script from it, or manually re-entering a few cards via
  `update-word`/`add-word`) if something goes wrong. If restoring from
  backup becomes a recurring need, that's a sign a proper `restore`
  command should be added to `scripts/add-word.mjs`, the same way
  `bulk-category` was added instead of continuing to write throwaway
  scripts.
- Backups can grow large for bigger libraries; there's no automatic
  cleanup of old backup files in `backups/` — mention this to the user if
  it becomes a concern, but don't delete old backups yourself without
  asking.
