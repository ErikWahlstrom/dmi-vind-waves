"""Collect free, latest SMHI, FMI and Sjöfartsverket ViVa station observations for the Live view.

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
import fmi_observations as fmi
from water_level import get_json, iso, HOUR, distance
from urllib.parse import quote
from zoneinfo import ZoneInfo
import re
import unicodedata

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


VIVA = 'https://services.viva.sjofartsverket.se/output/vivaoutputservice.svc/'
VIVA_FEEDS = [
    ('Medelvind','wind','m/s',(0,90)),
    ('Byvind','gust','m/s',(0,90)),
    ('Vindriktning','windDirection','°',(0,360)),
    ('Våghöjd','wave','m',(0,30)),
    ('Vågriktning','waveDirection','°',(0,360)),
    ('Vattenstånd','level','cm',(-500,500)),
    ('Vattentemp','temperature','°C',(-3,40)),
]


def viva_time(value):
    # ViVa sends Swedish wall time, without an offset. Skip ambiguous DST hours.
    local = datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
    zone = ZoneInfo('Europe/Stockholm')
    candidates = {round(local.replace(tzinfo=zone,fold=fold).timestamp()*1000)
                  for fold in (0,1)
                  if datetime.fromtimestamp(local.replace(tzinfo=zone,fold=fold).timestamp(),zone).replace(tzinfo=None)==local}
    if len(candidates)!=1:
        raise ValueError('Ambiguous or nonexistent Swedish observation time')
    return candidates.pop()


def station_name(name):
    name = re.sub(r'\(smhi\)|vågboj|\d+', '', name.lower())
    name = re.sub(r'\s+a\s*$', '', name.strip())  # SMHI's automatic-station suffix.
    name = ''.join(c for c in unicodedata.normalize('NFKD',name) if c.isalnum())
    return {'brofjordensangoring':'brofjorden'}.get(name,name)


def viva_catalog(data,stations):
    catalog={}
    for s in data['GetStationsResult']['Stations']:
        key,name,lat,lon=s.get('ID'),s.get('Name'),s.get('Lat'),s.get('Lon')
        if not isinstance(key,int) or key<1 or not isinstance(name,str) or not 0<len(name)<=100:
            continue
        if not isinstance(lat,(int,float)) or not isinstance(lon,(int,float)) or not 53<=lat<=70 or not 9<=lon<=32:
            continue
        # A matching name AND nearby position are required; proximity alone is unsafe.
        matches=[other for other in stations.values() if station_name(other['name'])==station_name(name)
                 and distance(lat,lon,other['lat'],other['lon'])<=1.5]
        station=min(matches,key=lambda other:distance(lat,lon,other['lat'],other['lon'])) if matches else {
            'id':f'viva-{key}','name':name,'owner':'Sjöfartsverket · ViVa','lat':lat,'lon':lon,'readings':{}}
        catalog[key]=(station,str(key))
    return catalog


def merge_viva(stations,catalog,data,parameter,field,unit,bounds,now):
    result=data['GetManyStationsOneParameterResult']
    if result.get('Felmeddelande') or not isinstance(result.get('SampleList'),list):
        raise ValueError('ViVa batch unavailable')
    for sample in result['SampleList']:
        if sample.get('Name')!=parameter or sample.get('Unit')!=unit or sample.get('Quality')!='Ok':
            continue
        if field=='level' and sample.get('WaterLevelReference')!='MVY':
            continue
        if sample.get('StationID') not in catalog:
            continue
        raw=str(sample.get('Value','')).strip()
        # Wind/wave speeds may have a compass prefix, e.g. "SV 3.4".
        if field in ('wind','gust','wave'):
            raw=re.sub(r'^[NSVEO]{1,3}\s+', '', raw)
        try:
            value,stamp=float(raw.replace(',','.')),viva_time(sample['Updated'])
        except (ValueError,TypeError,KeyError):
            continue
        if not math.isfinite(value) or not bounds[0]<=value<=bounds[1] or not now-2*HOUR<=stamp<=now+300000:
            continue
        station,viva_id=catalog[sample['StationID']]
        station['vivaId']=viva_id
        existing=station['readings'].get(field)
        if not existing or stamp>existing['time']:
            reading={'value':value,'time':stamp,'provisional':False,'source':'viva'}
            if field=='temperature':
                reading['depth']=None  # Sensor depth is not supplied by ViVa.
            station['readings'][field]=reading
        stations[station['id']]=station


def get_observation(url):
    return fmi.get_xml(url) if url.startswith(fmi.BASE+'?') else get_json(url)


def capture(fetch=get_observation,now=None):
    now=now if now is not None else round(datetime.now(timezone.utc).timestamp()*1000)
    stations,unavailable={},[]
    for source,parameter,field,bounds,units in FEEDS:
        url=f'https://opendata-download-{source}.smhi.se/api/version/1.0/parameter/{parameter}/station-set/all/period/latest-hour/data.json'
        try:
            merge_feed(stations,fetch(url),source,parameter,field,bounds,units,now)
        except Exception as error:
            unavailable.append(field)
            print(f'{field}: observation feed unavailable ({error})',flush=True)
    try:
        catalog=viva_catalog(fetch(VIVA+'vivastation/'),stations)
        for parameter,field,unit,bounds in VIVA_FEEDS:
            try:
                merge_viva(stations,catalog,fetch(VIVA+'GetManyStationsOneParameter/'+quote(parameter.lower())+'?isMVY=true'),parameter,field,unit,bounds,now)
            except Exception as error:
                unavailable.append('viva-'+field)
                print(f'ViVa {field}: unavailable ({error})',flush=True)
    except Exception as error:
        unavailable.append('viva')
        print(f'ViVa stations: unavailable ({error})',flush=True)
    for kind in fmi.FEEDS:
        try:
            fmi.merge(stations,fetch(fmi.url(kind,now)),kind,now)
        except Exception as error:
            unavailable.append('fmi-'+kind)
            print(f'FMI {kind}: unavailable ({error})',flush=True)
    if not stations:
        raise ValueError('No fresh station observations; retain the previous snapshot')
    return {'schema':1,'checked':iso(now),'stations':sorted(stations.values(),key=lambda s:s['id']),
            'unavailable':unavailable,'attribution':'SMHI and FMI (CC BY 4.0); Sjöfartsverket ViVa; observation map by this site'}


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
