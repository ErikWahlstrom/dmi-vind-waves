"""Snapshot DMI plots using printed timestamps, never inferred forecast times."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from io import BytesIO
import json
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from PIL import Image, ImageOps, UnidentifiedImageError

TYPES = ('win', 'hs', 'hsw')
ROOT = 'https://ocean.dmi.dk/anim/plots/'
MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split()


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
                stderr=subprocess.DEVNULL, timeout=20).decode()
    return parse_stamp(text)


def download(name, head=False):
    request = Request(ROOT + name, method='HEAD' if head else 'GET',
                      headers={'Cache-Control': 'no-cache', 'User-Agent': 'DMI-forecast-snapshot'})
    with urlopen(request, timeout=40) as response:
        modified = parsedate_to_datetime(response.headers['Last-Modified'])
        return modified, b'' if head else response.read()


def build(output, previous=None):
    names = [f'{kind}.ba.{i}.png' for i in range(1, 134) for kind in TYPES]

    def probe(name):
        try:
            return name, download(name, head=True)[0]
        except HTTPError as error:
            if error.code == 404:
                return name, None
            raise

    # Compare every file, because DMI may finish a partial upload without
    # changing frame 1. HTTP dates are cache identities, never forecast times.
    print('Checking DMI source file versions…', flush=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        modified = dict(pool.map(probe, names))
    source = {name: iso(value) if value else None for name, value in modified.items()}
    if previous and previous.get('schema') == 2 and previous.get('source') == source:
        print('Source files unchanged; keeping existing snapshot.')
        return False

    def frame(name):
        if modified[name] is None:
            return None
        date, data = download(name)
        if date != modified[name]:
            raise ValueError(f'{name}: publication changed during capture; retry next tick.')
        try:
            stamp = read_stamp(data)
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
    with ThreadPoolExecutor(max_workers=6) as pool:
        for count, result in enumerate(pool.map(frame, names), 1):
            if count % 30 == 0:
                print(f'Checked {count}/399 source images.', flush=True)
            if result is None:
                continue
            kind, name, stamp, date, data = result
            grouped.setdefault(stamp, {}).setdefault(kind, []).append((date, name, data))

    # Check every source again: publishing must not race the OCR capture.
    print('Verifying that source files stayed unchanged during capture…', flush=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        if dict(pool.map(probe, names)) != modified:
            raise ValueError('Publication changed during capture; keeping previous snapshot.')

    frames = []
    selected = []
    for stamp, candidates in sorted(grouped.items()):
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
    manifest = {'schema': 2, 'checked': iso(datetime.now(timezone.utc)),
                'source': source, 'frames': frames}
    (output / 'run.json').write_text(json.dumps(manifest) + '\n')
    print(f'Captured {len(frames)} matching times: {frames[0]["time"]} to {frames[-1]["time"]}.')
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--previous', type=Path)
    args = parser.parse_args()
    previous = json.loads(args.previous.read_text()) if args.previous and args.previous.exists() else None
    build(args.output, previous)
