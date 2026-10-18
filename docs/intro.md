# Bird-and-hand welcome

The root URL and `#/welcome` show **SignLine**, a hand-drawn songbird perched on
an open hand, and one **Begin** link. The warm paper, local Lora serif type and
sparse copy carry through to the working UI. There are no subtitles or extra
entry controls. Existing room, camera, recorder, speech, stats and design-kit
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

Begin starts the 1.6-second sequence. The title and action clear while the bird
takes off and stays centered. Navigation to `#/conversation` then hands the same
registered pose and size to `BirdLoading.tsx` if the route is still pending.
Its four flying poses loop until React's Suspense boundary resolves; there is no
extra loading delay or visible filler copy. A screen-reader status announces
loading. Failed art and forced colors show a plain loading status; reduced motion
keeps a still illustration. The paper tile stays aligned between both scenes.
The working header/form ease in over 320 ms. The call module is prefetched on
Begin focus/hover and at activation. Direct routes use the same bird loading state.

The call form and room standby use `Songbirds.tsx`: two birds facing each other
on a leafy branch, matching the approved natural-history reference. Camera and
recorder standby screens retain the static bird on a hand. Space art is unused.

## Ownership and fallbacks

`Intro.tsx` preloads and decodes both art assets. Once ready, Begin guards against
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

Browser checks cover a deliberately delayed call module at desktop and phone
sizes: the tracked chest and loader align within 2 px, wingbeats continue while
pending, and the call form replaces them only when ready. Reduced motion, forced
colors, missing loading art and navigation away during loading are also exercised.

See [design system](design-system.md) for the shared paper style and font license.
