import importlib.util
import base64
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch

import eccodes as ec
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))

spec = importlib.util.spec_from_file_location('forecast', Path(__file__).parents[1] / 'scripts/forecast.py')
forecast = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = forecast
spec.loader.exec_module(forecast)
UTC = timezone.utc
RUN = datetime(2026, 10, 28, 6, tzinfo=UTC)


def message(parameter, valid_hour=1, values=None):
    """Small real GRIB fixture: three rows, including a masked land cell."""
    h = ec.codes_grib_new_from_samples('regular_ll_sfc_grib1')
    try:
        for key, value in {'centre': 94, 'table2Version': 140, 'indicatorOfParameter': parameter,
                           'dataDate': 20261028, 'dataTime': 600, 'stepRange': valid_hour,
                           'Ni': 3, 'Nj': 3, 'latitudeOfFirstGridPointInDegrees': 60,
                           'latitudeOfLastGridPointInDegrees': 58,
                           'longitudeOfFirstGridPointInDegrees': 18,
                           'longitudeOfLastGridPointInDegrees': 20,
                           'iDirectionIncrementInDegrees': 1, 'jDirectionIncrementInDegrees': 1,
                           'bitmapPresent': 1}.items():
            ec.codes_set(h, key, value)
        missing = ec.codes_get(h, 'missingValue')
        ec.codes_set_values(h, values if values is not None else [missing, 2, 3, 4, 5, 6, 7, 8, 9])
        return ec.codes_get_message(h)
    finally:
        ec.codes_release(h)


class ForecastTests(unittest.TestCase):
    def test_real_renderer_writes_three_valid_pngs(self):
        # Exercise native decoder + GEOS + plotting cleanup in the test process,
        # so a Linux shutdown regression fails before the full 399-image batch.
        data = b''.join(message(p) for p in forecast.PARAMETERS)
        valid = RUN + timedelta(hours=1)
        grid, fields = forecast.decode(data, RUN, valid)
        renderer = forecast.Renderer(grid)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                files = renderer.render(fields, forecast.Step(valid, RUN, {}),
                                        forecast.Forecast('DMI WAM', RUN, []), Path(tmp), 1)
                self.assertEqual(set(files), {'win', 'hs', 'hsw'})
                for name in files.values():
                    with Image.open(Path(tmp) / name) as image:
                        self.assertEqual(image.size, (900, 675))
                        image.verify()
                renderer.write_coastline(Path(tmp))
                for kind in files:
                    vector = ET.parse(Path(tmp) / f'{kind}.map.1.svg').getroot()
                    ns_vector = {'svg': 'http://www.w3.org/2000/svg'}
                    self.assertEqual(vector.findall('.//svg:image', ns_vector), [])
                    self.assertGreater(len(vector.findall('.//svg:path', ns_vector)), 0)
                    self.assertEqual(vector.attrib['data-kind'], kind)
                    self.assertEqual(vector.attrib['data-time'], forecast.iso(valid))
                    self.assertEqual(vector.attrib['data-identity'], forecast.Forecast('DMI WAM', RUN, []).identity())
                mask = ET.parse(Path(tmp) / 'map-sea.svg').getroot()
                self.assertIsNotNone(mask.find('.//{http://www.w3.org/2000/svg}clipPath'))
                svg = ET.parse(Path(tmp) / 'coastline.svg').getroot()
                ns = {'svg': 'http://www.w3.org/2000/svg'}
                self.assertEqual(svg.findall('.//svg:image', ns), [], 'Coastlines must remain vector geometry')
                self.assertGreater(len(svg.findall('.//svg:path', ns)), 10)
                viewbox = [float(n) for n in svg.attrib['viewBox'].split()]
                self.assertAlmostEqual(viewbox[2] / viewbox[3], 900 / 675)
                clip = svg.find('.//svg:clipPath/svg:path', ns)
                self.assertIsNotNone(clip)
                # The SVG clipping rectangle must match the PNG's plot region,
                # including margins. Pixel/point units differ by exactly 100/72.
                corners = np.array([float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', clip.attrib['d'])]).reshape(-1, 2)
                np.testing.assert_allclose([corners[:, 0].min() / viewbox[2], corners[:, 1].min() / viewbox[3],
                                            np.ptp(corners[:, 0]) / viewbox[2], np.ptp(corners[:, 1]) / viewbox[3]],
                                           [.172, .04, .61, .90], atol=1e-6)
                # The point export must identify the same hour and model point
                # as the image, preserve missing values, and decode in a browser.
                points = forecast.PointForecast(renderer, fields)
                points.add(fields)
                changed = {key: value.copy() for key, value in fields.items()}
                changed['wind'][2, 2] = 12.34
                changed['swell'][2, 2] = np.nan
                points.add(changed)
                source = forecast.Forecast('DMI WAM', RUN, [])
                steps = [forecast.Step(valid, RUN, {}), forecast.Step(valid + timedelta(hours=1), RUN, {})]
                points.write(Path(tmp), source, steps)
                index = json.loads((Path(tmp) / 'point-index.json').read_text())
                self.assertEqual(index['times'], [forecast.iso(s.time) for s in steps])
                self.assertEqual(index['identity'], source.identity())
                selected = next(i for i, p in enumerate(index['points']) if p[2:] == [20, 58])
                tile = json.loads((Path(tmp) / 'point-0.json').read_text())
                data = np.frombuffer(base64.b64decode(tile['data']), dtype='<u2').reshape(2, tile['count'], 6)
                self.assertEqual(data[0, selected, 0], 900)
                self.assertEqual(data[1, selected, 0], 1234)
                self.assertEqual(data[1, selected, 4], 65535)
                # Invert the exported image coordinates to the projected grid.
                x, y = index['points'][selected][:2]
                projected = renderer.maps['win'][1].transData.inverted().transform((x * 900, (1-y) * 675))
                np.testing.assert_allclose(projected, [renderer.x[2, 2], renderer.y[2, 2]], atol=2)
        finally:
            renderer.close()

    def test_real_grib_decoding_preserves_land_and_rejects_other_hours(self):
        data = b''.join(message(p) for p in forecast.PARAMETERS)
        grid, fields = forecast.decode(data, RUN, RUN + timedelta(hours=1))
        self.assertEqual(grid[0].shape, (3, 3))
        self.assertEqual(set(fields), set(forecast.PARAMETERS.values()))
        self.assertTrue(np.isnan(fields['wave'][0, 0]))
        self.assertEqual(fields['wave'][2, 2], 9)
        with self.assertRaisesRegex(ValueError, 'run/valid time'):
            forecast.decode(data, RUN, RUN + timedelta(hours=2))
        with self.assertRaisesRegex(ValueError, 'missing required'):
            forecast.decode(message(245), RUN, RUN + timedelta(hours=1))

    def test_duplicate_parameter_is_not_silently_accepted(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            forecast.decode(message(245) * 2, RUN, RUN + timedelta(hours=1))

    def test_direction_packing_at_north_wraps_without_losing_a_forecast(self):
        # Actual WAM files can contain 360.0109 degrees after GRIB packing.
        data = b''.join(message(p, values=[360.01] * 9 if p == 238 else None)
                        for p in forecast.PARAMETERS)
        _, fields = forecast.decode(data, RUN, RUN + timedelta(hours=1))
        self.assertTrue(np.all((fields['swell_dir'] >= 0) & (fields['swell_dir'] < .1)))

    def test_arrows_point_towards_destination(self):
        u, v = forecast.vectors(np.array([0, 90, 180, 270]))
        np.testing.assert_allclose(u, [0, -1, 0, 1], atol=1e-10)
        np.testing.assert_allclose(v, [-1, 0, 1, 0], atol=1e-10)

    def test_incomplete_duplicate_and_expired_sequences_are_rejected(self):
        steps = [forecast.Step(RUN + timedelta(hours=i), RUN, {}) for i in range(133)]
        self.assertEqual(len(forecast.validate_steps(steps, RUN, 132, RUN + timedelta(hours=6))), 133)
        for sequence, now in [(steps[:-1], RUN), (steps + [steps[0]], RUN),
                              (steps, RUN + timedelta(hours=120))]:
            with self.assertRaises(forecast.SourceUnavailable):
                forecast.validate_steps(sequence, RUN, 132, now)

    def test_discovery_uses_older_complete_run_during_publication(self):
        older = RUN - timedelta(hours=6)
        def read(url):
            if url.endswith('/instances'):
                return {'instances': [{'id': r.strftime('%Y-%m-%dT%H%M%SZ')} for r in [RUN, older]]}
            run = RUN if '06%3A00' in url else older
            count = 12 if run == RUN else 133
            return {'features': [{'properties': {'modelRun': forecast.iso(run),
                     'datetime': forecast.iso(run + timedelta(hours=i)), 'created': forecast.iso(run)},
                     'asset': {'data': {'href': f'https://dmi-opendata.s3.eu-north-1.amazonaws.com/{i}'}}}
                     for i in range(count)]}
        with patch.object(forecast, 'read_json', side_effect=read):
            result = forecast.dmi_forecast(RUN + timedelta(hours=4))
        self.assertEqual(result.run, older)
        self.assertEqual(len(result.steps), 133)

    def test_download_outage_has_bounded_retries(self):
        with patch.object(forecast, 'urlopen', side_effect=TimeoutError()), patch.object(
                forecast.time, 'sleep') as sleep:
            with self.assertRaises(forecast.SourceUnavailable):
                forecast.request('https://example.test/data')
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [2, 4])

    def test_primary_outage_uses_explicitly_labelled_backup(self):
        backup = forecast.Forecast('DWD EWAM', RUN, [])
        with patch.object(forecast, 'dmi_forecast', side_effect=forecast.SourceUnavailable('offline')), \
                patch.object(forecast, 'dwd_forecast', return_value=backup), \
                patch.object(forecast, 'render_forecast', return_value=True) as render:
            self.assertTrue(forecast.capture(Path('/unused'), now=RUN))
        self.assertEqual(render.call_args.args[0].provider, 'DWD EWAM')

    def test_backup_host_outage_does_not_probe_every_folder(self):
        with patch.object(forecast, 'request', side_effect=forecast.SourceUnavailable('offline')) as read:
            with self.assertRaises(forecast.SourceUnavailable):
                forecast.dwd_forecast(RUN)
        self.assertEqual(read.call_count, 1)

    def test_both_sources_down_preserves_saved_forecast_and_records_incident(self):
        with tempfile.TemporaryDirectory() as tmp:
            output, report = Path(tmp) / 'forecast', Path(tmp) / 'output'
            with patch.object(forecast, 'dmi_forecast', side_effect=forecast.SourceUnavailable('offline')), \
                    patch.object(forecast, 'dwd_forecast', side_effect=forecast.SourceUnavailable('offline')), \
                    patch.dict(os.environ, {'GITHUB_OUTPUT': str(report)}):
                self.assertFalse(forecast.capture(output, now=RUN))
            self.assertFalse(output.exists())
            self.assertEqual(report.read_text(), 'source_unavailable=true\n')

    def test_render_failure_cannot_expose_partial_manifest_or_images(self):
        steps = [forecast.Step(RUN + timedelta(hours=i), RUN, {}) for i in range(2)]
        source = forecast.Forecast('DMI WAM', RUN, steps)
        grid = (np.zeros((2, 2)), np.zeros((2, 2)))
        with tempfile.TemporaryDirectory() as tmp, patch.object(forecast, 'Renderer') as renderer, \
                patch.object(forecast, 'PointForecast'), \
                patch.object(forecast, 'download_step', return_value={}), \
                patch.object(forecast, 'load_step', return_value=(grid, {})):
            renderer.return_value.render.side_effect = [{'win': 'win.ba.1.png'}, RuntimeError('render failed')]
            output = Path(tmp) / 'forecast'
            with self.assertRaisesRegex(RuntimeError, 'render failed'):
                forecast.render_forecast(source, output)
            self.assertFalse(output.exists())
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_unchanged_run_skips_rendering_but_preview_does_not(self):
        source = forecast.Forecast('DMI WAM', RUN, [forecast.Step(RUN, RUN, {})])
        previous = {'forecastIdentity': source.identity()}
        with patch.object(forecast, 'load_step') as load:
            self.assertFalse(forecast.render_forecast(source, Path('/unused'), previous))
            load.assert_not_called()
        with patch.object(forecast, 'load_step', side_effect=RuntimeError('render requested')), \
                patch.object(forecast, 'download_step', return_value={}):
            with tempfile.TemporaryDirectory() as tmp, self.assertRaisesRegex(RuntimeError, 'render requested'):
                forecast.render_forecast(source, Path(tmp) / 'forecast', {**previous, 'preview': True})

    def test_native_decoder_stays_on_main_thread_while_downloads_prefetch(self):
        source = forecast.Forecast('DMI WAM', RUN, [forecast.Step(RUN, RUN, {})])
        def download(*args):
            self.assertIsNot(threading.current_thread(), threading.main_thread())
            return {}
        def decode(*args):
            self.assertIs(threading.current_thread(), threading.main_thread())
            return (np.zeros((2, 2)), np.zeros((2, 2))), {}
        with tempfile.TemporaryDirectory() as tmp, patch.object(forecast, 'Renderer') as renderer, \
                patch.object(forecast, 'PointForecast'), \
                patch.object(forecast, 'download_step', side_effect=download), \
                patch.object(forecast, 'load_step', side_effect=decode):
            renderer.return_value.render.return_value = {}
            self.assertTrue(forecast.render_forecast(source, Path(tmp) / 'forecast', max_frames=1))


if __name__ == '__main__':
    unittest.main()
