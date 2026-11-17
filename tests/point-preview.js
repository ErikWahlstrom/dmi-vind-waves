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
    assert(document.querySelector('#point-location').textContent.includes(point[3].toFixed(3)), 'Selected latitude');
    const chunk = await fetch(fixture.imageBase + 'point-' + Math.floor(pointNumber/index.tileSize) + '.json').then(r=>r.json());
    const buffer = Uint8Array.from(atob(chunk.data), c=>c.charCodeAt(0));
    const view = new DataView(buffer.buffer);
    const hour = displayedFrame.index-1;
    const expected = view.getUint16(((hour*chunk.count+pointNumber%index.tileSize)*6)*2,true)/100;
    assert(document.querySelector('#point-reading strong').textContent.startsWith(expected.toFixed(1)), 'Displayed value must equal the model value');
    const slider = document.querySelector('#point-slider');
    slider.value = 4; slider.dispatchEvent(new Event('input'));
    await until(()=>displayedFrame.index===5);
    assert(document.querySelector('#point-time').textContent===fmtLocal(new Date(fixture.frames[4].time)), 'Graph and map hour agree');
    document.querySelector('#point-next').click();
    await until(()=>displayedFrame.index===6);
    assert(document.querySelector('#point-sheet').getBoundingClientRect().width<=innerWidth, 'Sheet fits the phone');
    assert(getComputedStyle(document.querySelector('main')).gap==='4px', 'Map spacing unchanged');
    document.querySelector('#point-close').click();
    await until(()=>!sheet.open && !document.querySelector('.point-marker'));
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
