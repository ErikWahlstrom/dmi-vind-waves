// Run after tests/point-preview.js in a mobile browser. Chromium has no Safari
// toolbar; simulate visual-viewport zoom and pan without altering the map.
(async function () {
    const vv = visualViewport, sheet = document.querySelector('#point-sheet');
    const keys = ['scale', 'offsetLeft', 'offsetTop', 'width', 'height'];
    const descriptors = Object.fromEntries(keys.map(k => [k, Object.getOwnPropertyDescriptor(vv, k)]));
    const initial = Object.fromEntries(keys.map(k => [k, vv[k]]));
    const view = {...initial};
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const tick = () => new Promise(resolve => requestAnimationFrame(resolve));
    const assert = (ok, message) => { if (!ok) throw Error(message); };
    const originalScroll = scrollY;
    const imageRect = document.querySelector('#img-win').getBoundingClientRect();
    let count = 0;
    try {
        keys.forEach(k => Object.defineProperty(vv, k, {configurable:true, get:()=>view[k]}));
        for (const scale of [1, 2, 3, 1.5]) {
            view.scale = scale;
            view.width = initial.width / scale;
            view.height = initial.height / scale;
            view.offsetLeft = scale === 1 ? 0 : 35;
            view.offsetTop = scale === 1 ? 0 : 90;
            vv.dispatchEvent(new Event('resize'));
            // Start with an already zoomed map, rather than zooming a sheet
            // that was positioned at scale 1.
            document.querySelector('.imgwrap').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
            for (let i=0; i<100 && document.querySelector('#point-content').hidden; i++) await pause(50);
            assert(sheet.open && !document.querySelector('#point-content').hidden, 'Graph did not open');
            await tick(); await tick();
            for (const [left,top,height] of [[view.offsetLeft,view.offsetTop,view.height],[50,135,initial.height/scale-30],[15,60,initial.height/scale]]) {
                view.offsetLeft=left; view.offsetTop=top; view.height=height;
                vv.dispatchEvent(new Event('scroll'));
                vv.dispatchEvent(new Event('resize'));
                await tick(); await tick();
                const r=sheet.getBoundingClientRect();
                assert(r.left>=left-1 && r.right<=left+view.width+1, 'Zoomed sheet leaves screen horizontally');
                assert(r.top>=top-1 && r.bottom<=top+height+1, 'Zoomed sheet leaves screen vertically');
                assert(Math.abs(r.width*scale-(initial.width-16))<2, 'Sheet grows with pinch zoom');
                const close=document.querySelector('#point-close').getBoundingClientRect();
                assert(close.width*scale>=43 && close.width*scale<50, 'Close button changes physical size');
                count++;
            }
            // Tap hour 2 in the counter-scaled graph. Client coordinates must
            // be converted back to the graph's unscaled coordinates.
            const graph=document.querySelector('#point-graphs');
            graph.scrollLeft=0;
            const r=graph.getBoundingClientRect(), ratio=r.width/graph.offsetWidth;
            const opts={bubbles:true,pointerId:87,pointerType:'touch',clientX:r.left+(graph.clientLeft+38+2*8)*ratio,clientY:r.top+30*ratio};
            graph.dispatchEvent(new PointerEvent('pointerdown',opts));
            graph.dispatchEvent(new PointerEvent('pointerup',opts));
            assert(document.querySelector('#point-slider').value==='2', 'Zoomed graph tap selects the wrong hour');
            assert(view.scale===scale && scrollY===originalScroll, 'Opening the sheet resets map zoom or scroll');
            const current=document.querySelector('#img-win').getBoundingClientRect();
            assert(Math.abs(current.width-imageRect.width)<1, 'Map size changed');
            document.querySelector('#point-close').click();
            await pause(30);
        }
        return {checks:count,scenarios:['open while zoomed','2× and 3× zoom','panning','toolbar resize','graph taps','map zoom preserved']};
    } finally {
        if (sheet.open) sheet.close();
        keys.forEach(k=>{if(descriptors[k])Object.defineProperty(vv,k,descriptors[k]);else delete vv[k];});
        vv.dispatchEvent(new Event('resize'));
        await tick();
    }
})();
