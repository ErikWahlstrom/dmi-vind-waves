// Real two-hour SVG fixture, with delayed responses to catch blink/stale-frame races.
(async function(){
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(ok,m)=>{if(!ok)throw Error(m);};
 async function until(f){for(let i=0;i<400;i++){if(f())return;await pause(10);}throw Error('Playback did not settle');}
 const original=window.fetch,base=location.origin+'/output/playback-fixture/',actual=location.origin+'/output/vector-fixture/plots/';let fetches=0;
 const j=await(await fetch('/output/vector-fixture/run.json')).json();j.imageBase=base;j.coastline=null;
 window.fetch=(url,options)=>{if(String(url).startsWith(base)){if(String(url).includes('.map.1.svg')){fetches++;return pause(250).then(()=>original(String(url).replace(base,actual),options));}return original(String(url).replace(base,actual),options);}return original(url,options);};
 try{
  if(!ForecastMap.active())document.querySelector('#forecast-map-launch').click();
  refreshRun(j);window.fetchRunInfo=()=>Promise.resolve(j);
  await until(()=>displayedFrame?.snapshot.imageBase===base&&document.querySelector('#forecast-map svg[data-time]')?.dataset.time===j.frames[1].time);
  const visible=()=>[...document.querySelectorAll('#forecast-map svg[data-time]')].filter(e=>Number(getComputedStyle(e).opacity)>0);
  let blanks=0,mismatches=0,sampling=true;
  function sample(){if(!sampling)return;const layers=visible();if(!layers.length)blanks++;if(layers.length&&displayedFrame&&layers[0].dataset.time!==displayedFrame.snapshot.frames[displayedFrame.index-1].time)mismatches++;requestAnimationFrame(sample);}requestAnimationFrame(sample);
  const old=visible()[0];show(1);await pause(40);
  assert(visible()[0]===old,'Current layer disappears while next hour loads');assert(displayedFrame.index===2,'Timestamp changes before vector is ready');
  assert(parseFloat(document.querySelector('.fill').style.width)===0,'Slider thumb waits for network');
  show(2);assert(parseFloat(document.querySelector('.fill').style.width)===100,'Slider thumb sticks on a cancelled hour');await pause(350);assert(displayedFrame.index===2&&visible()[0]===old,'Late response overwrites the latest choice');
  const started=performance.now();show(1);await until(()=>displayedFrame.index===1);const cachedSwapMs=Math.round(performance.now()-started);
  assert(fetches===1,'Cached hour downloaded again');assert(visible()[0].dataset.time===j.frames[0].time,'Wrong vector hour after cached swap');
  const track=document.querySelector('.track'),r=track.getBoundingClientRect();
  track.dispatchEvent(new PointerEvent('pointerdown',{pointerId:81,clientX:r.left,clientY:r.top+10,bubbles:true,button:0}));
  for(let i=0;i<20;i++)track.dispatchEvent(new PointerEvent('pointermove',{pointerId:81,clientX:r.left+r.width*i/19,clientY:r.top+10,bubbles:true,button:0}));
  track.dispatchEvent(new PointerEvent('pointerup',{pointerId:81,bubbles:true,button:0}));
  assert(parseFloat(document.querySelector('.fill').style.width)===100,'Drag does not immediately follow finger');
  await until(()=>displayedFrame.index===2);assert(!mapScrubbing,'Drag remains active after release');
  await pause(50);sampling=false;
  assert(!blanks,'Empty forecast frames occurred');assert(!mismatches,'Time labels and visible forecast disagree');
  assert(!performance.getEntriesByType('resource').some(r=>r.name.startsWith(base)&&r.name.endsWith('.png')),'Vector slider still waits on PNG images');
  const restored=JSON.parse(JSON.stringify(j));restored.imageBase=actual;restored.coastline='coastline.svg';refreshRun(restored);window.fetchRunInfo=()=>Promise.resolve(restored);await until(()=>displayedFrame?.snapshot.imageBase===actual);
  document.querySelector('#forecast-map-images').click();await until(()=>!ForecastMap.active());
  assert([...document.querySelectorAll('.imgwrap>img[id]')].every(img=>img.src.includes('/output/vector-fixture/plots/')&&img.complete),'Images fallback shows stale images');
  return {noBlankFrames:true,latestRequestWins:true,noPNGWait:true,timeMatchesLayer:true,cachedSwapMs,imagesFallbackFresh:true};
 }finally{window.fetch=original;}
})();
