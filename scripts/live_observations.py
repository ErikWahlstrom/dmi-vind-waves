"""Collect free, latest-hour SMHI station observations for the Live view.

Seven batch queries cover wind, gusts, direction, wave buoys and local-mean water
level. Measurements keep their own observation time and quality, never forecast
values. Meteorological Y means provisional/unverified real-time data, whereas
oceanographic Y means suspect and is excluded.
"""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
from water_level import get_json, iso, HOUR

FEEDS = [
    ('metobs',4,'wind',(0,90),('meter per sekund',)),
    ('metobs',3,'windDirection',(0,360),('grader',)),
    ('metobs',21,'gust',(0,90),('meter per sekund',)),
    ('ocobs',1,'wave',(0,30),('m',)),
    ('ocobs',7,'waveDirection',(0,360),('grader','°')),
    ('ocobs',14,'level',(-500,500),('cm',)),
    ('ocobs',5,'temperature',(-3,40),('°C',)),
]


def merge_feed(stations, data, source, parameter, field, bounds, units, now):
    if str(data['parameter']['key']) != str(parameter) or data['parameter']['unit'] not in units:
        raise ValueError('Unexpected observation parameter or unit')
    for s in data['station']:
        lat,lon = s.get('latitude'),s.get('longitude')
        if not isinstance(lat,(float,int)) or not isinstance(lon,(float,int)) or not 53<=lat<=70 or not 9<=lon<=32:
            continue
        samples=[]
        for r in s.get('value',[]):
            try:
                value,stamp = float(r['value']),r['date']
            except (ValueError,TypeError,KeyError):
                continue
            if field=='temperature':
                try:
                    if float(r.get('depth',float('nan'))) != 0:
                        continue
                except (TypeError,ValueError):
                    continue
            allowed = ('G','Y') if source=='metobs' else ('G','O')
            if r.get('quality') not in allowed or not math.isfinite(value) or not bounds[0]<=value<=bounds[1] or not isinstance(stamp,(int,float)) or not now-2*HOUR<=stamp<=now+300000:
                continue
            samples.append({'value':value,'time':stamp,'provisional':r['quality']!='G'})
        if not samples:
            continue
        key=('met-' if source=='metobs' else 'sea-')+str(s['key'])
        station=stations.setdefault(key,{'id':key,'name':s['name'],'owner':s.get('owner','SMHI'),
                                        'lat':lat,'lon':lon,'readings':{}})
        if station['lat']!=lat or station['lon']!=lon:
            raise ValueError('Station coordinates differ between observation feeds')
        station['readings'][field]=max(samples,key=lambda r:r['time'])
        if field=='temperature':
            station['readings'][field]['depth']=0


def capture(fetch=get_json,now=None):
    now=now if now is not None else round(datetime.now(timezone.utc).timestamp()*1000)
    stations,unavailable={},[]
    for source,parameter,field,bounds,units in FEEDS:
        url=f'https://opendata-download-{source}.smhi.se/api/version/1.0/parameter/{parameter}/station-set/all/period/latest-hour/data.json'
        try:
            merge_feed(stations,fetch(url),source,parameter,field,bounds,units,now)
        except Exception as error:
            unavailable.append(field)
            print(f'{field}: observation feed unavailable ({error})',flush=True)
    if not stations:
        raise ValueError('No fresh station observations; retain the previous snapshot')
    return {'schema':1,'checked':iso(now),'stations':sorted(stations.values(),key=lambda s:s['id']),
            'unavailable':unavailable,'attribution':'SMHI, CC BY 4.0; observation map by this site'}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    data=capture()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    temp=args.output.with_suffix('.tmp')
    temp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    temp.replace(args.output)
    print(f'{len(data["stations"])} observed stations; '+', '.join(f'{field}: {sum(field in s["readings"] for s in data["stations"])}' for field in ('wind','wave','level','temperature')),flush=True)
