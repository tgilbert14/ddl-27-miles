# 27 Miles to Canada — The Switchback

An interactive Desert Data Labs scroll story about the Catalina Highway climb from Tucson's Sonoran Desert to Mount Lemmon's mixed-conifer summit. Scientific copy and guardrails live in [`docs/grounding-bible.md`](docs/grounding-bible.md).

## The idea

The highway is the interface. The reader begins behind a nearly closed car-door seam, opens it with the first scroll, and then advances along a glowing road rendered in perspective. Terrain, camera, sun, vegetation, haze, and typography change together from hot desert to cool high forest.

All visible state comes from one route timeline keyed to real narrative mileposts. That same timeline drives:

- the road and ecological landscape;
- the active life-zone title;
- modeled elevation, temperature, mile, and road direction;
- section focus and transitions;
- the real 200-foot Summerhaven descent;
- the summit pullback.

This avoids the common scrollytelling failure where the copy describes one location while the visual and instrument have already drifted into another.

## Signature moments

1. **Open the door.** A dark seam parts to reveal desert light and a road entering the frame.
2. **The last saguaro.** Desert vegetation passes the viewer in perspective and disappears below its elevation threshold.
3. **The island closes around you.** Oak canopy enters from the edges, creating a physical sense of enclosure.
4. **Look back from Windy Point.** An accessible range control turns the camera between the road ahead and the desert below.
5. **The road goes down.** Elevation, modeled temperature, and direction all respond to the Summerhaven dip before the final climb.
6. **Pull back.** Near the summit, the driving view transforms into a complete six-band mountain transect with the traveled switchback glowing across it.
7. **Climate portal.** A draggable seam compares the 100°F desert start with the approximately 77°F summit while keeping both states explicitly labeled.
8. **Auto Ascent.** A slow cruise control carries the visitor from their current position to the summit in roughly 100 seconds. Any wheel, touch, pointer, or keyboard input immediately hands control back to the visitor; reduced-motion mode turns it into a direct summit shortcut.

## Visual language

- Condensed expedition typography rather than ornamental cards.
- Copy placed directly into landscape negative space.
- Coral desert heat transitioning to alpine cyan and midnight blue.
- Fine contour geometry, tactile print grain, and a glowing yellow route.
- Section-specific composition and pacing instead of six repeated layouts.
- No photos, inline SVG illustrations, scrolljacking, autoplay, or speculative climate claims.

## Build

`build.js` concatenates the source fragments into `index.html` and `fragment.html`. The landscape is decorative Canvas; all claims, controls, and navigation remain semantic HTML. A single invalidated animation scheduler is used, rendering only while scrolling or interacting. The page includes reduced-motion, mobile, keyboard, and no-JavaScript fallbacks.

`og.png` is the bespoke share card. The output remains dependency-free and compatible with the project's static/GitHub Pages workflow.
