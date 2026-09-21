# Verification report

Verified 2026-09-21 against the local app on port 4187 and subsequently the deployed GitHub Pages site. All automated content mutations used the in-memory demo, never production Firestore.

## Production deployment verification

- Repository created: https://github.com/WinChiu/vocabulary-re (public).
- Site: https://winchiu.github.io/vocabulary-re/ (HTTP 200, HTTPS).
- Successful Actions run: https://github.com/WinChiu/vocabulary-re/actions/runs/35577968851. Application commit: `768bced5782b7181b742eef976ba8ee72a090b46`.
- All 31 logic tests passed in GitHub's Linux runner. The initial run reached `configure-pages` before Pages was enabled; the subsequent run succeeded after configuration.
- Production Firebase module initializes Authentication and Firestore for `vocabulary-f8603`; its real configuration is injected from the repository secret and is absent from Git history.
- The Firebase authorized-domain configuration includes `winchiu.github.io`.
- An unauthenticated Firestore read returned `permission-denied`, as expected. No production records were written.
- Clicking the live Google sign-in button opened `accounts.google.com` with account selection. Completing Google authentication requires the account owner; authenticated database reads/writes are not yet verified by the agent.
- On the live site's isolated demo, actual CSV parsing returned 1 ready / 2 duplicates / 1 invalid, import succeeded, a complete review saved its mock result, and the sample CSV returned HTTP 200. No page-level JavaScript errors occurred in these smoke checks.

## Automated logic: 31 tests passed

`tests/core.test.mjs` covers:

- Exact auth-bypass flags; demo user identity.
- Today counts versus session eligibility; status, category, starred, type and search filters; stable sorting and shuffling.
- Required fields, 1–5 nonempty examples, duplicate prevention, self-edit exemption, and HTML/attribute escaping.
- SRS ladder and cap, mastery threshold, first mastery timestamp, demotions, local midnight/year rollover, early review, weighted modes, and consecutive accuracy.
- Retry failures counted once; stable example choice; session isolation from original cards.
- Cloze exact, regular and irregular English tokens, phrase exclusion, missing examples, and Swedish exact matching.
- CSV heading precedence, unknown-field preview, invalid rows, existing/batch duplicates, and multiple examples.
- Mock CRUD, language/instance isolation, 901-row import partitioning (450/450/1), retry idempotency, rejected writes and bounded timeouts.
- Dictionary failure handling and result limits; TTS language and URL encoding.

## Browser flows passed

| Area | Verified behavior |
| --- | --- |
| Library | 15-item first page, second page, case-insensitive search, pagination reset, detail open and filtered wraparound, star toggle |
| Editing | Required validation, add, edit, five-example maximum, one-example minimum, save returns to Today |
| Deletion | Cancel preserves the word; confirmation removes it |
| CSV | Real SheetJS parsing of quoted commas/newlines and Chinese headers, multiple examples, preview counts, unknown fields, cancel without write, confirmed import |
| Review | Flip EN/ZH, spelling wrong-then-correct stays failed, cloze blank/reveal, Enter advances, summary and save, no matches, phrase restriction, missing-cloze exclusion |
| Session navigation | Settings prompts to exit an active review; cancel keeps session; partial-session exit returns to Today |
| Settings | Dedicated language and sign-out controls, account email, isolated Swedish library, language persistence after refresh, no Swedish dictionary, logout clears bypass query |
| Failure simulations | Star rollback, form retention, result retention and retry, blocked navigation with unsaved results, dictionary failure, both audio engines failing, permission-denied logout with email |
| Layout | 1440px desktop, 390px mobile, 320px narrow layout; compact headings; no top brand bar; fixed three-tab bottom navigation |
| Safe area | `viewport-fit=cover`, minimum 16px bottom padding, simulated 34px iPhone inset, controls above the inset and matching content clearance |

Browser scripts are sequential and stateful: Library → Import → Review. Settings resets the demo before Failure checks. Screenshots in `output/playwright/` show Today, Library, Settings and login, including the simulated iPhone inset. A test assertion initially checked the DOM before an asynchronous confirmation finished; the final review script explicitly waits for Today and passes.

## Mobile action-position follow-up

The mobile action row is fixed above the bottom navigation for review, add/edit, CSV confirmation, detail navigation and results. Main content reserves both rows. The primary review action occupies the same right-hand slot for reveal, self-rating, answer checking and continuing.

`tests/browser-stable-actions.js` verifies bounding-box positions (within 1px) after reveal, very long example text, scrolling, next card, incorrect-answer feedback, adding examples, textarea growth and validation. It also verifies Enter submission after moving the submit button outside the answer form, and simulates a 300px keyboard inset. Real keyboard handling uses VisualViewport events and temporarily hides the app navigation while typing. Physical iOS keyboard behavior remains unverified.

## Not verified live

- Completing Google sign-in, browser-local Firebase authentication persistence and authenticated cloud reads/writes still require the account owner. Firebase initialization, the Google popup handoff, unauthenticated denial, the Actions secret and the Pages deployment have been verified live.
- Physical iPhone Safari home-indicator behavior and audible device TTS: responsive layout and a 34px inset were simulated in a desktop browser. Audio failure paths and language mapping were verified; actual sound quality is device-dependent.
- Real Google TTS endpoint availability is not guaranteed; it is unofficial. The specified fallback is implemented.

## Deliberate PRD decisions and later UI revisions

- Single-account allowlist with unchanged `cards`/`cards_sv` collections.
- First wrong answer remains a failure after retry. Each card contributes statistics once per session.
- Unusable Cloze cards are excluded with a count; phrases cannot use Cloze.
- Invalid CSV rows are previewed with reasons and excluded, rather than writing incomplete cards.
- Language and sign-out moved to a dedicated Settings page at the user's request; language changes remain on Settings.
- Removed motivational copy and the top app header. Today, Library and Settings use compact serif headings and a shared bottom navigation bar with safe-area spacing.

## Mobile Google sign-in repair (2026-09-21)

- Replaced Firebase popup-helper sign-in with Google Identity Services plus Firebase credential exchange; existing Firebase session persistence and Firestore permissions remain unchanged.
- 38 unit tests pass, including seven direct-login tests for synchronous popup opening, credential exchange, cancellation/blocked popup retry, missing credentials, exchange failures, duplicate clicks, timeout and stale callbacks.
- Verified the production OAuth origin in a clean browser: Google account sign-in opens without origin_mismatch. A 390px touch-enabled browser using the proposed app modules also opens Google's login screen, displays cancellation feedback and re-enables the button, with no page errors.
- Completing sign-in with the owner's account and retrying on physical phones remain unverified. Browser emulation does not prove device storage behavior or authenticated Firestore access.
