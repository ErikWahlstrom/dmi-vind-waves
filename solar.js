/* Daylight/civil-twilight bands. SunCalc 1.9.0 is vendored with its BSD license. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/suncalc-1.9.0.js'));
    else root.ForecastSolar = factory(root.SunCalc);
})(typeof window === 'object' ? window : globalThis, function (sun) {
    'use strict';
    var day = 86400000;
    function range(start, end, lat, lon) {
        start = Number(start); end = Number(end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
            !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
            throw Error('Invalid solar range');
        }
        var events = [], seen = new Set();
        // UTC noons avoid device-timezone and DST shifts. Include adjacent
        // solar days so a range starting at night has the correct initial phase.
        for (var d = Math.floor(start / day) - 2; d <= Math.ceil(end / day) + 2; d++) {
            var times = sun.getTimes(new Date(d * day + day / 2), lat, lon);
            ['dawn', 'sunrise', 'sunset', 'dusk'].forEach(function (type) {
                var time = Number(times[type]), key = type + ':' + time;
                if (Number.isFinite(time) && !seen.has(key)) {
                    seen.add(key); events.push({time:time, type:type});
                }
            });
        }
        events.sort(function (a, b) { return a.time - b.time; });
        var altitude = sun.getPosition(new Date(start), lat, lon).altitude * 180 / Math.PI;
        var phase = altitude >= -.833 ? 'daylight' : (altitude >= -6 ? 'twilight' : 'night');
        var after = {dawn:'twilight', sunrise:'daylight', sunset:'twilight', dusk:'night'};
        events.forEach(function (e) { if (e.time <= start) phase = after[e.type]; });
        var bands = [], cursor = start;
        events.forEach(function (e) {
            if (e.time <= start || e.time >= end) return;
            if (e.time > cursor) bands.push({start:cursor, end:e.time, phase:phase});
            phase = after[e.type]; cursor = e.time;
        });
        bands.push({start:cursor, end:end, phase:phase});
        return {bands:bands, events:events.filter(function (e) { return e.time >= start && e.time <= end; })};
    }
    return {range:range};
});
