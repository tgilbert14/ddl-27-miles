# 27 Miles to Canada

An interactive Desert Data Labs field ascent up Arizona's Catalina Highway.
Scroll from Sonoran desertscrub at 2,860 feet, where the General Hitchcock
Highway begins, to Mount Lemmon's mixed-conifer summit at 9,157 feet, on the
real road over the real terrain.

**Live experience:** https://tgilbert14.github.io/ddl-27-miles/

## Highlights

- A three.js view of the Santa Catalina Mountains at true vertical scale,
  with the road from OpenStreetMap and terrain from Mapzen Terrain Tiles
- Six biotic communities coloured by elevation, with plants placed by band
- One control: a measured elevation profile of the road, fixed to the bottom,
  that scrolls the page by drag, tap or keyboard
- Windy Point look-back that turns the camera toward the Tucson basin
- The real crest and dip before Summerhaven, and a summit overview
- Slow, interruptible Auto ascent
- Responsive, keyboard-accessible, reduced-motion, no-WebGL and
  no-JavaScript editions

## What is measured and what is drawn

The road line, terrain, elevations and miles are measured. Temperature is a
model (100°F at 2,700 ft, minus 3.5°F per 1,000 ft). The colour bands, plants,
sky, light and haze are drawn. The page says so in its own section.

## Build

Source fragments live in `src/`; `node build.js` produces the deployable
`index.html` (one module script). The only dependency is the vendored
`vendor/three.module.min.js`. Data in `data/` is built by
`tools/build_data.py` (see its docstring; downloads are cached in
`tools/.cache`, which is git-ignored).

Scientific claims and editorial guardrails are documented in
[`docs/grounding-bible.md`](docs/grounding-bible.md).

Road © OpenStreetMap contributors (ODbL). Elevation: Mapzen Terrain Tiles.
