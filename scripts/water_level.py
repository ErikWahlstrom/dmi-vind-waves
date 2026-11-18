"""Free station water levels: SMHI RW observations + locally aligned DMI changes.

This is our derived station forecast, not an official SMHI station forecast.
Only documented APIs are used. The two providers' raw zero levels are never
assumed equal: a median of contemporaneous observation-minus-model differences
aligns DMI to the station's local mean-water reference.
"""
from __future__ import annotations

import argparse
import bisect
import concurrent.futures
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import statistics
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

SMHI = 'https://opendata-download-ocobs.smhi.se/api/version/1.0/parameter/14/'
DMI = 'https://opendataapi.dmi.dk/v1/forecastedr/collections/dkss_nsbs/'
STAC = 'https://opendataapi.dmi.dk/v1/forecastdata/collections/dkss_nsbs/items?'
HOUR = 3600000
_request_lock = threading.Lock()
_next_request = 0


def millis(stamp):
    return round(datetime.fromisoformat(stamp.replace('Z', '+00:00')).timestamp() * 1000)


def iso(stamp):
    return datetime.fromtimestamp(stamp / 1000, timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def get_json(url):
    global _next_request
    request = urllib.request.Request(url, headers={'User-Agent': 'Baltic-forecast-water-level/1.0', 'Cache-Control':'no-cache'})
    for attempt in range(2):
        if url.startswith(DMI):
            # Forecast EDR throttles more aggressively than other DMI APIs.
            with _request_lock:
                time.sleep(max(0, _next_request-time.monotonic()))
                _next_request = time.monotonic()+2
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt:
                raise
            retry = error.headers.get('Retry-After', '5')
            time.sleep(min(30, max(5, int(retry) if retry.isdigit() else 5)))


def distance(lat, lon, other_lat, other_lon):
    a, b = math.radians(lat), math.radians(other_lat)
    h = math.sin((b-a)/2)**2 + math.cos(a)*math.cos(b)*math.sin(math.radians(other_lon-lon)/2)**2
    return 12742 * math.asin(min(1, math.sqrt(h)))


def axis_values(axis):
    if 'values' in axis:
        return axis['values']
    n = axis['num']
    if not isinstance(n, int) or not 1 <= n <= 1000:
        raise ValueError('Invalid grid axis')
    return [axis['start'] + (axis['stop']-axis['start']) * i / max(1, n-1) for i in range(n)]


def parse_model(data, lat, lon, expected_times):
    axes = data['domain']['axes']
    times = [millis(t) for t in axis_values(axes['t'])]
    if times != expected_times:
        raise ValueError('DMI forecast times do not match the pinned model run')
    parameter = data['parameters']['sea-mean-deviation']
    # Cube responses omit units; the collection metadata is checked by capture.
    if parameter.get('unit') and parameter['unit']['symbol']['value'] != 'm':
        raise ValueError('Unexpected DMI water-level unit')
    r = data['ranges']['sea-mean-deviation']
    names, shape, values = r['axisNames'], r['shape'], r['values']
    if sorted(names) != ['t', 'x', 'y'] or len(shape) != 3 or math.prod(shape) != len(values):
        raise ValueError('Invalid CoverageJSON dimensions')
    xs, ys = axis_values(axes['x']), axis_values(axes['y'])
    if any(shape[i] != {'t':len(times), 'x':len(xs), 'y':len(ys)}[name] for i, name in enumerate(names)):
        raise ValueError('Grid dimensions disagree with coordinates')
    candidates = sorted((distance(lat, lon, y, x), iy, ix, y, x)
                        for iy, y in enumerate(ys) for ix, x in enumerate(xs))
    for km, iy, ix, y, x in candidates:
        if km > 10:
            break
        series = []
        for it in range(len(times)):
            offset = 0
            for name, size in zip(names, shape):
                offset = offset * size + {'t':it, 'x':ix, 'y':iy}[name]
            value = values[offset]
            series.append(round(value * 100, 3) if isinstance(value, (int, float)) and
                          math.isfinite(value) and abs(value) <= 5 else None)
        if sum(v is not None for v in series) >= len(times) * .95:
            return {'values':series, 'lat':y, 'lon':x, 'distanceKm':round(km, 2)}
    return None


def interpolate(times, values, stamp):
    i = bisect.bisect_right(times, stamp) - 1
    if i < 0 or i >= len(times) or values[i] is None:
        return None
    if stamp == times[i]:
        return values[i]
    if i+1 >= len(times) or values[i+1] is None or times[i+1]-times[i] != HOUR:
        return None
    return values[i] + (values[i+1]-values[i]) * (stamp-times[i]) / HOUR


def observations(station, now):
    result = {}
    for v in station.get('value', []):
        stamp, value = v.get('date'), v.get('value')
        # O = provisional/unchecked real-time value; Y = suspect, excluded.
        if (v.get('quality') not in ('G', 'O') or not isinstance(stamp, (int, float)) or
                not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > 500 or
                not now - 2*HOUR <= stamp <= now + 5*60000):
            continue
        result[stamp] = [stamp, value, v['quality']]
    return sorted(result.values())


def aligned_forecast(times, model, observed):
    if not model or not observed:
        return None, None
    latest = observed[-1][0]
    offsets = []
    for stamp, value, _ in observed:
        if stamp < latest - HOUR:
            continue
        base = interpolate(times, model['values'], stamp)
        if base is not None:
            offsets.append(value-base)
    # Enough contemporaneous samples to avoid aligning to a lone noisy value.
    if len(offsets) < 3 or latest < times[0] or latest > times[-1]:
        return None, None
    offset = statistics.median(offsets)
    if abs(offset) > 100:
        return None, None
    return [round(v+offset, 1) if v is not None and t >= latest else None
            for t, v in zip(times, model['values'])], round(offset, 3)


def water_message(url):
    """Download only the documented surface DSLM message, not the 9 MB file."""
    if not (url.startswith('https://dmi-opendata.s3.') and urllib.parse.urlparse(url).hostname.endswith('.amazonaws.com')):
        raise ValueError('Unexpected forecast download host')
    with urllib.request.urlopen(url+'.index', timeout=25) as response:
        lines = response.read(200000).decode().splitlines()
    matches = [i for i,line in enumerate(lines) if ':DSLM:sfc:' in line]
    if len(matches) != 1 or matches[0]+1 >= len(lines):
        raise ValueError('Surface water-level field missing from GRIB index')
    i = matches[0]
    start, stop = int(lines[i].split(':')[1]), int(lines[i+1].split(':')[1])-1
    if not 0 <= start <= stop or stop-start > 2_000_000:
        raise ValueError('Invalid water-level byte range')
    request = urllib.request.Request(url, headers={'Range':f'bytes={start}-{stop}'})
    with urllib.request.urlopen(request, timeout=25) as response:
        if response.status != 206 or not response.headers.get('Content-Range', '').startswith(f'bytes {start}-{stop}/'):
            raise ValueError('Server ignored partial download request')
        data = response.read(stop-start+2)
    if len(data) != stop-start+1:
        raise ValueError('Incomplete water-level GRIB message')
    return data


def decode_water_message(data, run_time, valid_time, with_grid=False):
    import eccodes as ec
    import numpy as np
    handle = ec.codes_new_from_message(data)
    try:
        if any(ec.codes_get(handle,key) != value for key,value in
               [('edition',1),('centre','ekmi'),('table2Version',128),('indicatorOfParameter',82),('level',0)]):
            raise ValueError('Unexpected water-level GRIB encoding')
        for prefix,stamp in [('data',run_time),('validity',valid_time)]:
            date = datetime.strptime(f'{ec.codes_get(handle,prefix+"Date"):08d}{ec.codes_get(handle,prefix+"Time"):04d}', '%Y%m%d%H%M').replace(tzinfo=timezone.utc)
            if round(date.timestamp()*1000) != stamp:
                raise ValueError('Water-level GRIB time differs from catalogue')
        fingerprint = tuple(ec.codes_get(handle,key) for key in
                            ['Ni','Nj','latitudeOfFirstGridPointInDegrees','longitudeOfFirstGridPointInDegrees',
                             'latitudeOfLastGridPointInDegrees','longitudeOfLastGridPointInDegrees','iScansNegatively','jScansPositively'])
        values = ec.codes_get_values(handle)
        if values.size != fingerprint[0]*fingerprint[1]:
            raise ValueError('Invalid water-level grid size')
        missing = ec.codes_get(handle,'missingValue')
        values = np.where((values==missing) | ~np.isfinite(values) | (np.abs(values)>5), np.nan, values*100)
        coords = None
        if with_grid:
            lat = ec.codes_get_array(handle,'latitudes')
            lon = (ec.codes_get_array(handle,'longitudes')+180)%360-180
            coords = (lat,lon)
        return values, fingerprint, coords
    finally:
        ec.codes_release(handle)


def bulk_models(stations, run_id, stamps, fetch=get_json):
    """Read one field per hour once for every station; cache for the entire run."""
    import numpy as np
    times = [millis(t) for t in stamps]
    data = fetch(STAC+urllib.parse.urlencode({'modelRun':iso(times[0]), 'limit':1000}))
    files = []
    for item in data['features']:
        if millis(item['properties']['modelRun']) != times[0]:
            raise ValueError('Water-level catalogue mixes forecast runs')
        url = item.get('asset',item.get('assets',{}))['data']['href']
        files.append((millis(item['properties']['datetime']),url))
    files.sort()
    if [t for t,_ in files] != times:
        raise ValueError('Water-level file catalogue is incomplete')
    values, fingerprint, coords = decode_water_message(water_message(files[0][1]),times[0],times[0],True)
    if not np.isfinite(values).any():
        raise ValueError('Water-level field contains no sea data')
    lat, lon = coords
    result, indices = {}, {}
    for s in stations:
        key = str(s['key'])
        nearby = np.flatnonzero((np.abs(lat-s['latitude'])<.1) & (np.abs(lon-s['longitude'])<.2) & np.isfinite(values))
        choices = [(distance(s['latitude'],s['longitude'],lat[i],lon[i]),i) for i in nearby]
        if not choices or min(choices)[0] > 10:
            result[key] = None
            continue
        km,i = min(choices)
        indices[key] = i
        result[key] = {'values':[None]*len(times),'lat':float(lat[i]),'lon':float(lon[i]),'distanceKm':round(km,2)}
        result[key]['values'][0] = round(float(values[i]),3)
    if not indices:
        return result
    deadline = time.monotonic()+180
    def read_hour(item):
        h,(stamp,url) = item
        if time.monotonic()>deadline:
            return h,None
        try:
            values, grid, _ = decode_water_message(water_message(url),times[0],stamp)
            if grid != fingerprint:
                raise ValueError('Water-level grid changed within a forecast run')
            return h,{key:round(float(values[i]),3) if np.isfinite(values[i]) else None for key,i in indices.items()}
        except Exception as error:
            print(f'Water-level hour {h} unavailable ({error})',flush=True)
            return h,None
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for h,samples in pool.map(read_hour,enumerate(files[1:],1)):
            if samples:
                for key,value in samples.items():result[key]['values'][h]=value
    # Missing steps stay missing. Insufficient coverage can be retried next run.
    return {key:model for key,model in result.items() if model is None or
            sum(v is not None for v in model['values'])>=len(times)*.95}


def capture(previous=None, fetch=get_json, now=None, bulk=bulk_models):
    now = now if now is not None else round(datetime.now(timezone.utc).timestamp()*1000)
    previous = previous or {}
    batch = fetch(SMHI + 'station-set/all/period/latest-hour/data.json')
    if batch['parameter']['key'] != '14' or batch['parameter']['unit'] != 'cm':
        raise ValueError('SMHI observations must use RW centimetres')
    try:
        metadata = fetch(DMI.rstrip('/'))
        if metadata['parameter_names']['sea-mean-deviation']['unit']['symbol']['value'] != 'm':
            raise ValueError('Unexpected DMI water-level collection unit')
        instances = fetch(DMI + 'instances')['instances']
        recent = [i for i in instances if 0 <= now-millis(i['extent']['temporal']['values'][0]) <= 18*HOUR]
        instance = max(recent, key=lambda i:i['id'])
        run_id = instance['id']
        stamps = instance['extent']['temporal']['values']
        times = [millis(t) for t in stamps]
        if len(times) < 49 or any(b-a != HOUR for a,b in zip(times, times[1:])):
            raise ValueError('DMI forecast is incomplete')
    except Exception:
        if (previous.get('schema') != 1 or not previous.get('times') or
                not 0 <= now-millis(previous['times'][0]) <= 18*HOUR):
            run_id, stamps, times = None, [], []
        else:
            run_id, stamps = previous['modelRun'], previous['times']
            times = [millis(t) for t in stamps]
    old = {s['id']:s for s in previous.get('stations', [])} if previous.get('modelRun') == run_id else {}
    deadline = time.monotonic() + 240
    candidates = [(s, observations(s, now)) for s in batch['station']]
    candidates = [(s, obs) for s, obs in candidates if obs]
    needed = [s for s,_ in candidates if
              (old.get(str(s['key']),{}).get('lat'),old.get(str(s['key']),{}).get('lon')) != (s['latitude'],s['longitude']) or
              (not old.get(str(s['key']),{}).get('model') and not old.get(str(s['key']),{}).get('modelUnavailable'))]
    models = {}
    if run_id and needed:
        try:
            models = bulk(needed,run_id,stamps,fetch)
            print(f'Collected water-level fields for {sum(v is not None for v in models.values())} stations',flush=True)
        except Exception as error:
            print(f'Bulk water-level forecast unavailable ({error}); trying bounded point queries',flush=True)

    def station_result(item):
        s, obs = item
        key, lat, lon = str(s['key']), s['latitude'], s['longitude']
        model = old.get(key, {}).get('model')
        unavailable = old.get(key,{}).get('modelUnavailable',False)
        if old.get(key, {}).get('lat') != lat or old.get(key, {}).get('lon') != lon:
            model, unavailable = None, False
        if key in models:
            model, unavailable = models[key], models[key] is None
        if run_id and not model and not unavailable and time.monotonic() < deadline:
            # A small cube handles station coordinates falling on land cells.
            query = urllib.parse.urlencode({'bbox':f'{lon-.15},{lat-.08},{lon+.15},{lat+.08}',
                                            'crs':'crs84', 'parameter-name':'sea-mean-deviation', 'f':'CoverageJSON'})
            try:
                position = urllib.parse.urlencode({'coords':f'POINT({lon} {lat})', 'crs':'crs84',
                                                  'parameter-name':'sea-mean-deviation', 'f':'CoverageJSON'})
                # The latest collection path is faster than DMI's instance
                # query path. Exact timestamps below still pin every response
                # to the selected run, including during a model rollover.
                model = parse_model(fetch(DMI + 'position?' + position), lat, lon, times)
                if not model:
                    model = parse_model(fetch(DMI + 'cube?' + query), lat, lon, times)
            except Exception as error:
                print(f'{s["name"]}: forecast unavailable ({error})', flush=True)
        forecast, offset = aligned_forecast(times, model, obs)
        return {'id':key, 'name':s['name'], 'owner':s.get('owner', 'SMHI'), 'lat':lat, 'lon':lon,
                'observations':obs, 'model':model, 'modelUnavailable':unavailable, 'forecast':forecast, 'offsetCm':offset}

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        stations = list(pool.map(station_result, candidates))
    if len(stations) < 5:
        raise ValueError('Too few fresh water-level stations; keep the previous snapshot')
    return {'schema':1, 'checked':iso(now), 'reference':'SMHI local mean water (RW)',
            'method':'DMI DKSS plus median observation-minus-model offset over the latest hour',
            'modelRun':run_id, 'times':stamps, 'stations':stations,
            'attribution':'SMHI and DMI, CC BY 4.0; station forecasts aligned by this site'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--previous', type=Path)
    args = parser.parse_args()
    previous = None
    if args.previous and args.previous.exists():
        try:
            previous = json.loads(args.previous.read_text())
        except (ValueError, OSError):
            pass
    data = capture(previous)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(data["stations"])} stations, {sum(s["forecast"] is not None for s in data["stations"])} adjusted forecasts', flush=True)


if __name__ == '__main__':
    main()
