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
wrapper follows a rising leftward path and diminishes in size. The hand first
dips, then recoils upward and settles over one second. Pencil wrist edges taper
into the paper. There is no idle animation.

Begin starts the 1.6-second sequence. The title and action clear, the bird leaves,
and the paper fades into `#/conversation`; the working header/form ease in over
320 ms. The call module is prefetched on Begin focus/hover and at activation.
Other pages reuse the static perched illustration; space art is no longer used.

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

See [design system](design-system.md) for the shared paper style and font license.
