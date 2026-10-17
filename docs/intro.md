# Earthrise welcome screen

The root URL and `#/welcome` open a full-screen introduction before the app.
**Begin** makes a short 650 ms departure transition to `#/conversation`;
**Skip intro** enters immediately. The conversation page's **Back to the stars**
link replays it. Existing room, camera, recorder, speech, stats, and design-kit
links open directly, without an introduction in front of them.

The visual direction comes from the user's Moon/Earth references and the star
spiral in their Astra screenshot. The supplied
[Astra page](https://openai.com/index/gpt-6-astra/) returned an HTTPS proxy 403
during implementation, so its exact moving sequence could not be inspected.
This implementation uses an original three-arm orbital particle animation.

## Scene and motion

- `web/public/intro/earthrise.png` is an original generated background, created
  with OpenAI image generation from the user's visual direction. It is included
  locally; the intro does not depend on an external image host.
- `web/src/pages/Intro.tsx` owns entry, skip, replay presentation, pause, and the
  departure timer. It does not request camera or microphone access.
- `web/src/components/OrbitalStars.tsx` renders deterministic particles on a
  transparent 2D canvas over the photographic scene. Tilted, shallow elliptical
  projections create the spiral; distant particles are occluded by the Earth,
  and particles fade before the lunar foreground.
- `web/src/pages/Intro.css` owns the dark scene, responsive image crop, typography,
  glass Begin control, and reduced-effects/forced-colors treatments. It does not
  replace the main app's saved appearance preference.

The image is 1672 × 941 px. The renderer's Earth anchors are approximately
`(0.659, 0.441)` in source-image coordinates with a radius of `0.247` times
the rendered image height. The mobile crop differs from desktop; update the
image positioning and particle anchors together if replacing the background.

Motion runs at up to 30 fps with device pixel ratio capped at 1.6. Narrow screens
use 650 orbital and 130 background particles; larger screens use 1100 and 260.
Glow sprites are created once per renderer lifecycle and reused. Render time
advances only while playing. Pausing, reduced motion, a hidden document, or
unmounting stops the animation loop; resize and visibility observers are cleaned
up with it. The component also cleans up any pending departure timer when leaving.

## Access and loading

Begin and Skip remain available without waiting through a timed presentation.
The pause control exposes its state and accessible name. With reduced motion,
stars are static and Begin skips the departure animation. Increased contrast,
reduced transparency, and forced colors have explicit fallbacks.

Main app screens are lazy-loaded. The welcome screen therefore does not load the
LiveKit call or MediaPipe camera modules. After a lazy screen is ready, keyboard
focus moves into its main content. Direct room links preserve their room query
parameters and title. The browser's Back button can return to the introduction.

## Verification

- All 158 existing frontend tests pass, along with TypeScript/production build,
  lint, and whitespace checks.
- Chromium checks verified visible motion, pause/resume, stopped rendering after
  entry, cancellation of a pending transition, reduced-motion entry, keyboard
  Skip, direct links, room error handling, and no device access from the intro.
- Layouts were checked at 320 × 720, 390 × 844, 768 × 1024, 1440 × 900,
  1920 × 1080, and 844 × 390. No document horizontal overflow was found. Begin
  is visible on the tested 390 × 844 phone layout; Skip remains visible in all.
- The production entry bundle is about 234 kB before gzip, with call/camera
  modules deferred. Vite still warns about the separate LiveKit call chunk
  exceeding 500 kB.

These checks do not establish real-device GPU/frame pacing, Safari behavior, or
live provider/camera acceptance. The existing roadmap statuses are unchanged.
