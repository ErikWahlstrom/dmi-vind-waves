import importlib.util
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import ssl
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).parents[1] / 'scripts/snapshot.py')
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class SnapshotTests(unittest.TestCase):
    def test_source_connection_failure_has_bounded_retries(self):
        error = URLError(ConnectionRefusedError('Connection refused'))
        with patch.object(snapshot, 'urlopen', side_effect=error) as request, patch.object(
                snapshot.time, 'sleep') as sleep:
            with self.assertRaises(snapshot.SourceUnavailable):
                snapshot.download('hs.ba.1.png')
            self.assertEqual(request.call_count, 3)
            self.assertEqual([call.args[0] for call in sleep.call_args_list], [2, 4])

    def test_transient_source_error_recovers(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.headers = {'Last-Modified': 'Thu, 22 Oct 2026 06:00:00 GMT'}
        response.read.return_value = b'image'
        for failure in [HTTPError('url', 503, 'unavailable', {}, None),
                        HTTPError('url', 429, 'rate limited', {}, None), TimeoutError()]:
            with self.subTest(failure=failure), patch.object(
                    snapshot, 'urlopen', side_effect=[failure, response]) as request, patch.object(snapshot.time, 'sleep'):
                self.assertEqual(snapshot.download('hs.ba.1.png')[1], b'image')
                self.assertEqual(request.call_count, 2)

    def test_missing_files_and_certificate_errors_still_propagate(self):
        for error in [HTTPError('url', 404, 'missing', {}, None),
                      HTTPError('url', 403, 'forbidden', {}, None),
                      URLError(ssl.SSLCertVerificationError('bad certificate'))]:
            with self.subTest(error=error), patch.object(snapshot, 'urlopen', side_effect=error) as request:
                with self.assertRaises(type(error)):
                    snapshot.download('hs.ba.1.png')
                self.assertEqual(request.call_count, 1)

    def test_outage_skips_without_downloading_entire_set_or_publishing(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'forecast'
            report = Path(tmp) / 'summary'
            previous = {'checked': '2026-10-21T13:47:00Z'}
            with patch.object(snapshot, 'download', side_effect=snapshot.SourceUnavailable('offline')) as request, patch.dict(
                    os.environ, {'GITHUB_STEP_SUMMARY': str(report)}), patch('sys.stdout'):
                self.assertFalse(snapshot.capture(output, previous))
                self.assertEqual(request.call_count, 1)
            self.assertFalse(output.exists())
            self.assertIn('Forecast refresh skipped', report.read_text())
            self.assertIn(previous['checked'], report.read_text())

    def test_validation_errors_are_not_silenced_as_outages(self):
        with patch.object(snapshot, 'build', side_effect=ValueError('Invalid timeline')):
            with self.assertRaisesRegex(ValueError, 'Invalid timeline'):
                snapshot.capture(Path('/unused'))

    def test_printed_dates_and_ocr_zero(self):
        self.assertEqual(snapshot.iso(snapshot.parse_stamp('2026 OCT 18 O6GMT|')), '2026-10-18T06:00:00Z')
        for text in ['2026 OCT 32 06GMT', '2026 OCT 18 26GMT', 'not a timestamp']:
            with self.assertRaises(ValueError):
                snapshot.parse_stamp(text)

    def capture(self, output, rollover=False, mismatch=False, older_prefix=False,
                first_mismatch=False, previous=None, tail_shift=0):
        anchor = datetime(2026, 10, 13, 21, 30, tzinfo=timezone.utc)
        start = anchor.replace(hour=18, minute=0)
        probes = {}

        def download(name, head=False):
            self.assertFalse(head, 'Freshness must be checked from actual image content')
            kind, _, index, _ = name.split('.')
            index = int(index)
            if index > (4 if older_prefix else 3):
                raise HTTPError(name, 404, 'missing', {}, None)
            modified = anchor
            if mismatch and kind == 'hs' and index == 3:
                modified -= timedelta(days=1)
            if index == 4:
                modified -= timedelta(days=1)
            probes[name] = probes.get(name, 0) + 1
            if rollover and probes[name] > 1:
                modified += timedelta(days=1)
            if head:
                return modified, b''
            hours = [0, 1, 4, -1][index - 1]
            if index == 3:
                hours += tail_shift
            if first_mismatch and kind == 'hs' and index == 1:
                hours -= 6
            return modified, snapshot.iso(start + timedelta(hours=hours)).encode()

        with patch.object(snapshot, 'download', side_effect=download), patch.object(
                snapshot, 'read_stamp', side_effect=lambda data: datetime.fromisoformat(data.decode().replace('Z', '+00:00'))):
            return snapshot.build(output, previous)

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

    def test_old_leftovers_cannot_precede_current_first_frame(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'forecast'
            self.capture(output, older_prefix=True)
            data = json.loads((output / 'run.json').read_text())
            self.assertEqual(len(data['frames']), 3)
            self.assertEqual(data['frames'][0]['time'], '2026-10-13T18:00:00Z')
            self.assertEqual(data['frames'][0]['files']['hs'], 'hs.ba.1.png')
            self.assertEqual(data['captureVersion'], snapshot.CAPTURE_VERSION)

    def test_disagreeing_first_frames_do_not_publish(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'forecast'
            with self.assertRaisesRegex(ValueError, 'first frames disagree'):
                self.capture(output, first_mismatch=True)
            self.assertFalse(output.exists())

    def test_rollover_does_not_publish(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'forecast'
            with self.assertRaises(ValueError):
                self.capture(output, rollover=True)
            self.assertFalse(output.exists())

    def test_content_change_with_unchanged_headers_is_published(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / 'first'
            self.capture(first)
            previous = json.loads((first / 'run.json').read_text())
            second = Path(tmp) / 'second'
            self.assertTrue(self.capture(second, previous=previous, tail_shift=1))
            updated = json.loads((second / 'run.json').read_text())
            name = 'hs.ba.3.png'
            self.assertEqual(previous['source'][name]['modified'], updated['source'][name]['modified'])
            self.assertNotEqual(previous['source'][name]['sha256'], updated['source'][name]['sha256'])
            self.assertEqual(updated['frames'][-1]['time'], '2026-10-13T23:00:00Z')

    def test_identical_content_skips_snapshot_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / 'first'
            self.capture(first)
            previous = json.loads((first / 'run.json').read_text())
            second = Path(tmp) / 'second'
            self.assertFalse(self.capture(second, previous=previous))
            self.assertFalse(second.exists())

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
