import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import live_observations as live


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.now=1795071600000
        self.station={'key':'1','name':'Test coastal station','latitude':60.8,'longitude':17.4,'owner':'SMHI',
                      'value':[{'value':'6.2','date':self.now,'quality':'Y'}]}

    def test_meteorological_real_time_quality_and_ocean_suspect_quality_differ(self):
        data={'parameter':{'key':'4','unit':'meter per sekund'},'station':[self.station]}
        result={};live.merge_feed(result,data,'metobs',4,'wind',(0,90),('meter per sekund',),self.now)
        self.assertEqual(result['met-1']['readings']['wind']['value'],6.2)
        self.assertTrue(result['met-1']['readings']['wind']['provisional'])
        self.station['value'][0]['quality']='Y'
        result={};live.merge_feed(result,data,'ocobs',4,'wind',(0,90),('meter per sekund',),self.now)
        self.assertFalse(result)
        self.station['value'][0]['quality']='O'
        live.merge_feed(result,data,'ocobs',4,'wind',(0,90),('meter per sekund',),self.now)
        self.assertEqual(result['sea-1']['name'],self.station['name'])

    def test_bad_values_old_readings_and_wrong_units_are_excluded(self):
        self.station['value']=[{'value':'NaN','date':self.now,'quality':'G'},
                               {'value':'9','date':self.now-3*3600000,'quality':'G'},
                               {'value':'100','date':self.now,'quality':'G'}]
        data={'parameter':{'key':'4','unit':'meter per sekund'},'station':[self.station]}
        result={};live.merge_feed(result,data,'metobs',4,'wind',(0,90),('meter per sekund',),self.now)
        self.assertFalse(result)
        with self.assertRaises(ValueError):live.merge_feed(result,data,'metobs',3,'wind',(0,90),('meter per sekund',),self.now)

    def test_partial_feed_failure_keeps_other_actual_observations(self):
        self.station['value'][0]['quality']='G'
        def fetch(url):
            if '/parameter/4/' in url:return {'parameter':{'key':'4','unit':'meter per sekund'},'station':[self.station]}
            raise OSError('offline')
        result=live.capture(fetch,self.now)
        self.assertEqual(len(result['stations']),1)
        self.assertEqual(result['stations'][0]['readings']['wind']['time'],self.now)
        self.assertIn('wave',result['unavailable'])


if __name__=='__main__':unittest.main()
