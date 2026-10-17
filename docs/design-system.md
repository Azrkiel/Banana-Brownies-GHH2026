# SignLine / Glass

The shared design kit is available from **Design kit** in the app header (`#/design-kit`).
It includes working button variants, disabled states, forms, colors, type, badges,
and a material example. Its controls are examples; they do not start a call or recording.

## Direction and reference

Reference: [Apple’s Liquid Glass overview](https://developer.apple.com/documentation/technologyoverviews/liquid-glass).
The documentation host returned a proxy HTTP 403 during this implementation, so
this is a web interpretation of the material, not a claim to implement Apple’s
native rendering or to have checked the current documentation text.

Use glass for the navigation and control layer: translucency, a bright edge,
soft depth, and a quiet blue/lilac/cyan canvas. Keep reading surfaces more opaque.
Video and live speech drafts use a stable dark surface; captions use a stable light
surface. Avoid stacking blur layers or placing text directly over changing video.

## Files and ownership

- `web/src/design-system.css`: semantic tokens and reusable primitives.
- `web/src/components/ui.tsx`: native React controls and shared visual components.
- `web/src/index.css`: document defaults, native fields, focus, and motion preferences.
- `web/src/App.css`: application shell, home, and conversation layout.
- Page styles own their layout, not a separate palette or button implementation.

This redesign does not mark roadmap cards complete. The task ledger in `plan.md`
continues to govern recognition, training, provider, and real-device acceptance.

## Tokens

Use `var(--...)` rather than introducing a new one-off color or spacing scale.

| Purpose | Tokens |
| --- | --- |
| Text | `--color-ink`, `--color-muted`, `--font-sans`, `--font-mono` |
| Actions | `--color-accent`, `--color-accent-hover`, `--color-accent-soft` |
| Meaning | `--color-positive`, `--color-warning`, `--color-danger`, and their `-soft` fills |
| Surfaces | `--color-canvas`, `--color-surface`, `--glass-fill`, `--glass-stroke`, `--glass-blur` |
| Type | `--text-xs` (12), `--text-sm` (14), `--text-body` (16), `--text-title` (32–48), `--text-display` (52–72) |
| Shape | `--radius-sm` (12), `--radius-control` (16), `--radius-panel` (28), `--radius-pill` |
| Spacing | `--space-1`, `2`, `3`, `4`, `6`, `8`, `12` (4, 8, 12, 16, 24, 32, 48 px) |
| Depth/motion | `--shadow-glass`, `--shadow-control`, `--duration-fast`, `--ease-out` |

The font stack uses the platform font: San Francisco on Apple devices and the
system fallback elsewhere. No proprietary font files or font downloads are needed.
Use sentence case for controls. Reserve the uppercase eyebrow for short context.

## Components

```tsx
import { Badge, Button, Icon, PageHeader, Surface } from '../components/ui';

<PageHeader
  eyebrow="SIGNLINE / YOUR FEATURE"
  title="A clear, useful title."
  description="One short sentence explaining the screen."
  accessory={<Badge tone="positive">Connected</Badge>}
/>

<Surface aria-labelledby="settings-title">
  <h2 id="settings-title">Settings</h2>
  <label className="field">
    Display name
    <input autoComplete="given-name" placeholder="e.g. Kev" />
  </label>
  <Button variant="primary" onClick={onContinue}>
    Continue <Icon name="arrow" />
  </Button>
</Surface>
```

`Button` forwards native button attributes and defaults to `type="button"`.
For forms, explicitly use `type="submit"`. Its variants are `primary`, `secondary`,
`ghost`, and `danger`; sizes are `regular` and `small`. Both retain at least a
44 px target. Prefer one primary action per section. Use danger for ending or
removing something, never as a decorative accent. Use a real anchor for navigation.

`Surface` renders a section. Give substantial sections a visible heading and
`aria-labelledby`. It is intentionally more opaque than the navigation glass.
Use the `.glass` class for a floating control group; do not blur large content areas.

`Badge` supports `neutral`, `positive`, and `warning`. Its label must communicate
the state without relying on color. `Icon` is decorative and hidden from assistive
technology; an icon-only control still needs an accessible name.

Use `.field` for stacked native labels and fields, `.check-field` for consent,
`.button-row` for wrapping actions, `.panel-heading` for section headers, and
`.state-panel` for honest empty, loading, and error states. Do not add example
metrics to a real dashboard or imply that an unconfigured provider is connected.

## Accessibility and responsive behavior

- Keep captions readable and stable. Preserve polite live announcements and
  interim/final caption semantics.
- Preserve consent, recording locks, disabled controls, microphone controls, and
  camera cleanup when building new screens.
- Keyboard focus uses a visible blue outline with a 4 px offset. Do not remove it.
- Reduced motion disables decorative animation and control transforms/transitions.
- Reduced transparency replaces glass with an opaque fill. Browsers without
  backdrop-filter also get an opaque fallback.
- Increased contrast strengthens borders and secondary text. Forced-colors mode
  retains native system colors and control boundaries.
- Layouts stack on smaller widths. Keep tables in `.table-scroll`, use wrapping
  action rows, and check at 320 px as well as desktop. Do not hide overflow on the
  document to conceal a broken layout.

## Validation

Run from the repository root:

```sh
npm --prefix web test
npm --prefix web run build
npm --prefix web run lint
```

Review Conversation, a room, Camera check, Recorder, Stats (empty and configured),
Speech check, and Design kit in a browser. Check keyboard
focus, consent gating, errors, narrow screens, and reduced visual-effect settings.
Provider credentials and physical cameras are required for live integration checks;
a visual redesign does not establish their readiness.
