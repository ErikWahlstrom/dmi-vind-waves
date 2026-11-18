import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('water_level', Path(__file__).parents[1] / 'scripts/water_level.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class WaterLevelTests(unittest.TestCase):
    def setUp(self):
        self.start = w.millis('2026-11-18T12:00:00Z')
        self.times = [self.start+i*w.HOUR for i in range(49)]
        self.stamps = [w.iso(t) for t in self.times]
        self.data = {'domain':{'axes':{'t':{'values':self.stamps}, 'x':{'start':18,'stop':18.1,'num':2}, 'y':{'values':[59]}}},
                     'parameters':{'sea-mean-deviation':{}},
                     'ranges':{'sea-mean-deviation':{'axisNames':['t','y','x'],'shape':[49,1,2],
                                                   'values':[x for _ in self.times for x in [None,.4]]}}}

    def test_land_cell_is_skipped_and_regular_axes_expanded(self):
        result = w.parse_model(self.data,59,18,self.times)
        self.assertAlmostEqual(result['lon'],18.1)
        self.assertEqual(result['values'],[40]*49)
        self.assertLess(result['distanceKm'],10)

    def test_axis_order_and_forecast_identity(self):
        data = copy.deepcopy(self.data)
        data['ranges']['sea-mean-deviation'].update(axisNames=['x','t','y'],shape=[2,49,1],values=[None]*49+[.25]*49)
        self.assertEqual(w.parse_model(data,59,18,self.times)['values'],[25]*49)
        with self.assertRaises(ValueError):w.parse_model(data,59,18,self.times[1:])
        data['ranges']['sea-mean-deviation']['shape']=[49,2,1]
        with self.assertRaises(ValueError):w.parse_model(data,59,18,self.times)

    def test_no_distant_or_invalid_sea_cell(self):
        self.assertIsNone(w.parse_model(self.data,60,18,self.times))
        self.data['ranges']['sea-mean-deviation']['values']=[None]*98
        self.assertIsNone(w.parse_model(self.data,59,18,self.times))

    def test_observation_quality_age_and_units(self):
        now = self.start+w.HOUR
        raw={'value':[{'date':now-i*60000,'value':v,'quality':q} for i,v,q in
                      [(0,20,'G'),(1,19,'O'),(2,999,'G'),(3,21,'Y'),(180,20,'G')]]}
        self.assertEqual([v[1] for v in w.observations(raw,now)],[19,20])

    def test_alignment_uses_contemporaneous_median_and_preserves_changes(self):
        model={'values':[40+i for i in range(49)]}
        obs=[[self.start+i*60000,-20+i/60,'O'] for i in range(10)]
        # One outlier must not shift the reference level.
        obs[3][1]=70
        values,offset=w.aligned_forecast(self.times,model,obs)
        self.assertAlmostEqual(offset,-60)
        self.assertIsNone(values[0]) # never backfill a forecast as an observation
        self.assertEqual(values[1],-19)
        self.assertEqual(values[2]-values[1],1)
        self.assertEqual(w.aligned_forecast(self.times,model,obs[:1]),(None,None))
        self.assertEqual(w.aligned_forecast(self.times,model,[[self.start-w.HOUR,5,'G']]*3),(None,None))

    def test_capture_reuses_pinned_model_and_fetches_observations_once(self):
        now=self.start+w.HOUR
        stations=[{'key':str(i),'name':str(i),'latitude':59,'longitude':18,
                   'value':[{'date':now-j*60000,'value':20,'quality':'O'} for j in range(4)]} for i in range(5)]
        previous={'schema':1,'modelRun':'run','times':self.stamps,'stations':[
            {'id':str(i),'lat':59,'lon':18,'model':{'values':[40]*49}} for i in range(5)]}
        calls=[]
        def fetch(url):
            calls.append(url)
            if 'station-set' in url:return {'parameter':{'key':'14','unit':'cm'},'station':stations}
            if url.endswith('/instances'):return {'instances':[{'id':'run','extent':{'temporal':{'values':self.stamps}}}]}
            return {'parameter_names':{'sea-mean-deviation':{'unit':{'symbol':{'value':'m'}}}}}
        result=w.capture(previous,fetch,now)
        self.assertEqual(len(calls),3)
        self.assertEqual(len(result['stations']),5)
        self.assertTrue(all(s['forecast'][-1]==20 for s in result['stations']))
        # First capture uses the bulk fields directly, without extra point calls.
        calls.clear()
        bulk=lambda stations,run,stamps,fetch:{s['key']:{'values':[40]*49} for s in stations}
        result=w.capture(None,fetch,now,bulk)
        self.assertEqual(len(calls),3)
        self.assertTrue(all(s['forecast'][-1]==20 for s in result['stations']))

    @unittest.skipUnless(importlib.util.find_spec('eccodes'), 'ecCodes optional for basic parser checks')
    def test_grib_parameter_time_bitmap_and_signed_values(self):
        import eccodes as ec
        import numpy as np
        handle=ec.codes_grib_new_from_samples('regular_ll_sfc_grib1')
        try:
            for key,value in [('centre','ekmi'),('table2Version',128),('indicatorOfParameter',82),
                              ('level',0),('Ni',2),('Nj',2),('dataDate',20261118),('dataTime',1200),
                              ('latitudeOfFirstGridPointInDegrees',59),('latitudeOfLastGridPointInDegrees',58),
                              ('longitudeOfFirstGridPointInDegrees',18),('longitudeOfLastGridPointInDegrees',19),
                              ('bitmapPresent',1),('missingValue',9999)]:
                ec.codes_set(handle,key,value)
            ec.codes_set_values(handle,[.25,-.4,9999,.6])
            message=ec.codes_get_message(handle)
            values,grid,coords=w.decode_water_message(message,self.start,self.start,True)
            self.assertAlmostEqual(values[0],25,places=3)
            self.assertAlmostEqual(values[1],-40,places=3)
            self.assertTrue(np.isnan(values[2]))
            self.assertEqual(len(coords[0]),4)
            with self.assertRaises(ValueError):w.decode_water_message(message,self.start,self.start+w.HOUR)
            ec.codes_set(handle,'indicatorOfParameter',33)
            with self.assertRaises(ValueError):w.decode_water_message(ec.codes_get_message(handle),self.start,self.start)
        finally:ec.codes_release(handle)


if __name__ == '__main__':unittest.main()
