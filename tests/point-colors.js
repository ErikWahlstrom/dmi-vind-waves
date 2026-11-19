// Run after tests/point-preview.js in the local viewer.
(async function(){
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(ok,m)=>{if(!ok)throw Error(m);};
 document.querySelector('.imgwrap').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 for(let i=0;i<100&&document.querySelector('#point-content').hidden;i++)await pause(30);
 for(let q=0;q<3;q++){
  document.querySelector('#point-view-graph').click();
  document.querySelector('#point-reading button[data-quantity="'+q+'"]').click();
  const curve=document.querySelector('#point-graphs [data-series]'),gradient=document.querySelector('#point-value-colors');
  assert(curve.getAttribute('stroke')==='url(#point-value-colors)','Graph still uses one quantity color');
  assert(gradient.getAttribute('gradientUnits')==='userSpaceOnUse','Colors do not follow the numeric axis');
  assert(Number(gradient.getAttribute('y1'))>Number(gradient.getAttribute('y2')),'Graph colors run in the wrong value direction');
  assert(gradient.querySelectorAll('stop').length>=4,'Map color bands missing');
 }
 document.querySelector('#point-view-table').click();await pause(100);
 const dots=document.querySelectorAll('#point-table .point-color-dot');
 assert(dots.length>0,'Table color dots missing');
 for(const dot of dots){
  const cell=dot.closest('td'),q=cell.cellIndex-1,value=Number(cell.dataset.value);
  const sample=document.createElement('span');sample.style.backgroundColor=ForecastColors.color(q,value);
  assert(dot.style.backgroundColor===sample.style.backgroundColor,'Table dot differs from map color');
  const d=dot.getBoundingClientRect(),a=dot.previousElementSibling.getBoundingClientRect();
  assert(d.top>=a.bottom,'Dot is not below direction arrow');
 }
 const scroller=document.querySelector('#point-table-scroll');
 assert(scroller.scrollWidth<=scroller.clientWidth+1,'Color dots cause horizontal overflow');
 document.querySelector('#point-close').click();await pause(30);
 return {quantities:3,dots:dots.length,mapColors:true,phoneLayout:true};
})();
