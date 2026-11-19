/* Latest observed station readings; no forecast values are accepted here. */
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory();
    else root.ForecastLiveData=factory();
})(typeof window==='object'?window:globalThis,function(){
    'use strict';
    var fields={wind:[0,90],gust:[0,90],windDirection:[0,360],wave:[0,30],waveDirection:[0,360],level:[-500,500],temperature:[-3,40]};
    function distance(a,b){
        var r=Math.PI/180,x=a.lat*r,y=b.lat*r,h=Math.sin((y-x)/2)**2+Math.cos(x)*Math.cos(y)*Math.sin((b.lon-a.lon)*r/2)**2;
        return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
    }
    function stations(data,now){
        now=now===undefined?Date.now():now;
        if(!data||data.schema!==1||!Array.isArray(data.stations)||!Number.isFinite(Date.parse(data.checked))||
            now-Date.parse(data.checked)>7200000||Date.parse(data.checked)>now+300000)return [];
        return data.stations.filter(function(s){return s&&/^(met|sea|viva|fmi)-\d+$/.test(s.id)&&typeof s.name==='string'&&s.name.length<=100&&
            Number.isFinite(s.lat)&&s.lat>=53&&s.lat<=70&&Number.isFinite(s.lon)&&s.lon>=9&&s.lon<=32&&s.readings;}).map(function(s){
            var readings={};
            Object.keys(fields).forEach(function(key){
                var r=s.readings[key],limit=fields[key];
                if(r&&(key!=='temperature'||r.depth===0||(['viva','fmi'].includes(r.source)&&r.depth===null))&&Number.isFinite(r.value)&&r.value>=limit[0]&&r.value<=limit[1]&&Number.isFinite(r.time)&&
                    r.time>=now-7200000&&r.time<=now+300000)readings[key]={value:r.value,time:r.time,provisional:!!r.provisional,...(['viva','fmi'].includes(r.source)?{source:r.source}:{}),...(key==='temperature'?{depth:r.depth}:{})};
            });
            return {id:s.id,name:s.name,owner:typeof s.owner==='string'?s.owner:'SMHI',lat:s.lat,lon:s.lon,readings:readings,...(/^\d+$/.test(s.vivaId||'')?{vivaId:s.vivaId}:{})};
        }).filter(function(s){return Object.keys(s.readings).length;});
    }
    function nearby(all,point,layer){
        var field=layer==='waves'?'wave':layer;
        return all.filter(function(s){return s.readings[field];}).map(function(s){return {station:s,distanceKm:distance(point,s)};})
            .sort(function(a,b){return a.distanceKm-b.distanceKm;});
    }
    function format(field,value){
        if(field==='temperature')return value.toFixed(1)+' °C';
        if(field==='level'){var n=Math.round(value);return (n>0?'+':'')+n+' cm';}
        if(field.endsWith('Direction'))return Math.round(value)+'°';
        return value.toFixed(1)+(field==='wave'?' m':' m/s');
    }
    return {stations:stations,nearby:nearby,format:format,distance:distance};
});
