/* On-demand recent SMHI, ViVa and FMI observations for one selected station. */
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory();
    else root.ForecastLiveHistory=factory();
})(typeof window==='object'?window:globalThis,function(){
    'use strict';
    var hour=3600000,cache=new Map();
    var feeds={
        wind:{parameter:4,units:['meter per sekund'],range:[0,90]},
        windDirection:{parameter:3,units:['grader'],range:[0,360]},
        gust:{parameter:21,units:['meter per sekund'],range:[0,90]},
        wave:{parameter:1,units:['m'],range:[0,30]},
        waveDirection:{parameter:7,units:['grader','°'],range:[0,360]},
        level:{parameter:14,units:['cm'],range:[-500,500]},
        temperature:{parameter:5,units:['°C'],range:[-3,40]}
    };
    function keepSample(buckets,bucket,reading,latest,key){
        if(!buckets[bucket]||reading.time<buckets[bucket].time)buckets[bucket]=reading;
        if(latest&&(!latest[key]||reading.time>latest[key].time))latest[key]=reading;
    }
    function parse(data,id,key,now,latest){
        var feed=feeds[key],parts=id.split('-'),source=parts[0],allowed=source==='met'?['G','Y']:['G','O'];
        if(!feed||!data||String(data.station&&data.station.key)!==parts[1]||
            String(data.parameter&&data.parameter.key)!==String(feed.parameter)||!feed.units.includes(data.parameter.unit)||!Array.isArray(data.value))throw Error('Unexpected station history');
        var buckets={};
        data.value.forEach(function(sample){
            if(key==='temperature'&&(sample.depth===undefined||sample.depth===null||String(sample.depth).trim()===''||Number(sample.depth)!==0))return;
            if(typeof sample.value!=='string'&&typeof sample.value!=='number')return;
            if(String(sample.value).trim()==='')return;
            var value=Number(sample.value),time=sample.date;
            if(!allowed.includes(sample.quality)||!Number.isFinite(value)||value<feed.range[0]||value>feed.range[1]||
                !Number.isFinite(time)||time<now-24*hour||time>now+300000)return;
            var bucket=Math.floor(time/hour)*hour;
            if(bucket>Math.floor(now/hour)*hour)return;
            keepSample(buckets,bucket,{value:value,time:time,provisional:sample.quality!=='G'},latest,key);
        });
        return buckets;
    }
    var vivaParameters={wind:'Medelvind',gust:'Byvind',windDirection:'Vindriktning',wave:'Våghöjd',waveDirection:'Vågriktning',level:'Vattenstånd',temperature:'Vattentemp'};
    var swedishTime=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    function vivaTime(value){
        if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))return NaN;
        var nominal=Date.parse(value.replace(' ','T')+'Z'),matches=[];
        [60,120].forEach(function(offset){
            var candidate=nominal-offset*60000,parts={};
            if(!Number.isFinite(candidate))return;
            swedishTime.formatToParts(candidate).forEach(function(p){parts[p.type]=p.value;});
            if(parts.year+'-'+parts.month+'-'+parts.day+' '+parts.hour+':'+parts.minute+':'+parts.second===value)matches.push(candidate);
        });
        return matches.length===1?matches[0]:NaN;
    }
    function parseViva(data,key,now,latest){
        var result=data&&data.GetHistoryResult,feed=feeds[key],buckets={};
        if(!feed||!result||result.Felmeddelande||!Array.isArray(result.StationHistory)||
           (key==='level'&&result.WaterLevelRef!=='MVY'))throw Error('Unexpected ViVa history');
        result.StationHistory.forEach(function(sample){
            var raw=sample.Value;
            if(typeof raw!=='string'&&typeof raw!=='number'||String(raw).trim()==='')return;
            var value=Number(String(raw).replace(',','.')),time=vivaTime(sample.Time);
            if(!Number.isFinite(value)||value<feed.range[0]||value>feed.range[1]||!Number.isFinite(time)||time<now-24*hour||time>now+300000)return;
            var bucket=Math.floor(time/hour)*hour;
            if(bucket>Math.floor(now/hour)*hour)return;
            // History does not carry the current feed's Quality field.
            keepSample(buckets,bucket,{value:value,time:time,source:'viva',provisional:true},latest,key);
        });
        return buckets;
    }
    var fmiParameters={wind:'windspeedms',windDirection:'winddirection',gust:'windgust',wave:'WaveHs',waveDirection:'ModalWDi',temperature:'TWATER'};
    var fmiNS={wfs:'http://www.opengis.net/wfs/2.0',om:'http://www.opengis.net/om/2.0',gml:'http://www.opengis.net/gml/3.2',wml:'http://www.opengis.net/waterml/2.0'};
    function parseFmi(xml,id,keys,now,latest){
        if(typeof xml!=='string'||xml.length>4000000||/<!DOCTYPE/i.test(xml))throw Error('Unexpected FMI history');
        var document=new DOMParser().parseFromString(xml,'application/xml'),root=document.documentElement,series={};
        if(root.localName!=='FeatureCollection'||root.namespaceURI!==fmiNS.wfs||document.querySelector('parsererror'))throw Error('FMI history unavailable');
        keys.forEach(function(key){series[key]={};});
        Array.from(root.getElementsByTagNameNS(fmiNS.wfs,'member')).forEach(function(member){
            var prop=member.getElementsByTagNameNS(fmiNS.om,'observedProperty')[0];
            if(!prop)return;
            var href=prop.getAttributeNS('http://www.w3.org/1999/xlink','href'),parameter;
            try{parameter=new URL(href).searchParams.get('param');}catch(_){return;}
            var key=keys.find(function(k){return fmiParameters[k]===parameter;});
            if(!key)return;
            var identifier=Array.from(member.getElementsByTagNameNS(fmiNS.gml,'identifier')).find(function(e){return (e.getAttribute('codeSpace')||'').endsWith('/fmisid');});
            if(!identifier||'fmi-'+identifier.textContent!==id)throw Error('FMI history station mismatch');
            Array.from(member.getElementsByTagNameNS(fmiNS.wml,'MeasurementTVP')).forEach(function(sample){
                var valueElement=sample.getElementsByTagNameNS(fmiNS.wml,'value')[0],timeElement=sample.getElementsByTagNameNS(fmiNS.wml,'time')[0];
                if(!valueElement||!timeElement||!valueElement.textContent.trim()||!timeElement.textContent.endsWith('Z'))return;
                var value=Number(valueElement.textContent),time=Date.parse(timeElement.textContent),limit=feeds[key].range;
                if(!Number.isFinite(value)||value<limit[0]||value>limit[1]||!Number.isFinite(time)||time<now-24*hour||time>now+300000)return;
                var bucket=Math.floor(time/hour)*hour;
                if(bucket>Math.floor(now/hour)*hour)return;
                keepSample(series[key],bucket,{value:value,time:time,source:'fmi',provisional:true},latest,key);
            });
        });
        return series;
    }
    async function loadFmi(station,options,now){
        var keys=Object.keys(fmiParameters).filter(function(key){return station.readings[key];});
        var kind=keys.some(function(key){return ['wind','windDirection','gust'].includes(key);})?'weather':'wave';
        keys=keys.filter(function(key){return (kind==='weather')===['wind','windDirection','gust'].includes(key);});
        if(options.signal&&options.signal.aborted)throw new DOMException('Aborted','AbortError');
        var controller=new AbortController(),abort=function(){controller.abort();},timer=setTimeout(abort,15000);
        if(options.signal)options.signal.addEventListener('abort',abort,{once:true});
        try{
            var query=new URLSearchParams({service:'WFS',version:'2.0.0',request:'getFeature',storedquery_id:'fmi::observations::'+kind+'::timevaluepair',
                fmisid:station.id.split('-')[1],parameters:keys.map(function(key){return fmiParameters[key];}).join(','),
                starttime:new Date(now-24*hour).toISOString(),endtime:new Date(now).toISOString(),timestep:'10'});
            var response=await fetch('https://opendata.fmi.fi/wfs?'+query,{signal:controller.signal});
            if(!response.ok)throw Error('FMI history unavailable');
            var latest={},series=parseFmi(await response.text(),station.id,keys,now,latest);
            var result={rows:rows(series,now),latest:latest,fields:keys,unavailable:keys.filter(function(key){return !Object.keys(series[key]).length;})};
            if(result.rows.length)cache.set(station.id,{time:now,result:result});
            return result;
        }catch(error){if(options.signal&&options.signal.aborted)throw error;return {rows:[],fields:keys,unavailable:keys};}
        finally{clearTimeout(timer);if(options.signal)options.signal.removeEventListener('abort',abort);}
    }
    function rows(series,now){
        var latest=0;
        Object.keys(series).forEach(function(key){Object.keys(series[key]).forEach(function(t){latest=Math.max(latest,Number(t));});});
        if(!latest)return [];
        var result=[];
        for(var t=latest;t>latest-24*hour&&t>=Math.floor((now-24*hour)/hour)*hour;t-=hour){
            var readings={};Object.keys(series).forEach(function(key){if(series[key][t])readings[key]=series[key][t];});
            result.push({time:t,readings:readings});
        }
        return result;
    }
    async function load(station,options){
        options=options||{};var now=Date.now(),cached=cache.get(station.id);
        if(!options.force&&cached&&now-cached.time<600000)return cached.result;
        if(!/^(met|sea|viva|fmi)-\d+$/.test(station.id))throw Error('Invalid station');
        if(station.id.startsWith('fmi-'))return loadFmi(station,options,now);
        var parts=station.id.split('-'),source=parts[0]==='met'?'metobs':'ocobs';
        var keys=Object.keys(feeds).filter(function(key){return station.readings[key];});
        var series={},latest={},unavailable=[];
        // Sequential requests follow SMHI's guidance for historical observations.
        for(var key of keys){
            if(options.signal&&options.signal.aborted)throw new DOMException('Aborted','AbortError');
            var controller=new AbortController(),abort=function(){controller.abort();};
            if(options.signal)options.signal.addEventListener('abort',abort,{once:true});
            var timer=setTimeout(abort,15000);
            try{
                var isViva=station.readings[key].source==='viva'||parts[0]==='viva';
                var vivaId=station.vivaId||(parts[0]==='viva'?parts[1]:null);
                if(isViva&&!/^\d+$/.test(vivaId||''))throw Error('Missing ViVa station identity');
                var url=isViva?'https://services.viva.sjofartsverket.se/output/vivaoutputservice.svc/ViVaStationHistory/'+encodeURIComponent(vivaParameters[key])+'/'+vivaId+'?isMVY=true':
                    'https://opendata-download-'+source+'.smhi.se/api/version/1.0/parameter/'+feeds[key].parameter+'/station/'+parts[1]+'/period/latest-day/data.json';
                var response=await fetch(url,{signal:controller.signal});
                if(!response.ok)throw Error('History unavailable');
                series[key]=isViva?parseViva(await response.json(),key,now,latest):parse(await response.json(),station.id,key,now,latest);
            }catch(error){if(options.signal&&options.signal.aborted)throw error;unavailable.push(key);}
            finally{clearTimeout(timer);if(options.signal)options.signal.removeEventListener('abort',abort);}
        }
        var result={rows:rows(series,now),latest:latest,fields:keys.filter(function(key){return station.readings[key]||series[key]&&Object.keys(series[key]).length;}),unavailable:unavailable};
        if(result.rows.length)cache.set(station.id,{time:now,result:result});
        return result;
    }
    return {parse:parse,parseViva:parseViva,parseFmi:parseFmi,vivaTime:vivaTime,rows:rows,load:load};
});
