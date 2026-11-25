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
behind it. **← Back** returns to the Wind, Waves or Swell map selected in the
detail view. **Last forecast point** reopens that location. Switching views preserves
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

## Live station observations

The **Live** button in the forecast header (separate from Graph/Table) opens a separate phone-friendly page with a station map,
nearby-station table and individual station readings. Wind, waves and water
level and surface water temperature appear together on the map with distinct symbols and a compact key.
The approved small joined-symbol marker groups each station's coloured symbols
and values beside one small station anchor, with no surrounding card. Each
reading is directly tappable and opens the station timeline in one step.
Different stations at identical coordinates are laid out beside each other;
zooming separates nearby stations without opening a numbered cluster. The Live
map shows offshore and coastal stations, including inland points within about
15 km of the coast. The map uses a bundled Natural Earth mask generated by
`scripts/coastal_stations.py`. Larger wind and wave symbols indicate stronger
readings. Parameter filters
are available in the nearby-station table. Tap a marker or station name to see its values,
measurement times, operator and provisional status. **Live map** returns to the
shared map. **Forecast ↓** jumps to the station forecast in the same timeline.
**Last forecast point** reopens the last selected forecast location from the map
or a live station page.
**Copy link** saves the current layer, station and view, always using the latest
available observations. For example, `?view=live&detail=1` opens the combined station map;
`liveTab=nearby&liveLayer=waves` opens the nearby buoy list, and
`liveTab=station&station=sea-33003` selects Finngrundet.
Existing forecast coordinates remain the origin for nearby-station distances.

`scripts/live_observations.py` uses documented, free SMHI batch observation
feeds: metobs parameters 4/3/21 (wind, direction, gust), and ocobs parameters
1/7/14/5 (significant wave height, wave direction, water level relative to local
mean, surface water temperature in °C). Only depth-0 temperature samples with
valid ocean quality are used. Temperature appears at stations that actually
report it, with its own timestamp and provisional status. Its history is
available from the temperature marker; unavailable temperature forecasts stay
blank. The collector also reads Sjöfartsverket ViVa's public station catalog and
seven batch feeds (wind, gust, wind direction, wave height/direction, water level
and temperature), without an account or paid service. Stations absent from SMHI
are added with stable `viva-<ID>` links. Matching normalized names within 1.5 km
are combined under the existing SMHI ID (including known buoy name variants);
proximity alone never merges stations. Each quantity uses its newest valid
observation, retaining ViVa identity for on-demand history. ViVa values must
have quality `Ok`; levels must explicitly use `MVY` (local mean), excluding
RH2000/chart-datum/lake readings. ViVa sensor depths are unspecified and are
labelled **Water temperature**, without claiming a surface measurement.
Swedish local timestamps are converted with summer/winter time; ambiguous DST
hours are skipped. ViVa history has no per-sample quality flags and is marked
provisional. Both sources remain independently usable during provider failures.
ViVa's public website endpoints are an external dependency, not a versioned
SMHI Open Data contract. Wind is generally reported hourly; this is a latest-observation view,
not a continuously streamed instrument feed. Each value retains its own time.
Missing directions stay missing and values older than two hours are hidden.
Unchecked meteorological readings are labelled provisional; suspect ocean
readings are excluded. Partial provider failures retain healthy feeds.


Finnish wind stations and wave/temperature buoys come directly from FMI's free
WFS `weather::timevaluepair` and `wave::timevaluepair` observation queries.
Two shared batch requests cover the latest two hours at 10-minute steps, within
19–32°E, 59–66°N (Finland's Baltic coast, Åland and neighbouring inland weather
stations). Parameters are windspeedms/winddirection/windgust (m/s, degrees),
WaveHs (significant wave height, m), ModalWDi (peak wave direction, degrees from)
and TWATER (water temperature, °C). FMI water levels are not requested.
The collector validates the WFS schema, parameter identity, fmisid, coordinate
system/axis order, UTC times and value ranges; NaN and stale values are missing.
FMI's response has no per-sample quality flags, so readings are labelled
provisional. Buoy temperature has a generic label because sensor depths vary.
Each station has a stable `fmi-<fmisid>` bookmark; tapping a marker loads the
last 24 hours directly from FMI in one station-specific request, with the first valid
sample per hour and visible gaps. Seasonal buoys disappear when they stop
reporting. FMI data is credited separately under CC BY 4.0; the service is free
and does not require an API key. One FMI feed failing does not hide other feeds.

The reusable **Update live station observations** workflow refreshes the
`live-data` branch alongside water levels through the existing reliable
20-minute forecast scheduler. Visitors fetch one cached snapshot, rather than
querying providers station by station for the map. SMHI data uses CC BY 4.0 attribution;
ViVa is separately credited to Sjöfartsverket with a source link.
The station map lazily loads vendored Leaflet 1.9.4 (BSD-2-Clause, licence in
`vendor/leaflet/LICENSE`) and standard OpenStreetMap tiles with visible
attribution. Station and nearby-table bookmarks do not load the map library
until the map is opened.

Opening a station loads an **Hourly timeline** with fixed Wind, Waves, Swell
and Level columns. It opens at the latest observed hour: scroll downward into the
future forecast, upward into the last 24 hours of measurements. A highlighted
latest reading appears at its actual measurement time when a newer sample is
available. Measured rows show all observations available for the station,
regardless of which value was tapped on the map. Forecast rows show all four quantities when
available, using a distinct background, explicit labels and a measured/predicted
boundary. **Latest** returns to the newest reading, **Forecast ↓** jumps to the first forecast and
**Details** returns to the current station readings. Dates include a short weekday. There is one vertical
scroll area and column headings stay visible on phones.

History requests only the selected station's available measurements from SMHI's
`latest-day` endpoints, sequentially and on demand; successful results are cached
for ten minutes. Each hourly row shows the first valid sample in that UTC hour.
The row label shows the hour in device-local time, with the actual measurement
time below each observed value. Missing hours have blank readings, and
provisional readings have an asterisk. Closing
the view or switching stations cancels pending requests.

Future wind, waves and swell use the same commit-pinned sea model data as the
maps, selecting the nearest valid point within 20 km of the station. The point's
distance, provider and model run are stated; inland stations outside that range
retain their measured history. Water levels use the existing station-aligned
estimate and show the station name and distance. For a water gauge, only that
same gauge's forecast is accepted. No forecasts are relabelled as observations,
no missing hours are interpolated and model horizons are not extended. History
and forecast outages leave current station readings usable independently.

Check parsing/cache behaviour with `node tests/live-history.cjs` and model
identity, nearest-point limits and timeline separation with
`node tests/live-forecast.cjs`. After `tests/point-preview.js` in the browser,
`tests/live-history-view.js` checks delayed station switches and history outages;
`tests/live-timeline.js` checks all four future columns, observation isolation,
phone layout and scroll navigation.

Check parsing with `python -m unittest discover -s tests -p test_live_observations.py`
and `node tests/live-data.cjs`. Run `tests/live-view.js` after
`tests/point-preview.js` in a browser to check navigation, station selection,
bookmarks and stale readings; `tests/live-view-zoom.js` checks viewport sizing.
`tests/live-viva.js` runs on the default map with the short vector fixture to
check merged-source history, additional stations, temperature depth labels,
phone table fit and saved ViVa station links (including merged aliases).
`tests/live-joined-markers.js` checks the combined station badges, transparent backgrounds,
co-located stations, direct reading taps and saved quantity links.
`tests/live-fmi.js` additionally checks FMI XML history parsing, station identity,
missing values, wind/buoy/temperature selection, saved links and failure recovery.

Forecast maps, graph lines and the dots beneath table direction arrows share
the exact value thresholds and colours in `forecast-colors.json`. Graph
colours change at those thresholds along the value axis. The Python renderer
and browser both read this file; `node tests/forecast-colors.cjs` checks the
boundaries. `tests/point-colors.js` checks the graph and table presentation.

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

## Interactive forecast map

The map navigation links to Wind, Waves, Swell and Live pages. Each mode has a
shareable URL and supports browser Back and Forward. The pages share a zoomable
map and retain the selected forecast hour and map position when switching modes.
The hourly slider sits beneath the forecast map. Hold a sea location to open the hourly graph or table.
Each live station has one badge, with its available readings listed beside it.
**Image charts** in the footer returns to the stacked charts. The map choice is retained in saved links. `?mapDisplay=images` keeps the
legacy charts available; their footer offers **Interactive map** to return.
Old saved Live-map links open the shared map, while station/nearby-table links
retain their dedicated detail view.

Renderer 5 publishes true SVG colour-band contours and direction arrows in
EPSG:3857 alongside the PNGs. The SVGs contain paths, with no embedded bitmap.
Each carries its forecast identity, valid hour and quantity, checked by the
viewer before display. A shared vector sea/land clipping mask is downloaded
once per model run. Arrows stay a steady on-screen size after map zoom. Renderer 6 additionally
publishes compact per-hour model fields in `flow.N.json`, paired with the pinned
sea-point geography. The browser chooses nearby model directions using screen
spacing, reducing crowding when zoomed out and revealing finer sampling when
zoomed in. It uses measured grid positions, without inventing sub-grid detail. Bands
remain crisp when zoomed, while the model's spatial resolution stays unchanged.
Existing renderer-3/4 snapshots retain the browser-reprojected raster fallback.
PNG image charts and graph/table exports remain available.

**Live** uses the same Leaflet map object, centre and zoom, replacing the forecast
layer with observed station markers and hiding the forecast time slider and
legend while reserving their layout space, keeping the map window steady.
Tapping a station opens its existing readings/timeline; **Maps** (or the
station Map tab) returns to that shared map. Switching back to Wind/Waves/Swell
restores the forecast hour. Station data and marker drawing are shared with the
standalone Live view; automatic refresh and stale-reading checks are retained.
The map layer choice is saved as `mapLayer=live` in links.

Vector timeline changes load the SVG directly, without waiting for the three
hidden PNG charts. The previous layer and its actual timestamp stay visible
until the replacement SVG and directions are ready, then swap together in one
frame. The slider thumb follows the finger immediately; drag events are
coalesced per animation frame and cold requests are briefly deferred during a
fast sweep. The current quantity's two neighbouring hours in each direction
are prefetched with bounded, low-priority requests. Parsed geometry and hourly
directions are cached with fixed limits. The Images fallback loads the matching
PNGs before leaving the map, so it also retains the correct hour. SVG markup uses an explicit element and
attribute allowlist. Image prefetching pauses in interactive mode. The detailed
base map is OpenStreetMap, with its attribution retained in every layer.

Check projection alignment with `node tests/forecast-projection.cjs`. In the
browser, run `tests/forecast-map.js` after `tests/point-preview.js` to check
quantity/time consistency, zooming, the fixed slider, gesture cancellation,
long-press details and the image fallback. Generate a short real vector fixture
with `python scripts/forecast.py output/vector-fixture --max-frames 2`, then run
`tests/forecast-vector.js` in the browser to check true SVG rendering, arrow size,
shared Live markers, slider visibility and restoration of time/map position.
`tests/forecast-playback.js` exercises delayed loads, rapid reversals, cached
hours, no blank frames, matching time labels and the absence of PNG requests
during vector playback. `node tests/forecast-arrows.cjs` checks adaptive spacing,
directions and frame identity.

## Reloading an installed home-screen app

A discreet **Reload app** control is available in the Maps, Forecast and Live
footers. It reloads the current location/view using a unique document URL and
HTTP cache revalidation, then adds that recovery token to app scripts, the
shared colour palette and lazily loaded Leaflet JS/CSS. Inline CSS comes from
the fresh document. The token is removed from the address bar after startup so
copied and saved links stay clean. This fetches fresh app files without deleting
browser data or affecting other sites. Provider and immutable forecast URLs are
unchanged. The recovery control is initialized inline, independently of optional
forecast scripts, so it remains available if those scripts fail to load.
Check recovery behaviour with `node tests/app-refresh.cjs`.

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
