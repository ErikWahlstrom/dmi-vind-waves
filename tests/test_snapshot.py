import importlib.util
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).parents[1] / 'scripts/snapshot.py')
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class SnapshotTests(unittest.TestCase):
    def test_printed_dates_and_ocr_zero(self):
        self.assertEqual(snapshot.iso(snapshot.parse_stamp('2026 OCT 18 O6GMT|')), '2026-10-18T06:00:00Z')
        for text in ['2026 OCT 32 06GMT', '2026 OCT 18 26GMT', 'not a timestamp']:
            with self.assertRaises(ValueError):
                snapshot.parse_stamp(text)

    def capture(self, output, rollover=False, mismatch=False):
        anchor = datetime(2026, 10, 13, 21, 30, tzinfo=timezone.utc)
        start = anchor.replace(hour=18, minute=0)
        probes = {}

        def download(name, head=False):
            kind, _, index, _ = name.split('.')
            index = int(index)
            if index > 3:
                raise HTTPError(name, 404, 'missing', {}, None)
            modified = anchor
            if mismatch and kind == 'hs' and index == 3:
                modified -= timedelta(days=1)
            if head:
                probes[name] = probes.get(name, 0) + 1
                if rollover and probes[name] > 1:
                    modified += timedelta(days=1)
                return modified, b''
            return modified, snapshot.iso(start + timedelta(hours=[0, 1, 4][index - 1])).encode()

        with patch.object(snapshot, 'download', side_effect=download), patch.object(
                snapshot, 'read_stamp', side_effect=lambda data: datetime.fromisoformat(data.decode().replace('Z', '+00:00'))):
            return snapshot.build(output)

    def test_actual_spacing_and_saved_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'forecast'
            self.assertTrue(self.capture(output))
            data = json.loads((output / 'run.json').read_text())
            self.assertEqual([f['time'] for f in data['frames']], [
                '2026-10-13T18:00:00Z', '2026-10-13T19:00:00Z', '2026-10-13T22:00:00Z'])
            self.assertEqual(len(list((output / 'plots').iterdir())), 9)

    def test_mixed_publications_are_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'forecast'
            self.capture(output, mismatch=True)
            data = json.loads((output / 'run.json').read_text())
            self.assertEqual(len(data['frames']), 2)
            self.assertNotIn('hs.ba.3.png', [p.name for p in (output / 'plots').iterdir()])

    def test_rollover_does_not_publish(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'forecast'
            with self.assertRaises(ValueError):
                self.capture(output, rollover=True)
            self.assertFalse(output.exists())

    def test_newest_complete_set_with_older_fallback(self):
        old = datetime(2026, 10, 12, 21, 30, tzinfo=timezone.utc)
        start = datetime(2026, 10, 13, 18, tzinfo=timezone.utc)

        def download(name, head=False):
            kind, _, index, _ = name.split('.')
            index = int(index)
            if index > 4:
                raise HTTPError(name, 404, 'missing', {}, None)
            # Index 3 is an incomplete newer set for time 0. Index 4 is a
            # complete newer set for time 1; older indices supply both times.
            newer = index == 4 or (index == 3 and kind != 'hs')
            modified = old + timedelta(days=1 if newer else 0)
            time = start + timedelta(hours=(index - 1) % 2)
            return modified, b'' if head else snapshot.iso(time).encode()

        with tempfile.TemporaryDirectory() as tmp, patch.object(
                snapshot, 'download', side_effect=download), patch.object(
                snapshot, 'read_stamp', side_effect=lambda data: datetime.fromisoformat(data.decode().replace('Z', '+00:00'))):
            output = Path(tmp) / 'forecast'
            snapshot.build(output)
            frames = json.loads((output / 'run.json').read_text())['frames']
            self.assertEqual([f['files']['win'] for f in frames], ['win.ba.1.png', 'win.ba.4.png'])
            self.assertLess(frames[0]['published'], frames[1]['published'])


if __name__ == '__main__':
    unittest.main()
