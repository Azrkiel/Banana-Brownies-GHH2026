# Bird-and-hand welcome

The root URL and `#/welcome` show **SignLine**, a hand-drawn songbird perched on
an open hand, the tagline **Video calls. Shared captions.**, and one **Begin** link
styled as the shared primary button. The warm paper, local Lora serif type and
sparse copy carry through to the working UI. There are no extra entry controls.
Existing room, camera, recorder, speech, stats and design-kit
links still open directly. No device permission is requested on entry.

## Drawn layers and motion

`BirdIllustration.tsx` composes two local transparent WebP assets on a registered
3:2 stage: `perch-hand.webp` and `bird-frames.webp`. The latter is a 1536 × 1024
sprite sheet containing six separately illustrated poses in a 3-column/2-row grid:
perched, preparation, wings up, wings out, wings down, and recovery. They were
created with OpenAI image generation from the approved bird-on-hand concept.
The hand is a separate illustration, so its movement does not drag the bird.

`BirdIllustration.css` uses stepped sprite positions with small registration
corrections to keep the chest/head aligned while the wings change. The flight
wrapper starts with a rising leftward path, then the view tracks its chest into
the viewport center. Its final size matches the loading bird on every viewport.
The hand first dips, then recoils upward and drops out of view over one second. Pencil wrist edges taper
into the paper. There is no idle animation.

Begin starts the 1.6-second sequence. The title, tagline and action clear while the bird
takes off and stays centered. Navigation to `#/conversation` then hands the same
registered pose and size to `BirdLoading.tsx` if the route is still pending.
Its four flying poses loop until React's Suspense boundary resolves; there is no
extra loading delay or visible filler copy. A screen-reader status announces
loading. Failed art and forced colors show a plain loading status; reduced motion
keeps a still illustration. The paper tile stays aligned between both scenes.
The call module is prefetched on
Begin focus/hover and at activation. Direct routes use the same bird loading state.

Once the call form is ready after a completed takeoff, `Songbirds.tsx` continues
the same chest position, sprite pose and scale from the center into a 1.2-second
landing arc. Wingbeats slow, the feet lower to the branch, and the original
perched pose settles on the **right**, facing the **blue bird on the left**.
The form stays usable throughout. The page does not replay its entrance after
the landing. Fresh direct visits show the settled pair immediately.

`branch-blue.webp` is a regenerated transparent 1536 × 1024 illustration with
longer branches and olive twigs extending to both sides. It contains just the
left blue bird and an empty right perch. The right bird remains a separate layer
from `bird-frames.webp`, so there is no baked-in duplicate at its landing spot.
The call form and room standby share this composition. The previous two-bird
`songbirds.webp` remains as the original artwork reference. Camera and
recorder standby screens retain the static bird on a hand. Space art is unused.

## Ownership and fallbacks

`Intro.tsx` preloads and decodes the hand, sprite sheet and new branch. Once ready, Begin guards against
repeat clicks and waits for the bird path's CSS `animationend`. A bounded 1.8-second
fallback handles disabled/interrupted CSS animations. Navigation away cancels the
fallback and listeners, including navigation between root and `#/welcome` aliases.
Returning starts a new perched scene. Escape skips the departure.

Reduced motion, forced colors, or unavailable art enter the call form immediately.
Changing to reduced motion/forced colors during flight also finishes immediately.
The native Begin link preserves modified-click navigation. Keyboard activation and
focus transfer to the working main landmark remain intact. The art is decorative;
all text and controls are semantic HTML. None of the animation is used to enable
camera or microphone access.

`App.tsx` owns the one-time welcome-to-call handoff in memory. Navigation away
clears it; returning to the welcome resets the perched scene. Landing uses the
same 44%/61% chest registration as takeoff and loading, with layout offsets that
remain stable under React StrictMode. Escape, resize or a change to reduced
motion/forced colors finishes the landing. A bounded 1.5-second fallback handles
disabled CSS animation events, and its listeners/timer are cleaned up on unmount.

Run `node web/scripts/check-welcome-flight.mjs` from the repository root after
installing the frontend dependencies. It uses Chromium (`/usr/bin/chromium`, or
set `BROWSER_EXECUTABLE`) and starts its own Vite server on port 5189.

Browser checks cover a deliberately delayed call module at 1440, 768, 390 and
320 px: takeoff, loading and landing start align within 2 px of viewport center.
The checks exercise settling, direct entry, no device requests, horizontal
overflow, reduced motion, forced colors, Escape, motion preference changes,
disabled animation events, missing branch art and returning/replaying the welcome.
The 207 frontend tests, lint and production build also pass. These visual changes
do not change roadmap card statuses or validate live calls or camera inference.

See [design system](design-system.md) for the shared paper style and font license.
