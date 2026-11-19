/* On-demand recent SMHI observations for one selected station. */
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
    function parse(data,id,key,now){
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
            if(!buckets[bucket]||time>buckets[bucket].time)buckets[bucket]={value:value,time:time,provisional:sample.quality!=='G'};
        });
        return buckets;
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
        if(!/^(met|sea)-\d+$/.test(station.id))throw Error('Invalid station');
        var parts=station.id.split('-'),source=parts[0]==='met'?'metobs':'ocobs';
        var keys=parts[0]==='met'?['wind','gust','windDirection']:(station.readings.wave?['wave','waveDirection']:[]).concat(station.readings.level?['level']:[],station.readings.temperature?['temperature']:[]);
        keys=keys.filter(function(key){return station.readings[key];});
        var series={},unavailable=[];
        // Sequential requests follow SMHI's guidance for historical observations.
        for(var key of keys){
            if(options.signal&&options.signal.aborted)throw new DOMException('Aborted','AbortError');
            var controller=new AbortController(),abort=function(){controller.abort();};
            if(options.signal)options.signal.addEventListener('abort',abort,{once:true});
            var timer=setTimeout(abort,15000);
            try{
                var response=await fetch('https://opendata-download-'+source+'.smhi.se/api/version/1.0/parameter/'+feeds[key].parameter+'/station/'+parts[1]+'/period/latest-day/data.json',{signal:controller.signal});
                if(!response.ok)throw Error('History unavailable');
                series[key]=parse(await response.json(),station.id,key,now);
            }catch(error){if(options.signal&&options.signal.aborted)throw error;unavailable.push(key);}
            finally{clearTimeout(timer);if(options.signal)options.signal.removeEventListener('abort',abort);}
        }
        var result={rows:rows(series,now),fields:keys.filter(function(key){return station.readings[key]||series[key]&&Object.keys(series[key]).length;}),unavailable:unavailable};
        if(result.rows.length)cache.set(station.id,{time:now,result:result});
        return result;
    }
    return {parse:parse,rows:rows,load:load};
});
