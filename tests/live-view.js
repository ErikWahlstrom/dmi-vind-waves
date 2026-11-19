// Run after point-preview.js. Observation-only fixtures exercise the map,
// nearest-station lists, station tables and navigation without provider calls.
(async function(){
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(ok,m)=>{if(!ok)throw Error(m);};
 async function until(f){for(let i=0;i<150;i++){if(f())return;await pause(30);}throw Error('Live view did not settle');}
 const now=Date.now(),reading=value=>({value,time:now-300000,provisional:false});
 const data={schema:1,checked:new Date(now).toISOString(),stations:[
  {id:'met-1',name:'Test coastal wind',owner:'SMHI',lat:59.21,lon:20.83,readings:{wind:reading(7.2),windDirection:reading(240),gust:reading(11.4)}},
  {id:'sea-2',name:'Test wave buoy',owner:'SMHI',lat:59.3,lon:20.9,readings:{wave:reading(1.2),level:reading(12)}},
  {id:'sea-3',name:'Test water gauge',owner:'Sjöfartsverket',lat:59.22,lon:20.84,readings:{level:reading(17)}}]};
 const originalFetch=window.fetch;
 window.fetch=(url,options)=>{
  if(String(url).includes('/live-data/'))return Promise.resolve(new Response(JSON.stringify(data)));
  if(String(url).includes('opendata-download-')){
   const match=String(url).match(/parameter\/(\d+)\/station\/(\d+)/),parameter=Number(match[1]),station=match[2];
   const unit=parameter===4||parameter===21?'meter per sekund':parameter===14?'cm':parameter===1?'m':'grader';
   const stamp=Math.floor(now/3600000)*3600000;
   return Promise.resolve(new Response(JSON.stringify({station:{key:station},parameter:{key:parameter,unit},value:[{date:stamp,value:parameter===1?'1.2':parameter===14?'12':'7.2',quality:'G'},{date:stamp-2*3600000,value:'1.0',quality:'G'}]})));
  }
  return originalFetch(url,options);
 };
 try{
  document.querySelector('.imgwrap').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  await until(()=>!document.querySelector('#point-content').hidden);
  document.querySelector('#point-graphs').scrollLeft=3*8;document.querySelector('#point-graphs').dispatchEvent(new Event('scroll'));
  await until(()=>displayedFrame.index===4);
  document.querySelector('#point-view-live').click();
  await until(()=>document.querySelector('#live-map .leaflet-marker-icon'));
  assert(document.querySelector('#point-view-live').closest('header'),'Live navigation is mixed with Graph/Table');
  assert(document.querySelectorAll('#point-view-controls button').length===2,'Graph/Table controls include page navigation');
  assert(document.querySelectorAll('#live-map .leaflet-marker-icon').length===4,'Map hides a measurement type behind a filter');
  assert(document.querySelector('#live-layers').hidden,'Map still requires a parameter filter');
  const colocated=[...document.querySelectorAll('#live-map [data-station="sea-2"]')];
  assert(colocated.length===2&&colocated[0].style.marginLeft!==colocated[1].style.marginLeft,'Co-located measurements cover each other');
  assert(document.querySelector('#live-map [data-measurement="wave"] .live-marker-waves'),'Buoy symbol missing');
  assert(!document.querySelector('#point-sheet').open&&document.querySelector('#live-sheet').open,'Forecast and Live pages overlap');
  assert(getComputedStyle(document.querySelector('main')).visibility==='hidden','Maps remain behind Live view');
  document.querySelector('#live-map .leaflet-marker-icon').click();
  assert(document.querySelector('#live-station-name').textContent==='Test coastal wind','Station tap does not open the table');
  assert(document.querySelectorAll('#live-current tbody tr').length===3,'Wind, direction or gust missing');
  await until(()=>document.querySelectorAll('#live-history tbody tr').length===24);
  assert(document.querySelector('#live-history thead').textContent.includes('Wind m/s'),'Wind history columns missing');
  assert(document.querySelectorAll('#live-history tbody tr')[1].textContent.includes('—'),'Missing history hour invented');
  assert(document.querySelector('#live-current tbody').textContent.includes('11.4 m/s'),'Measured gust value missing');
  assert(new URL(location.href).searchParams.get('station')==='met-1','Selected station not saved in URL');
  document.querySelector('#live-tabs [data-tab="nearby"]').click();
  document.querySelector('#live-layers [data-layer="waves"]').click();
  assert(document.querySelectorAll('#live-list tbody tr').length===1,'Nearby wave-buoy list missing');
  document.querySelector('#live-list tbody button').click();
  assert(document.querySelector('#live-station-name').textContent==='Test wave buoy','Buoy station table missing');
  await until(()=>document.querySelector('#live-history thead').textContent.includes('Waves m'));
  assert(!document.querySelector('#live-history thead').textContent.includes('Wind m/s'),'Old station history remains');
  assert(document.querySelector('#live-current tbody').textContent.includes('1.2 m'),'Measured wave height missing');
  const q=new URL(location.href).searchParams;
  assert(q.get('view')==='live'&&q.get('liveTab')==='station'&&q.get('liveLayer')==='waves'&&q.get('time')==='now','Live bookmark state is incomplete');
  document.querySelector('#live-forecast').click();
  await until(()=>document.querySelector('#point-sheet').open&&!document.querySelector('#point-content').hidden);
  assert(!document.querySelector('#live-sheet').open,'Forecast return leaves Live open');
  assert(document.querySelector('#point-graphs').getAttribute('aria-valuenow')==='3','Live navigation loses forecast hour');
  document.querySelector('#point-close').click();await pause(30);
  document.querySelector('#live-open').click();
  await until(()=>document.querySelector('#live-station-name').textContent==='Test wave buoy');
  data.checked=new Date(now-3*3600000).toISOString();document.querySelector('#live-refresh').click();
  await until(()=>document.querySelector('#live-status').textContent.includes('out of date'));
  assert(!document.querySelector('#live-map .leaflet-marker-icon'),'Stale readings remain on Live map');
  document.querySelector('#live-close').click();await pause(300);
  assert(new URL(location.href).searchParams.get('detail')==='0','Maps navigation requires browser history');
  return {scenarios:['station map','measured wind and gusts','wave-buoy table','nearby list','per-reading times','station bookmarks','forecast hour preserved','Maps navigation','stale readings hidden']};
 }finally{window.fetch=originalFetch;if(document.querySelector('#live-sheet').open)document.querySelector('#live-close').click();}
})();
