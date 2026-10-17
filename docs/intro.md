# Editorial welcome screen

The root URL and `#/welcome` open the introduction. **Begin**, **Skip intro**,
and **Explore the conversation** all navigate immediately to `#/conversation`.
The conversation page's **Back to welcome** link returns here. Existing room,
camera, recorder, speech, stats, and design-kit links open directly.

The supplied Anthropic reference replaces the former dark Earthrise scene and
animated glass controls. The page uses a flat ivory canvas, a bold sans headline,
serif supporting copy, one clay action, and a manilla illustration plate. The
original line illustration keeps the idea of connection across perspectives.
It uses local SVG geometry and shared color tokens, with no remote assets.

`web/src/pages/Intro.tsx` owns the welcome page; `Intro.css` handles its responsive
layout. `web/src/components/ConnectionPlate.tsx` renders the static illustration.
There are no continuous animations, timers, device requests, or pause controls.
The former star renderer and unused floating sign cards have been removed.
The older image in `web/public/intro/` is retained as an unused historical asset.

Main app screens remain lazy-loaded. The welcome screen does not load LiveKit
or MediaPipe. After navigation to a lazy screen, focus moves to its main landmark.
Interactive elements retain visible focus outlines, while the main landmark does
not draw a page-sized ring. Browser Back and direct room query parameters work
as before. See [design system](design-system.md) for the shared visual rules and
validation evidence.
