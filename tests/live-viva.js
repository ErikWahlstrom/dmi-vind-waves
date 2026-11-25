// Run on the default map with output/vector-fixture available.
(async function(){
 const assert=(ok,m)=>{if(!ok)throw Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(f){for(let i=0;i<350;i++){if(f())return;await pause(30);}throw Error('ViVa view did not settle');}
 const now=Date.now(),stamp=Math.floor(now/3600000)*3600000,reading=value=>({value,time:now-300000,source:'viva'});
 const stations=[{id:'sea-35119',vivaId:'33',name:'Bönan 2',owner:'Sjöfartsverket',lat:60.7388,lon:17.3177,readings:{wind:reading(3.4),windDirection:reading(230),temperature:{...reading(5.4),depth:null}}},
  {id:'viva-44',vivaId:'44',name:'Additional ViVa station',owner:'Sjöfartsverket · ViVa',lat:60.85,lon:17.6,readings:{temperature:{...reading(7.2),depth:null}}}];
 const local=time=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(time);
 const original=window.fetch,originalOpen=ForecastLive.open,calls=[];
 ForecastLive.open=opts=>originalOpen({...opts,getForecast:async()=>({rows:[],notes:[]})});
 window.fetch=(url,options)=>{
  if(String(url).includes('/live-data/'))return Promise.resolve(new Response(JSON.stringify({schema:1,checked:new Date(now).toISOString(),stations})));
  if(String(url).includes('vivaoutputservice')){calls.push(String(url));const temperature=String(url).includes('Vattentemp');return Promise.resolve(new Response(JSON.stringify({GetHistoryResult:{StationHistory:[{Time:local(stamp),Value:temperature?'5.4':'3.4'},{Time:local(stamp-3600000),Value:temperature?'5.5':'3.2'}],Felmeddelande:null,WaterLevelRef:null}})));}
  if(String(url).includes('opendata-download-'))throw Error('Merged station used the wrong history provider');
  return original(url,options);
 };
 try{
  const j=await(await fetch('/output/vector-fixture/run.json')).json();j.imageBase=location.origin+'/output/vector-fixture/plots/';refreshRun(j);window.fetchRunInfo=()=>Promise.resolve(j);
  await until(()=>ForecastMap.active()&&document.querySelector('#forecast-map .leaflet-control-zoom-in'));
  document.querySelector('#forecast-map-quantities [data-quantity=live]').click();document.querySelector('#forecast-map-refresh').click();
  await until(()=>document.querySelectorAll('#forecast-map [data-measurement=temperature]').length===2);
  assert(document.querySelectorAll('#forecast-map [data-station="sea-35119"]').length===2,'Merged station markers duplicated or missing');
  document.querySelector('#forecast-map [data-station="sea-35119"][data-measurement=temperature]').click();
  await until(()=>[...document.querySelectorAll('#live-history tr[data-kind=observed] td[data-quantity=temperature]')].some(c=>c.textContent.includes('5.4')));
  const current=document.querySelector('#live-current').textContent;
  assert(current.includes('5.4 °C')&&current.includes('ViVa'),'Bönan temperature/source missing');
  assert(!current.includes('(surface)'),'Unknown ViVa sensor depth was labelled surface');
  assert(document.querySelector('#live-footer').textContent.includes('Sjöfartsverket ViVa'),'ViVa attribution missing');
  assert(calls.some(u=>u.includes('/Vattentemp/33?')),'Merged station lost ViVa history identity');
  assert(document.querySelector('#live-sheet').scrollWidth<=document.querySelector('#live-sheet').clientWidth,'Station page overflows phone');
  assert(document.querySelector('#live-station').scrollWidth<=document.querySelector('#live-station').clientWidth,'Temperature table overflows phone');
  document.querySelector('#live-close').click();
  document.querySelector('#forecast-map [data-station="viva-44"]').click();
  await until(()=>document.querySelector('#live-station-name').textContent==='Additional ViVa station');
  assert(new URLSearchParams(location.search).get('station')==='viva-44','New station not saved in link');
  await until(()=>calls.some(u=>u.includes('/Vattentemp/44?')));
  const saved=location.href;document.querySelector('#live-close').click();history.replaceState(history.state,'',saved);
  await ForecastLive.open({sharedMap:true});
  assert(document.querySelector('#live-station-name').textContent==='Additional ViVa station','Saved ViVa station link failed');
  document.querySelector('#live-close').click();
  const alias=new URL(location.href);alias.searchParams.set('station','viva-33');alias.searchParams.set('liveTab','station');alias.searchParams.set('liveLayer','temperature');history.replaceState(history.state,'',alias);
  await ForecastLive.open({sharedMap:true});
  assert(document.querySelector('#live-station-name').textContent==='Bönan 2','Merged ViVa bookmark alias failed');
  return {combinedMap:true,mergedStationHistory:true,additionalStations:true,temperatureDepthHonest:true,savedStationLink:true,phoneFit:true};
 }finally{ForecastLive.open=originalOpen;window.fetch=original;if(document.querySelector('#live-sheet').open)document.querySelector('#live-close').click();}
})();
