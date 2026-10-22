# Design

The app is read on a phone in a shuttle, on a boat, in bright sun and with patchy signal, by a few friends who want answers, not a planning tool. So: legible first, one loud thing per screen, everything else quiet.

## Type

**Atkinson Hyperlegible Next**, one family for everything. It was designed for legibility at small sizes and for low vision, with distinct letterforms (Il1, 0O). That's the job here: reading a time or a confirmation number at a glance on a moving bus. Times use tabular figures so they line up. Sizes are in rem, so the **Large text** setting and browser zoom scale everything.

## Color

| Token | Light | Dark | Job |
|---|---|---|---|
| canvas | `#f1f3f2` | `#0f1214` | Page background, a cool stone (not cream). |
| surface | `#ffffff` | `#171b1f` | Raised rows, sheets. |
| ink / muted | `#15191d` / `#535d64` | `#ecf0f2` / `#a3aeb5` | Text and secondary text. |
| accent | `#0b6476` | `#5cc6d8` | Lagoon teal: links, primary actions, booked. |
| ticket | `#ffc21a` | `#ffc21a` | The "Next" ticket on Today. The one loud thing. |
| todo | `#8a4b00` | `#ffb95c` | "To book" marks and missing nights. Quiet, never a banner. |
| danger | `#b3261e` | `#ff8a80` | Delete. |

Light follows the phone by default; Trip → Display can force light or dark. **Sunlight** overrides both with black on white, heavier type and thicker rules, and hides photos behind text. Components use only these tokens.

## The one bold element

Today's **Next** card is a ticket stub: marigold, a big tabular time, the title, a perforated edge, and under it the actions you need right then (Directions, Call, WhatsApp, the confirmation to copy). Everything else on every screen is plain lists with hairline dividers. There are no stacks of identical cards, no eyebrow labels, and no decoration.

## Layout

- A single column up to 42rem, left-aligned. Phones get a bottom bar (Today, Plan, **+**, To-do, Trip) in thumb reach; tablets and laptops get the same tabs along the top.
- Touch targets are at least 44px.
- Sheets rise from the bottom on phones and sit centered on wider screens. Only one is open at a time, and its main field is focused when it opens so the keyboard comes up.
- Status is never shown by color alone: "Booked" has a check and the word, "To book" a ring and the words, "Maybe" a label.

## Words

Sentence case, plain verbs, and names from the traveler's point of view: "To book", not "needs-booking"; "Ideas", not "unscheduled items". A button says what happens ("Mark booked"), and the toast that follows says the same thing ("Marked Zip lining booked", with Undo). Errors say what happened and what to do, and never apologize.
