import sys
from pathlib import Path
import unittest
from urllib.parse import parse_qs,urlparse
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import fmi_observations as fmi
import live_observations as live

FIXTURE=(Path(__file__).parent/'fixtures/fmi-observations.xml').read_bytes()
NOW=1795102200000  # 2026-11-19 15:30 UTC

class FmiTests(unittest.TestCase):
    def test_wind_and_buoy_parameters_have_ids_coordinates_latest_times_and_missing_values(self):
        stations={}
        for kind in fmi.FEEDS:fmi.merge(stations,FIXTURE,kind,NOW)
        self.assertEqual(len(stations),3)
        wind=stations['fmi-100908'];self.assertEqual(wind['name'],'Parainen Utö')
        self.assertEqual((wind['lat'],wind['lon']),(59.77909,21.37479))
        self.assertEqual(wind['readings']['wind']['value'],6.2)
        self.assertEqual(wind['readings']['windDirection']['value'],230)
        self.assertTrue(wind['readings']['wind']['provisional'])
        self.assertEqual(wind['readings']['wind']['source'],'fmi')
        self.assertEqual(stations['fmi-134246']['readings']['wave']['value'],1.2)
        self.assertEqual(stations['fmi-134246']['readings']['waveDirection']['value'],101)
        self.assertEqual(stations['fmi-134246']['readings']['temperature']['value'],6.5)
        self.assertIsNone(stations['fmi-134246']['readings']['temperature']['depth'])
        self.assertEqual(list(stations['fmi-103807']['readings']),['temperature'])

    def test_stale_future_bad_numbers_wrong_axes_and_wrong_parameters_are_rejected(self):
        for xml,kind,now in [(FIXTURE,'wave',NOW+3*fmi.HOUR), (FIXTURE,'wave',NOW-3*fmi.HOUR),
            (FIXTURE.replace(b'<wml2:value>1.2</wml2:value>',b'<wml2:value>99</wml2:value>').replace(b'<wml2:value>1.1</wml2:value>',b'<wml2:value>-1</wml2:value>'),'wave',NOW)]:
            stations={};fmi.merge(stations,xml,kind,now)
            self.assertFalse(any('wave' in s['readings'] for s in stations.values()))
        stations={};fmi.merge(stations,FIXTURE.replace(b'61.8 20.233',b'20.233 61.8'),'wave',NOW)
        self.assertNotIn('fmi-134246',stations)
        stations={};fmi.merge(stations,FIXTURE.replace(b'/EPSG/0/4258',b'/EPSG/0/4326'),'wave',NOW);self.assertFalse(stations)
        stations={};fmi.merge(stations,FIXTURE.replace(b'param=WaveHs',b'param=SeaLevel'),'wave',NOW)
        self.assertNotIn('wave',stations['fmi-134246']['readings'])

    def test_error_and_malformed_xml_are_not_healthy_empty_feeds(self):
        for xml in [b'<ExceptionReport/>',b'not XML',b'<!DOCTYPE x><x/>']:
            with self.assertRaises(Exception):fmi.merge({},xml,'wave',NOW)

    def test_batch_query_is_bounded_recent_and_does_not_request_levels(self):
        for kind in fmi.FEEDS:
            query=parse_qs(urlparse(fmi.url(kind,NOW)).query)
            self.assertEqual(query['bbox'],['19,59,32,66'])
            self.assertEqual(query['starttime'],['2026-11-19T13:30:00Z'])
            self.assertEqual(query['endtime'],['2026-11-19T15:30:00Z'])
            self.assertNotIn('SeaLevel',query['parameters'][0])

    def test_fmi_survives_other_provider_failures_and_partial_fmi_failure(self):
        def fetch(url):
            if 'observations%3A%3Awave' in url:return FIXTURE
            raise OSError('offline')
        data=live.capture(fetch,NOW)
        self.assertEqual(len(data['stations']),2)
        self.assertIn('fmi-weather',data['unavailable'])
        self.assertFalse(any('level' in s['readings'] for s in data['stations']))
        self.assertIn('FMI',data['attribution'])

if __name__=='__main__':unittest.main()
