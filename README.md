# Ellan Vannin weather

The week's weather for the Isle of Man, drawn as a paper-cut panorama of the island. Time runs left to right, from now at the left edge to about seven days ahead, and you scroll right to move into the future. Each column of the scene is lit and weathered for its own hour.

The skyline is the island's real profile seen from the sea off Douglas, from the Calf of Man on the left to the Point of Ayre on the right. It is scenery. A column shows a moment in time, not a place, and the forecast is for a single point at Douglas.

## What the picture encodes

| In the scene | Comes from |
|---|---|
| Sky colour, dawn and dusk glows, stars | Sun elevation computed in the page, darkened and greyed by cloud cover and rain |
| Dotted arcs, sun and moon discs | Sun and moon paths above the horizon, on one fixed scale from the horizon (0°) to the top of the sky (66°, a little above the most the moon can reach from Douglas); each disc sits at its highest point, and the moon shows its real phase, turned so its lit edge faces the way it does in the sky that night |
| Wisps, puffs and cloud banks at three heights | High, mid and low cloud cover |
| Low cloud base and hill fog | Estimated cloud base, 125 m per degree between air temperature and dew point |
| Rain, snow, lightning | Hourly precipitation, snowfall and thunderstorm weather codes; rain slants with the wind |
| Pale veil over land and sea | Visibility below 6 km |
| Height of the sea against the beach | Tide (sea level from the marine model) |
| Wave height and white horses | Wave height; white horses appear from about 12 mph of wind |
| Lit windows on Douglas promenade | Darkness at that hour |
| Lighthouses: Chicken Rock, Thousla Rock, Langness, Douglas Head, Maughold Head, Point of Ayre | The six Northern Lighthouse Board lights, in their real daymarks. After dark each flashes its real character, such as Maughold Head's three white flashes every 30 seconds or Thousla Rock's red flash every 3; fog spreads the glow |

Now and then a grey seal puts its head up, a pod of dolphins leaps or a minke whale blows and rolls, and a few herring gulls wheel over the bay. They are decoration, not forecast, and they keep out of the dark hours.

The ruler underneath gives the same hours as numbers: temperature, rain per hour (bar opacity is the chance of rain) and wind speed and direction.

The whole forecast, about seven days, is always there: scroll right (trackpad, mouse wheel, swipe, Page Down, or the "later" tab) to move into the future, and Now to come back. The Week, 48 h, 24 h and 12 h buttons are zoom levels that set how many hours fit on one screen; zooming keeps the hour under the pointer where it was. The island stays fixed in the frame while time slides past it, and each column of the island is lit for whichever hour is passing over it. Only the visible stretch is drawn, so even the 12-hour zoom, about 19,000 px of timeline, repaints in a few milliseconds. In the closer zooms the ruler labels every hour and prints the rain amount on each bar.

The panel beside the scene shows the highlighted hour as a paper-cut harbour, with each reading on a small paper tag:

- **Wind dial** on top of the mast: a wind sock seen from above on a compass rose, pointing the way the wind blows. Its length is the wind speed, read against dotted rings at 10, 20, 30 and 40 mph, and a dashed outline shows how far the gusts reach. The red dot on the rim marks where the wind comes from.
- **Thermometer** bracketed to the mast, from −5 to 25 °C, with a small mark for what it feels like.
- **Rain gauge** on the quay, filling with the hour's rain (the level follows the square root of the amount, up to 8 mm), its drops as strong as the chance of rain.
- **Tide staff** painted on the harbour wall and scaled to the week's range. The sea stands at that hour's level in metres above or below mean sea level, and the red arrow shows whether it is rising or falling. Tide tables quote height above chart datum instead, so their numbers are higher; compare the shape and times, not the figures.

The sky behind the harbour follows the hour, and now and then a grey seal puts its head up by the quay. On a phone the panel sits under the scene as a single row of the same instruments, so both fit on one screen.

## Running it

It is a static page with no build step. Serve the folder over http and open it:

```bash
python3 -m http.server 8000
# then http://localhost:8000/
```

The page opens on the zoom you last used in that browser, or 48 hours the first time. Query options: `?demo` shows a made-up week that exercises every kind of weather, and `?hours=168`, `48`, `24` or `12` opens on that view regardless.

## Data

- Forecast: Open-Meteo, Met Office `ukmo_seamless` (UKV 2 km, then the 10 km global model), topped up from `best_match` for the last hours the Met Office run does not reach. Free for non-commercial use, CC BY 4.0, no key.
- Tides and waves: Open-Meteo marine API, Douglas Bay. The tide is modelled, not a tide table: on 24 September 2026 its heights matched the published Douglas tables well, but its high and low water times ran 25 to 35 minutes early, so the panel rounds them to the quarter hour and says "about". Use a proper tide table for anything that matters.
- Skyline: `profile.js`, built once by `tools/build_profile.py` from the SRTM 1 arc-second tile N54W005 (AWS Terrain Tiles), about 30 m between rows, thinned to 720 points by keeping each group's highest. Snaefell comes out at 622 m, North Barrule 561 m and South Barrule 477 m, against 621, 565 and 483 m. The page never calls an elevation service.

If Open-Meteo cannot be reached, the page uses the last forecast it saved in the browser, if that still covers the next day, and otherwise falls back to the demo week and says so.

Do not rebuild the skyline against Open-Meteo's elevation API. It bills every coordinate as a call, and the grid is large enough to use up the hourly quota for the whole network, which then blocks the forecast too.
