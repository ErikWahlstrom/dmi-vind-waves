/* URL-only view state: portable between devices, with no stored browser state. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ForecastViewState = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var quantities = ['wind', 'waves', 'swell'];
    function coordinate(value, limit) {
        if (value === null || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
        var n = Number(value);
        return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
    }
    function read(href) {
        var url = new URL(href), q = url.searchParams;
        var lat = coordinate(q.get('lat'), 90), lon = coordinate(q.get('lon'), 180);
        var point = lat !== null && lon !== null ? {lat:lat, lon:lon} : null;
        var map = quantities.includes(q.get('map')) ? q.get('map') : 'wind';
        var quantity = quantities.includes(q.get('quantity')) ? q.get('quantity') : map;
        return {point:point, map:map, quantity:quantity, view:q.get('view') === 'table' ? 'table' : 'graph',
            detail:!!point && q.get('detail') !== '0', full:q.get('full') === '1',
            row:/^\d{1,3}$/.test(q.get('row') || '') ? Math.min(999, Number(q.get('row'))) : null,
            time:q.get('time') || new URLSearchParams(url.hash.slice(1).replace(/\+/g, '%2B')).get('time') || 'now',
            invalidPoint:(q.has('lat') || q.has('lon')) && !point};
    }
    function write(href, state) {
        var url = new URL(href), q = url.searchParams;
        if (state.point) {
            q.set('lat', Number(state.point.lat).toFixed(6)); q.set('lon', Number(state.point.lon).toFixed(6));
        } else { q.delete('lat'); q.delete('lon'); }
        q.set('map', state.map); q.set('quantity', state.quantity); q.set('view', state.view);
        q.set('detail', state.detail ? '1' : '0');
        if (state.full) q.set('full', '1'); else q.delete('full');
        if (state.view === 'table' && state.row !== null && state.row !== undefined) q.set('row', String(state.row)); else q.delete('row');
        q.set('time', state.time || 'now');
        // Retire the old preview switch, while preserving unrelated parameters.
        q.delete('preview');
        var hash = new URLSearchParams(url.hash.slice(1)); hash.delete('time');
        url.hash = hash.toString();
        return url.href;
    }
    return {read:read, write:write};
});
