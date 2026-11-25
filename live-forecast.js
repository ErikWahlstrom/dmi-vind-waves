/* Station timelines: measured past and modelled future share quantity columns. */
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory();
    else root.ForecastLiveTimeline=factory();
})(typeof window==='object'?window:globalThis,function(){
    'use strict';
    var hour=3600000,fields=['wind','wave','swell','level'];
    var observedFields=['wind','wave','level','temperature'],directionKeys={wind:'windDirection',wave:'waveDirection'};
    function nearest(index,station){
        var best=-1,distance=20;
        index.points.forEach(function(p,i){
            var rad=Math.PI/180,a=station.lat*rad,b=p[3]*rad;
            var km=12742*Math.asin(Math.min(1,Math.sqrt(Math.sin((b-a)/2)**2+Math.cos(a)*Math.cos(b)*Math.sin((p[2]-station.lon)*rad/2)**2)));
            if(km<distance){best=i;distance=km;}
        });
        return {index:best,distanceKm:distance};
    }
    function model(index,tile,best,now){
        if(tile.schema!==1||tile.identity!==index.identity||!Number.isInteger(tile.count)||tile.count<1||tile.count>index.tileSize||
            best<0||best>=index.points.length||best%index.tileSize>=tile.count||
            JSON.stringify(index.fields)!==JSON.stringify(['wind','wind_dir','wave','wave_dir','swell','swell_dir'])||
            JSON.stringify(index.scales)!==JSON.stringify([100,10,100,10,100,10]))throw Error('Invalid station forecast data');
        var binary=atob(tile.data),bytes=Uint8Array.from(binary,function(c){return c.charCodeAt(0);});
        if(bytes.length!==index.times.length*tile.count*12)throw Error('Incomplete station forecast data');
        var view=new DataView(bytes.buffer),local=best%index.tileSize;
        return index.times.map(function(t,h){
            var time=Date.parse(t),readings={};
            ['wind','wave','swell'].forEach(function(key,f){
                var value=view.getUint16(((h*tile.count+local)*6+f*2)*2,true),dir=view.getUint16(((h*tile.count+local)*6+f*2+1)*2,true);
                if(value!==65535)readings[key]={value:value/100,time:time,direction:dir===65535?null:dir/10};
            });
            return {time:time,readings:readings,kind:'forecast'};
        }).filter(function(row){return Number.isFinite(row.time)&&row.time>now&&Object.keys(row.readings).length;});
    }
    function combine(history,forecast,now,latestHistory={},currentReadings={}){
        var future={};
        (forecast||[]).forEach(function(row){if(row.time>now){var target=future[row.time]||(future[row.time]={time:row.time,readings:{},kind:'forecast'});fields.forEach(function(key){if(row.readings[key])target.readings[key]=row.readings[key];});}});
        var past=(history||[]).filter(function(row){return row.time<=Math.floor(now/hour)*hour;}).map(function(row){
            var readings={};
            observedFields.forEach(function(key){
                var reading=row.readings[key],direction=row.readings[directionKeys[key]];
                if(reading)readings[key]=Object.assign({},reading,{direction:direction?direction.value:null});
            });
            return {time:row.time,kind:'observed',readings:readings};
        });
        var latestReadings={},latestTime=-Infinity;
        observedFields.forEach(function(key){
            var current=currentReadings[key],historical=latestHistory[key],source=latestHistory;
            if(current&&current.time<=now&&(!historical||historical.time>now||current.time>=historical.time))source=currentReadings;
            var reading=source[key],direction=source[directionKeys[key]];
            if(!reading||reading.time>now||past.some(function(row){return row.readings[key]&&row.readings[key].time>=reading.time;}))return;
            latestReadings[key]=Object.assign({},reading,{direction:direction&&Math.abs(direction.time-reading.time)<=600000?direction.value:null});
            latestTime=Math.max(latestTime,reading.time);
        });
        if(Object.keys(latestReadings).length)past.push({time:latestTime,kind:'latest',readings:latestReadings});
        return Object.values(future).concat(past).sort(function(a,b){return a.time-b.time;});
    }
    return {nearest:nearest,model:model,combine:combine};
});
