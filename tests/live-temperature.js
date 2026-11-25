// Run on the default viewer (no mapDisplay parameter) with the short vector fixture.
(async function(){
 const assert=(ok,m)=>{if(!ok)throw Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(f){for(let i=0;i<350;i++){if(f())return;await pause(30);}throw Error('Temperature view did not settle');}
 const now=Date.now(),stamp=Math.floor(now/3600000)*3600000,reading=value=>({value,time:now-300000});
 const stations=[{id:'sea-901',name:'Temperature buoy',owner:'SMHI',lat:60.9,lon:18.6,readings:{wave:reading(1.2),temperature:{...reading(6.1),depth:0}}},{id:'sea-902',name:'Temperature-only station',owner:'SMHI',lat:60.85,lon:17.6,readings:{temperature:{...reading(7.2),depth:0}}}];
 const original=window.fetch;
 window.fetch=(url,options)=>{
  if(String(url).includes('/live-data/'))return Promise.resolve(new Response(JSON.stringify({schema:1,checked:new Date(now).toISOString(),stations})));
  if(String(url).includes('opendata-download-')){const m=String(url).match(/parameter\/(\d+)\/station\/(\d+)/);return Promise.resolve(new Response(JSON.stringify({station:{key:m[2]},parameter:{key:Number(m[1]),unit:Number(m[1])===5?'°C':'m'},value:[{date:stamp,value:'6.1',quality:'O',depth:'0'},{date:stamp-3600000,value:'6.0',quality:'G',depth:'0'}]})));}
  return original(url,options);
 };
 try{
  const j=await(await fetch('/output/vector-fixture/run.json')).json();j.imageBase=location.origin+'/output/vector-fixture/plots/';refreshRun(j);window.fetchRunInfo=()=>Promise.resolve(j);
  await until(()=>ForecastMap.active()&&document.querySelector('#forecast-map .leaflet-control-zoom-in'));
  while(ForecastMap.view().zoom<8){document.querySelector('#forecast-map .leaflet-control-zoom-in').click();await pause(350);}
  assert(!document.querySelector('#forecast-map-nav #forecast-map-images'),'Old Images button remains in main navigation');
  assert(document.querySelector('footer #forecast-map-images'),'Charts fallback is missing');
  document.querySelector('#forecast-map-quantities [data-quantity=live]').click();document.querySelector('#forecast-map-refresh').click();
  await until(()=>document.querySelectorAll('#forecast-map [data-measurement=temperature]').length===2);
  document.querySelector('#forecast-map [data-station="sea-902"]').click();await until(()=>document.querySelector('#live-sheet').open);
  assert(document.querySelector('#live-current').textContent.includes('Water temperature (surface)'),'Surface temperature label missing');
  assert(document.querySelector('#live-current').textContent.includes('7.2 °C'),'Water temperature units/value missing');
  await until(()=>[...document.querySelectorAll('#live-history tr[data-kind=observed] td[data-quantity=temperature]')].some(c=>c.textContent.includes('6.1')));
  assert(document.querySelector('#live-history thead').textContent.includes('Water °C'),'Temperature history column missing');
  assert(document.querySelector('#live-station').scrollWidth<=document.querySelector('#live-station').clientWidth,'Temperature timeline overflows phone');
  document.querySelector('#live-close').click();assert(!document.querySelector('#live-sheet').open,'Station map return is not shared');
  document.querySelector('#forecast-map-quantities [data-quantity="0"]').click();
  return {defaultInteractive:true,cleanNavigation:true,surfaceTemperature:true,temperatureOnlyStation:true,hourlyHistory:true,phoneFit:true};
 }finally{window.fetch=original;if(document.querySelector('#live-sheet').open)document.querySelector('#live-close').click();}
})();
