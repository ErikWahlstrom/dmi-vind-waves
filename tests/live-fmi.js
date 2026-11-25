// Run on the default map with output/vector-fixture available.
(async function(){
 const assert=(ok,m)=>{if(!ok)throw Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(f){for(let i=0;i<350;i++){if(f())return;await pause(30);}throw Error('FMI view did not settle');}
 const now=Date.now(),hour=3600000,stamp=Math.floor(now/hour)*hour,original=window.fetch,originalOpen=ForecastLive.open,calls=[];
 let xml=await(await fetch('/tests/fixtures/fmi-observations.xml')).text(),fail=false;
 const shift=stamp-hour-Date.UTC(2026,10,19,15);
 xml=xml.replace(/2026-11-19T\d\d:\d\d:00Z/g,t=>new Date(Date.parse(t)+shift).toISOString().replace('.000Z','Z'));
 const parsed=ForecastLiveHistory.parseFmi(xml,'fmi-100908',['wind','windDirection','gust'],now);
 assert(Object.values(parsed.wind).some(r=>r.value===5),'FMI first hourly sample lost');
 assert(!Object.values(parsed.wind).some(r=>r.value===5.8),'Later same-hour wind replaced the first sample');
 let mismatch=false;try{ForecastLiveHistory.parseFmi(xml,'fmi-999',['wind'],now);}catch(_){mismatch=true;}
 assert(mismatch,'FMI history station identity not validated');
 assert(!Object.keys(ForecastLiveHistory.parseFmi(xml,'fmi-134246',['wave'],now+48*hour).wave).length,'Stale FMI history accepted');
 for(const bad of ['<ExceptionReport/>','<broken','<!DOCTYPE x><x/>']){let rejected=false;try{ForecastLiveHistory.parseFmi(bad,'fmi-100908',['wind'],now);}catch(_){rejected=true;}assert(rejected,'Bad FMI XML accepted');}
 const reading=value=>({value,time:now-300000,source:'fmi',provisional:true});
 const stations=[{id:'fmi-100908',name:'Parainen Utö',owner:'FMI',lat:59.77909,lon:21.37479,readings:{wind:reading(6.2),windDirection:reading(230),gust:reading(8.2)}},
 {id:'fmi-134246',name:'Selkämeri aaltopoiju',owner:'FMI',lat:61.8,lon:20.233,readings:{wave:reading(1.2),waveDirection:reading(101),temperature:{...reading(6.5),depth:null}}},
 {id:'fmi-103807',name:'Oulu Santapankki',owner:'FMI',lat:65.18083,lon:25.0325,readings:{temperature:{...reading(3.2),depth:null}}}];
 ForecastLive.open=opts=>originalOpen({...opts,getForecast:async()=>({rows:[],notes:[]})});
 window.fetch=(url,options)=>{
  if(String(url).includes('/live-data/'))return Promise.resolve(new Response(JSON.stringify({schema:1,checked:new Date(now).toISOString(),stations})));
  if(String(url).startsWith('https://opendata.fmi.fi/wfs?')){
   calls.push(String(url));if(fail)return Promise.resolve(new Response('',{status:503}));
   const id=new URL(url).searchParams.get('fmisid'),doc=new DOMParser().parseFromString(xml,'application/xml');
   [...doc.getElementsByTagNameNS('http://www.opengis.net/wfs/2.0','member')].forEach(m=>{if(m.getElementsByTagNameNS('http://www.opengis.net/gml/3.2','identifier')[0].textContent!==id)m.remove();});
   return Promise.resolve(new Response(new XMLSerializer().serializeToString(doc)));
  }
  return original(url,options);
 };
 try{
  const j=await(await fetch('/output/vector-fixture/run.json')).json();j.imageBase=location.origin+'/output/vector-fixture/plots/';refreshRun(j);window.fetchRunInfo=()=>Promise.resolve(j);
  await until(()=>ForecastMap.active()&&document.querySelector('#forecast-map .leaflet-control-zoom-in'));
  document.querySelector('#forecast-map-quantities [data-quantity=live]').click();document.querySelector('#forecast-map-refresh').click();
  await until(()=>document.querySelectorAll('#forecast-map [data-station^="fmi-"]').length===4);
  document.querySelector('#forecast-map [data-station="fmi-100908"]').click();
  await until(()=>[...document.querySelectorAll('#live-history tr[data-kind=observed] [data-quantity=wind]')].some(c=>c.textContent.includes('6.2')));
  assert(document.querySelector('#live-current').textContent.includes('6.2 m/s'),'Finnish wind missing');
  const q=new URL(calls[0]).searchParams;assert(q.get('storedquery_id').includes('weather')&&q.get('parameters').includes('winddirection'),'Wind/history parameters wrong');
  document.querySelector('#live-close').click();document.querySelector('#forecast-map [data-station="fmi-134246"][data-measurement=wave]').click();
  await until(()=>[...document.querySelectorAll('#live-history tr[data-kind=observed] [data-quantity=wave]')].some(c=>c.textContent.includes('1.2')));
  assert(document.querySelector('#live-current').textContent.includes('Peak wave direction (from)'),'FMI peak direction labelled as mean');
  assert(document.querySelector('#live-current').textContent.includes('6.5 °C'),'Finnish buoy temperature missing');
  assert(document.querySelector('#live-footer').textContent.includes('FMI · CC BY 4.0'),'FMI attribution missing');
  assert(document.querySelector('#live-sheet').scrollWidth<=document.querySelector('#live-sheet').clientWidth,'FMI station page overflows phone');
  assert(calls.length===2,'FMI history was fetched once per field instead of once per station');
  const saved=location.href;document.querySelector('#live-close').click();history.replaceState(history.state,'',saved);await ForecastLive.open({sharedMap:true});
  assert(document.querySelector('#live-station-name').textContent==='Selkämeri aaltopoiju','Saved FMI station failed');
  fail=true;document.querySelector('#live-refresh').click();
  await until(()=>document.querySelector('#live-history-note').textContent.includes('Hourly history unavailable'));
  assert(document.querySelector('#live-current').textContent.includes('1.2 m'),'FMI history outage hid current readings');
  document.querySelector('#live-close').click();document.querySelector('#forecast-map [data-station="fmi-103807"]').click();
  assert(document.querySelector('#live-current').textContent.includes('3.2 °C'),'Temperature-only FMI station failed');
  return {xmlHistory:true,stationIdentity:true,wind:true,wave:true,temperature:true,oneHistoryRequestPerStation:true,savedStationLink:true,phoneFit:true,historyFailurePreservesCurrent:true};
 }finally{window.fetch=original;ForecastLive.open=originalOpen;if(document.querySelector('#live-sheet').open)document.querySelector('#live-close').click();}
})();
