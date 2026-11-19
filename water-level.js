/* Free, station-based water levels. All values are centimetres relative to RW. */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ForecastWater = factory();
})(typeof window === 'object' ? window : globalThis, function() {
    'use strict';
    var HOUR = 3600000, cached = null, loaded = 0, pending = null;
    var url = 'https://raw.githubusercontent.com/ErikWahlstrom/dmi-vind-waves/water-data/water-level.json';
    function distance(lat, lon, a, b) {
        var rad = Math.PI / 180, x = lat*rad, y = a*rad;
        var h = Math.sin((y-x)/2)**2 + Math.cos(x)*Math.cos(y)*Math.sin((b-lon)*rad/2)**2;
        return 12742*Math.asin(Math.min(1, Math.sqrt(h)));
    }
    function validObservation(v, now) {
        return Array.isArray(v) && v.length === 3 && Number.isFinite(v[0]) && Number.isFinite(v[1]) &&
            Math.abs(v[1]) <= 500 && ['G','O'].includes(v[2]) && v[0] >= now-2*HOUR && v[0] <= now+300000;
    }
    function select(data, lat, lon, now) {
        now = now === undefined ? Date.now() : now;
        if (!data || data.schema !== 1 || !Array.isArray(data.stations) || !Array.isArray(data.times) ||
            !Number.isFinite(Date.parse(data.checked)) || now-Date.parse(data.checked)>2*HOUR || Date.parse(data.checked)>now+300000) return null;
        var times = data.times.map(Date.parse);
        var validTimes = times.length >= 49 && times.every(function(t,i){return Number.isFinite(t) && (!i || t-times[i-1]===HOUR);});
        var freshModel = validTimes && times[0] <= now && now-times[0] <= 18*HOUR;
        var candidates = data.stations.filter(function(s) {
            return /^\d+$/.test(s.id) && typeof s.name === 'string' && s.name.length<=100 &&
                Number.isFinite(s.lat) && Math.abs(s.lat)<=90 && Number.isFinite(s.lon) && Math.abs(s.lon)<=180 &&
                Array.isArray(s.observations) && s.observations.some(function(v){return validObservation(v,now);});
        }).map(function(s) {
            var obs = s.observations.filter(function(v){return validObservation(v,now);}).sort(function(a,b){return a[0]-b[0];});
            var forecast = freshModel && Array.isArray(s.forecast) && s.forecast.length === times.length &&
                s.forecast.every(function(v){return v===null || Number.isFinite(v) && Math.abs(v)<=500;}) &&
                s.forecast.some(function(v,i){return v!==null && times[i]>now;}) ? s.forecast : null;
            return {id:s.id, name:s.name, owner:s.owner, lat:s.lat, lon:s.lon, observations:obs,
                forecast:forecast, times:times, modelRun:validTimes ? data.times[0] : null,
                distanceKm:distance(lat,lon,s.lat,s.lon)};
        }).filter(function(s){return s.distanceKm<=100;}).sort(function(a,b){return a.distanceKm-b.distanceKm;});
        // Prefer the closest station with both observation and forecast. A
        // nearby observation alone remains useful when the model is unavailable.
        return candidates.find(function(s){return s.forecast;}) || candidates[0] || null;
    }
    function at(station, stamp) {
        if (!station) return null;
        var obs = station.observations.reduce(function(best,v){return !best || Math.abs(v[0]-stamp)<Math.abs(best[0]-stamp) ? v : best;},null);
        if (obs && Math.abs(obs[0]-stamp)<=10*60000) return {value:obs[1], kind:'Observed', time:obs[0]};
        var latest = station.observations[station.observations.length-1];
        if (!station.forecast || stamp<latest[0]) return null;
        var i = station.times.indexOf(stamp), value = i<0 ? null : station.forecast[i];
        return value===null ? null : {value:value, kind:'Forecast estimate', time:stamp};
    }
    function unavailableReason(data, lat, lon, now) {
        now = now === undefined ? Date.now() : now;
        if (!data || data.schema !== 1 || !Number.isFinite(Date.parse(data.checked)) || !Array.isArray(data.stations))
            return 'Water level temporarily unavailable';
        if (now-Date.parse(data.checked)>2*HOUR) return 'Water level data is out of date';
        var nearby = data.stations.filter(function(s){return s && Number.isFinite(s.lat) && Number.isFinite(s.lon) && distance(lat,lon,s.lat,s.lon)<=100;});
        if (!nearby.length) return 'Water level: no station within 100 km';
        if (nearby.every(function(s){return !Array.isArray(s.observations) || !s.observations.some(function(v){return validObservation(v,now);});}))
            return 'Nearby station readings are unavailable or out of date';
        return 'Water level temporarily unavailable';
    }
    async function load() {
        if (cached && Date.now()-loaded<10*60000) return cached;
        if (pending) return pending;
        pending = (async function(){
            var controller = new AbortController(), timer = setTimeout(function(){controller.abort();},10000);
            try {
                var response = await fetch(url+'?slot='+Math.floor(Date.now()/(20*60000)), {signal:controller.signal});
                if (!response.ok) throw Error('Water-level data unavailable');
                cached = await response.json(); loaded = Date.now(); return cached;
            } finally { clearTimeout(timer); pending = null; }
        })();
        return pending;
    }
    function format(value) { var n = Math.round(value); return (n>0?'+':'')+n; }
    return {select:select, at:at, load:load, format:format, distance:distance, unavailableReason:unavailableReason};
});
