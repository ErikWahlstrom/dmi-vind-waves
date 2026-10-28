"""Render Baltic wind, waves and swell from DMI WAM, with DWD EWAM backup.

All frames in a snapshot come from one provider and model run. Publication is
left to the existing workflow, which pins images and run.json to Git commits.
"""
import argparse
import bz2
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from http.client import IncompleteRead
import json
import os
from pathlib import Path
import re
import ssl
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np

UTC = timezone.utc
VERSION = 1
DMI = 'https://opendataapi.dmi.dk/v1/'
DWD = 'https://opendata.dwd.de/weather/maritime/wave_models/ewam/grib/'
# Use numeric DMI table 140 identifiers: generic wgrib index labels can be wrong.
PARAMETERS = {245: 'wind', 249: 'wind_dir', 229: 'wave', 230: 'wave_dir',
              237: 'swell', 238: 'swell_dir'}
DWD_FIELDS = {'sp_10m': 'wind', 'dd_10m': 'wind_dir', 'swh': 'wave',
              'mwd': 'wave_dir', 'shts': 'swell', 'mdts': 'swell_dir'}
DWD_PARAMETERS = {'sp_10m': (0, 2, 1), 'dd_10m': (0, 2, 0),
                  'swh': (10, 0, 3), 'mwd': (10, 0, 14),
                  'shts': (10, 0, 8), 'mdts': (10, 0, 7)}
PLOTS = {'win': ('wind', 'WIND AT 10 M', 'm/s'),
         'hs': ('wave', 'SIGNIFICANT WAVE HEIGHT', 'm'),
         'hsw': ('swell', 'SWELL HEIGHT', 'm')}


class SourceUnavailable(Exception):
    """A provider has no fresh, complete forecast or cannot be reached."""


def iso(value):
    return value.astimezone(UTC).isoformat().replace('+00:00', 'Z')


def parse_time(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(UTC)


def request(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'Baltic-forecast-renderer/1'}), timeout=45) as response:
                data = response.read()
                length = response.headers.get('Content-Length')
                if length and len(data) != int(length):
                    raise ConnectionError('Interrupted download')
                return data
        except HTTPError as error:
            if error.code not in (404, 408, 429) and not 500 <= error.code < 600:
                raise
            failure = error
            if error.code == 404:
                break
        except URLError as error:
            if isinstance(error.reason, ssl.SSLError):
                raise
            failure = error
        except (TimeoutError, ConnectionError, IncompleteRead) as error:
            failure = error
        if attempt < 2:
            time.sleep(2 ** (attempt + 1))
    raise SourceUnavailable(f'{url}: {failure}') from failure


def read_json(url):
    return json.loads(request(url))


@dataclass
class Step:
    time: datetime
    published: datetime
    urls: dict


@dataclass
class Forecast:
    provider: str
    run: datetime
    steps: list

    def identity(self):
        return sha256(json.dumps({'version': VERSION, 'provider': self.provider,
                                 'run': iso(self.run), 'steps': [
                                     [iso(s.time), iso(s.published), s.urls]
                                     for s in self.steps]}, sort_keys=True).encode()).hexdigest()


def validate_steps(steps, run, hours, now):
    steps = sorted(steps, key=lambda s: s.time)
    expected = [run + timedelta(hours=i) for i in range(hours + 1)]
    if [s.time for s in steps] != expected:
        raise SourceUnavailable('Model run is still incomplete or has duplicate forecast hours')
    if not steps[0].time <= now < steps[-1].time - timedelta(hours=24):
        raise SourceUnavailable('Forecast has insufficient future coverage')
    return steps


def dmi_forecast(now):
    instances = read_json(DMI + 'forecastedr/collections/wam_nsb/instances')['instances']
    runs = sorted((datetime.strptime(x['id'], '%Y-%m-%dT%H%M%SZ').replace(tzinfo=UTC)
                   for x in instances), reverse=True)
    for run in runs:
        if not timedelta(0) <= now - run <= timedelta(hours=18):
            continue
        query = urlencode({'modelRun': iso(run), 'limit': 1000})
        items = read_json(DMI + 'forecastdata/collections/wam_nsb/items?' + query)['features']
        steps = []
        for item in items:
            props = item['properties']
            if parse_time(props['modelRun']) != run:
                raise ValueError('DMI returned data from another model run')
            # Current DMI STAC uses singular "asset"; also accept standard assets.
            assets = item.get('asset', item.get('assets', {}))
            url = assets['data']['href']
            if not url.startswith(('https://dmi-opendata.s3.', 'https://opendataapi.dmi.dk/')):
                raise ValueError('Unexpected DMI download host')
            steps.append(Step(parse_time(props['datetime']), parse_time(props['created']), {'grib': url}))
        try:
            return Forecast('DMI WAM', run, validate_steps(steps, run, 132, now))
        except SourceUnavailable:
            continue
    raise SourceUnavailable('No complete DMI WAM run within 18 hours')


def dwd_forecast(now):
    # DWD publishes 00/12 UTC runs, retaining more than one run in each folder.
    listings = {}
    for cycle in ('00', '12'):
        unavailable = False
        for field in DWD_FIELDS:
            url = DWD + cycle + '/' + field + '/'
            try:
                listing = request(url).decode()
            except SourceUnavailable:
                # One bounded retry sequence is enough to detect a host outage.
                # Keep already discovered complete runs, but do not spend the
                # entire workflow timeout probing every folder on a dead host.
                unavailable = True
                break
            for filename, stamp, hour in re.findall(
                    r'href="(EWAM_[A-Z0-9_]+_(\d{10})_(\d{3})\.grib2\.bz2)"', listing):
                run = datetime.strptime(stamp, '%Y%m%d%H').replace(tzinfo=UTC)
                if timedelta(0) <= now - run <= timedelta(hours=30):
                    listings.setdefault(run, {}).setdefault(int(hour), {})[field] = url + filename
        if unavailable:
            break
    for run, hours in sorted(listings.items(), reverse=True):
        # The direct EWAM feed currently supplies 0..78 h. Do not extrapolate.
        steps = [Step(run + timedelta(hours=h), run, urls) for h, urls in hours.items()
                 if set(urls) == set(DWD_FIELDS) and h <= 78]
        try:
            return Forecast('DWD EWAM', run, validate_steps(steps, run, 78, now))
        except SourceUnavailable:
            continue
    raise SourceUnavailable('No complete DWD EWAM run within 30 hours')


def grib_time(handle, prefix):
    import eccodes as ec
    return datetime.strptime(f'{ec.codes_get(handle, prefix + "Date"):08d}'
                             f'{ec.codes_get(handle, prefix + "Time"):04d}',
                             '%Y%m%d%H%M').replace(tzinfo=UTC)


def decode(data, run, valid, field=None):
    """Decode with ecCodes and preserve the native sea/land bitmap."""
    import eccodes as ec
    result = {}
    grid = None
    # ecCodes file readers require a real file descriptor.
    with tempfile.TemporaryFile() as source:
        source.write(data)
        source.seek(0)
        while (handle := ec.codes_grib_new_from_file(source)) is not None:
            try:
                if grib_time(handle, 'data') != run or grib_time(handle, 'validity') != valid:
                    raise ValueError('GRIB run/valid time differs from the catalogue')
                if field is None:
                    if (ec.codes_get(handle, 'edition') != 1 or
                            ec.codes_get(handle, 'centre', str) != 'ekmi' or
                            ec.codes_get(handle, 'table2Version') != 140):
                        raise ValueError('Unexpected DMI GRIB encoding')
                    key = PARAMETERS.get(ec.codes_get(handle, 'indicatorOfParameter'))
                else:
                    parameter = tuple(ec.codes_get(handle, k) for k in
                                      ('discipline', 'parameterCategory', 'parameterNumber'))
                    if parameter != DWD_PARAMETERS[field]:
                        raise ValueError('DWD GRIB parameter differs from the requested field')
                    key = DWD_FIELDS[field]
                if key is None:
                    continue
                ni, nj = ec.codes_get(handle, 'Ni'), ec.codes_get(handle, 'Nj')
                lat = ec.codes_get_array(handle, 'latitudes').reshape(nj, ni)
                lon = ec.codes_get_array(handle, 'longitudes').reshape(nj, ni)
                lon = (lon + 180) % 360 - 180
                if grid is not None and (not np.array_equal(grid[0], lon) or not np.array_equal(grid[1], lat)):
                    raise ValueError('Forecast fields have different grids')
                grid = (lon, lat)
                values = ec.codes_get_values(handle).reshape(nj, ni)
                missing = values == ec.codes_get(handle, 'missingValue')
                values = np.where(missing | ~np.isfinite(values), np.nan, values)
                finite = values[np.isfinite(values)]
                maximum = 360 if key.endswith('_dir') else (100 if key == 'wind' else 50)
                # Packed angles can be just above 360 through quantization.
                tolerance = .5 if key.endswith('_dir') else .01
                if not finite.size or finite.min() < -tolerance or finite.max() > maximum + tolerance:
                    raise ValueError(f'Invalid {key} values at {iso(valid)}: '
                                     f'{finite.min() if finite.size else "empty"}..'
                                     f'{finite.max() if finite.size else "empty"}')
                values = values % 360 if key.endswith('_dir') else np.maximum(values, 0)
                if key in result:
                    raise ValueError(f'Duplicate {key} field')
                result[key] = values
            finally:
                ec.codes_release(handle)
    if not result or (field is None and set(result) != set(PARAMETERS.values())):
        raise ValueError('GRIB is missing required fields')
    return grid, result


def download_step(forecast, step):
    """Only network I/O runs in the prefetch thread; no native decoder state."""
    return {field: request(url) for field, url in step.urls.items()}


def load_step(forecast, step, downloaded=None):
    downloaded = download_step(forecast, step) if downloaded is None else downloaded
    if forecast.provider == 'DMI WAM':
        return decode(downloaded['grib'], forecast.run, step.time)
    grid, result = None, {}
    for field, url in step.urls.items():
        try:
            data = bz2.decompress(downloaded[field])
        except (OSError, EOFError) as error:
            raise SourceUnavailable(f'Incomplete DWD download: {url}') from error
        field_grid, values = decode(data, forecast.run, step.time, field)
        if grid is not None and (not np.array_equal(grid[0], field_grid[0]) or
                                 not np.array_equal(grid[1], field_grid[1])):
            raise ValueError('DWD fields have different grids')
        grid = field_grid
        result.update(values)
    if set(result) != set(PARAMETERS.values()):
        raise ValueError('DWD step is missing required fields')
    return grid, result


def vectors(direction):
    # Both providers use meteorological "from" directions; arrows show travel.
    angle = np.deg2rad(direction)
    return -np.sin(angle), -np.cos(angle)


class Renderer:
    def __init__(self, grid):
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import cartopy.crs as ccrs
        import cartopy.feature as cfeature
        from matplotlib.colors import ListedColormap, BoundaryNorm
        from shapely.geometry import Polygon
        import shapely
        self.plt = plt
        self.crs = ccrs.PlateCarree()
        self.projection = ccrs.LambertConformal(central_longitude=20, central_latitude=60,
                                               standard_parallels=(55, 65))
        lon, lat = grid
        crop = (lon >= 8.5) & (lon <= 32) & (lat >= 53) & (lat <= 66.5)
        rows, cols = np.where(crop)
        if not len(rows):
            raise ValueError('Forecast grid does not cover the Baltic')
        self.slice = (slice(rows.min(), rows.max() + 1), slice(cols.min(), cols.max() + 1))
        self.lon, self.lat = lon[self.slice], lat[self.slice]
        # The familiar chart is the Baltic basin, excluding Kattegat and the
        # Norwegian Sea. This boundary crosses land; it is not a coastal model.
        basin = Polygon([(9, 53), (32, 53), (32, 66.5), (16, 66.5),
                         (16, 58.5), (12.6, 58.5), (12.6, 56), (9, 56)])
        self.basin_mask = shapely.contains_xy(basin, self.lon, self.lat)
        coastline = cfeature.NaturalEarthFeature('physical', 'coastline', '10m')
        coasts = [g.intersection(basin) for g in coastline.intersecting_geometries((9, 32, 53, 66.5))]
        points = self.projection.transform_points(self.crs, self.lon, self.lat)
        self.x, self.y = points[..., 0], points[..., 1]
        colours = ['#dddddd', '#9999ff', '#0000ff', '#0088ff', '#00eeee', '#00ff00',
                   '#99ff00', '#ffff00', '#ffbb00', '#ff8800', '#ff4400', '#bb0000']
        self.maps = {}
        for kind, (key, title, unit) in PLOTS.items():
            levels = ([0, .5, 1.5, 3, 5, 8, 11, 14, 18, 21, 25, 29, 32]
                      if key == 'wind' else [0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12, 14])
            wave_colours = ['#dddddd', '#9999ff', '#0000ff', '#0088ff', '#00eeee', '#00ffaa',
                            '#00ff00', '#99ff00', '#ffff00', '#ffbb00', '#ff8800', '#ff4400',
                            '#ee0000', '#cc0000', '#aa0000']
            cmap = ListedColormap(colours if key == 'wind' else wave_colours)
            cmap.set_over('#ff00ff')
            norm = BoundaryNorm(levels, cmap.N)
            fig = plt.figure(figsize=(9, 6.75), dpi=100, facecolor='white')
            ax = fig.add_axes([.172, .06, .61, .90], projection=self.projection)
            ax.set_extent([9, 31.5, 53.5, 66.2], crs=self.crs)
            ax.set_aspect('auto')
            ax.add_feature(cfeature.NaturalEarthFeature('physical', 'land', '10m',
                                                       edgecolor='none', facecolor='white'), zorder=3)
            ax.add_geometries(coasts, crs=self.crs, edgecolor='black', facecolor='none',
                              linewidth=.45, zorder=5)
            for latitude in np.arange(52, 68, 2):
                ax.plot(np.linspace(0, 40, 150), np.full(150, latitude), transform=self.crs,
                        color='black', linestyle=(0, (1, 4)), linewidth=.8, zorder=4)
            for longitude in np.arange(0, 40, 2):
                ax.plot(np.full(150, longitude), np.linspace(50, 70, 150), transform=self.crs,
                        color='black', linestyle=(0, (1, 4)), linewidth=.8, zorder=4)
            for spine in ax.spines.values():
                spine.set_linewidth(1.2)
            bar_ax = fig.add_axes([.802, .16, .018, .72])
            scalar = matplotlib.cm.ScalarMappable(norm=norm, cmap=cmap)
            bar = fig.colorbar(scalar, cax=bar_ax, boundaries=levels, ticks=levels[1:],
                               spacing='uniform', extend='max')
            bar.ax.tick_params(labelsize=9, length=0)
            bar.ax.set_title(unit, fontsize=10, fontweight='bold', loc='left')
            # Fixed header box, keeping title and actual valid time separate.
            header = fig.add_axes([.172, .962, .61, .036], facecolor='black')
            header.set_xticks([]); header.set_yticks([])
            header.text(.008, .5, title, color='white', fontsize=9, va='center', fontweight='bold')
            stamp = header.text(.992, .5, '', color='white', fontsize=9, va='center', ha='right',
                                fontfamily='DejaVu Sans Mono')
            credit = fig.text(.172, .027, '', fontsize=7, color='#444444')
            self.maps[kind] = (fig, ax, cmap, norm, levels, stamp, credit)

    def render(self, fields, step, forecast, output, index):
        files = {}
        for kind, (key, _, _) in PLOTS.items():
            fig, ax, cmap, norm, levels, stamp, credit = self.maps[kind]
            values = np.where(self.basin_mask, fields[key][self.slice], np.nan)
            direction = fields[key + '_dir'][self.slice]
            if not np.isfinite(values).any():
                raise ValueError('Empty Baltic forecast')
            contour = ax.contourf(self.x, self.y, values, levels=levels, cmap=cmap, norm=norm,
                                  extend='max', zorder=1, corner_mask=False)
            # Subsample in geography, then rotate earth-relative arrows to the map.
            stride = (slice(None, None, 10), slice(None, None, 8))
            u, v = vectors(direction[stride])
            u, v = self.projection.transform_vectors(self.crs, self.lon[stride], self.lat[stride], u, v)
            visible = np.isfinite(values[stride]) & (values[stride] >= (.5 if key == 'wind' else .1))
            arrows = ax.quiver(self.x[stride][visible], self.y[stride][visible], u[visible], v[visible],
                               angles='xy', scale_units='inches', scale=10, width=.0018,
                               headwidth=3.5, headlength=4, zorder=5)
            stamp.set_text(step.time.strftime('%Y %b %d %HGMT').upper())
            license_text = 'CC BY 4.0' if forecast.provider == 'DMI WAM' else 'DWD Open Data'
            credit.set_text(f'{forecast.provider} · run {forecast.run:%d %b %Y %H} UTC · '
                            f'Own rendering · {license_text}')
            name = f'{kind}.ba.{index}.png'
            fig.savefig(output / name, dpi=100)
            contour.remove(); arrows.remove()
            files[kind] = name
        return files

    def close(self):
        for fig, *_ in self.maps.values():
            self.plt.close(fig)


def render_forecast(forecast, output, previous=None, max_frames=None):
    identity = forecast.identity()
    if previous and not previous.get('preview') and previous.get('forecastIdentity') == identity:
        print(f'{forecast.provider}: complete run unchanged; keeping existing images.', flush=True)
        return False
    steps = forecast.steps[:max_frames] if max_frames else forecast.steps
    # Stage everything: run.json appears only after all three images at all hours succeed.
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        staging = Path(tmp)
        plots = staging / 'plots'
        plots.mkdir()
        renderer = None
        frames = []
        try:
            # Bounded prefetch avoids holding the entire forecast in memory.
            # Keep ecCodes and plotting on the main thread. In particular,
            # ecCodes native caches must not outlive a decoding worker thread.
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(download_step, forecast, steps[0])
                for i, step in enumerate(steps, 1):
                    downloaded = future.result()
                    if i < len(steps):
                        future = pool.submit(download_step, forecast, steps[i])
                    grid, fields = load_step(forecast, step, downloaded)
                    if renderer is None:
                        renderer = Renderer(grid)
                        reference_grid = grid
                    elif not all(np.array_equal(a, b) for a, b in zip(reference_grid, grid)):
                        raise ValueError('Forecast grid changed between hours')
                    files = renderer.render(fields, step, forecast, plots, i)
                    frames.append({'time': iso(step.time), 'published': iso(step.published), 'files': files})
                    if i == 1 or i % 12 == 0 or i == len(steps):
                        print(f'Rendered {i}/{len(steps)} hours from {forecast.provider}.', flush=True)
        finally:
            if renderer:
                renderer.close()
        manifest = {'schema': 2, 'generatorVersion': VERSION, 'forecastIdentity': identity,
                    'preview': max_frames is not None,
                    'provider': forecast.provider, 'modelRun': iso(forecast.run),
                    'checked': iso(datetime.now(UTC)), 'frames': frames,
                    'attribution': ('DMI, CC BY 4.0, own rendering; https://creativecommons.org/licenses/by/4.0/'
                                    if forecast.provider == 'DMI WAM' else 'DWD Open Data, own rendering')}
        (staging / 'run.json').write_text(json.dumps(manifest) + '\n')
        if output.exists():
            raise ValueError('Output directory must not already exist')
        staging.rename(output)
    return True


def capture(output, previous=None, provider='auto', max_frames=None, now=None):
    now = now or datetime.now(UTC)
    sources = [('dmi', dmi_forecast), ('dwd', dwd_forecast)]
    for name, discover in sources:
        if provider not in ('auto', name):
            continue
        try:
            forecast = discover(now)
            print(f'Using {forecast.provider}, run {iso(forecast.run)}; {len(forecast.steps)} hours.', flush=True)
            return render_forecast(forecast, output, previous, max_frames)
        except SourceUnavailable as error:
            print(f'{name.upper()} unavailable: {error}', flush=True)
    print('All forecast sources unavailable; retaining the saved snapshot.', flush=True)
    if path := os.environ.get('GITHUB_OUTPUT'):
        with open(path, 'a') as report:
            report.write('source_unavailable=true\n')
    if path := os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(path, 'a') as report:
            report.write('### Forecast refresh skipped\n\nDMI and DWD could not supply a fresh complete '
                         'forecast. Saved images retained; the next run will retry.\n\n')
            if previous and previous.get('checked'):
                report.write(f'Last snapshot: {previous["checked"]}\n')
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--previous', type=Path)
    parser.add_argument('--provider', choices=('auto', 'dmi', 'dwd'), default='auto')
    parser.add_argument('--max-frames', type=int, help='Preview only; never publish a truncated sequence')
    args = parser.parse_args()
    if args.max_frames is not None and args.max_frames < 1:
        parser.error('--max-frames must be positive')
    previous = json.loads(args.previous.read_text()) if args.previous and args.previous.exists() else None
    capture(args.output, previous, args.provider, args.max_frames)
    print('Forecast processing complete.', flush=True)


if __name__ == '__main__':
    main()
