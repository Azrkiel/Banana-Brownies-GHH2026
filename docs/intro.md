# Notebook welcome

The root URL and `#/welcome` show a paper page with the **SignLine** heading,
a realistic hand-drawn Earth, Moon and stars, and one **Begin** action. There are
no subtitles, footer slogans or duplicate entry links. The local Lora font follows
the wide serif feel of the user's Claude Opus 5.5 heading reference.

Begin navigates immediately to `#/conversation`. The app header's SignLine link
returns to the welcome. Existing room, camera, recorder, speech, stats and design
kit links still open directly. The intro requests no camera or microphone access.

`web/src/pages/Intro.tsx` contains the semantic heading and link. `Intro.css` arranges
the title, drawing and action. `AstronomyArt.tsx` reuses the local transparent WebP
illustration; body styling supplies the separate paper grain. The artwork is
original AI-generated imagery in the naturalist illustration style requested by
the user. It is decorative, with HTML used for all text and interaction.

There are no animation loops or timers. The screens remain lazy-loaded so the
welcome does not load LiveKit or MediaPipe. Keyboard navigation and focus transfer
continue to work. See [design system](design-system.md) for assets and license details.
