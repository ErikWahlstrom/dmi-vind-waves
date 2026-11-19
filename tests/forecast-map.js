// Run after point-preview.js against the short local forecast fixture.
(async function(){
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(ok,m)=>{if(!ok)throw Error(m);};
 async function until(f){for(let i=0;i<250;i++){if(f())return;await pause(30);}throw Error('Interactive forecast did not settle');}
 document.querySelector('#forecast-map-launch').click();
 await until(()=>document.querySelector('#forecast-map-message').textContent.includes('hold at sea'));
 const beforeHour=displayedFrame.index,osm=()=>[...document.querySelectorAll('#forecast-map img.leaflet-tile')].map(i=>i.src).sort().join('|');
 const geography=osm(),bar=document.querySelector('#bar').getBoundingClientRect();
 document.querySelector('#forecast-map-quantities [data-quantity="1"]').click();
 await until(()=>document.querySelector('#forecast-map-message').textContent.startsWith('Waves · m ·'));
 assert(displayedFrame.index===beforeHour,'Quantity switch changed forecast time');assert(osm()===geography,'Quantity switch changed zoom or position');
 const tiles=[...document.querySelectorAll('#forecast-map canvas')];
 assert(tiles.some(c=>c.getContext('2d').getImageData(0,0,256,256).data.some((v,i)=>i%4===3&&v>0)),'No forecast raster is visible');
 document.querySelector('#forecast-map .leaflet-control-zoom-in').click();await pause(300);
 const after=document.querySelector('#bar').getBoundingClientRect(),map=document.querySelector('#forecast-map').getBoundingClientRect();
 assert(Math.abs(bar.top-after.top)<1&&Math.abs(bar.width-after.width)<1,'Slider moves when zooming map');assert(after.top>=map.bottom,'Slider overlaps map pane');
 const node=document.querySelector('#forecast-map'),r=node.getBoundingClientRect();
 function pointer(type,x=0){node.dispatchEvent(new PointerEvent(type,{pointerId:71,pointerType:'touch',isPrimary:true,button:0,clientX:r.left+r.width/2+x,clientY:r.top+r.height/2,bubbles:true}));}
 pointer('pointerdown');pointer('pointermove',20);await pause(600);pointer('pointerup');assert(!document.querySelector('#point-sheet').open,'Panning opens details');
 pointer('pointerdown');await pause(650);pointer('pointerup');
 await until(()=>document.querySelector('#point-sheet').open&&!document.querySelector('#point-content').hidden);
 assert(document.querySelector('#point-reading [aria-pressed=true]').dataset.quantity==='1','Map hold selects wrong quantity');
 document.querySelector('#point-close').click();await pause(100);
 document.querySelector('#forecast-map-images').click();await until(()=>!ForecastMap.active());assert(!ForecastMap.active(),'Images fallback does not open');assert(!document.body.classList.contains('forecast-map-mode'),'Images remain hidden');
 return {colouredOverlay:true,quantityKeepsTimeAndZoom:true,sliderOutsideMap:true,panDoesNotSelect:true,longPressDetails:true,imagesFallback:true};
})();
