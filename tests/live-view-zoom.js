(async function(){
 const vv=visualViewport,keys=['scale','offsetLeft','offsetTop','width','height'];
 const previous=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(vv,k)]));
 const initial=Object.fromEntries(keys.map(k=>[k,vv[k]])),v={...initial};
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(ok,m)=>{if(!ok)throw Error(m);};
 const q=new URL(location.href);q.searchParams.set('liveTab','nearby');history.replaceState(null,'',q);
 try{
  keys.forEach(k=>Object.defineProperty(vv,k,{configurable:true,get:()=>v[k]}));
  for(const scale of [1,2,3]){
   Object.assign(v,{scale,width:initial.width/scale,height:initial.height/scale,offsetLeft:20,offsetTop:40});
   document.querySelector('#live-open').click();await pause(150);vv.dispatchEvent(new Event('resize'));await pause(100);
   const r=document.querySelector('#live-sheet').getBoundingClientRect(),b=document.querySelector('#live-close').getBoundingClientRect();
   assert(Math.abs(r.width*scale-initial.width)<2&&Math.abs(r.height*scale-initial.height)<2,'Live page changes physical size with map pinch zoom');
   assert(Math.abs(r.left-v.offsetLeft)<1&&Math.abs(r.top-v.offsetTop)<1,'Live page leaves visual viewport');
   assert(Math.abs(b.height*scale-44)<1,'Maps control grows with pinch zoom');
   document.querySelector('#live-close').click();await pause(30);
  }
  return {scales:[1,2,3],screenFit:true,navigationSize:true};
 }finally{keys.forEach(k=>{if(previous[k])Object.defineProperty(vv,k,previous[k]);else delete vv[k];});vv.dispatchEvent(new Event('resize'));}
})();
