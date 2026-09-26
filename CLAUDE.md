# Ellan Vannin weather: project notes

A static page that draws the Isle of Man forecast as a paper-cut panorama of the island. Time runs left to right and each column of the scene is lit and weathered for its own hour; the skyline is scenery, and the forecast is for one point at Douglas. `README.md` is the feature documentation (what each part of the picture encodes, the data sources and their caveats) and is written for anyone who finds the public repo. Keep it in step with the page.

It is a personal project, started on 24 September 2026. The first session was opened in `~/projects/game` and moved here once the idea took shape, so its transcript sits under that project's slug (`~/.claude/projects/-Users-richard-projects-game/eca4107e-b5f1-4dd0-b163-389e9e5eab6e.jsonl`) and its journal entries carry the handle `weather`. Richard's visual references were three pages from miaai-lab's Claude-Opus-5.5-100-HTML-Files: 091 alpenglow day cycle, 018 paper-cut diorama and 012 nimbus weather.

It is not Hansard work, so Hansard branding does not apply. The page keeps its own paper palette and type (IM Fell English, Newsreader) in `index.html`.

## Files

| File | Holds |
|---|---|
| `index.html` | Markup and all the CSS, with colour tokens on `:root` and a dark-mode block |
| `app.js` | The scene, in one IIFE: data, sun and moon maths (after SunCalc), layout, painting, the creatures, wiring. Sections are marked `/* ---------- name ---------- */`. `hourDetail` gathers the highlighted hour's numbers for the panel |
| `panel.js` | The hour panel (`window.HourPanel`): the instruments, the harbour picture, the phone strip and the harbour seal, drawn as SVG. It knows nothing about the forecast beyond the fields `hourDetail` passes it |
| `profile.js` | The generated skyline (`window.MANX_PROFILE`): three silhouettes of 720 bearings, in hundredths of a degree above level as seen from a boat 10 km east of Douglas. Never hand-edit it; rebuild with `python3 tools/build_profile.py` |
| `tools/build_profile.py` | Stdlib only; downloads one 2.7 MB SRTM tile |

There is no build step, no dependency and no test suite.

## Run and verify

```bash
python3 -m http.server 8000     # then http://localhost:8000/
```

- `?demo` shows a made-up week that exercises every kind of weather and makes no network calls. Use it while working on the drawing. Open-Meteo's free quota is counted per network, and once it is spent the forecast returns 429 until the hourly limit resets.
- `?stretch=N` draws the hills N times their real height (default 6), for comparing settings.
- `?hours=168`, `48`, `24` or `12` opens at that zoom. Otherwise the page opens at the zoom last used in that browser (localStorage `ellan-vannin-view`), or 48 h the first time. The last good forecast is cached under `ellan-vannin-forecast-v1`.
- `?debug` exposes `window.EV` (`paperMoon`, `moonDisc`, `sunAlt`, `moonAlt`, the layout object `G`, `paint`) for checking the astronomy from the console, plus `spawn('seal' | 'dolphins' | 'whale')` and `creatures()` to make a creature surface now and then move or re-time it for a screenshot, and `harbourSeal` (set `on = false` and `next = 0` to bring the panel's seal up).
- Verify in agent-browser, headless: demo and live, every zoom, light and dark, day and night, and phone width. The timeline scrolls sideways inside `.stage`, and the page itself must never scroll horizontally. At phone width the panel becomes a strip under the scene, and the scene and strip should share one screen.
- `agent-browser errors` did not report a deliberate test error on 25 September, so an empty result there proves nothing. Check that the page works instead: the panel's text and drawing are filled in and the animations are moving.
- Keep every agent-browser call under 30 seconds (the gotcha is in `~/.claude/context/tools.md`). To sample something over time, such as a lighthouse's flashes, start a loop inside the page that writes to a global, return at once, and read the global afterwards.
- Check astronomy against an outside source, never against the code. On 24 September sunrise and sunset were checked against gov.im, day lengths against timeanddate, and the moon's phase against 30 real nights.

## Publishing

The repo is public (`cowinr/manx-weather`), and GitHub Pages serves `main` at https://cowinr.github.io/manx-weather/, rebuilding about a minute after a push. Richard made it public on 24 September 2026 because his GitHub plan does not serve Pages from a private repo. A push to `main` is therefore a public release: commit when asked, and ask before pushing. History so far is straight commits on `main`, with no branches or pull requests.

## What the code must keep doing

- **The island stays fixed while time scrolls past it.** `paintScene` draws sky, cloud, sea and ruler in timeline coordinates (translated by the scroll offset), and the land, shore and landmarks in view coordinates, each column lit for the hour passing over it. Only the visible stretch is painted, at a median of 2 to 3 ms a repaint when measured on 24 September. New scenery has to pick one of the two coordinate systems and draw only what is on screen.
- **Nothing may change between repaints except the hour.** Texture and scatter come from `hash(x, seed)` keyed to absolute timeline position, or from `mulberry(seed)` with a fixed seed inside the `build*` functions that run once per layout. `Math.random` is used only for animation on the effects canvas: lightning, and when and where a sea creature surfaces. A random number drawn per paint makes the scene shimmer as it scrolls.
- **Sun and moon share one altitude scale, from 0° to 66°.** The first version topped out at 44° and the moon ran off the top of the view: from Douglas the moon can climb to about 64.5°, and in autumn 2026 it is near a major lunar standstill. Do not rescale it to suit the sun.
- **The moon's shape is computed, not drawn from a table.** It uses the lit fraction, rotated by the bright-limb angle minus the parallactic angle, and was checked against real dates (full on 26 September 2026, new on 10 October).
- **The tide is modelled.** Heights are measured from mean sea level, not chart datum, and the times ran 25 to 35 minutes early against the Douglas tables, which is why the panel says "about". Keep that wording honest if the tide display changes.
- **The skyline is a real view from one real place.** `build_profile.py` ray-casts from a boat 10 km east of Douglas (eye 6 m), and anything set on the island goes through `sight(lat, lon)` or `xAt`, which turn a position into its bearing from that boat. The first version took the highest ground on each line of latitude, as if seen from infinitely far east, at about 9 times real height: hills at different depths merged into one jagged outline, and Richard wanted something an islander would recognise. He chose 6 times real height (`STRETCH`) on 25 September after comparing 3 to 9 in the app. The boat first sat 5 km off Douglas Head, but from there the north-east coast is end-on and Laxey, North Barrule, Ramsey and the Point of Ayre fell within 5° of each other, so it moved out to spread them. Before moving it again, check the landmarks' bearings from the new spot: the towns need room between them. `G.k` is pixels per degree and follows the width, so the island is low on a phone. Towns, the wheel and the lights are props: they stand at their true bearings but are drawn at a fixed size, with town widths following the screen width (`buildTowns`) so they keep their places on a phone. Cloud bases and hill fog are measured against the hills at 14 km (`yAlt`), so they still meet the hilltops at the right height.
- **Never rebuild the skyline from Open-Meteo's elevation API.** On 24 September it billed every grid point as a call and used up the network's forecast quota for the rest of the hour. The README gives the details.
- **Sea creatures surface through a sea strip, not on top of the sea.** `waveY` gives the shape `paintSea` draws, and each creature is clipped to the area above its strip's wave, so whatever is under water stays hidden. Change the sea through `SEA`, `seaLam`, `seaAmp` and `seaTop` so the two cannot drift apart. Gulls are drawn in screen space, like the island.
- **The panel redraws only when the hour or its size changes.** `setCursor` runs on every scroll event, so `HourPanel.show` compares the hour and size with what it last drew before rebuilding the SVG. The harbour seal moves one SVG group each frame and never redraws the picture.
- **`LIGHTS` holds the six Northern Lighthouse Board lights**, with positions, daymarks and characters taken from NLB, Wikipedia and Wikidata. The Calf of Man lights are disused and left out on purpose. `flashLevel` reproduces each published character; check any change by timing the flashes in the page.
