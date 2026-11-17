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
        const expected=forecast.coastline==='coastline.svg'?forecast.imageBase+'coastline.svg':new URL('coastline-v1.svg',document.baseURI).href;
        assert(coast.src===expected,'Vector coast does not match the displayed snapshot layout');
    }
    document.querySelector('.imgwrap').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await until(()=>document.querySelector('#point-sheet').open&&!document.querySelector('#point-content').hidden);
    assert(document.querySelectorAll('.point-marker').length===3,'Vector layer duplicates selected-point markers');
    assert(document.querySelector('#point-thumb-coast').getAttribute('href')===document.querySelector('.coastline-layer').src,'Thumbnail does not use the vector coastline');
    const graph=document.querySelector('#point-graphs');
    graph.scrollLeft=8*5;graph.dispatchEvent(new Event('scroll'));
    await until(()=>displayedFrame.index===6);
    assert(document.querySelectorAll('.coastline-layer').length===3,'Changing the hour duplicates vector layers');
    document.querySelector('#point-close').click();
    await pause(50);
    const saved={version:forecast.generatorVersion,coast:forecast.coastline};
    try {
        forecast.generatorVersion=3;delete forecast.coastline;
        // Trigger the same observer used when the displayed forecast changes.
        const ping=document.createElement('span');document.querySelector('.imgwrap').appendChild(ping);ping.remove();
        await until(()=>document.querySelectorAll('.coastline-layer').length===3&&document.querySelector('.coastline-layer').src.endsWith('/coastline-v1.svg'));
        assert(document.querySelector('#point-thumb-coast').getAttribute('href').endsWith('/coastline-v1.svg'),'Cached forecast thumbnail lacks a vector fallback');
    } finally {
        forecast.generatorVersion=saved.version;
        if(saved.coast)forecast.coastline=saved.coast;
        const ping=document.createElement('span');document.querySelector('.imgwrap').appendChild(ping);ping.remove();
    }
    return {scenarios:['PNG/SVG alignment','pinned geography','map hit testing','thumbnail coast','hour changes']};
})();
