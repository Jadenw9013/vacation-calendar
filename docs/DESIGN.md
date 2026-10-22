# Design

The app is read on a phone in a shuttle, on a boat, in bright sun and with patchy signal, by a few friends who want answers, not a planning tool. So: legible first, one loud thing per screen, everything else quiet.

## Type

**Atkinson Hyperlegible Next**, one family for everything. It was designed for legibility at small sizes and for low vision, with distinct letterforms (Il1, 0O). That's the job here: reading a time or a confirmation number at a glance on a moving bus. Times use tabular figures so they line up. Sizes are in rem, so the **Large text** setting and browser zoom scale everything.

## Color

Each token is written once as `light-dark(light, dark)`. The phone's theme decides unless Trip, Display forces one. Every text color passes WCAG AA (4.5:1) on its own tint, on the surface and on the page, in both themes; the weakest pair is 5.3:1.

| Token | Light | Dark | Job |
|---|---|---|---|
| canvas | `#f1f3f2` | `#0f1214` | Page background, a cool stone (not cream). |
| surface | `#ffffff` | `#171b1f` | Raised rows, sheets. |
| ink / muted | `#15191d` / `#535d64` | `#ecf0f2` / `#a3aeb5` | Text and secondary text. |
| accent | `#0b6476` | `#5cc6d8` | Lagoon teal: links, primary actions, the active tab. |
| ticket | `#ffc21a` | `#ffc21a` | The "Next" ticket on Today. |
| ok | `#11693c` | `#6fd69a` | Booked. |
| todo | `#8a4b00` | `#ffb95c` | To book, and nights with nowhere to stay. |
| maybe | `#5b3ea8` | `#c2b0ff` | Maybe. |
| danger | `#b3261e` | `#ff8a80` | Delete. |

**Kinds of things**, each with its icon on a tint of its color:

| Kind | Light | Dark |
|---|---|---|
| Place to stay | indigo `#4338ca` | `#aca7ff` |
| Flight | sky `#0a5f96` | `#7cc4f2` |
| Getting around | teal `#0b6476` | `#5cc6d8` |
| Activity | green `#2e6e1f` | `#8fd47a` |
| Food and drink | coral `#a33a12` | `#ff9e78` |
| Other | slate `#535d64` | `#a3aeb5` |

People get an initial on a color picked from their name, the same on every phone.

Color never carries meaning alone:
- every kind has its icon
- every status pill has a mark and a word: ✓ Booked, ○ To book, ? Maybe
- a missing night's amber dot comes with the words "nowhere to stay" for screen readers

**Sunlight** turns everything black on white with heavier type and outlined chips, and hides photos behind text.

## The bold elements

Today's **Next** card is a ticket stub: marigold, a big tabular time, the title, a perforated edge, and under it the actions you need right then (Directions, Call, WhatsApp, the confirmation to copy). The other is **saved posts**: tall picture tiles in a three-column grid, like a profile, opening into a full-screen black viewer that plays the post. Everything else is plain lists with hairline dividers and small colored chips: no stacks of identical cards, no eyebrow labels, no decoration.

## Layout

- A single column up to 42rem, left-aligned. Phones get a bottom bar (Today, Plan, **+**, To-do, Trip) in thumb reach; tablets and laptops get the same tabs along the top.
- Touch targets are at least 44px.
- Sheets rise from the bottom on phones and sit centered on wider screens. Only one is open at a time, and its main field is focused when it opens so the keyboard comes up.
- Status is never shown by color alone: "Booked" has a check and the word, "To book" a ring and the words, "Maybe" a label.

## Words

Sentence case, plain verbs, and names from the traveler's point of view: "To book", not "needs-booking"; "Ideas", not "unscheduled items". A button says what happens ("Mark as booked"), and the toast that follows says the same thing ("Marked Zip lining booked", with Undo). A status is never worded like a button and a button is never worded like a status: on the To-do list each row shows its status pill (To book) and, separately, the action (Mark as booked). Errors say what happened and what to do, and never apologize.
