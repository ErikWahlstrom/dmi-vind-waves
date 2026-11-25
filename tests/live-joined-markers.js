// One combined badge per station, with directly tappable readings beside it.
(async function(){
 const assert=(ok,m)=>{if(!ok)throw Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(f){for(let i=0;i<350;i++){if(f())return;await pause(30);}throw Error('Combined station view did not settle');}
 const now=Date.now(),stamp=Math.floor(now/3600000)*3600000,original=window.fetch,originalOpen=ForecastLive.open;
 const reading=value=>({value,time:now-300000,source:'viva'}),stations=[{id:'viva-33',vivaId:'33',name:'Combined station',owner:'ViVa',lat:60.73,lon:17.33,readings:{wind:reading(4.2),windDirection:reading(230),level:reading(27),temperature:{...reading(5.4),depth:null}}},{id:'viva-44',vivaId:'44',name:'Wind only',owner:'ViVa',lat:60.73,lon:17.33,readings:{wind:reading(3.2)}}];
 stations.push(
  {id:'viva-45',name:'Wave buoy',lat:60.8,lon:17.5,readings:{wave:reading(1.2),waveDirection:reading(90)}},
  {id:'viva-46',name:'Stale direction buoy',lat:60.9,lon:17.6,readings:{wave:reading(3.8),waveDirection:{...reading(90),time:now-16*60000}}},
  {id:'met-47',name:'Inland wind',lat:60.42,lon:15.5,readings:{wind:reading(18)}}
 );
 const local=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(t);
 ForecastLive.open=opts=>originalOpen({...opts,getForecast:async()=>({rows:[{time:stamp+3600000,kind:'forecast',readings:{wind:{value:5,time:stamp+3600000},wave:{value:1.2,time:stamp+3600000}}}],notes:[]})});
 window.fetch=(url,options)=>{
  if(String(url).includes('/live-data/'))return Promise.resolve(new Response(JSON.stringify({schema:1,checked:new Date(now).toISOString(),stations})));
  if(String(url).includes('vivaoutputservice')){const u=decodeURIComponent(String(url)),v=u.includes('Vattentemp')?'5.4':u.includes('Vattenstånd')?'27':u.includes('Vindriktning')?'230':'4.2';return Promise.resolve(new Response(JSON.stringify({GetHistoryResult:{StationHistory:[{Time:local(stamp),Value:v},{Time:local(stamp-3600000),Value:v}],WaterLevelRef:'MVY'}})));}
  return original(url,options);
 };
 try{
  const j=await(await fetch('/output/vector-fixture/run.json')).json();j.imageBase=location.origin+'/output/vector-fixture/plots/';refreshRun(j);window.fetchRunInfo=()=>Promise.resolve(j);
  await until(()=>ForecastMap.active()&&document.querySelector('#forecast-map .leaflet-control-zoom-in'));
  document.querySelector('#forecast-map-quantities [data-quantity=live]').click();document.querySelector('#forecast-map-refresh').click();
  await until(()=>document.querySelectorAll('#forecast-map [data-live-station]').length===4);
  const buoy=document.querySelector('#forecast-map [data-live-station="viva-45"]');
  const strength=station=>parseFloat(document.querySelector('#forecast-map [data-live-station="'+station+'"] .live-marker-strength').style.getPropertyValue('--live-strength'));
  assert(!document.querySelector('#forecast-map [data-live-station="met-47"]'),'Inland marker appears on the Live map');
  assert(strength('viva-33')>strength('viva-44')&&strength('viva-46')>strength('viva-45'),'Symbols do not grow as wind or wave strength increases');
  assert(buoy.querySelector('.live-marker-symbol').textContent==='≋','Wave direction replaced the wave symbol');
  assert(buoy.querySelector('[data-measurement=wave] .live-marker-wave-arrow').textContent==='←','Waves from the east should point west');
  assert(buoy.querySelector('[data-measurement=wave]').getAttribute('aria-label').includes('From 90°'),'Wave direction is missing from the accessible label');
  assert(!document.querySelector('#forecast-map [data-live-station="viva-46"] .live-marker-wave-arrow'),'Stale wave direction is shown');
  const card=document.querySelector('#forecast-map [data-live-station="viva-33"]');
  assert(card.querySelectorAll('button[data-measurement]').length===3,'Station readings hidden behind an extra click');
  const other=document.querySelector('#forecast-map [data-live-station="viva-44"] .live-station-readings').getBoundingClientRect(),own=card.querySelector('.live-station-readings').getBoundingClientRect();
  assert(other.right<=own.left||own.right<=other.left,'Co-located stations cover each other');
  const boxes=[...card.querySelectorAll('button')].map(e=>e.getBoundingClientRect());
  for(let i=0;i<boxes.length;i++)for(let k=i+1;k<boxes.length;k++)assert(boxes[i].right<=boxes[k].left||boxes[k].right<=boxes[i].left||boxes[i].bottom<=boxes[k].top||boxes[k].bottom<=boxes[i].top,'Readings overlap within station');
  card.querySelector('[data-measurement=level]').click();
  await until(()=>[...document.querySelectorAll('#live-history tr[data-kind=observed] [data-quantity=level]')].some(e=>e.textContent.includes('27')));
  assert(new URLSearchParams(location.search).get('liveLayer')==='level','Direct tap opened the wrong measurement');
  const readingButton=card.querySelector('button'),glyph=card.querySelector('.live-marker-symbol');
  assert(card.querySelectorAll('.live-marker-symbol').length===1&&glyph.children.length===3,'Combined station needs one badge showing its three measurements');
  assert(glyph.getBoundingClientRect().width>=24&&parseFloat(getComputedStyle(readingButton).fontSize)>=15,'Station badge or reading text is too small');
  assert(glyph.getBoundingClientRect().right<=readingButton.getBoundingClientRect().left,'Readings must sit beside the badge');
  assert(getComputedStyle(readingButton).backgroundColor==='rgba(0, 0, 0, 0)','Opaque reading card introduced');
  assert(getComputedStyle(card.querySelector('.live-station-readings')).backgroundColor==='rgba(0, 0, 0, 0)','Opaque station card introduced');
  document.querySelector('#live-close').click();document.querySelector('#forecast-map [data-station="viva-33"][data-measurement=temperature]').click();
  await until(()=>[...document.querySelectorAll('#live-history tr[data-kind=observed] [data-quantity=temperature]')].some(e=>e.textContent.includes('5.4')));
  assert(new URLSearchParams(location.search).get('liveLayer')==='temperature','Temperature tap opened the wrong history');
  document.querySelector('#live-close').click();document.querySelector('#forecast-map [data-station="viva-33"][data-measurement=wind]').click();
  await until(()=>[...document.querySelectorAll('#live-history tr[data-kind=observed] [data-quantity=wind]')].some(e=>e.textContent.includes('4.2')));
  assert(document.querySelector('#live-sheet').scrollWidth<=document.querySelector('#live-sheet').clientWidth,'Station page overflows phone');
  const saved=location.href;document.querySelector('#live-close').click();history.replaceState(history.state,'',saved);await ForecastLive.open({sharedMap:true});
  assert(new URLSearchParams(location.search).get('liveLayer')==='wind','Saved reading selection failed');
  document.querySelector('#live-close').click();document.querySelector('#forecast-map [data-station="viva-44"]').click();
  assert(document.querySelector('#live-station-name').textContent==='Wind only','Wind-only marker opens wrong station');
  return {oneBadgePerStation:true,directReadingTap:true,noOverlappingReadings:true,largerReadings:true,noCards:true,quantityBookmark:true,phoneFit:true};
 }finally{window.fetch=original;ForecastLive.open=originalOpen;if(document.querySelector('#live-sheet').open)document.querySelector('#live-close').click();}
})();
