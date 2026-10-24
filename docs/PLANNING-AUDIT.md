# New vacation planning audit

Scope: starting another vacation, adding an existing itinerary without a model, and remembering the person and their joined trips. Audited against the active `vacation-calendar` app, not the v1 backup.

The current new-trip experience is conversational: describe a vacation to the Gemini planner, refine a preview, and explicitly save it. The creation form has been removed. Google accounts now provide a personal trip library and cross-device planning-conversation recovery. Existing trips still support deterministic paste import and manual entry without AI.

| Finding | Impact | Change |
| --- | --- | --- |
| No bulk text itinerary import | An existing travel plan had to be re-entered item by item or sent to the assistant | Added Plan → Paste a travel plan, deterministic parsing, editable review, per-item selection, existing-match checks, offline save and batch Undo |
| Manual entry hidden behind text parsing | Users had to learn parser phrasing or use the assistant | Added a manual entry button and editable item titles, times, ends and booking details |
| Clearing a parsed day fell back to its original date | An intended idea was silently scheduled | Clearing the day now omits both start and end |
| No checkout entry in the add preview | A multi-night stay required editing after creation | Added checkout date/time and a one-night default |
| New-trip action buried in Trip settings | Repeat planning was difficult to discover | Added All trips / Plan a new trip to every trip screen; direct `/?new=1` entry |
| Seed trip prevented the creation form opening for new users | An unrelated existing vacation dominated onboarding | New visitors see the creation form even when the original trip is available |
| Destination forced to equal trip name; home currency forced to USD | Descriptive names polluted destination searches; home settings were inaccurate | Separate optional name/destination and explicit destination/home currencies and zones |
| Newly created trips landed on Today with no planning guidance | The app led with missing bookings rather than useful next actions | New trips open Plan, with paste, stay, flight and idea actions |
| Browser cookies were the only membership record | A new device or cleared cookies required rejoining every trip | Optional verified Google accounts with server-side trip memberships and persistent account cookies |
| First name was the only actor identifier | Two people with the same first name were indistinguishable in edit attribution | Account-backed manual changes record a stable account ID alongside the display name |
| Invalid calendar days passed `Date.parse` validation | February 30 could be stored and roll into March | Validate date round trips; regression coverage for leap days and reversed trip dates |
| Creation accepted passcodes longer than joining allowed | A created trip could be impossible to join | Both creation and joining enforce the 100-character maximum |
| Dependency advisories in the framework and transitive packages | Known security defects remained in production and development dependencies | Updated Next.js/ESLint config to 16.4.3, React to 19.3.1, Zod to 4.6.7 and Vitest to 5.0.5, plus affected transitive packages. An override keeps Serwist's pinned Zod dependency on the same patched version; production build verifies compatibility. Full npm audit reports zero vulnerabilities |
| Repeated lines in one pasted itinerary were both selected | Accidental duplicate plans could be imported in one action | Repeated matches start unchecked with a visible explanation |
| Import did not expose flight time zones | Flights crossing the date line could look as though they arrived before departure | Added independent departure/arrival zones, metadata parsing and validation against actual instants |
| Pasted notes/confirmations could exceed storage limits | Save failed after review rather than identifying the field to correct | Validate metadata lengths during review |
| Quick-add kind could freeze while typing | A hotel typed gradually could remain an activity | Follow the parsed kind until the user chooses an override |
| Guest session timestamps were not checked by the server | Replayed cookies could outlive their intended lifetime | Validate issue time and expiry, and reject appended cookie data |
| Font loader warned despite fallback adjustment being disabled | Noisy builds and a Google download dependency during builds | Bundle the same licensed Atkinson font locally with its SIL license |
| New-trip setup felt like administrative data entry | Travelers had to answer a long form before exploring a trip | Replaced the form with a Gemini conversation, suggested replies, live draft preview, explicit save, generated invitation passcode and editable itinerary items |
| Signing in had little visible benefit | Account information occupied space without supporting planning | Added a personal workspace and trip library, a compact account menu, automatic attribution and account-scoped planning recovery across devices |
| Home disappeared when only one trip existed | Signed-in people could not easily return to their workspace | Keep the personal home available regardless of trip count |
| Model JSON schemas can exceed Google's complexity limit | New-trip model requests failed with generic invalid-argument errors | Use a simpler provider schema, normalize absent optional values and apply the full domain schema before storage; verified against the real model |

## Limits and follow-up work

- The importer is deliberately explicit: ISO dates or numbered day headings, one item per line, optional typed prefixes and pipe-separated details. It does not interpret arbitrary prose or tables. Unrecognized lines are preserved for review rather than discarded. Flight time zones can be supplied in pasted metadata or edited during review.
- Existing-item checks compare normalized title, kind, day and start time. They do not fuzzy-match hotels or merge changed bookings. Re-importing a modified itinerary requires review.
- The planning conversation supports exploring destinations and flexible dates before saving. Exact dates are required when converting the draft into a trip. Expense splitting and route optimization remain separate product work.
- Google credentials and the exact callback URL must be supplied before the sign-in button appears. Automated OAuth tests cover state, nonce, expiry, guest migration, membership restoration, account separation and sign-out; live consent must be checked with the deployment's credentials.
- Group people and assignees still use editable first names. The account ID establishes stable access and manual-edit attribution; it does not migrate the entire people/assignment model or provide owner/admin roles or account deletion.

## Verification

Unit/API coverage includes date validity, separate destination/home settings, full pasted-plan conversion and Undo, date/time errors, duplicate matches, OAuth handshake validation, guest linking, trip recovery without trip cookies, account isolation and logout. Browser coverage exercises creation, manual multi-night booking, unscheduling an idea, and offline text import/sync with no AI requests, plus the existing app regression suite.

Results: 86 unit/API tests and all 21 browser tests pass, including conversational creation, failed-message retry, mobile/desktop accessibility and account-scoped cross-device recovery. ESLint, TypeScript, the production build and the dependency audit pass. `npm run planner:eval` also exercises the real Gemini provider without creating or changing a trip. Google interactive consent remains a user action.
