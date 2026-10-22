# Checks on a real phone

`npm run e2e` covers layout, accessibility, adding, the item page and the assistant in Chromium. It can't reproduce the iPhone keyboard, the system Back gesture, a real install, the share sheet, or reading a screen outdoors. Run through this on one iPhone (Safari) and one Android phone (Chrome) before the trip, on the deployed site. Tick each line on both phones.

| # | Check | How | Pass when | iPhone | Android |
|---|---|---|---|---|---|
| 1 | Join | Open the trip link, enter your name and the passcode | You land on Today; the passcode isn't asked again next time | ☐ | ☐ |
| 2 | Keyboard comes up | Tap **+** | The keyboard opens straight away; the box and its preview stay above it | ☐ | ☐ |
| 3 | Quick add | Type "coffee sat 8" and tap Add | It shows Sat, 8:00 AM in the preview, then on the Plan with an Undo toast | ☐ | ☐ |
| 4 | Back gesture | Open an item from Plan, then swipe back (iPhone: left edge; Android: back gesture) | You're back on the Plan where you were | ☐ | ☐ |
| 5 | Install | iPhone: Share → Add to Home Screen. Android: menu → Install app | It opens full screen, without the browser bar | ☐ | ☐ |
| 6 | Share sheet (Android only) | In TikTok or Instagram, Share → the app | The trip opens with the link in the + box; Save link adds it | — | ☐ |
| 7 | Paste a link (iPhone) | Copy a TikTok or Reel link, tap +, paste | It offers to save it to an item or as an idea | ☐ | — |
| 8 | Airplane mode | Open the app once with signal, turn on airplane mode, reopen it from the home screen | Today, the Plan and any item page open; the line at the bottom says you're offline | ☐ | ☐ |
| 9 | Offline edit | In airplane mode, tick a checklist entry and add a to-do; then turn signal back on | Both show at once with "waiting to sync"; after signal returns they're on another phone too | ☐ | ☐ |
| 10 | Directions and calls | On an item with an address and a phone, tap Directions, then Call | Maps opens to the place; the dialer opens with the number | ☐ | ☐ |
| 11 | Copy confirmation | Tap the confirmation number on Today's ticket | "Confirmation copied"; it pastes correctly into another app | ☐ | ☐ |
| 12 | Sunlight outdoors | In direct sun, Trip → Sunlight mode | Times, titles and "To book" are readable at arm's length | ☐ | ☐ |
| 13 | Assistant with a screenshot | + → ask, attach a booking confirmation screenshot | It's recorded on the right item, with the confirmation number | ☐ | ☐ |
