# Just Word

A static vocabulary review app for English and Swedish, built with native JavaScript ES modules. No application backend, bundler, or build step is required.

Live site: **https://winchiu.github.io/vocabulary-re/**

Repository: https://github.com/WinChiu/vocabulary-re

Production uses Firebase project `vocabulary-f8603`. Its configuration is supplied through the repository's encrypted `FIREBASE_CONFIG_CONTENT` Actions secret; the real local configuration remains gitignored.

## Run locally

Requires Node.js 22 or newer. No npm install is needed for the app or unit tests.

```powershell
npm start
```

Open `http://127.0.0.1:4173/`. If that port is occupied:

```powershell
$env:PORT='4187'
npm start
```

The server binds only to localhost. Open `http://127.0.0.1:4187/?auth_bypass=1` for the demo. The demo never imports the Firebase connection module. Its two language libraries live in memory and reset on refresh. `auth_bypass=true` also works.

## Interface

- Today: due count, state totals, collapsible session settings, and review entry.
- Library: search, filters, 15-item pages, detail, pronunciation, add/edit/delete, stars, CSV import.
- Settings: learning language and account sign-out. The chosen language persists locally.
- Today, Library, and Settings share a fixed bottom navigation bar. Content reserves its height and the device safe area; the viewport enables `viewport-fit=cover`.
- Four review modes: EN → ZH, ZH → EN, spelling, and single-word cloze. Failed answers remain failures even after a successful retry. Results are saved only at session completion; confirmed early exit discards the session.

The latest design intentionally omits the app header and motivational text, with compact serif page headings.

## Firebase setup

1. Copy `js/firebase-config.template.js` to `js/firebase-config.js` and insert your Firebase web app settings. The real file is gitignored.
2. Enable Google sign-in in Firebase Authentication. Add localhost and the deployment hostname to Authorized Domains.
3. Create a Firestore database. This app uses the collections `cards` and `cards_sv`. It assumes one authorized person, **not isolated data for multiple accounts**.
4. Configure Firestore rules in the Firebase Console before using live data. For example, replacing the email below with the single authorized account:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function allowed() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email == 'YOUR_EMAIL@example.com';
    }
    match /cards/{card} { allow read, write: if allowed(); }
    match /cards_sv/{card} { allow read, write: if allowed(); }
  }
}
```

These rules are an explicit single-account example, not a multi-user schema. Firebase web API keys are public configuration; access control is enforced by the rules. Never put service-account credentials in this frontend.

The app uses Firebase SDK 12.7.0 from gstatic, SheetJS 0.20.3 from its CDN, and Phosphor Icons 2.1.1. An internet connection is needed for those resources, Google fonts, dictionary lookups, and remote audio. Local changes in the demo do not persist.

## Deploy

The supplied GitHub Actions workflow targets GitHub Pages on a push to `main` or a manual run. Pages and the repository secret `FIREBASE_CONFIG_CONTENT` are configured for this repository. The secret contains the complete real `firebase-config.js` module. The workflow runs unit tests, stages only app assets, injects the configuration, and deploys. The first successful deployment was verified on 2026-09-21: https://github.com/WinChiu/vocabulary-re/actions/runs/35577968851.

## Test

```powershell
npm test
```

If a sandbox prevents Node's test subprocess from starting:

```powershell
node --test --experimental-test-isolation=none tests/core.test.mjs
```

Browser checks use Playwright CLI, not a runtime dependency. Start the app on port 4187, then run these sequentially against a dedicated browser session:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=justword open 'http://127.0.0.1:4187/?auth_bypass=1' --headed
npx --yes --package @playwright/cli playwright-cli -s=justword run-code --filename=tests/browser-layout.js
npx --yes --package @playwright/cli playwright-cli -s=justword run-code --filename=tests/browser-library.js
npx --yes --package @playwright/cli playwright-cli -s=justword run-code --filename=tests/browser-import.js
npx --yes --package @playwright/cli playwright-cli -s=justword run-code --filename=tests/browser-review.js
npx --yes --package @playwright/cli playwright-cli -s=justword run-code --filename=tests/browser-settings.js
npx --yes --package @playwright/cli playwright-cli -s=justword run-code --filename=tests/browser-failures.js
```

The browser checks intentionally use in-memory data. The failure suite temporarily replaces MockStore methods and browser audio objects, then ends on the access-denied screen. Reload afterward to discard the test state. Screenshots are written to `output/playwright/` (gitignored). See `QA.md` for verified scope and outstanding live checks.

## Implementation notes

- `js/core.js` and `js/review.js`: validation, filtering, fixed-interval SRS, and isolated session state.
- `js/data.js` / `js/firebase.js`: identical Mock and Firebase store interfaces; 450-record batches and time-bounded requests.
- `js/views.js` / `js/app.js`: escaped HTML views and event/state coordination. Browser back/forward routing is not used.
- `js/import.js`: lazy-loaded SheetJS CSV parsing, bilingual field mapping, validation, deduplication and preview.
- `js/services.js`: dictionary timeout/cancellation and desktop/mobile TTS fallback order.

Date scheduling uses the browser's local timezone and local midnight. Early review updates weighted statistics only. Mastery requires both a success streak of at least 3 and an interval of at least 14 days. Cloze supports exact Unicode word tokens, conservative English regular inflections and a small explicit irregular-form list; Swedish uses exact matching. It does not infer general grammar or phrase inflections.

Import retries reuse stable document IDs, preventing duplicate documents after a partial batch failure. A timeout bounds the UI wait; it cannot cancel a Firestore write already sent. Review retries write computed absolute statistics rather than increments. Pending results and imports are in memory, so keep the page open until the operation succeeds. Concurrent editing in multiple tabs is outside this single-user version's conflict handling.

References: [Firebase batch writes](https://firebase.google.com/docs/firestore/manage-data/transactions), [SheetJS standalone scripts](https://docs.sheetjs.com/docs/getting-started/installation/standalone/).
