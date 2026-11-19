// Run after point-preview.js. Forecast data is synthetic so future hours never expire.
(async function(){
 const assert=(ok,m)=>{if(!ok)throw Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(f){for(let i=0;i<200;i++){if(f())return;await pause(30);}throw Error('Station timeline did not settle');}
 const now=Date.now(),h=3600000,stamp=Math.floor(now/h)*h,reading=value=>({value,time:now-300000});
 const stations=[{id:'met-81',name:'Timeline wind',lat:60.85,lon:17.5,readings:{wind:reading(7.2),gust:reading(10),windDirection:reading(240)}},{id:'sea-82',name:'Timeline buoy',lat:60.9,lon:17.6,readings:{wave:reading(1.4)}}];
 const original=window.fetch,originalOpen=ForecastLive.open;let chosen=[];
 ForecastLive.open=opts=>originalOpen({...opts,getForecast:async(station,signal)=>{
  chosen.push(station.id);return {rows:Array.from({length:12},(_,i)=>i+1).map(n=>({time:stamp+n*h,readings:{wind:{value:6+n,time:stamp+n*h,direction:240},wave:{value:1+n/10,time:stamp+n*h,direction:90},swell:{value:.3,time:stamp+n*h,direction:null},level:{value:12,time:stamp+n*h}}})),notes:['Test forecast for selected station'],summary:['Sea grid 1 km away']};
 }});
 window.fetch=(url,options)=>{
  if(String(url).includes('/live-data/'))return Promise.resolve(new Response(JSON.stringify({schema:1,checked:new Date(now).toISOString(),stations})));
  if(String(url).includes('opendata-download-')){
   const match=String(url).match(/parameter\/(\d+)\/station\/(\d+)/),parameter=Number(match[1]);
   return Promise.resolve(new Response(JSON.stringify({station:{key:match[2]},parameter:{key:parameter,unit:parameter===1?'m':parameter===3?'grader':'meter per sekund'},value:[{date:stamp,value:'1.4',quality:'G'},{date:stamp-2*h,value:'1.1',quality:'G'}]})));
  }return original(url,options);
 };
 try{
  const q=new URL(location.href);q.searchParams.set('liveTab','map');q.searchParams.delete('station');history.replaceState(null,'',q);
  document.querySelector('#live-open').click();document.querySelector('#live-refresh').click();
  await until(()=>document.querySelector('#live-map [data-station="met-81"]'));
  document.querySelector('#live-map [data-station="met-81"]').click();
  await until(()=>document.querySelectorAll('#live-history tr[data-kind=forecast]').length===12);await pause(80);
  const times=[...document.querySelectorAll('#live-history tr[data-time]')].map(r=>Number(r.dataset.time));
  assert(times.every((t,i)=>!i||t>times[i-1]),'Time does not advance downward');
  assert(document.querySelectorAll('#live-history thead th').length===5,'Four quantity columns missing');
  const first=document.querySelector('#live-history tr[data-kind=forecast]');
  assert(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/.test(first.querySelector('td small').textContent),'Short weekday missing from date');
  assert([...first.querySelectorAll('td[data-quantity]')].every(c=>c.textContent!=='—'),'Future hides a quantity');
  assert([...document.querySelectorAll('#live-history tr[data-kind=observed] td[data-quantity]')].filter(c=>c.dataset.quantity!=='wind').every(c=>c.textContent==='—'),'Observations fill other quantities');
  const panel=document.querySelector('#live-station'),boundary=document.querySelector('#live-history [data-present]');
  assert(boundary.getBoundingClientRect().top>=panel.getBoundingClientRect().top&&boundary.getBoundingClientRect().top<panel.getBoundingClientRect().bottom,'Does not open at latest observations');
  assert(panel.scrollWidth<=panel.clientWidth,'Timeline overflows phone width');
  document.querySelector('#live-timeline-future').click();await pause(400);
  const before=panel.scrollTop;document.querySelector('#live-timeline-now').click();assert(panel.scrollTop<before,'Latest does not return upward from future');
  const sticky=document.querySelector('#live-history th').getBoundingClientRect();assert(sticky.top>=panel.getBoundingClientRect().top+43,'Column headings disappear behind navigation');
  document.querySelector('#live-timeline-details').click();assert(panel.scrollTop===0,'Cannot return to latest station details');
  document.querySelector('#live-tabs [data-tab=map]').click();document.querySelector('#live-map [data-station="sea-82"]').click();
  await until(()=>document.querySelector('#live-history [data-present] td[data-quantity=wave]')?.textContent!=='—'&&document.querySelector('#live-title').textContent==='Timeline buoy');
  assert([...document.querySelectorAll('#live-history tr[data-kind=observed] td[data-quantity]')].filter(c=>c.dataset.quantity!=='wave').every(c=>c.textContent==='—'),'Buoy history contains wind or level observations');
  assert(chosen.includes('met-81')&&chosen.includes('sea-82'),'Forecast does not follow selected station');
  return {futureAllFour:true,observedSelectedOnly:true,opensAtLatest:true,scrollNavigation:true,phoneFit:true};
 }finally{ForecastLive.open=originalOpen;window.fetch=original;if(document.querySelector('#live-sheet').open)document.querySelector('#live-close').click();}
})();
