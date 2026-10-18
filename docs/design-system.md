# SignLine notebook design

The user's current direction replaces the prior editorial card design with a
textured paper notebook. Original bird-and-hand drawings, serif typography, pencilled
lines and minimal action labels define the UI. The earlier Anthropic source files
remain archived in `docs/design/anthropic/` for provenance.

## Assets and typography

- `web/public/notebook/paper.webp`: original generated paper grain, 1536 × 1024,
  about 69 kB, tiled at a subtle reading scale across every route.
- `web/public/notebook/perch-hand.webp`: a transparent, realistically drawn hand
  and forearm, about 193 kB. It is separate from the bird for the release bounce.
- `web/public/notebook/bird-frames.webp`: six illustrated poses in an even 3 × 2
  sprite sheet, about 313 kB. The opening uses the poses for takeoff and a centered
  flying bird replaces route loading screens. Both assets are 1536 × 1024.
- `web/public/notebook/songbirds.webp`: two realistic songbirds facing each other
  on a leafy branch, about 400 kB, 1536 × 1024 with transparency. The call form
  and room standby use this separate illustration from the approved reference.
- The images were created with OpenAI image generation using the user's naturalist
  butterfly and Claude Opus 5.5 screenshots as visual direction, then encoded as
  WebP. They contain no text. Text and controls are accessible HTML.
- Lora supplies the wide, soft serif voice of the heading reference; the screenshot
  does not supply an exact font binary. Local Latin WOFF2 files include regular,
  medium, semibold and italic styles. They came from `@fontsource/lora@5.3.0` and
  are distributed under the bundled SIL Open Font License. There is no remote
  font request or added package dependency.

`web/src/styles/notebook-tokens.css` defines the local font faces, paper/graphite
palette, spacing, irregular radii and pencil-line SVG. `design-system.css` owns
shared controls, surfaces and status indicators. Page CSS owns layout.

## Interface

The welcome screen contains exactly **SignLine**, the illustration, and **Begin**.
The drawing is decorative and hidden from assistive technology. Begin is a real
link and plays the drawn takeoff before entering. There are no repeated entry
actions, taglines, figure captions or numbered notes. See [welcome motion](intro.md)
for timing, ownership and immediate-entry fallbacks.

The app header contains SignLine and five short links: Call, Camera, Speech,
Record and Stats. The design-kit route remains available directly at `#/design-kit`
for development and is not advertised in the user navigation.

The call form contains Name, Room, Role and Join. It preserves browser validation,
role behavior and the room popup, with two songbirds sharing a branch beside it.
Camera, recorder, speech and stats use plain
page names and functional controls. Marketing copy, redundant subtitles and
instructional demo panels have been removed. Necessary consent, actual status,
errors and data-loss notices remain. The local camera/video itself is displayed
without an illustration filter; drawings appear only in standby states.

Controls use transparent fills, thin irregular frames or double pencil underlines.
Checkboxes and select indicators use ink paths while retaining native semantics.
Status indicators retain labels; connected and warning states also have distinct
shapes. Captions keep readable foregrounds and stable layout. No glass effects,
blur, glossy buttons or rounded cards remain.

## Access and verification

Font and artwork requests are local. Keyboard focus, skip-to-content, route focus,
media cleanup and recording/speech consent remain intact. Reduced motion removes
hover movement and skips the takeoff. Increased contrast strengthens borders. Forced colors removes
paper imagery and decorative illustrations and restores native checkboxes/selects.

Validation for this revision:

- All 158 frontend tests, TypeScript/production build, lint and whitespace checks pass.
- Chromium passed 32 route/width combinations: eight routes at 1440, 768, 390 and
  320 px, plus welcome entry at 844 × 390, 320 × 568 and 1920 × 1080. No document
  horizontal overflow or page errors occurred. Begin stayed visible.
- Paper and locally hosted Lora fonts loaded. The opening page contains exactly
  the title and one link. Other pages made no device requests before an action.
- Keyboard entry and route focus passed. Join remained disabled without a name,
  invalid room names were rejected, and valid room/role parameters reached the
  popup. The room field's existing hyphen pattern was made compatible with modern
  browser Unicode-set validation; the accepted room-name contract is unchanged.
- Recording consent gates camera access. Speech consent, Start/Stop, recognition
  results and Clear were exercised with an explicit speech-service mock.
- Populated stats used sample API data. Empty stats and invalid room links also
  rendered their real status/error states.
- Four routes reflowed at doubled root text size on a phone viewport. Forced colors
  removed the paper and restored native controls. Visible-text contrast checks
  passed across eight routes against the base paper color (disabled controls
  excluded); the paper grain is decorative and kept pale.

Browser speech results and stats data are test fixtures; these checks do not
establish live provider, real-camera or two-laptop acceptance. The existing warning
about the separate LiveKit JavaScript chunk remains. Roadmap card statuses are
unchanged by the visual work.

The bird update is checked separately for six actual displayed poses, independent
hand recoil, CSS completion, double activation, Escape, route cancellation,
return-to-welcome reset, a missing image, disabled CSS animation, reduced motion
and preference changes. Static layout checks cover the working routes as well.
The call form and its validation remain unchanged by the bird animation.

## Notebook UI consistency check — October 17, 2026

The approved `animation/centered-bird-loader` branch is already included in
`main` through PR #4. Its paper, bird artwork, Lora typography and pencil controls
remain the shared design; no additional visual redesign was needed.

- Chromium checked welcome, call, camera, speech, recorder, stats, both signer
  and hearing device checks, and the design kit at 1440, 768, 390 and 320 px.
  All 36 combinations loaded local Lora and the paper texture, without document
  horizontal overflow, browser errors, or device requests before user action.
- Desktop and phone screenshots were reviewed for the shared notebook styling.
  Device checks retained their disabled Join gate and role-specific microphone
  controls. Reduced-motion entry, invalid-room validation and forced colors passed.
- Normal-motion playback verified takeoff, changing wing frames in the centered
  loader, and entry into the call form. The call-module request was delayed for
  the recording to make the loading state visible.
- All 178 frontend tests, production build and lint passed. The pre-call render
  tests now assert the approved `Devices` heading instead of the previous
  `Before you join` copy; their room, role, camera and disabled-Join checks remain.

These checks cover the rendered pages and local validation. Live provider calls,
populated database stats, real camera tracking and two-laptop acceptance were not
repeated. No roadmap card status was changed, and no deployment was performed.
