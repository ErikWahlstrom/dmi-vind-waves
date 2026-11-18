// Run after tests/point-preview.js. Synthetic values isolate UI behavior;
// the collector is separately checked against real DMI/SMHI responses.
(async function(){
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(ok,m)=>{if(!ok)throw Error(m);};
 async function until(f){for(let i=0;i<150;i++){if(f())return;await pause(30);}throw Error('Water-level UI did not settle');}
 const originalLoad=ForecastWater.load,originalSelect=ForecastWater.select;
 const first=Date.parse(forecast.frames[0].time),now=first+4*3600000;
 const times=Array.from({length:49},(_,i)=>new Date(first+i*3600000).toISOString());
 const station={id:'2507',name:'Test sea station',lat:59.21,lon:20.83,
  observations:Array.from({length:4},(_,i)=>[now-i*60000,24,'O']),forecast:times.map((_,i)=>i<4?null:26+i)};
 const data={schema:1,checked:new Date(now).toISOString(),times,stations:[station]};
 ForecastWater.load=async()=>data;
 ForecastWater.select=(d,lat,lon)=>originalSelect(d,lat,lon,now);
 try{
  document.querySelector('.imgwrap').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  await until(()=>document.querySelector('#point-water-summary').textContent.includes('Test sea station'));
  document.querySelector('#point-view-table').click();await pause(100);
  const table=document.querySelector('#point-table');
  assert(table.tHead.rows[0].cells.length===5,'Missing station water-level column');
  assert(table.querySelector('tr[data-hour="6"] .point-water-cell').textContent==='≈+32','Derived forecast value or estimate marker missing');
  assert(table.querySelector('tr[data-hour="4"] .point-water-cell').textContent==='+24','Measured value is not distinguished from forecast');
  assert(table.querySelector('tr[data-hour="0"] .point-water-cell').textContent==='—','Current reading repeated into unavailable past hours');
  assert(!document.querySelector('#point-water-key').hidden,'Water-level legend missing');
  table.querySelector('tr[data-hour="6"] button').click();await until(()=>displayedFrame.index===7);
  document.querySelector('#point-water-info').open=true;
  assert(document.querySelector('#point-water-description').textContent.includes('local mean'),'Reference level not explained');
  assert(document.querySelector('#point-water-description').textContent.includes('derived by this site'),'Derived station forecast not labelled');
  assert(document.querySelectorAll('#point-water-description a').length===3,'Provider/license credits missing');
  document.querySelector('#point-water-info').open=false;
  const scroller=document.querySelector('#point-table-scroll');
  assert(scroller.scrollWidth<=scroller.clientWidth+1,'Five-column table scrolls horizontally on phone');
  ForecastWater.load=async()=>{throw Error('offline');};
  document.querySelector('#point-close').click();await pause(30);
  document.querySelector('#point-return').click();
  await until(()=>document.querySelector('#point-water-summary').textContent==='Water level temporarily unavailable');
  assert(!document.querySelector('#point-content').hidden,'Water-level outage hides marine forecast');
  assert([...table.querySelectorAll('.point-water-cell')].every(c=>c.textContent==='—'),'Old station values retained after failed fetch');
  document.querySelector('#point-view-graph').click();
  assert(document.querySelector('#point-graphs [data-series]'),'Water-level outage breaks graph');
  document.querySelector('#point-close').click();await pause(30);
  return {scenarios:['station name and distance','signed RW centimetres','forecast estimate markers','no invented past data','source and method credits','five-column phone layout','hour selection','independent outage handling']};
 }finally{ForecastWater.load=originalLoad;ForecastWater.select=originalSelect;}
})();
