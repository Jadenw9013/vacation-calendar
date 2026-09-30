# Design plan

The week goes from a midnight arrival to a 3,976 m volcano. The palette comes from that ground: volcanic ash, basalt, Lake Atitlán, and a warning-tape yellow for the one thing that must be loud, which is the nights nobody has booked.

## Palette

| Name    | Light     | Dark      | Role |
| ------- | --------- | --------- | ---- |
| Ash     | `#F2F3F1` | `#111417` | Page background. A cool grey-white, not cream. |
| Basalt  | `#15181B` | `#ECEFEF` | Body text, hazard stripes. |
| Pumice  | `#5E676E` | `#9AA4AA` | Secondary text: locations, notes. |
| Scree   | `#D5D9DB` | `#2A3035` | Rules and borders. |
| Lake    | `#0E5A6B` | `#4DB3C6` | Booked. Solid fills and the booked mark. |
| Hazard  | `#FFD400` | `#FFD400` | Unbooked nights and gaps. Always paired with basalt stripes and the words "No bed". |
| Ember   | `#C8321E` | `#FF6A4D` | Used once: the summit elevation on the hike. |

Lake is the calm "handled" color. Hazard yellow with diagonal basalt stripes reads as caution tape from across a shuttle aisle, and it survives bright sun. Everything else stays neutral so those two never compete.

## Status without color

Status is never shown by color alone. Each status has its own mark and a word:

- **Booked**: a filled square ■ and the word "Booked", on a solid card.
- **Needs booking**: a hollow square □ and "Needs booking", on a dashed card.
- **Undecided**: a dashed circle ◌ and "Undecided", on a dashed card.
- **Gaps**: the striped hazard pattern and the words "No bed" or "No transport".

## Type

- **Archivo** (variable, with a width axis). Day headers and the page title use it at 125% width and weight 800, which gives the look of map lettering or trail signage without a novelty face. Body text uses it at normal width. It's legible at small sizes on a phone.
- **IBM Plex Mono**. Times, flight numbers, durations and dates in gap windows. It gives a departure-board precision and tabular digits, so times line up in a column.

There are no all-caps eyebrow labels. Section headers are sentence case in expanded Archivo.

## Layout

The page is a single column, at most 40rem wide, and designed for a phone first.

1. **Header.** "Guatemala" plus the dates, with one line of status: days to departure and the number of nights with no bed. The countdown earns its place only because it is paired with that unbooked count, which shows how urgent the open bookings are.
2. **Night strip.** Seven cells, Tue 24 to Mon 30, one per night. A booked night is a solid lake fill. An unbooked night is striped hazard with "No bed". This answers "where am I sleeping" in one glance. Each cell links to that day.
3. **Gaps.** Derived, and the first list on the page. Each row shows what is missing, the window in mono, and the duration.
4. **Timeline.** One section per day, with a sticky day header in expanded Archivo. Events sit in a time rail (mono) and a content column showing the title, location, status mark, owner, notes and to-dos. Every day ends with a "Tonight" slot: either the booked place or a hazard block.
5. **Still to book.** Unbooked segments, each listing what is waiting on it. Then the open questions with what they block, and the trip-wide to-dos.

Dark mode follows the system setting, for reading in a dark shuttle.
