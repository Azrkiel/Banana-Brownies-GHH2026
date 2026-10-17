# SignLine / Glass 2

SignLine follows Apple's Liquid Glass design guidance through a web implementation:
content stays readable and grounded, while navigation and important control groups
occupy a separate translucent layer. The interactive **Design kit** is at
`#/design-kit`. Its examples do not start a call or recording.

## Sources and interpretation

The following official documentation was read on October 17, 2026:

- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)
- [Color](https://developer.apple.com/design/human-interface-guidelines/color),
  [Motion](https://developer.apple.com/design/human-interface-guidelines/motion),
  and [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
  and [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)

Apple describes Liquid Glass as a distinct functional layer for controls and
navigation, recommends using it sparingly, and advises against putting it in the
content layer. Regular material softens detail and adjusts luminosity for
legibility. Clear material belongs over visually rich media; Apple's Materials
guidance suggests considering a 35% dark dimming layer over bright content.
Controls should retain clear grouping, familiar shapes, readable foregrounds,
and appropriate behavior under accessibility preferences.

This React app uses CSS backdrop filters, restrained highlights, semantic colors,
and interaction transitions to interpret that guidance. It does not use the native
SwiftUI/UIKit renderer, reproduce native refraction, or automatically infer
foreground contrast from live video. CSS values below are SignLine choices,
not Apple platform constants. The `glass--clear` example includes an explicit
35% dimming layer; real video labels and captions use stable backgrounds.

## Material roles

| Role | Implementation | Use |
| --- | --- | --- |
| Regular glass | `.glass`, `Button variant="glass"` | Floating navigation, display tools, compact call controls, standalone important controls |
| Clear glass | `.glass.glass--clear` with deliberate dimming behind it | Small controls over rich media; demonstrated in the Design kit |
| Reading surface | `Surface` / `.ui-surface` | Settings, consent, charts, clip library, and dense content |
| Caption surface | `.caption-panel`, speech history/live draft | Stable, readable foreground/background; no blur |
| Emphasized action | `Button variant="primary"` | Join, start, or confirm; semantic accent with a contrasting foreground |

Apply glass once per control group. Interior controls do not each need their own
backdrop filter. Never put a glass sample inside another glass sample. Ordinary
cards use a quiet border and a much smaller shadow than floating controls.
Do not put controls across the signer's hands or face. The call toolbar remains
in reserved space below the video.

The header stays available as content scrolls underneath it. A fading canvas
background protects its scroll edge; it is a web treatment, not Apple's native
scroll-edge API. A shared selection shape follows the current navigation item,
including when the layout changes size. Selection also uses `aria-current`, so
animation is never the only state cue. Display tools form a separate control group.

The home screen prioritizes joining a conversation. Supporting information and an
illustration follow the form on small screens. Camera access, the role-specific
microphone behavior, room validation, and opening the call in a new tab are unchanged.

## Tokens and ownership

- `web/src/design-system.css`: semantic colors, materials, component primitives,
  appearance variants, and accessibility fallbacks.
- `web/src/components/ui.tsx`: native React controls and decorative icons.
- `web/src/index.css`: document typography, fields, focus, and reduced motion.
- `web/src/App.css`: floating shell, join layout, video room, and captions.
- Page styles own layout and use the shared tokens rather than separate palettes.

| Purpose | Tokens / starting values |
| --- | --- |
| Appearance | `--color-canvas`, `--color-surface`, `--color-inset`, `--color-ink`, `--color-muted` |
| Action | `--color-accent`, `--color-accent-hover`, `--color-on-accent`, `--color-accent-soft` |
| Meaning | Positive, warning, and danger foreground/soft-fill pairs |
| Boundaries | `--color-border` for grouping; `--color-field-border` for interactive fields |
| Regular glass | `--glass-fill`, `--glass-stroke`, `--glass-highlight`, `--glass-selected`, `--glass-blur` |
| Depth | `--shadow-glass` for floating controls; `--shadow-panel` for content |
| Typography | Body 16 px; controls 14 px; page title 28–36 px; home title 36–52 px; live room captions 18 px |
| Geometry | 12 px small radius; 14 px fields; 28 px panels; capsule control groups |
| Spacing | 4, 8, 12, 16, 24, 32, 48 px |
| Feedback | 160 ms control feedback; 280 ms navigation selection; `--ease-out` |

Use system fonts. Apple devices can use San Francisco through `-apple-system`;
other devices use their system fallback. Do not ship proprietary font files.
Use restrained heading tracking and normal body tracking. Body content must wrap
and support text enlargement instead of relying on a fixed line count.

## Appearance and accessibility

The header's appearance button cycles **Auto → Light → Dark → Auto**. Auto follows
`prefers-color-scheme`; explicit choices are stored under `signline-appearance`.
The accessible name announces the current appearance and the next choice. If local
storage is unavailable, the current session still works. Light and dark appearances
have separate semantic foreground, fill, accent, and glass values.

Keep captions stable, with interim/final semantics and polite announcements.
Preserve consent, recording locks, disabled states, camera cleanup, and microphone
controls. Every icon-only control needs an accessible name; decorative icons remain
hidden from assistive technology. Controls retain at least a 44 px target, and
keyboard focus uses a visible 3 px outline with a 4 px offset. A skip link focuses
the main content below the sticky header.

- Reduced motion disables transitions, press transforms, and decorative animation.
- Reduced transparency replaces glass with opaque appearance-appropriate surfaces.
- Increased contrast strengthens borders and removes backdrop filters.
- Forced colors use system colors and preserve visible selection and boundaries.
- Browsers without backdrop filters receive opaque material fallbacks.
- Media-query support varies by browser; test the actual target browser/device.

Use readable foregrounds even when a dark or light image scrolls underneath the
header. A lower fill opacity is not inherently more correct. Clear material needs
an explicitly protected foreground, especially over bright video. Fields have a
stronger border token than passive content panels. WCAG contrast requirements apply
to the composited result; blur alone does not establish compliance.

## Components

`Button` supports `primary`, `secondary`, `ghost`, `danger`, and `glass`, with regular
and small sizes. It forwards native button attributes and defaults to `type="button"`.
Use `type="submit"` inside forms. Prefer a single clear primary action per task.
Danger styling denotes destructive actions, not decoration.

`Surface` renders a section. Give significant sections a heading and
`aria-labelledby`. Use a real anchor for navigation. `Badge` pairs neutral,
positive, or warning color with a text label. Do not imply unconfigured providers
are connected or add example metrics to the real dashboard.

The Design kit switches between regular glass, clear glass, and stable content
examples against the same illustrative backdrop. It demonstrates action variants,
disabled states, forms, adaptive colors, typography, and status semantics. Inspect
it in both appearances and with reduced-effects settings.

## Validation

From the repository root:

```sh
python3 plan/verify.py preflight
npm --prefix web test
npm --prefix web run build
npm --prefix web run lint
```

Review Conversation, room connection/error states, Camera check, Recorder, Stats
(empty and configured), Speech check, and Design kit in a browser. Verify keyboard
focus, form validation, room parameters, consent gating, navigation selection,
appearance persistence, and reduced visual effects. Check 320 px layouts and text
zoom as well as desktop. Tables scroll within their own container.

The UI update passed 158 existing frontend tests, TypeScript/production build, and
lint. Chromium checks cover seven routes at 320/390/768/1440 px in light and dark
appearances, plus theme persistence/system changes, room submission, consent,
keyboard skip navigation, material switching, a configured dashboard fixture,
reduced motion/transparency, increased contrast, and forced colors. Fixtures do
not establish live provider or database access. Real-camera, two-laptop, Safari,
and target-hardware performance checks remain necessary.

The home, Recorder, Speech check, and Design kit also passed a 200% root-text
enlargement check at 1280 px without document overflow. The production build retains
Vite's existing warning about a main chunk larger than 500 kB; no dependencies were
added by this update.

This visual update does not promote any roadmap card. Recognition, model training,
provider integration, and live acceptance remain governed by `plan.md`.
