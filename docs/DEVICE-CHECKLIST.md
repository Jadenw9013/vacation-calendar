# Checks on a real phone

Playwright covers layout, contrast, targets, dialogs and offline in Chromium
(`npm run e2e`), but it can't reproduce the iPhone keyboard, the system Back
gesture, a real install, or reading a screen outdoors. Run through this on one
iPhone (Safari) and one Android phone (Chrome) before the trip, on the
deployed site. Tick each line on both phones.

| # | Check | How | Pass when | iPhone | Android |
|---|---|---|---|---|---|
| 1 | Keyboard over the input | Open Ask, tap the message box, type two lines | The box and the send button stay above the keyboard; nothing jumps behind it; the page doesn't zoom in | ☐ | ☐ |
| 2 | Keyboard with a proposal | Ask "draft a plan for Wednesday", then tap the message box | Apply / Discard on the card stay reachable while the keyboard is up | ☐ | ☐ |
| 3 | Quick add with the keyboard | Tap Quick add, type "zipline thu 11am" | The preview card is visible while typing; Add can be tapped without closing the keyboard | ☐ | ☐ |
| 4 | Back gesture / Back button | Open Ask, then swipe back (iPhone: from the left edge; Android: back gesture or button) | The planner closes and you're still on the trip; a second Back leaves as normal | ☐ | ☐ |
| 5 | Sheets don't stack | From an item's "…" menu choose Ask; from Plan mode's Add choose "Full form…" | Only one sheet is ever open; Close is always visible | ☐ | ☐ |
| 6 | Add to Home Screen | iPhone: Share → Add to Home Screen. Android: menu → Install app | The icon is the volcano; it opens full screen without the browser bar; the iPhone hint in Settings disappears once installed | ☐ | ☐ |
| 7 | Airplane mode reload | Open the site once with signal, then turn on airplane mode and reopen it from the home screen | Today's plan appears with "Offline, showing saved copy from …"; Ask and edits say they need a connection; Quick add still previews | ☐ | ☐ |
| 8 | Weak signal | On a slow connection (one bar, or a throttled hotspot), reload | The saved copy shows within about 4 seconds instead of a blank page | ☐ | ☐ |
| 9 | Sunlight mode outdoors | In direct sun, at the phone's normal brightness, tap Sunlight on the photo | Times, titles and "Not booked" are readable at arm's length without shading the screen | ☐ | ☐ |
| 10 | Sunlight mode at night | Phone in dark mode, Sunlight on | White on black, no glare from photos; turning it off restores the photos | ☐ | ☐ |
| 11 | Large text | Settings → Text size → Large; also try the phone's own larger text setting | Nothing is cut off or overlapping on Today, Trip and Ask; no sideways scrolling | ☐ | ☐ |
| 12 | Dictation | In the message box and Quick add, use the keyboard's microphone | Dictated text lands in the box and can be sent or added | ☐ | ☐ |
| 13 | Two people at once | One person changes a time while the other has the site open, then the second locks and unlocks their phone | The second phone shows the change, an Updates count on the Trip tab, and "Updated" on that item | ☐ | ☐ |
| 14 | Undo | Apply a change, then tap Undo in the bar within 10 seconds; apply another and undo it later from Updates | Both changes come back off | ☐ | ☐ |

Anything that fails: note the phone model, OS version and what you saw, and
take a screenshot.
