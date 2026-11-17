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
    const index = await fetch(forecast.imageBase+forecast.pointForecast).then(r=>r.json());
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
                // The marker shares the graph's paint surface. Actual pixel
                // visibility under browser zoom is checked by point-render-zoom.cjs.
                const marker=document.querySelector('#point-cursor'),mr=marker.getBoundingClientRect();
                assert(Math.abs(mr.width*scale-2)<.1,'Time marker loses its visible width');
                assert(marker.ownerSVGElement===document.querySelector('#point-graphs svg'),'Time marker uses a separate compositing layer');
                assert(marker.ownerSVGElement.lastElementChild===marker,'Time marker is painted below graph content');
                count++;
            }
            // Tap hour 2 in the counter-scaled graph. Client coordinates must
            // be converted back to the graph's unscaled coordinates.
            const graph=document.querySelector('#point-graphs');
            graph.scrollLeft=0;
            const r=graph.getBoundingClientRect(), ratio=r.width/graph.offsetWidth;
            const opts={bubbles:true,pointerId:87,pointerType:'touch',clientX:r.left+(graph.clientLeft+graph.clientWidth/2+2*8)*ratio,clientY:r.top+60*ratio};
            graph.dispatchEvent(new PointerEvent('pointerdown',opts));
            graph.dispatchEvent(new PointerEvent('pointerup',opts));
            assert(graph.getAttribute('aria-valuenow')==='2', 'Zoomed graph tap selects the wrong hour');
            const cursor=document.querySelector('#point-cursor').getBoundingClientRect();
            graph.scrollLeft=3*8; graph.dispatchEvent(new Event('scroll'));
            await tick(); await tick();
            assert(graph.getAttribute('aria-valuenow')==='3', 'Zoomed scrolling does not update the selected hour');
            assert(Math.abs(document.querySelector('#point-cursor').getBoundingClientRect().left-cursor.left)<1, 'Zoomed cursor moves with the graph');
            const thumb=document.querySelector('#point-thumbnail'),dot=document.querySelector('#point-thumb-dot');
            const cx=Number(dot.getAttribute('cx')),cy=Number(dot.getAttribute('cy'));
            const target=index.points.find(p=>Math.hypot(p[0]*900-cx,p[1]*675-cy)>6&&Math.hypot(p[0]*900-cx,p[1]*675-cy)<15);
            assert(target,'Nearby point for zoomed map adjustment');
            thumb.click();
            assert(!document.querySelector('#point-editor').hidden,'Zoomed thumbnail does not open the editor');
            await tick();await tick();
            const er=sheet.getBoundingClientRect(),confirm=document.querySelector('#point-edit-use').getBoundingClientRect();
            assert(er.left>=view.offsetLeft-1&&er.right<=view.offsetLeft+view.width+1,'Zoomed editor leaves the screen horizontally');
            assert(confirm.top>=view.offsetTop-1&&confirm.bottom<=view.offsetTop+view.height+1,'Zoomed editor confirmation is offscreen');
            const tr=thumb.getBoundingClientRect(),box=thumb.querySelector('svg').viewBox.baseVal;
            const drag={bubbles:true,pointerId:88,pointerType:'touch',button:0,clientX:tr.left+tr.width/2,clientY:tr.top+tr.height/2};
            thumb.dispatchEvent(new PointerEvent('pointerdown',drag));
            thumb.dispatchEvent(new PointerEvent('pointermove',{...drag,clientX:drag.clientX+(cx-target[0]*900)*tr.width/box.width,clientY:drag.clientY+(cy-target[1]*675)*tr.height/box.height}));
            const dr=dot.getBoundingClientRect();
            assert(Math.abs((dr.left+dr.right)/2-(tr.left+tr.right)/2)<1,'Zoomed thumbnail marker drifts');
            thumb.dispatchEvent(new PointerEvent('pointerup',drag));
            document.querySelector('#point-edit-use').click();
            for(let i=0;i<100&&(document.querySelector('#point-content').inert||Math.abs(Number(dot.getAttribute('cx'))-target[0]*900)>.01);i++)await pause(50);
            assert(!document.querySelector('#point-content').inert&&Math.abs(Number(dot.getAttribute('cx'))-target[0]*900)<.01,'Zoomed thumbnail drag selects the wrong sea point');
            assert(graph.getAttribute('aria-valuenow')==='3','Zoomed thumbnail adjustment resets time');
            assert(view.scale===scale && scrollY===originalScroll, 'Opening the sheet resets map zoom or scroll');
            const current=document.querySelector('#img-win').getBoundingClientRect();
            assert(Math.abs(current.width-imageRect.width)<1, 'Map size changed');
            document.querySelector('#point-close').click();
            await pause(30);
        }
        return {checks:count,scenarios:['open while zoomed','2× and 3× zoom','panning','toolbar resize','graph taps','thumbnail adjustment','map zoom preserved']};
    } finally {
        if (sheet.open) sheet.close();
        keys.forEach(k=>{if(descriptors[k])Object.defineProperty(vv,k,descriptors[k]);else delete vv[k];});
        vv.dispatchEvent(new Event('resize'));
        await tick();
    }
})();
