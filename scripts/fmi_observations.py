"""FMI Open Data WFS: Finnish wind and marine observations (CC BY 4.0).

The timevaluepair schema supplies station coordinates/IDs and observed-property
codes. Units are fixed by the selected FMI parameter definitions; NaN is missing.
"""
from datetime import datetime, timezone
import math
import re
import urllib.request
from urllib.parse import urlencode, urlparse, parse_qs
import xml.etree.ElementTree as ET

BASE='https://opendata.fmi.fi/wfs'
HOUR=3600000
FEEDS={
    'weather':{'windspeedms':('wind',(0,90)), 'winddirection':('windDirection',(0,360)), 'windgust':('gust',(0,90))},
    'wave':{'WaveHs':('wave',(0,30)), 'ModalWDi':('waveDirection',(0,360)), 'TWATER':('temperature',(-3,40))},
}
NS={'wfs':'http://www.opengis.net/wfs/2.0', 'om':'http://www.opengis.net/om/2.0',
    'gml':'http://www.opengis.net/gml/3.2', 'wml':'http://www.opengis.net/waterml/2.0'}
XLINK='{http://www.w3.org/1999/xlink}href'


def url(kind,now):
    return BASE+'?'+urlencode({'service':'WFS','version':'2.0.0','request':'getFeature',
        'storedquery_id':f'fmi::observations::{kind}::timevaluepair',
        'starttime':datetime.fromtimestamp((now-2*HOUR)/1000,timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'endtime':datetime.fromtimestamp(now/1000,timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'parameters':','.join(FEEDS[kind]),'timestep':'10','bbox':'19,59,32,66'})


def get_xml(url):
    request=urllib.request.Request(url,headers={'User-Agent':'Baltic-forecast-live/1.0'})
    with urllib.request.urlopen(request,timeout=25) as response:
        return response.read(8*1024*1024+1)


def merge(stations,data,kind,now):
    if len(data)>8*1024*1024 or b'<!DOCTYPE' in (data if isinstance(data,bytes) else data.encode()).upper():
        raise ValueError('Unexpected FMI XML')
    root=ET.fromstring(data)
    if root.tag!='{'+NS['wfs']+'}FeatureCollection':
        raise ValueError('FMI observation query failed')
    for member in root.findall('wfs:member',NS):
        prop=member.find('.//om:observedProperty',NS)
        if prop is None:
            continue
        parameter=parse_qs(urlparse(prop.get(XLINK,'')).query).get('param',[''])[0]
        if parameter not in FEEDS[kind]:
            continue
        field,bounds=FEEDS[kind][parameter]
        identifier=next((e.text for e in member.findall('.//gml:identifier',NS) if e.get('codeSpace','').endswith('/fmisid')),None)
        name=next((e.text for e in member.findall('.//gml:name',NS) if e.get('codeSpace','').endswith('/name')),None)
        point=member.find('.//gml:Point',NS)
        if not identifier or not re.fullmatch(r'\d+',identifier) or not name or len(name)>100 or point is None:
            continue
        if point.get('srsName')!='http://www.opengis.net/def/crs/EPSG/0/4258':
            continue  # FMI uses latitude, longitude in ETRS89; never guess axis order.
        try:
            lat,lon=map(float,point.findtext('gml:pos','',NS).split())
        except ValueError:
            continue
        if not 59<=lat<=66 or not 19<=lon<=32:
            continue
        samples=[]
        for sample in member.findall('.//wml:MeasurementTVP',NS):
            try:
                raw=sample.findtext('wml:value','',NS)
                stamp=sample.findtext('wml:time','',NS)
                if not stamp.endswith('Z'):
                    continue
                time=round(datetime.fromisoformat(stamp.replace('Z','+00:00')).timestamp()*1000)
                value=float(raw)
            except (ValueError,TypeError):
                continue
            if math.isfinite(value) and bounds[0]<=value<=bounds[1] and now-2*HOUR<=time<=now+300000:
                samples.append({'value':value,'time':time,'provisional':True,'source':'fmi'})
        if not samples:
            continue
        key='fmi-'+identifier
        station=stations.setdefault(key,{'id':key,'name':name,'owner':'Finnish Meteorological Institute (FMI)',
                                        'lat':lat,'lon':lon,'readings':{}})
        if (station['lat'],station['lon'])!=(lat,lon):
            raise ValueError('FMI station coordinates differ between parameters')
        reading=max(samples,key=lambda s:s['time'])
        if field=='temperature':
            reading['depth']=None  # Buoys have different sensor depths; keep the generic label.
        previous=station['readings'].get(field)
        if not previous or reading['time']>previous['time']:
            station['readings'][field]=reading
