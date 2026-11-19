# Baltic wind, waves and swell

The GitHub Pages viewer displays immutable PNG forecasts and their UTC timeline.
`scripts/forecast.py` creates the images from open model data, replacing the old
`ocean.dmi.dk` image downloader and OCR workflow in `scripts/snapshot.py`.

## Sources

- Primary: DMI WAM North Sea–Baltic (`wam_nsb`), approximately 5 km, hourly,
  0–132 hours, 00/06/12/18 UTC runs. The STAC catalogue supplies direct GRIB
  downloads, avoiding the EDR grid service. Data: DMI, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
  rendered by this project. [Documentation](https://www.dmi.dk/friedata/dokumentation/forecast-data-stac-api).
- Backup: DWD EWAM direct GRIB2 downloads, approximately 5 km, hourly,
  0–78 hours in the current direct feed, 00/12 UTC runs. Includes 10 m wind,
  total significant wave height, and total swell, with directions.
  [DWD Open Data](https://opendata.dwd.de/weather/maritime/wave_models/ewam/).
  [DWD attribution and terms](https://www.dwd.de/EN/service/copyright/copyright_node.html).

Every snapshot uses exactly one provider and model run. A partially published
DMI run is skipped in favour of a recent complete run. DMI runs older than 18
hours and DWD runs older than 30 hours are rejected. At least 24 future hours
must remain. If DMI cannot supply data, DWD is tried; if both fail, the last
saved images remain available and the existing outage alert sends once per
incident. Corrupt data, incorrect fields or mismatched timestamps fail validation
instead of being published. Individual missing sea/land values stay masked.

The map uses fixed wind and wave colour scales, coastlines from Natural Earth,
and arrows pointing in the direction of travel (opposite the supplied "from"
direction). Shaded land and subtle grid lines keep the forecast prominent;
compact horizontal legends fit in the existing bottom margin, preserving the
900 × 675 image dimensions and mobile stacking. The Baltic framing intentionally
excludes the Norwegian Sea and Kattegat. It is a visualization of model forecasts,
not a new forecast model.
The WAM wind forcing transitions from HARMONIE to ECMWF later in the forecast.

## Local use

Python 3.12 is used in CI. The ecCodes wheel includes the native decoder.

```sh
python3 -m venv /tmp/baltic-forecast-venv
/tmp/baltic-forecast-venv/bin/pip install -r scripts/requirements.txt
/tmp/baltic-forecast-venv/bin/python scripts/forecast.py /tmp/baltic-preview --max-frames 1
/tmp/baltic-forecast-venv/bin/python scripts/forecast.py /tmp/baltic-forecast
```

The output directory must not already exist. `--provider dmi` or `--provider dwd`
selects a source for inspection. Preview manifests are marked and cannot be
published by the workflow. Cartopy downloads its public 10 m land/coastline data
on first use; CI caches it between runs.

Run checks with:

```sh
python -m unittest discover -s tests -v
node tests/timeline.cjs
node tests/scheduler.mjs
```

For viewer layout and keyboard regressions, serve the repository with
`python3 -m http.server 8765`, then run these commands from the repository root:

```sh
kite run tests/viewer.kite
kite eval --file tests/mobile-scroll.js
```

The checks use fixture forecasts and images, cover smooth mobile scrolling, and
simulate visual viewport changes during toolbar resizing and pinch zoom. Real
iPhone Safari toolbar behavior still needs a device check. Run the file-based
eval separately: Kite currently treats `eval --file` inside a `.kite` test as
inline JavaScript.

## Viewer features

The [viewer](https://erikwahlstrom.github.io/dmi-vind-waves/)
opens a tall hourly graph for the map being pressed after holding a sea location
for half a second. Tap the miniature map to open a larger location editor, then
drag the map beneath its fixed marker (or use arrow keys). **Use location**
confirms the nearest sea model point and returns to the graph; **Cancel** keeps
the original point. Land locations cannot be confirmed. The graph retains its
selected hour and quantity. Tap Wind, Waves
or Swell to switch the plotted quantity; all three values remain visible and the
graph scrolls beneath a fixed centre marker to select the hour and update all
maps. Padding lets the first and last hours reach the marker. Ordinary scrolling
and pinch zoom cancel selection. Desktop users can
click a sea location. Drag or scroll the graph horizontally, use its arrow keys,
or step an hour with the buttons. No preview parameter is needed.

Switch to **Table** for a vertically scrollable hourly forecast with Wind, Waves
and Swell columns and arrows showing direction of travel. Tap a row to select
its hour and update the maps. Both views open as a dedicated page, with no map
behind it. **← Maps** returns to the standard images and **Forecast →** reopens
the selected location without using browser navigation. Switching views preserves
the selected hour and plotted quantity. The thumbnail remains available for
adjusting the location.

**Copy live link** saves the selected sea point and view while opening the latest
forecast hour on the next visit. Use this link for a phone home-screen shortcut.
**Share this hour** instead shares an explicit UTC timestamp through the phone's
share sheet (or copies it on browsers without sharing support). The address bar
also follows changes, so copying it or saving it to the home screen restores the
current settings. Use **Copy live link** first to clear a shared timestamp.

URL parameters are `lat`, `lon` (decimal model coordinates), `map` and `quantity`
(`wind`, `waves`, `swell`), `view` (`graph`, `table`), `detail` (`1` open, `0` maps),
`time` (`now` or an ISO timestamp with timezone), and `row` (zero-based
table scroll position for live links). Existing `#time=...` links still work.
The legacy `full` parameter is accepted; all detail links now use the full page.

The table's **Level cm** column uses a nearby Swedish station, named with its
distance below the forecast. Values are signed centimetres relative to that
station's local mean water level (SMHI's RW parameter 14), rather than RH 2000.
Plain values are observations within ten minutes of the table hour; **≈** marks
our derived forecast estimate. Expand the station note for the latest reading,
its time, the forecast method, model run, and provider/license links.

Water-level forecasts use DMI DKSS's predicted changes at the station's nearest
valid sea cell (within 10 km). We align them to SMHI RW observations using the
median observation-minus-model difference over the latest available hour, with
at least three paired samples. This handles the different zero references without
assuming raw DMI levels equal Swedish local mean levels. It is this site's
station forecast estimate, not an official SMHI forecast or a harbour-level
prediction at the tapped map point. No spatial interpolation or extrapolation
past the DMI forecast is performed. Suspect observations are excluded; unchecked
real-time observations are labelled provisional in the station note.

`scripts/water_level.py` fetches all current station observations in one SMHI
request and caches DMI values for each model run. It uses DMI's documented GRIB
index and HTTP range downloads to fetch only the surface water-level field for
all stations together (about 8 MB per complete run), checking parameter, bitmap,
grid and run/hour identity with ecCodes. Bounded, conservatively spaced point
queries provide a fallback. The independent **Update free water levels**
workflow refreshes the `water-data` branch every 20 minutes as a parallel job in
the main forecast workflow. The existing Cloudflare scheduler dispatches that
workflow reliably; the water refresh does not rely on a separate GitHub cron.
Both sources are
free and reusable with CC BY 4.0 attribution. The browser downloads just this
small snapshot when location details are opened, never queries each provider
per visitor, and caches it for ten minutes. The nearest station with both data
types within 100 km is preferred, falling back to observations alone. Readings
older than two hours, old model runs, unavailable hours, and distant stations
are omitted. A water-data outage leaves wind, waves and swell usable.

Check the collector with `python -m unittest discover -s tests -p test_water_level.py`,
the portable display logic with `node tests/water-level.cjs`, and the phone UI
with `tests/point-water.js` after `tests/point-preview.js` in the local browser.
Shared hours outside the current forecast select the nearest available hour;
links do not archive old model runs. Map pinch zoom is controlled by the browser.
Check URL parsing with `node tests/viewer-state.cjs`. In a local browser with the
real `output/point-fixture` data, run `tests/point-preview.js` followed by
`tests/point-views.js`; use `tests/point-restore.js` on a fresh saved URL to check
automatic restoration.

The graph leaves daylight clear, with neutral grey shading for civil twilight
and night (dusk to dawn). The table uses the same shading on hourly rows and adds
timed dawn, sunrise, sunset and dusk separators. Graph sunrise and sunset markers
and table events use the same device-local time as the timeline. These
are sea-level astronomical estimates for the selected model coordinates, using
vendored [SunCalc 1.9.0](https://github.com/mourner/suncalc/tree/v1.9.0) under its
BSD-2-Clause license in `vendor/suncalc-LICENSE`. Polar day/night are supported.
The calculation runs locally; no solar-data service is contacted. Check it with
`node tests/solar.cjs`.

The viewer also places a transparent SVG land/coastline layer over each PNG and
inside the location thumbnail. The layer uses the same Natural Earth 10 m
geography, Lambert projection and image bounds as the renderer, retaining island
vertices for smooth zooming. Forecast colours and arrows remain raster images.
Each snapshot publishes `plots/coastline.svg` once and lists it in `run.json`;
the three maps share that pinned asset. Cached renderer-3 snapshots use the
bundled `coastline-v1.svg`, which has the same projection and bounds; earlier
snapshots retain their PNGs. Regenerate the bundled asset if those bounds change.
The maps retain their image dimensions and stacked mobile layout.

## Publishing

The renderer also publishes a projected sea-point index and small, lazily loaded
hourly data chunks in `plots/`. These use the same provider, run, timestamps and
commit as the maps, including DWD fallback. Values are quantized to 0.01 m/s or m
and directions to 0.1 degrees; missing values remain missing. Selection uses
the nearest sea model point within a small map distance, and displays its
coordinates. It does not interpolate harbour conditions or request live provider
data from visitors' phones.

The existing scheduler checks every 20 minutes. A complete run's provider,
timestamps, URLs and renderer version identify it, so unchanged forecasts do not
download or render again. A new run produces three PNGs per hour, using the same
`win.ba.N.png`, `hs.ba.N.png` and `hsw.ba.N.png` names as before. All output is
staged before publication; `run.json` appears only once the whole sequence works.
Only downloads run in a background thread; native GRIB decoding and plotting
stay on the main thread so decoder caches do not outlive worker threads.
The workflow publishes commit-pinned images on the `data` branch. The site still
uses manifest schema 2 and retains the selected forecast time across updates.

When changing rendering or interpretation, increment `VERSION` in
`scripts/forecast.py` so the next check regenerates the images.

## Public access and reuse

The viewer has no login. Its source notice follows the currently displayed
provider, with links to DMI's CC BY 4.0 licence or DWD's reuse terms. The maps
are our own rendering of model data, with no provider endorsement; forecasts
can contain errors and users should consult official warnings before sailing.

A `noindex, nofollow` robots meta tag discourages search indexing and link
following by compliant crawlers. It does not block requests or protect the
public images. GitHub Pages project sites cannot set a host-root `robots.txt`
from this repository. Visitors fetch saved images from GitHub, never DMI/DWD
or the rendering workflow. Update checks stop in hidden tabs and are spaced
at least one minute apart per tab; automatic checks remain every ten minutes.
Client-side throttling limits ordinary browser traffic, not hostile bots.
If abusive traffic becomes a problem, use hosting/CDN controls for server-side
rate limiting; a client-side password or CAPTCHA alone cannot protect the
public image URLs.
