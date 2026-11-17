// Run after tests/point-preview.js. Test the actual exported grid values after
// dragging the thumbnail, including a different data chunk and zoomed input.
(async function () {
    const pause=ms=>new Promise(r=>setTimeout(r,ms));
    const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
    async function until(test){for(let i=0;i<200;i++){if(test())return;await pause(50);}throw Error('Adjustment did not settle');}
    const index=await fetch(forecast.imageBase+forecast.pointForecast).then(r=>r.json());
    document.querySelector('.imgwrap').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await until(()=>!document.querySelector('#point-content').hidden);
    const graph=document.querySelector('#point-graphs');
    graph.scrollLeft=4*8;graph.dispatchEvent(new Event('scroll'));
    await until(()=>graph.getAttribute('aria-valuenow')==='4');
    const thumbnail=document.querySelector('#point-thumbnail'),dot=document.querySelector('#point-thumb-dot');
    function findCurrent(){return index.points.findIndex(p=>Math.abs(p[0]*900-Number(dot.getAttribute('cx')))<.01&&Math.abs(p[1]*675-Number(dot.getAttribute('cy')))<.01);}
    function dragTo(x,y,keepDown=false){
        const r=thumbnail.getBoundingClientRect(),box=thumbnail.querySelector('svg').viewBox.baseVal;
        const start={x:Number(dot.getAttribute('cx')),y:Number(dot.getAttribute('cy'))};
        const px=r.left+r.width/2,py=r.top+r.height/2;
        const opts={bubbles:true,pointerId:71,pointerType:'touch',button:0,clientX:px,clientY:py};
        thumbnail.dispatchEvent(new PointerEvent('pointerdown',opts));
        thumbnail.dispatchEvent(new PointerEvent('pointermove',{...opts,clientX:px+(start.x-x)*r.width/box.width,clientY:py+(start.y-y)*r.height/box.height}));
        const rect=dot.getBoundingClientRect();
        assert(Math.abs((rect.left+rect.right)/2-(r.left+r.width/2))<1,'Marker moved horizontally during map drag');
        assert(Math.abs((rect.top+rect.bottom)/2-(r.top+r.height/2))<1,'Marker moved vertically during map drag');
        if(!keepDown)thumbnail.dispatchEvent(new PointerEvent('pointerup',opts));
        return opts;
    }
    const old=findCurrent();
    assert(old>=0,'Initial point is in the model grid');
    const target=index.points.findIndex((p,i)=>i!==old&&Math.floor(i/index.tileSize)!==Math.floor(old/index.tileSize)&&Math.hypot((p[0]-index.points[old][0])*900,(p[1]-index.points[old][1])*675)>12&&Math.hypot((p[0]-index.points[old][0])*900,(p[1]-index.points[old][1])*675)<50);
    assert(target>=0,'A nearby sea point in another chunk is available');
    dragTo(index.points[target][0]*900,index.points[target][1]*675);
    await until(()=>!document.querySelector('#point-content').inert&&findCurrent()===target);
    assert(graph.getAttribute('aria-valuenow')==='4','Moving the location resets the selected hour');
    assert(document.querySelector('#point-graphs [data-series="0"]'),'Moving the location resets the chosen quantity');
    const tile=await fetch(forecast.imageBase+'point-'+Math.floor(target/index.tileSize)+'.json').then(r=>r.json());
    const data=Uint8Array.from(atob(tile.data),c=>c.charCodeAt(0)),view=new DataView(data.buffer);
    const expected=view.getUint16(((4*tile.count+target%index.tileSize)*6)*2,true)/100;
    assert(document.querySelector('#point-reading strong').textContent.startsWith(expected.toFixed(1)),'Adjusted graph shows values from the wrong model point');
    const solarEvents=[...document.querySelectorAll('[data-solar-event]')];
    const ref=ForecastSolar.range(Date.parse(index.times[0]),Date.parse(index.times.at(-1)),index.points[target][3],index.points[target][2]);
    for(const event of solarEvents){const match=ref.events.find(e=>e.type===event.dataset.solarEvent&&e.time===Number(event.dataset.time));assert(match,'Solar markers were not recalculated for the new coordinates');}
    const selected=findCurrent();
    const cancelOpts=dragTo(index.points[selected][0]*900+15,index.points[selected][1]*675,true);
    thumbnail.dispatchEvent(new PointerEvent('pointercancel',cancelOpts));
    await pause(50);
    assert(findCurrent()===selected&&!document.querySelector('#point-content').inert,'Cancelling a drag changes the selected point');
    dragTo(154.8,27); // A corner with no nearby Baltic sea model points.
    await until(()=>document.querySelector('#point-message').textContent.includes('No sea data'));
    assert(findCurrent()===selected,'Land selection must retain the last valid forecast');
    document.querySelector('#point-close').click();
    await pause(50);
    return {scenarios:['fixed thumbnail marker','cross-chunk real data','hour preserved','solar location update','cancelled drag','invalid sea selection']};
})();
