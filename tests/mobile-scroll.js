// Run after tests/viewer.kite with a mobile viewport. Images are local fixtures.
// Chromium emulation has no collapsing Safari toolbar, so viewport changes and
// pinch zoom below are simulated explicitly in addition to real page scrolling.
(async function () {
    const bar = document.getElementById('bar');
    const inner = document.getElementById('barin');
    const vv = window.visualViewport;
    const tick = () => new Promise(resolve => requestAnimationFrame(resolve));
    const assert = (ok, message) => { if (!ok) throw new Error(message); };
    const originalStyles = [...document.querySelectorAll('.imgwrap img')].map(el => [el, el.style.minHeight]);
    const originalScroll = scrollY;
    const keys = ['scale', 'offsetLeft', 'offsetTop', 'width', 'height'];
    const originalDescriptors = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(vv, key)]));
    const viewport = Object.fromEntries(keys.map(key => [key, vv[key]]));
    const initial = {...viewport};
    let checks = 0;
    function visible() {
        assert(getComputedStyle(bar).opacity === '1', 'Control bar disappears during viewport changes');
        assert(getComputedStyle(bar).visibility === 'visible', 'Control bar is hidden');
        checks++;
    }
    try {
        originalStyles.forEach(([el]) => { el.style.minHeight = '700px'; });
        await tick();
        const baseline = inner.getBoundingClientRect();
        for (const top of [450, 1000, 200, 0]) {
            window.scrollTo({top, behavior: 'smooth'});
            for (let frame = 0; frame < 35; frame++) {
                await tick();
                visible();
                const rect = inner.getBoundingClientRect();
                assert(Math.abs(rect.top - baseline.top) < 1, 'Control bar jumps during page scrolling');
                assert(rect.top >= 0 && rect.bottom <= innerHeight, 'Control bar leaves the viewport');
            }
            assert(Math.abs(scrollY - top) < 2, 'Scroll fixture did not reach the requested position');
        }
        keys.forEach(key => Object.defineProperty(vv, key, {configurable: true, get: () => viewport[key]}));
        // Exercise a moving toolbar at default zoom, including the event itself
        // and the following paint: a settled screenshot would miss the fade-out.
        for (const delta of [-30, -60, -20, 0]) {
            viewport.height = initial.height + delta;
            vv.dispatchEvent(new Event('resize'));
            visible();
            await tick();
            visible();
        }
        // Keep the counter-scaled controls pinned while a zoomed viewport pans.
        viewport.scale = 2;
        viewport.width = initial.width / 2;
        viewport.height = initial.height / 2;
        for (const [left, top] of [[0, 0], [25, 70], [50, 140], [0, 0]]) {
            viewport.offsetLeft = left;
            viewport.offsetTop = top;
            vv.dispatchEvent(new Event('resize'));
            vv.dispatchEvent(new Event('scroll'));
            await tick();
            visible();
            const rect = bar.getBoundingClientRect();
            assert(Math.abs(rect.left - left) < 1, 'Zoomed bar drifts horizontally');
            assert(Math.abs(rect.width - viewport.width) < 1, 'Zoomed bar width is incorrect');
            assert(rect.top >= top && rect.bottom <= top + viewport.height, 'Zoomed bar leaves the visual viewport');
            assert(Math.abs(parseFloat(getComputedStyle(inner).fontSize) - 7) < 0.1, 'Zoom compensation is missing');
        }
        return {checks, scenarios: ['smooth scrolling both directions', 'toolbar viewport changes', 'zoomed panning']};
    } finally {
        keys.forEach(key => {
            if (originalDescriptors[key]) Object.defineProperty(vv, key, originalDescriptors[key]);
            else delete vv[key];
        });
        vv.dispatchEvent(new Event('resize'));
        originalStyles.forEach(([el, height]) => { el.style.minHeight = height; });
        window.scrollTo(0, originalScroll);
        await tick();
    }
})();
