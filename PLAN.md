# 27 Miles to Canada: the real road

An interactive Desert Data Labs scroll story about the Catalina Highway climb from Tucson's Sonoran Desert to Mount Lemmon's mixed-conifer summit. Scientific copy and guardrails live in [`docs/grounding-bible.md`](docs/grounding-bible.md).

## The idea

The reader drives the real road over the real mountain. A three.js view rides the General Hitchcock Highway as it is mapped in OpenStreetMap, over terrain from Mapzen Terrain Tiles at true vertical scale, and the copy sits over it on soft dark scrims.

All visible state comes from one timeline: scroll position gives a highway mile, and the mile gives

- the camera's place on the road (it follows about 350 m behind and 90 m above, looking 600 m ahead, with critically damped smoothing);
- the measured road elevation, interpolated from `data/route.json`;
- the modelled temperature (100°F at 2,700 ft, minus 3.5°F per 1,000 ft);
- the sky and haze colours of the community the road is in;
- the handle on the profile bar.

Scroll stays the single source of truth. The profile bar writes scroll through the inverse mapping (`Climb.yForMile`).

## Moments

1. **Mile 0.** The title sits over the view from where the highway begins.
2. **Six communities.** The terrain is coloured by elevation into six bands (edges at 4,000 / 5,000 / 6,000 / 7,000 / 8,000 ft, blended over about 150 ft). Low-poly plants are placed by band along the road: no saguaro above 4,000 ft, no conifer below 6,000 ft.
3. **Look back from Windy Point.** The range control really turns the camera, up to 180 degrees, toward the Tucson basin. Outside that chapter the look-back eases back to the road ahead.
4. **The road goes down.** The profile shows the measured crest (8,180 ft, mile 20.4) and the dip (7,734 ft, mile 22.5) before Ski Run Road.
5. **Pull back.** Entering the summit, the camera rises to a high oblique view from the south-west with the whole road drawn across the mountain.
6. **Auto ascent.** The play button at the left of the profile bar cruises to the summit with 3 s pauses at each stop; any input hands control back; reduced motion turns it into a jump.

## One control

A single bar fixed to the bottom: play/pause, readouts (mile; feet · measured; °F · modelled) and the measured elevation profile with seven stop ticks. It is backed by a real `<input type="range">` for keyboard and screen readers; pointer drags and taps on the profile scroll the page.

## Data

`tools/build_data.py` (run with `uv run --with numpy --with pillow python tools/build_data.py`) downloads and caches the tiles and OSM data and writes:

- `data/height.webp`: 1024 px terrain sheet, height in metres = (R*256 + G) * step + lo, about 37 m per pixel;
- `data/route.json`: the road sampled every 40 m with highway miles, elevation in feet and sheet positions;
- `data/meta.json`: sheet bounds and scale, plus nearby named places.

## Build

`build.js` concatenates the `src/` fragments in manifest order into `index.html` and `fragment.html` as one `<script type="module">`. The scene imports `./vendor/three.module.min.js` (three r160) and fetches `data/` with relative URLs. If WebGL or the data fail, the page gets `no-gl`, keeps a CSS gradient sky and everything else works. The view renders only when something changes, caps device pixel ratio at 1.5 on phones and 2 on desktop, and pauses when the tab is hidden. Reduced-motion, phone, keyboard and no-JavaScript editions are kept.

`og.png` is the share card.
