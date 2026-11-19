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

    def test_surface_temperature_keeps_units_depth_and_quality(self):
        self.station['value']=[{'value':6.05,'date':self.now,'quality':'O','depth':'0'},
                               {'value':9,'date':self.now+1000,'quality':'G','depth':'5'},
                               {'value':99,'date':self.now,'quality':'G','depth':'0'},
                               {'value':8,'date':self.now,'quality':'Y','depth':'0'}]
        data={'parameter':{'key':'5','unit':'°C'},'station':[self.station]}
        result={};live.merge_feed(result,data,'ocobs',5,'temperature',(-3,40),('°C',),self.now)
        self.assertEqual(result['sea-1']['readings']['temperature']['value'],6.05)
        self.assertEqual(result['sea-1']['readings']['temperature']['depth'],0)
        self.assertTrue(result['sea-1']['readings']['temperature']['provisional'])
        data['parameter']['unit']='F'
        with self.assertRaises(ValueError):live.merge_feed({},data,'ocobs',5,'temperature',(-3,40),('°C',),self.now)

    def test_partial_feed_failure_keeps_other_actual_observations(self):
        self.station['value'][0]['quality']='G'
        def fetch(url):
            if '/parameter/4/' in url:return {'parameter':{'key':'4','unit':'meter per sekund'},'station':[self.station]}
            raise OSError('offline')
        result=live.capture(fetch,self.now)
        self.assertEqual(len(result['stations']),1)
        self.assertEqual(result['stations'][0]['readings']['wind']['time'],self.now)
        self.assertIn('wave',result['unavailable'])


class VivaTests(unittest.TestCase):
    def setUp(self):
        self.now=live.viva_time('2026-11-19 16:20:00')
        self.stations={'sea-35119':{'id':'sea-35119','name':'Bönan 2','lat':60.7315,'lon':17.325833,'readings':{
            'level':{'value':23,'time':self.now-3600000}}}}
        self.catalog=live.viva_catalog({'GetStationsResult':{'Stations':[
            {'ID':33,'Name':'Bönan','Lat':60.7315,'Lon':17.325833},
            {'ID':44,'Name':'New coastal station','Lat':61.2,'Lon':17.8},
            {'ID':45,'Name':'Different nearby sensor','Lat':60.7315,'Lon':17.325833},
            {'ID':46,'Name':'Bönan','Lat':65,'Lon':18},
        ]}},self.stations)

    def sample(self,**values):
        return dict({'Name':'Vattentemp','Value':'5.4','Unit':'°C','Quality':'Ok','Updated':'2026-11-19 16:10:00','StationID':33},**values)

    def merge(self,samples,parameter='Vattentemp',field='temperature',unit='°C',bounds=(-3,40)):
        live.merge_viva(self.stations,self.catalog,{'GetManyStationsOneParameterResult':{'SampleList':samples}},parameter,field,unit,bounds,self.now)

    def test_provider_station_name_variants_match(self):
        for a,b in [('Örskär A','Örskär (SMHI)'),('Finngrundet Vågboj','Finngrundet (SMHI)'),('Pite-Rönnskär A','Pite Rönnskär (SMHI)'),('Bönan 2','Bönan')]:
            self.assertEqual(live.station_name(a),live.station_name(b))

    def test_bonan_merges_by_name_and_position_and_keeps_temperature_depth_unknown(self):
        self.merge([self.sample()])
        self.assertNotIn('viva-33',self.stations)
        station=self.stations['sea-35119'];self.assertEqual(station['vivaId'],'33')
        self.assertEqual(station['readings']['temperature'],{'value':5.4,'time':live.viva_time('2026-11-19 16:10:00'),'provisional':False,'source':'viva','depth':None})
        self.assertEqual(station['readings']['level']['value'],23)
        self.assertEqual(self.catalog[45][0]['id'],'viva-45')
        self.assertEqual(self.catalog[46][0]['id'],'viva-46')
        self.merge([self.sample(StationID=44)])
        self.assertIn('viva-44',self.stations)

    def test_invalid_old_wrong_unit_quality_and_other_temperature_sensors_are_excluded(self):
        self.merge([self.sample(Value='NaN'),self.sample(Value='41'),self.sample(Unit='F'),
                    self.sample(Quality='Gammalt värde'),self.sample(Updated='2026-11-18 16:10:00'),
                    self.sample(Updated='2026-11-19 17:10:00'),self.sample(Name='Vattentemp botten'),
                    self.sample(Value='-'),self.sample(StationID=999)])
        self.assertNotIn('temperature',self.stations['sea-35119']['readings'])

    def test_wind_prefix_directions_and_mean_water_level_reference(self):
        self.merge([self.sample(Name='Medelvind',Value='SV 3.4',Unit='m/s')],'Medelvind','wind','m/s',(0,90))
        self.assertEqual(self.stations['sea-35119']['readings']['wind']['value'],3.4)
        for reference in ['RH2000','Sjökortsnivå',None]:
            self.merge([self.sample(Name='Vattenstånd',Value='31',Unit='cm',WaterLevelReference=reference)],'Vattenstånd','level','cm',(-500,500))
        self.assertEqual(self.stations['sea-35119']['readings']['level']['value'],23)
        self.merge([self.sample(Name='Vattenstånd',Value='25',Unit='cm',WaterLevelReference='MVY')],'Vattenstånd','level','cm',(-500,500))
        self.assertEqual(self.stations['sea-35119']['readings']['level']['value'],25)
        # A delayed provider must not overwrite a more recent reading.
        self.merge([self.sample(Name='Vattenstånd',Value='20',Unit='cm',WaterLevelReference='MVY',Updated='2026-11-19 16:00:00')],'Vattenstånd','level','cm',(-500,500))
        self.assertEqual(self.stations['sea-35119']['readings']['level']['value'],25)

    def test_swedish_time_handles_summer_winter_and_skips_dst_ambiguities(self):
        self.assertEqual(live.iso(live.viva_time('2026-11-19 16:10:00')),'2026-11-19T15:10:00Z')
        self.assertEqual(live.iso(live.viva_time('2026-07-19 16:10:00')),'2026-07-19T14:10:00Z')
        for value in ['2026-10-25 02:30:00','2026-03-29 02:30:00']:
            with self.assertRaises(ValueError):live.viva_time(value)

    def test_viva_survives_smhi_failure_and_uses_lowercase_batch_parameter(self):
        calls=[]
        def fetch(url):
            calls.append(url)
            if url==live.VIVA+'vivastation/':return {'GetStationsResult':{'Stations':[{'ID':33,'Name':'Bönan','Lat':60.7315,'Lon':17.325833}]}}
            if '/vattentemp?' in url:return {'GetManyStationsOneParameterResult':{'SampleList':[self.sample()]}}
            raise OSError('offline')
        result=live.capture(fetch,self.now)
        self.assertEqual(result['stations'][0]['id'],'viva-33')
        self.assertEqual(result['stations'][0]['readings']['temperature']['value'],5.4)
        self.assertIn('wave',result['unavailable'])


if __name__=='__main__':unittest.main()
