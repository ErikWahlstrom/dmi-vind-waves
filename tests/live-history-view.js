// Run after point-preview.js. Test cancellation even when an old fetch ignores abort.
(async function(){
 const assert=(ok,m)=>{if(!ok)throw Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(f){for(let i=0;i<200;i++){if(f())return;await pause(25);}throw Error('History view did not settle');}
 const now=Date.now(),stamp=Math.floor(now/3600000)*3600000,reading=value=>({value,time:now-300000});
 const stations=[{id:'met-91',name:'Slow wind station',lat:60.85,lon:17.5,readings:{wind:reading(7)}},{id:'sea-92',name:'Fast buoy',lat:60.9,lon:17.6,readings:{wave:reading(1.4)}}];
 const original=window.fetch,originalOpen=ForecastLive.open;ForecastLive.open=opts=>originalOpen({...opts,getForecast:async()=>({rows:[],notes:[]})});let release,started=false,fail=false;
 window.fetch=(url,options)=>{
  if(String(url).includes('/live-data/'))return Promise.resolve(new Response(JSON.stringify({schema:1,checked:new Date(now).toISOString(),stations})));
  if(String(url).includes('opendata-download-')){
   if(fail)return Promise.resolve(new Response('',{status:503}));
   if(String(url).includes('/station/91/')){started=true;return new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({station:{key:'91'},parameter:{key:4,unit:'meter per sekund'},value:[{value:'77',date:stamp,quality:'G'}]})));});}
   return Promise.resolve(new Response(JSON.stringify({station:{key:'92'},parameter:{key:1,unit:'m'},value:[{value:'1.4',date:stamp,quality:'G'}]})));
  }
  return original(url,options);
 };
 try{
  document.querySelector('#live-open').click();document.querySelector('#live-refresh').click();
  await until(()=>document.querySelector('#live-map [data-station="met-91"]'));
  document.querySelector('#live-map [data-station="met-91"]').click();await until(()=>started);
  document.querySelector('#live-tabs [data-tab="map"]').click();
  document.querySelector('#live-map [data-station="sea-92"]').click();
  await until(()=>document.querySelector('#live-history tbody').textContent.includes('1.4'));
  release();await pause(100);
  assert(document.querySelector('#live-station-name').textContent==='Fast buoy','Old history changed selected station');
  assert(document.querySelector('#live-history thead').textContent.includes('Waves m'),'Old request replaced buoy columns');
  assert(!document.querySelector('#live-history tbody').textContent.includes('77'),'Cancelled wind history overwrote buoy data');
  fail=true;document.querySelector('#live-refresh').click();
  await until(()=>document.querySelector('#live-history-note').textContent.includes('observations unavailable')&&document.querySelector('#live-history tbody').children.length===0);
  assert(document.querySelector('#live-current tbody').textContent.includes('1.4 m'),'History outage hides current readings');
  assert(document.querySelector('#live-history tbody').children.length===0,'Failed refresh leaves old history as current');
  return {lateRequestIgnored:true,historyOutagePreservesCurrent:true};
 }finally{ForecastLive.open=originalOpen;if(release)release();window.fetch=original;if(document.querySelector('#live-sheet').open)document.querySelector('#live-close').click();}
})();
