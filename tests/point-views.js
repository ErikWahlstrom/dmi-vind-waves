// Run after tests/point-preview.js in the local viewer.
(async function(){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
 async function until(check){for(let i=0;i<200;i++){if(check())return;await pause(50);}throw Error('View did not settle');}
 document.querySelector('.imgwrap').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 await until(()=>!document.querySelector('#point-content').hidden);
 document.querySelector('#point-view-table').click();
 await pause(100);
 assert(!document.querySelector('#point-table-view').hidden&&document.querySelector('#point-chart').hidden,'Table does not replace graph');
 const normalSheet=document.querySelector('#point-sheet');
 assert(normalSheet.scrollHeight<=normalSheet.clientHeight+2,'Table requires a second outer scrollbar');
 assert(document.querySelectorAll('#point-table thead th').length===4,'Table needs time plus three quantities');
 assert(document.querySelectorAll('#point-table tbody tr[data-hour]').length===forecast.frames.length,'Missing forecast hours');
 const pointIndex=await(await fetch(forecast.imageBase+forecast.pointForecast)).json();
 const point=pointIndex.points.find(p=>p[3].toFixed(3)==='59.200'&&p[2].toFixed(3)==='20.833');
 const solar=ForecastSolar.range(Date.parse(pointIndex.times[0]),Date.parse(pointIndex.times.at(-1))+1,point[3],point[2]);
 assert(solar.events.length>0,'Fixture must cover solar transitions');
 for(const event of solar.events){
  const label=document.querySelector('#point-table [data-solar-event="'+event.type+'"][data-time="'+event.time+'"]');
  assert(label&&label.textContent.includes(':'),'Table solar event or local time missing');
 }
 for(const r of document.querySelectorAll('#point-table tr[data-hour]')){
  const stamp=Date.parse(pointIndex.times[Number(r.dataset.hour)]);
  assert(r.dataset.light===solar.bands.find(b=>b.start<=stamp&&b.end>stamp).phase,'Table shading disagrees with solar time');
 }
 const row=document.querySelector('#point-table tr[data-hour="6"]');
 assert(/[↓↙←↖↑↗→↘]/.test(row.textContent),'Direction arrows are missing');
 row.querySelector('button').click();await until(()=>displayedFrame.index===7);
 assert(row.getAttribute('aria-selected')==='true','Selected table hour not highlighted');
 document.querySelector('#point-expand').click();await pause(100);
 const s=document.querySelector('#point-sheet').getBoundingClientRect();
 assert(document.querySelector('#point-sheet').classList.contains('full-mode')&&Math.abs(s.height-innerHeight+16)<2,'Full view does not fill the phone');
 assert(!document.querySelector('#point-table-view').hidden,'Expanding changed table view');
 document.querySelector('#point-view-graph').click();await pause(100);
 assert(document.querySelector('#point-graphs').getAttribute('aria-valuenow')==='6','Switching back loses selected hour');
 assert(document.querySelector('#point-graphs svg').height.baseVal.value>282,'Full graph has no extra plotting height');
 document.querySelector('#point-reading button[data-quantity="2"]').click();
 document.querySelector('#point-view-table').click();
 await pause(300);
 let url=new URL(location.href);
 assert(url.searchParams.get('view')==='table'&&url.searchParams.get('full')==='1','Presentation not saved in URL');
 assert(url.searchParams.get('quantity')==='swell'&&url.searchParams.get('detail')==='1','Detail settings not saved');
 assert(url.searchParams.has('lat')&&url.searchParams.has('lon')&&url.searchParams.get('time')==='now','Live location link missing');
 // Mock the system share sheet: no messages are sent by a browser check.
 const share=Object.getOwnPropertyDescriptor(navigator,'share');
 Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{}});
 document.querySelector('#point-link-hour').click();
 url=new URL(location.href);
 assert(Date.parse(url.searchParams.get('time'))===Date.parse(forecast.frames[6].time),'Shared hour was not pinned');
 const fixedUrl=url.href;
 document.querySelector('#point-link-live').click();
 assert(new URL(location.href).searchParams.get('time')==='now','Live link retains a stale pinned time');
 const liveUrl=location.href;
 if(share)Object.defineProperty(navigator,'share',share);else delete navigator.share;
 document.querySelector('#point-close').click();await pause(300);
 assert(new URL(location.href).searchParams.get('detail')==='0','Closing details not saved');
 assert(getComputedStyle(document.querySelector('#point-sheet')).display==='none','Closed full view remains visible');
 return {scenarios:['hourly table','direction arrows','row selection','full graph and table','view switching','live links','fixed-hour sharing','closed detail state'],liveUrl,fixedUrl};
})();
