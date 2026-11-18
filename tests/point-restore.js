// Open a URL with lat/lon/view/full/time and mock GitHub calls, then run this
// script to supply a real short forecast and check automatic restoration.
(async function(){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
 const q=new URLSearchParams(location.search);
 const fixture=await(await fetch('/output/point-fixture/run.json')).json();
 fixture.imageBase=location.origin+'/output/point-fixture/plots/';
 refreshRun(fixture);window.fetchRunInfo=()=>Promise.resolve(fixture);
 for(let i=0;i<200&&(document.querySelector('#point-content').hidden||!document.querySelector('#point-sheet').open);i++)await pause(50);
 assert(document.querySelector('#point-sheet').open&&!document.querySelector('#point-content').hidden,'Saved location did not reopen details');
 assert(document.querySelector('#point-sheet').classList.contains('full-mode'),'Saved link did not open the dedicated page');
 assert(getComputedStyle(document.querySelector('main')).visibility==='hidden','Saved link leaves maps visible');
 assert(document.querySelector('#point-close').textContent.includes('Maps'),'Saved link has no Maps navigation');
 assert(!document.querySelector('#point-table-view').hidden===(q.get('view')==='table'),'Graph/table view not restored');
 const selected=Number(document.querySelector('#point-graphs').getAttribute('aria-valuenow'));
 const target=q.get('time')==='now'?Date.now():Date.parse(q.get('time'));
 const nearest=fixture.frames.reduce((best,f,i)=>Math.abs(Date.parse(f.time)-target)<Math.abs(Date.parse(fixture.frames[best].time)-target)?i:best,0);
 assert(selected===nearest,'Saved link opened the wrong forecast hour');
 assert(document.querySelector('#point-reading button[aria-pressed="true"]').dataset.quantity===String(['wind','waves','swell'].indexOf(q.get('quantity'))),'Quantity not restored');
 return {restored:true,view:q.get('view'),full:q.get('full'),selectedHour:selected,time:q.get('time')};
})();
