// Run after tests/point-preview.js with the generated coastline.svg fixture.
(async function () {
    const pause=ms=>new Promise(r=>setTimeout(r,ms));
    const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
    async function until(test){for(let i=0;i<200;i++){if(test())return;await pause(50);}throw Error('Coastline did not settle');}
    await until(()=>document.querySelectorAll('.coastline-layer').length===3);
    for(const wrap of document.querySelectorAll('.imgwrap')) {
        const base=wrap.querySelector('img[id^="img-"]'),coast=wrap.querySelector('.coastline-layer');
        await coast.decode();
        const r=base.getBoundingClientRect(),s=coast.getBoundingClientRect();
        for(const key of ['x','y','width','height'])assert(Math.abs(r[key]-s[key])<1,'Vector layer misaligned: '+key);
        assert(getComputedStyle(coast).pointerEvents==='none','Vector coast blocks map selection');
        assert(coast.src===forecast.imageBase+'coastline.svg','Vector coast is not pinned to the displayed snapshot');
    }
    document.querySelector('.imgwrap').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await until(()=>document.querySelector('#point-sheet').open&&!document.querySelector('#point-content').hidden);
    assert(document.querySelectorAll('.point-marker').length===3,'Vector layer duplicates selected-point markers');
    assert(document.querySelector('#point-thumb-coast').getAttribute('href')===forecast.imageBase+'coastline.svg','Thumbnail does not use the vector coastline');
    const graph=document.querySelector('#point-graphs');
    graph.scrollLeft=8*5;graph.dispatchEvent(new Event('scroll'));
    await until(()=>displayedFrame.index===6);
    assert(document.querySelectorAll('.coastline-layer').length===3,'Changing the hour duplicates vector layers');
    document.querySelector('#point-close').click();
    await pause(50);
    return {scenarios:['PNG/SVG alignment','pinned geography','map hit testing','thumbnail coast','hour changes']};
})();
