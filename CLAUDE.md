# Ellan Vannin weather: project notes

A static page that draws the Isle of Man forecast as a paper-cut panorama of the island. Time runs left to right and each column of the scene is lit and weathered for its own hour; the skyline is scenery, and the forecast is for one point at Douglas. `README.md` is the feature documentation (what each part of the picture encodes, the data sources and their caveats) and is written for anyone who finds the public repo. Keep it in step with the page.

It is a personal project, started on 24 September 2026. The first session was opened in `~/projects/game` and moved here once the idea took shape, so its transcript sits under that project's slug (`~/.claude/projects/-Users-richard-projects-game/eca4107e-b5f1-4dd0-b163-389e9e5eab6e.jsonl`) and its journal entries carry the handle `weather`. Richard's visual references were three pages from miaai-lab's Claude-Opus-5.5-100-HTML-Files: 091 alpenglow day cycle, 018 paper-cut diorama and 012 nimbus weather.

It is not Hansard work, so Hansard branding does not apply. The page keeps its own paper palette and type (IM Fell English, Newsreader) in `index.html`.

## Files

| File | Holds |
|---|---|
| `index.html` | Markup and all the CSS, with colour tokens on `:root` and a dark-mode block |
| `app.js` | Everything else, in one IIFE: data, sun and moon maths (after SunCalc), layout, painting, the tide staff and hanging tag, wiring. Sections are marked `/* ---------- name ---------- */` |
| `profile.js` | The generated skyline (`window.MANX_PROFILE`): three silhouettes of 720 points. Never hand-edit it; rebuild with `python3 tools/build_profile.py` |
| `tools/build_profile.py` | Stdlib only; downloads one 2.7 MB SRTM tile |

There is no build step, no dependency and no test suite.

## Run and verify

```bash
python3 -m http.server 8000     # then http://localhost:8000/
```

- `?demo` shows a made-up week that exercises every kind of weather and makes no network calls. Use it while working on the drawing. Open-Meteo's free quota is counted per network, and once it is spent the forecast returns 429 until the hourly limit resets.
- `?hours=168`, `48`, `24` or `12` opens at that zoom. Otherwise the page opens at the zoom last used in that browser (localStorage `ellan-vannin-view`), or 48 h the first time. The last good forecast is cached under `ellan-vannin-forecast-v1`.
- `?debug` exposes `window.EV` (`paperMoon`, `moonDisc`, `sunAlt`, `moonAlt`, the layout object `G`, `paint`) for checking the astronomy from the console.
- Verify in agent-browser, headless: demo and live, every zoom, light and dark, and phone width. The timeline scrolls sideways inside `.stage`, and the page itself must never scroll horizontally.
- Keep every agent-browser call under 30 seconds (the gotcha is in `~/.claude/context/tools.md`). To sample something over time, such as a lighthouse's flashes, start a loop inside the page that writes to a global, return at once, and read the global afterwards.
- Check astronomy against an outside source, never against the code. On 24 September sunrise and sunset were checked against gov.im, day lengths against timeanddate, and the moon's phase against 30 real nights.

## Publishing

The repo is public (`cowinr/manx-weather`), and GitHub Pages serves `main` at https://cowinr.github.io/manx-weather/, rebuilding about a minute after a push. Richard made it public on 24 September 2026 because his GitHub plan does not serve Pages from a private repo. A push to `main` is therefore a public release: commit when asked, and ask before pushing. History so far is straight commits on `main`, with no branches or pull requests.

## What the code must keep doing

- **The island stays fixed while time scrolls past it.** `paintScene` draws sky, cloud, sea and ruler in timeline coordinates (translated by the scroll offset), and the land, shore and landmarks in view coordinates, each column lit for the hour passing over it. Only the visible stretch is painted, at a median of 2 to 3 ms a repaint when measured on 24 September. New scenery has to pick one of the two coordinate systems and draw only what is on screen.
- **Nothing may change between repaints except the hour.** Texture and scatter come from `hash(x, seed)` keyed to absolute timeline position, or from `mulberry(seed)` with a fixed seed inside the `build*` functions that run once per layout. `Math.random` is used only for lightning on the effects canvas. A random number drawn per paint makes the scene shimmer as it scrolls.
- **Sun and moon share one altitude scale, from 0° to 66°.** The first version topped out at 44° and the moon ran off the top of the view: from Douglas the moon can climb to about 64.5°, and in autumn 2026 it is near a major lunar standstill. Do not rescale it to suit the sun.
- **The moon's shape is computed, not drawn from a table.** It uses the lit fraction, rotated by the bright-limb angle minus the parallactic angle, and was checked against real dates (full on 26 September 2026, new on 10 October).
- **The tide is modelled.** Heights are measured from mean sea level, not chart datum, and the times ran 25 to 35 minutes early against the Douglas tables, which is why the tag says "around". Keep that wording honest if the tide display changes.
- **Never rebuild the skyline from Open-Meteo's elevation API.** On 24 September it billed every grid point as a call and used up the network's forecast quota for the rest of the hour. The README gives the details.
- **`LIGHTS` holds the six Northern Lighthouse Board lights**, with positions, daymarks and characters taken from NLB, Wikipedia and Wikidata. The Calf of Man lights are disused and left out on purpose. `flashLevel` reproduces each published character; check any change by timing the flashes in the page.
