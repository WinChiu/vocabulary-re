# Verification report

Verified 2026-09-21 against the local app on port 4187. All mutations below used the in-memory demo, never production Firestore.

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

The mobile action row is fixed above the bottom navigation for review, add/edit, CSV confirmation, detail navigation, pagination and results. Main content reserves both rows. The primary review action occupies the same right-hand slot for reveal, self-rating, answer checking and continuing.

`tests/browser-stable-actions.js` verifies bounding-box positions (within 1px) after reveal, very long example text, scrolling, next card, incorrect-answer feedback, adding examples, textarea growth, validation and a shorter library page. It also verifies Enter submission after moving the submit button outside the answer form, and simulates a 300px keyboard inset. Real keyboard handling uses VisualViewport events and temporarily hides the app navigation while typing. Physical iOS keyboard behavior remains unverified.

## Not verified live

- Real Google popup login, browser-local Firebase authentication persistence, actual Firestore permission rules and cloud reads/writes: Firebase configuration was not provided.
- Real GitHub Pages deployment and repository secret configuration: workflow supplied, no public deployment performed.
- Physical iPhone Safari home-indicator behavior and audible device TTS: responsive layout and a 34px inset were simulated in a desktop browser. Audio failure paths and language mapping were verified; actual sound quality is device-dependent.
- Real Google TTS endpoint availability is not guaranteed; it is unofficial. The specified fallback is implemented.

## Deliberate PRD decisions and later UI revisions

- Single-account allowlist with unchanged `cards`/`cards_sv` collections.
- First wrong answer remains a failure after retry. Each card contributes statistics once per session.
- Unusable Cloze cards are excluded with a count; phrases cannot use Cloze.
- Invalid CSV rows are previewed with reasons and excluded, rather than writing incomplete cards.
- Language and sign-out moved to a dedicated Settings page at the user's request; language changes remain on Settings.
- Removed motivational copy and the top app header. Today, Library and Settings use compact serif headings and a shared bottom navigation bar with safe-area spacing.
