// Run with `wowsir eval --file tests/point-preview.js` after opening the local
// ?preview=point page. Serve a real short forecast at output/point-fixture/.
(async function () {
    function assert(value, message) { if (!value) throw Error(message); }
    function pause(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    async function until(predicate) {
        for (let i = 0; i < 200; i++) { if (predicate()) return; await pause(50); }
        throw Error('Preview did not settle');
    }
    const fixture = await fetch('/output/point-fixture/run.json').then(r => r.json());
    fixture.imageBase = location.origin + '/output/point-fixture/plots/';
    refreshRun(fixture);
    window.fetchRunInfo = () => Promise.resolve(fixture);
    await until(() => displayedFrame && document.querySelector('#img-win').naturalWidth);
    const index = await fetch(fixture.imageBase + fixture.pointForecast).then(r => r.json());
    assert(index.identity === fixture.forecastIdentity, 'Snapshot identity');
    const pointNumber = index.points.reduce((best, p, i) =>
        Math.hypot(p[2]-20, p[3]-58) < Math.hypot(index.points[best][2]-20, index.points[best][3]-58) ? i : best, 0);
    const point = index.points[pointNumber];
    const wrap = document.querySelector('.imgwrap');
    let rect = wrap.querySelector('img').getBoundingClientRect();
    const x = rect.left + point[0]*rect.width, y = rect.top + point[1]*rect.height;
    function pointer(type, id=1, dx=0) {
        wrap.dispatchEvent(new PointerEvent(type, {bubbles:true, pointerId:id,
            pointerType:'touch', clientX:x+dx, clientY:y, button:0}));
    }
    const sheet = document.querySelector('#point-sheet');
    pointer('pointerdown'); pointer('pointerup'); await pause(550);
    assert(!sheet.open, 'A short touch must not select a location');
    pointer('pointerdown'); pointer('pointermove',1,20); await pause(550); pointer('pointerup');
    assert(!sheet.open, 'Moving a finger must cancel the hold');
    pointer('pointerdown'); pointer('pointerdown',2); await pause(550); pointer('pointerup',1); pointer('pointerup',2);
    assert(!sheet.open, 'Pinch gestures must cancel the hold');
    pointer('pointerdown'); pointer('pointercancel'); await pause(550);
    assert(!sheet.open, 'Cancelled touches must not open a graph');
    pointer('pointerdown'); window.dispatchEvent(new Event('scroll')); await pause(550); pointer('pointerup');
    assert(!sheet.open, 'Page scrolling must cancel the hold');
    pointer('pointerdown'); await pause(550); pointer('pointerup');
    await until(() => sheet.open && !document.querySelector('#point-content').hidden);
    assert(document.querySelectorAll('.point-marker').length===3, 'One location marker on each map');
    assert(document.querySelectorAll('#point-graphs [data-series]').length===1, 'Only one quantity is plotted');
    assert(document.querySelector('#point-graphs [data-series="0"]'), 'Holding the wind map opens the wind graph');
    assert(document.querySelector('#point-reading button[aria-pressed="true"]').dataset.quantity==='0', 'Wind button is selected');
    assert(Math.abs(Number(document.querySelector('#point-thumb-dot').getAttribute('cx'))-point[0]*900)<.01, 'Thumbnail marks the selected longitude');
    assert(Math.abs(Number(document.querySelector('#point-thumb-dot').getAttribute('cy'))-point[1]*675)<.01, 'Thumbnail marks the selected latitude');
    assert(!document.querySelector('#point-place').hidden, 'Location thumbnail is visible');
    const crop=document.querySelector('#point-thumbnail svg').viewBox.baseVal;
    assert(crop.width===130 && crop.width<549, 'Thumbnail zooms into the selected coast');
    assert(point[0]*900>=crop.x && point[0]*900<=crop.x+crop.width && point[1]*675>=crop.y && point[1]*675<=crop.y+crop.height, 'Thumbnail crop contains the selected point');
    assert(document.querySelector('#point-location').textContent.includes(point[3].toFixed(3)), 'Selected latitude');
    assert(document.querySelectorAll('#point-graphs [data-light="night"]').length>0, 'Night bands are drawn');
    assert(document.querySelectorAll('#point-graphs [data-light="twilight"]').length>0, 'Civil twilight bands are drawn');
    assert(document.querySelectorAll('#point-graphs [data-light="daylight"]').length>0, 'Daylight bands are drawn');
    assert(document.querySelector('#point-graphs [data-solar-event="sunset"]'), 'Sunset is marked within the real forecast');
    const chunk = await fetch(fixture.imageBase + 'point-' + Math.floor(pointNumber/index.tileSize) + '.json').then(r=>r.json());
    const buffer = Uint8Array.from(atob(chunk.data), c=>c.charCodeAt(0));
    const view = new DataView(buffer.buffer);
    const hour = displayedFrame.index-1;
    const expected = view.getUint16(((hour*chunk.count+pointNumber%index.tileSize)*6)*2,true)/100;
    assert(document.querySelector('#point-reading strong').textContent.startsWith(expected.toFixed(1)), 'Displayed value must equal the model value');
    const slider = document.querySelector('#point-graphs');
    assert(!document.querySelector('#point-slider'), 'The second time slider is removed');
    const originalHour=slider.getAttribute('aria-valuenow');
    const cursorLeft=document.querySelector('#point-cursor').getBoundingClientRect().left;
    document.querySelector('#point-reading button[data-quantity="1"]').click();
    assert(document.querySelectorAll('#point-graphs [data-series]').length===1 && document.querySelector('#point-graphs [data-series="1"]'), 'Switching to waves replaces the single series');
    assert(slider.getAttribute('aria-valuenow')===originalHour, 'Switching quantities preserves the chosen hour');
    assert(document.querySelector('#point-thumb-image').getAttribute('href').endsWith(fixture.frames[Number(originalHour)].files.hs), 'Thumbnail follows the chosen quantity');
    slider.scrollLeft = 4*8; slider.dispatchEvent(new Event('scroll'));
    await until(()=>displayedFrame.index===5);
    assert(document.querySelector('#point-time').textContent===fmtLocal(new Date(fixture.frames[4].time)), 'Graph and map hour agree');
    assert(document.querySelector('#point-thumbnail').dataset.hour==='4', 'Thumbnail follows graph scrolling');
    assert(Math.abs(document.querySelector('#point-cursor').getBoundingClientRect().left-cursorLeft)<1, 'The time cursor stays fixed while the graph scrolls');
    assert(document.querySelectorAll('#point-reading strong').length===3, 'All three values remain visible while only one is plotted');
    document.querySelector('#point-next').click();
    await until(()=>displayedFrame.index===6);
    slider.scrollLeft=0; slider.dispatchEvent(new Event('scroll'));
    await until(()=>displayedFrame.index===1 && slider.getAttribute('aria-valuenow')==='0');
    const firstX=Number(document.querySelector('#point-graphs [data-series]').getAttribute('d').match(/^M([\d.]+)/)[1]);
    assert(Math.abs(firstX-slider.scrollLeft-slider.clientWidth/2)<1, 'Leading padding centres the first hour');
    slider.scrollLeft=slider.scrollWidth; slider.dispatchEvent(new Event('scroll'));
    await until(()=>displayedFrame.index===fixture.frames.length);
    assert(Math.abs(slider.scrollLeft-(fixture.frames.length-1)*8)<1, 'Trailing padding centres the final hour');
    assert(slider.getAttribute('aria-valuenow')===String(fixture.frames.length-1), 'The final hour is selectable by scrolling');
    slider.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    await until(()=>displayedFrame.index===1);
    slider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    await until(()=>displayedFrame.index===2);
    assert(document.querySelector('#point-sheet').getBoundingClientRect().width<=innerWidth, 'Sheet fits the phone');
    assert(getComputedStyle(document.querySelector('main')).gap==='4px', 'Map spacing unchanged');
    document.querySelector('#point-close').click();
    await until(()=>!sheet.open && !document.querySelector('.point-marker'));
    for (const [i,map] of [...document.querySelectorAll('.imgwrap')].entries()) {
        map.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        await until(()=>sheet.open && !document.querySelector('#point-content').hidden);
        assert(document.querySelector('#point-graphs [data-series="'+i+'"]'), 'Each map opens its own quantity');
        document.querySelector('#point-close').click();
        await until(()=>!sheet.open && !document.querySelector('.point-marker'));
    }
    // An old snapshot must never silently acquire point data from a newer run.
    const saved = fixture.pointForecast;
    delete fixture.pointForecast;
    pointer('pointerdown'); await pause(550); pointer('pointerup');
    await until(()=>document.querySelector('#point-message').textContent.includes('being prepared'));
    assert(document.querySelector('#point-content').hidden, 'Old snapshots show an honest unavailable message');
    fixture.pointForecast=saved;
    document.querySelector('#point-close').click();
    console.log('Point preview checks passed: touch cancellation, real values, markers, hourly map selection, close, and old snapshots.');
})();
