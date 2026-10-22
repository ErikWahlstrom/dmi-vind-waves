"""Snapshot DMI plots using printed timestamps, never inferred forecast times."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from io import BytesIO
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess
import ssl
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError

TYPES = ('win', 'hs', 'hsw')
ROOT = 'https://ocean.dmi.dk/anim/plots/'
MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split()
CHECK_KEY = uuid4().hex
CAPTURE_VERSION = 3


class SourceUnavailable(Exception):
    """DMI cannot currently be reached; retain the last verified snapshot."""


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def parse_stamp(text):
    # Tesseract occasionally reads zero as O in DMI's fixed-width font.
    match = re.search(r'(\d{4})\s+([A-Z]{3})\s+([\dO]{1,2})\s+([\dO]{2})\s*GMT', text.upper())
    if not match:
        raise ValueError(f'Unreadable forecast timestamp: {text!r}')
    year, month, day, hour = match.groups()
    return datetime(int(year), MONTHS.index(month) + 1,
                    int(day.replace('O', '0')), int(hour.replace('O', '0')),
                    tzinfo=timezone.utc)


def read_stamp(data):
    with Image.open(BytesIO(data)) as image:
        header = image.crop((round(image.width * .55), 0,
                             round(image.width * .785), 24)).convert('RGB')
        header = ImageOps.invert(header)
        header = header.resize((header.width * 4, header.height * 4))
        header = ImageOps.expand(header, border=20, fill='white')
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve() / 'header.png'
            header.save(path)
            text = subprocess.check_output(
                ['tesseract', str(path), 'stdout', '--psm', '7'],
                # Multiple OCR workers must not each start an OpenMP pool on
                # the small GitHub runner and starve one another of CPU.
                env={**os.environ, 'OMP_THREAD_LIMIT': '1'},
                stderr=subprocess.DEVNULL, timeout=60).decode()
    return parse_stamp(text)


def download(name, head=False):
    # DMI replaces fixed URLs. A fresh key per capture bypasses intermediary
    # caches; HEAD and GET in this capture still refer to the same URL.
    request = Request(ROOT + name + '?snapshot=' + CHECK_KEY, method='HEAD' if head else 'GET',
                      headers={'Cache-Control': 'no-cache', 'User-Agent': 'DMI-forecast-snapshot'})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=40) as response:
                modified = parsedate_to_datetime(response.headers['Last-Modified'])
                return modified, b'' if head else response.read()
        except HTTPError as error:
            if error.code != 429 and not 500 <= error.code < 600:
                raise
            failure = error
        except URLError as error:
            # Certificate/configuration problems still need a failed job.
            if isinstance(error.reason, ssl.SSLError):
                raise
            failure = error
        except (TimeoutError, ConnectionError) as error:
            failure = error
        if attempt < 2:
            time.sleep(2 ** (attempt + 1))
    raise SourceUnavailable(f'{name}: {failure}') from failure


def build(output, previous=None):
    names = [f'{kind}.ba.{i}.png' for i in range(1, 134) for kind in TYPES]

    def fetch_image(name):
        try:
            return name, download(name)
        except HTTPError as error:
            if error.code == 404:
                return name, None
            raise

    # HEAD/Last-Modified alone must never decide whether the images changed.
    # Read actual image bytes, including the tail of partially replaced runs.
    print('Downloading DMI images for content verification…', flush=True)
    # Probe before queueing hundreds of requests during a source outage.
    first_image = fetch_image(names[0])
    pool = ThreadPoolExecutor(max_workers=6)
    try:
        downloaded = dict([first_image, *pool.map(fetch_image, names[1:])])
    finally:
        # Do not drain the entire pending queue after one request fails.
        pool.shutdown(wait=True, cancel_futures=True)
    source = {name: {'modified': iso(value[0]), 'sha256': sha256(value[1]).hexdigest()}
              if value else None for name, value in downloaded.items()}
    first_stamps = {}
    for kind in TYPES:
        name = f'{kind}.ba.1.png'
        if downloaded[name] is not None:
            first_stamps[kind] = read_stamp(downloaded[name][1])
            print(f'{name}: printed time {iso(first_stamps[kind])}; '
                  f'Last-Modified {source[name]["modified"]}; '
                  f'SHA256 {source[name]["sha256"]}', flush=True)
    if (previous and previous.get('schema') == 2
            and previous.get('captureVersion') == CAPTURE_VERSION
            and previous.get('source') == source):
        print('All downloaded image hashes unchanged; keeping existing snapshot.', flush=True)
        return False

    def frame(name):
        if downloaded[name] is None:
            return None
        date, data = downloaded[name]
        try:
            kind = name.split('.')[0]
            stamp = first_stamps[kind] if name == f'{kind}.ba.1.png' else read_stamp(data)
        except UnidentifiedImageError:
            print(f'{name}: not an image; excluding unavailable frame.', flush=True)
            return None
        except ValueError as error:
            raise ValueError(f'{name}: {error}') from error
        # A forecast cannot precede its file publication by more than a day
        # or predict more than ten days ahead. Reject plausible OCR mistakes.
        if not -86400 <= (stamp - date).total_seconds() <= 10 * 86400:
            raise ValueError(f'{name}: implausible timestamp {stamp}')
        return name.split('.')[0], name, stamp, date, data

    grouped = {}
    first = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for count, result in enumerate(pool.map(frame, names), 1):
            if count % 30 == 0:
                print(f'Checked {count}/399 source images.', flush=True)
            if result is None:
                continue
            kind, name, stamp, date, data = result
            if name == f'{kind}.ba.1.png':
                first[kind] = (stamp, date)
            grouped.setdefault(stamp, {}).setdefault(kind, []).append((date, name, data))

    # Detect rollover from actual first-image bytes, not a second HEAD request.
    # Every other saved image is independently timestamped and matched below.
    print('Rechecking current first images after OCR…', flush=True)
    for kind in TYPES:
        name = f'{kind}.ba.1.png'
        if fetch_image(name)[1] != downloaded[name]:
            raise ValueError('Publication changed during capture; keeping previous snapshot.')

    if (set(first) != set(TYPES) or len({value[0] for value in first.values()}) != 1
            or (max(value[1] for value in first.values()) -
                min(value[1] for value in first.values())).total_seconds() >= 3600):
        raise ValueError('Current first frames disagree; keeping previous snapshot.')
    start = first['win'][0]

    frames = []
    selected = []
    for stamp, candidates in sorted(grouped.items()):
        if stamp < start:
            continue # leftovers must not extend the slider before the current run
        if set(candidates) != set(TYPES):
            continue
        # Choose the newest publication that supplies ALL three plots for this
        # exact valid time. An older complete set is useful when DMI's latest
        # upload is incomplete; never combine plots from different runs.
        dates = sorted({entry[0] for values in candidates.values() for entry in values}, reverse=True)
        for anchor in dates:
            group = {kind: max((entry for entry in values
                              if 0 <= (anchor - entry[0]).total_seconds() < 3600), default=None)
                     for kind, values in candidates.items()}
            if all(group.values()):
                break
        else:
            continue
        files = {}
        for kind, (_, name, data) in group.items():
            files[kind] = name
            selected.append((name, data))
        frames.append({'time': iso(stamp), 'published': iso(anchor), 'files': files})
    if len(frames) < 2:
        raise ValueError('No matching forecast sequence; keeping previous snapshot.')
    output.mkdir(parents=True, exist_ok=True)
    (output / 'plots').mkdir(exist_ok=True)
    for name, data in selected:
        (output / 'plots' / name).write_bytes(data)
    manifest = {'schema': 2, 'captureVersion': CAPTURE_VERSION,
                'checked': iso(datetime.now(timezone.utc)),
                'source': source, 'frames': frames}
    (output / 'run.json').write_text(json.dumps(manifest) + '\n')
    print(f'Captured {len(frames)} matching times: {frames[0]["time"]} to {frames[-1]["time"]}.')
    return True


def capture(output, previous=None):
    try:
        return build(output, previous)
    except SourceUnavailable as error:
        # A provider outage is a skipped refresh, not a broken workflow on
        # every scheduled check. Validation/programming errors still propagate.
        message = f'DMI source unavailable after retries; keeping saved forecast. {error}'
        print(f'::warning::{message}', flush=True)
        summary = os.environ.get('GITHUB_STEP_SUMMARY')
        if summary:
            with open(summary, 'a') as report:
                report.write('### Forecast refresh skipped\n\n'
                             'DMI could not be reached after three attempts. '
                             'The saved forecast was retained; the next scheduled run will retry.\n\n')
                if previous and previous.get('checked'):
                    report.write(f'Last snapshot capture: {previous["checked"]}\n')
        return False


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--previous', type=Path)
    args = parser.parse_args()
    previous = json.loads(args.previous.read_text()) if args.previous and args.previous.exists() else None
    capture(args.output, previous)
