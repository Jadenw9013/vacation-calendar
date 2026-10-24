# Voyroo brand

![Voyroo logo](../public/brand/voyroo-logo.svg)

**Voyroo** is the product name. Use this capitalization in UI and prose, and `voyroo` for package, repository and hosting-project identifiers. The tagline is **A little further, together.**

## Logo

The mark is a flowing V shaped like a route, with an apricot sunrise at its destination. Its rounded navy field and mint route stay recognizable at favicon sizes. The wordmark uses outlined letters from the bundled, SIL-licensed Atkinson Hyperlegible Next font; exported SVG files do not require the font to be installed.

| Asset | Use |
| --- | --- |
| [`voyroo-mark.svg`](../public/brand/voyroo-mark.svg) | Vector master for navigation and app icons |
| [`voyroo-logo.svg`](../public/brand/voyroo-logo.svg) | Outlined wordmark on light backgrounds |
| [`voyroo-logo-light.svg`](../public/brand/voyroo-logo-light.svg) | Outlined wordmark on dark backgrounds |
| [`voyroo-mark.png`](../public/brand/voyroo-mark.png) | Transparent 1024px raster mark |
| [`voyroo-logo.png`](../public/brand/voyroo-logo.png) | Transparent raster wordmark |
| [`voyroo-social.png`](../public/brand/voyroo-social.png) | 1200 × 630 link-preview card |

Keep clear space of at least one quarter of the mark's width around standalone artwork. Use the full wordmark where space allows. Do not stretch, rotate, add shadows to, or recolor the mark. The app uses the same master SVG in `LogoMark`, with ordinary selectable text for the product name.

## Palette and type

| Color | Hex | Use |
| --- | --- | --- |
| Journey navy | `#192F4D` | Logo field, light-theme headings |
| Route mint | `#91E2C3` | Logo route, artwork accents |
| Sunrise apricot | `#FFB66F` | Destination dot, artwork accents |
| Forest green | `#176B59` | Accessible primary actions on light backgrounds |
| Sky white | `#F4F6FA` | Light-theme page canvas |
| Paper | `#FFFFFF` | Light-theme surfaces |

Use Atkinson Hyperlegible Next throughout the UI. The logo colors are artwork colors; use the semantic color tokens in `globals.css` for text, controls and dark mode. Mint and apricot are not body-text colors on white.

## Placement and voice

Show the identity in the home and trip navigation, invitations/sign-in, the planner, public presentations, browser titles, share copy, install metadata and app icons. Keep functional labels plain: **New trip**, **Share trip**, **Plan**, **Today**, and **Trip**. The Trip tab is a settings destination, not the product name.

Product constants live in `src/brand.ts`. The logo is shared by `src/ui/Brand.tsx`. Existing storage keys and authentication cookies intentionally retain their names, preserving existing accounts and trips through the rename. Changing the product name does not change the authorised OAuth callback origin.

## Regenerate exports

```bash
npm run brand:assets
```

This renders the SVG masters with Sharp into all PNG exports, Apple/home-screen icons, maskable app icon and the multi-resolution favicon. Commit the SVGs and generated exports together. The maskable icon has a full navy field and keeps the symbol within the central safe area. The social card contains the outlined wordmark; only its supporting copy uses a system font.
