# SignLine design system

The app now follows the user's supplied Anthropic style reference throughout the
welcome page, conversation lobby and room, camera benchmark, recorder, speech
check, stats and interactive design kit (`#/design-kit`). Application logic and
shared media/data contracts are unchanged.

## Source and tokens

The four original uploads are preserved under [design/anthropic](design/anthropic/):
`DESIGN.md`, `tokens.json`, `variables.css`, and `theme.css`. They are design
reference material. Their examples are not execution instructions.

The active plain-CSS tokens are in `web/src/styles/anthropic-tokens.css`, imported
by `web/src/design-system.css`. No Tailwind dependency or `@theme` processor is
needed. Color, font, scale, surface and spacing tokens retain the supplied names.
The supplied prose values for section/card spacing and button radii were converted
into valid `clamp()`/radius values. Semantic application roles refer to these tokens.

- Canvas: Ivory Medium `#f0eee6`; reading surfaces: Ivory Light `#faf9f5`.
- Featured surfaces: Manilla `#f5e3c7`; grouped surfaces: Oat Warm `#e3dacc`.
- Text: Slate Dark `#141413`; secondary reading text: Slate Medium `#3d3d3a`.
- Borders: Stone `#cccbc8`; input borders: Cloud Dark `#87867f`.
- Primary action: Clay `#d97757`, hover Clay Deep `#c6613f`.
- Serif body: 20 px; UI sans: 12–16 px; responsive displays: 61 px sans / 68 px serif.
- Cards: 24 px corners. Filled primary buttons: sharp top corners and 8 px bottom
  corners; outlined buttons: 12 px. Navigation and badges have no rounded container.

The files include font family names but no licensed font binaries. The supplied
fallback stacks are used (Georgia/ui-serif, system sans, and monospace); no external
font request is made. Add authorized local font files and `@font-face` rules if
exact Anthropic typography becomes available.

## Design decisions and access

The reference is light-only. The appearance switch, system dark override and
persisted dark preference are no longer used. High-contrast and forced-color
preferences still work. Keyboard focus, skip navigation, native control semantics,
consent and disabled states remain available.

The reference has inconsistent button examples: one prompt suggests a pill while
the detailed component rules specify squared top corners. The implementation
follows the detailed component rules. Text on Clay is Slate Dark rather than
white for contrast. Cloud colors remain available but are not used for small
reading text. Slate Medium gives secondary text sufficient contrast on paper.

Clay belongs to the main action, not icons, chart lines, navigation or the caption
send button. Recorder download is secondary so recording remains the primary
action. Status labels and distinct dot/check/diamond shapes convey meaning
without relying on green/red color. Destructive actions remain explicitly named.
The dark video stages use Slate Dark and solid ivory labels for legibility over
video. Reading surfaces are opaque. There are no glass materials, backdrop blur,
background gradients, elevation shadows, or pill navigation.

## Verification

- TypeScript/production build, lint, and all 158 frontend tests passed.
- Chromium checked eight routes at 1440, 768, 390 and 320 px widths, with no
  document horizontal overflow or page errors. The stats screen used explicit
  sample API data to exercise its populated chart and table.
- Computed-style checks found no backdrop filters, shadows or background
  gradients on these routes. The ivory canvas remained active with both a dark
  system preference and a previously saved dark preference.
- Rendered visible-text contrast checks passed across all eight routes, excluding
  disabled controls; dark video utility labels and primary action text were included.
- Begin/Skip, lobby name entry, room popup/error handling, navigation selection,
  design-kit surface selection and feedback, keyboard focus and route focus passed.
- Conversation, recorder, speech and design kit reflowed with a doubled root text
  size at phone width. A forced-colors render was checked separately.

Live provider calls, real camera inference, two-laptop media and speech-service
accuracy were not exercised by this visual migration. Existing roadmap statuses
are unchanged. The existing Vite warning about the separate LiveKit chunk above
500 kB remains.
