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
direction). The Baltic framing intentionally excludes the Norwegian Sea and
Kattegat. It is a visualization of model forecasts, not a new forecast model.
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

## Publishing

The existing scheduler checks every 20 minutes. A complete run's provider,
timestamps, URLs and renderer version identify it, so unchanged forecasts do not
download or render again. A new run produces three PNGs per hour, using the same
`win.ba.N.png`, `hs.ba.N.png` and `hsw.ba.N.png` names as before. All output is
staged before publication; `run.json` appears only once the whole sequence works.
The workflow publishes commit-pinned images on the `data` branch. The site still
uses manifest schema 2 and retains the selected forecast time across updates.

When changing rendering or interpretation, increment `VERSION` in
`scripts/forecast.py` so the next check regenerates the images.
