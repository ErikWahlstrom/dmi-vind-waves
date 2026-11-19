/* One geographic forecast map; the existing images remain available as a fallback. */
(function(){
 'use strict';
 var style=document.createElement('style');style.textContent=`
 #forecast-map-shell { display:none; }
 body.forecast-map-mode main { display:flex; flex-direction:column; height:100dvh; padding:4px; padding-bottom:env(safe-area-inset-bottom,4px); overflow:hidden; gap:4px; }
 body.forecast-map-mode main>.pane { display:none; }
 body.forecast-map-mode #forecast-map-shell { display:flex; flex:1; flex-direction:column; min-height:160px; gap:4px; }
 body.forecast-map-mode #dock { display:block; padding:0; flex:none; }
 body.forecast-map-mode #bar { position:static!important; width:100%!important; padding:0; pointer-events:auto; }
 body.forecast-map-mode #barin { margin:0; font-size:14px!important; }
 body.forecast-map-mode footer { padding:0 4px; margin:0; font-size:10px; }
 body.forecast-map-mode #sourceInfo { font-size:0; line-height:0; margin:0; }
 body.forecast-map-mode #sourceCredit { font-size:10px; line-height:14px; }
 body.forecast-map-mode #prefetchInfo { display:none; }
 body.forecast-map-mode #live-open,body.forecast-map-mode #point-return,body.forecast-map-mode #point-preview-hint,body.forecast-map-mode #forecast-map-launch { display:none!important; }
 #forecast-map-nav,#forecast-map-quantities { display:flex; gap:5px; }
 #forecast-map-shell button,#forecast-map-launch { min-height:44px; border:1px solid #484d52; border-radius:8px; color:#eee; background:#2b3036; padding:0 10px; font:inherit; font-size:13px; }
 #forecast-map-nav strong { flex:1; align-self:center; font-size:14px; }
 #forecast-map-quantities button { flex:1; }
 #forecast-map-quantities button[aria-pressed=true] { background:#36536b; border-color:#89b8dd; }
 #forecast-map { flex:1; min-height:100px; border-radius:8px; background:#c8dde4; touch-action:none; }
 #forecast-map .leaflet-control-zoom a { width:40px; height:40px; line-height:40px; }
 #forecast-map .leaflet-control-attribution { font-size:9px; }
 #forecast-map-key { display:flex; height:20px; color:#eee; }
 #forecast-map-key span { flex:1; text-align:center; font-size:8px; border-top:6px solid; padding-top:1px; }
 #forecast-map-message { margin:0; min-height:14px; font-size:10px; color:#abb2ba; }
 #forecast-map-shell [hidden] { display:none!important; }
 `;document.head.appendChild(style);
 var shell=document.createElement('section');shell.id='forecast-map-shell';shell.innerHTML=`<div id="forecast-map-nav"><button id="forecast-map-images" type="button">Images</button><strong>Forecast map</strong><button id="forecast-map-details" type="button" hidden>Details</button><button id="forecast-map-live" type="button">Live →</button></div><div id="forecast-map-quantities"><button data-quantity="0" type="button">Wind</button><button data-quantity="1" type="button">Waves</button><button data-quantity="2" type="button">Swell</button></div><div id="forecast-map" tabindex="0" role="region" aria-label="Interactive forecast map. Hold a sea location for hourly details."></div><div id="forecast-map-key" aria-label="Forecast colour scale"></div><p id="forecast-map-message" role="status"></p>`;
 document.querySelector('main').prepend(shell);
 var launch=document.createElement('button');launch.id='forecast-map-launch';launch.type='button';launch.textContent='Try interactive map';document.querySelector('footer').prepend(launch);
 var map=null,layer=null,current=null,requested=null,indexCache=new Map(),imageCache=new Map(),sequence=0,selected=0,active=false,loading=false;
 var q=new URLSearchParams(location.search);selected=Math.max(0,['wind','waves','swell'].indexOf(q.get('map')));
 function message(text){document.getElementById('forecast-map-message').textContent=text;}
 function save(){var url=new URL(location.href);url.searchParams.set('mapDisplay',active?'interactive':'images');url.searchParams.set('map',['wind','waves','swell'][selected]);history.replaceState(history.state,'',url);}
 function library(){
  if(window.ForecastLeafletReady)return window.ForecastLeafletReady;
  if(window.L)return Promise.resolve();
  return window.ForecastLeafletReady=Promise.all([new Promise(function(resolve,reject){var link=document.createElement('link');link.rel='stylesheet';link.href=ForecastApp.asset('vendor/leaflet/leaflet.css');link.onload=resolve;link.onerror=reject;document.head.appendChild(link);}),new Promise(function(resolve,reject){var script=document.createElement('script');script.src=ForecastApp.asset('vendor/leaflet/leaflet.js');script.onload=resolve;script.onerror=reject;document.head.appendChild(script);})]);
 }
 function key(){
  window.dispatchEvent(new CustomEvent('forecast-map-quantity',{detail:selected}));
  shell.querySelectorAll('[data-quantity]').forEach(function(b){b.setAttribute('aria-pressed',String(Number(b.dataset.quantity)===selected));});
  var scale=ForecastColors.scales[selected?'wave':'wind'],legend=document.getElementById('forecast-map-key');legend.replaceChildren();
  scale.colors.concat(scale.over).forEach(function(color,i){var span=document.createElement('span');span.style.borderColor=color;span.textContent=scale.levels[i];span.title=scale.levels[i]+(i+1<scale.levels.length?'–'+scale.levels[i+1]:'+')+(selected?' m':' m/s');legend.appendChild(span);});
 }
 async function ensureMap(){
  await library();if(map)return;
  map=L.map('forecast-map',{minZoom:4,maxZoom:12,tapHold:true});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  var lat=Number(q.get('lat')),lon=Number(q.get('lon'));
  if(q.has('lat')&&q.has('lon')&&Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=53&&lat<=67&&lon>=9&&lon<=32)map.setView([lat,lon],7);else map.fitBounds([[54,12],[66,30]]);
  var Raster=L.GridLayer.extend({createTile:function(coords){var canvas=document.createElement('canvas');canvas.width=canvas.height=256;if(current){var rgba=ForecastProjection.tile(current.source,current.transform,coords.z,coords.x,coords.y);canvas.getContext('2d').putImageData(new ImageData(rgba,256,256),0,0);}return canvas;}});
  layer=new Raster({opacity:.72,keepBuffer:1,maxNativeZoom:10}).addTo(map);
  var hold=null,start=null,pointers=new Set(),last=0;
  function cancel(){clearTimeout(hold);hold=null;}
  function select(latlon){if(Date.now()-last<800)return;last=Date.now();window.ForecastOpenPoint(latlon.lat,latlon.lng,selected);}
  var node=map.getContainer();
  node.addEventListener('pointerdown',function(e){pointers.add(e.pointerId);cancel();if(pointers.size!==1||e.button!==0)return;start={x:e.clientX,y:e.clientY};var point=map.mouseEventToLatLng(e);hold=setTimeout(function(){hold=null;select(point);},550);});
  node.addEventListener('pointermove',function(e){if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)cancel();});
  ['pointerup','pointercancel','lostpointercapture'].forEach(function(name){node.addEventListener(name,function(e){pointers.delete(e.pointerId);cancel();});});
  map.on('movestart zoomstart',cancel);map.on('contextmenu',function(e){L.DomEvent.preventDefault(e.originalEvent);select(e.latlng);});
  new ResizeObserver(function(){if(map&&active)map.invalidateSize({pan:false});}).observe(shell);
 }
 function index(snapshot){
  if(!indexCache.has(snapshot.imageBase)){
   var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},15000);
   indexCache.clear();indexCache.set(snapshot.imageBase,fetch(snapshot.imageBase+snapshot.pointForecast,{signal:controller.signal}).finally(function(){clearTimeout(timer);}).then(function(r){if(!r.ok)throw Error('Forecast geography unavailable');return r.json();}).then(function(data){
    if(data.schema!==1||data.identity!==snapshot.forecastIdentity||JSON.stringify(data.times)!==JSON.stringify(snapshot.frames.map(function(f){return f.time;})))throw Error('Forecast geography does not match this hour');return ForecastProjection.fit(data.points);
   }).catch(function(e){indexCache.delete(snapshot.imageBase);throw e;}));
  }return indexCache.get(snapshot.imageBase);
 }
 function source(url){
  if(!imageCache.has(url)){
   if(imageCache.size>5)imageCache.delete(imageCache.keys().next().value);
   imageCache.set(url,new Promise(function(resolve,reject){var image=new Image(),timer=setTimeout(function(){image.src='';reject(Error('Forecast image timed out'));},15000);image.crossOrigin='anonymous';image.onload=function(){clearTimeout(timer);try{var canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;var ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);resolve(ForecastProjection.prepare(ctx.getImageData(0,0,canvas.width,canvas.height)));}catch(e){reject(e);}};image.onerror=function(){clearTimeout(timer);reject(Error('Forecast layer unavailable'));};image.src=url;}).catch(function(e){imageCache.delete(url);throw e;}));
  }return imageCache.get(url);
 }
 async function sync(){
  if(!active||!map||!displayedFrame)return;
  var frame=displayedFrame,url=frame.snapshot.imageBase+frame.snapshot.frames[frame.index-1].files[['win','hs','hsw'][selected]];
  if(requested===url)return;requested=url;var token=++sequence;
  layer.setOpacity(0);message('Loading '+['wind','waves','swell'][selected]+' · '+fmtLocal(new Date(frame.snapshot.frames[frame.index-1].time))+'…');
  try{
   var values=await Promise.all([source(url),index(frame.snapshot)]);
   if(token!==sequence||!active)return;
   current={source:values[0],transform:values[1]};layer.redraw();layer.setOpacity(.72);
   message(['Wind · m/s','Waves · m','Swell · m'][selected]+' · '+fmtLocal(new Date(frame.snapshot.frames[frame.index-1].time))+' · hold at sea for details');
  }catch(error){if(token===sequence){message(error.message+'. Tap a quantity to retry, or use Images.');}}
 }
 async function activate(){
  if(loading)return;loading=true;active=true;prefetchState=null;document.body.classList.add('forecast-map-mode');key();
  try{await ensureMap();map.invalidateSize({pan:false});requested=null;sync();save();}
  catch(error){active=false;document.body.classList.remove('forecast-map-mode');document.getElementById('status').textContent='Interactive map unavailable. Images remain available.';}
  finally{loading=false;}
 }
 launch.addEventListener('click',activate);
 document.getElementById('forecast-map-images').addEventListener('click',function(){active=false;sequence++;document.body.classList.remove('forecast-map-mode');save();if(forecast)prefetch(forecast);});
 document.getElementById('forecast-map-live').addEventListener('click',function(){window.dispatchEvent(new Event('forecast-open-live'));});
 document.getElementById('forecast-map-details').addEventListener('click',function(){document.getElementById('point-return').click();});
 document.getElementById('forecast-map-quantities').addEventListener('click',function(e){var b=e.target.closest('[data-quantity]');if(!b)return;selected=Number(b.dataset.quantity);key();save();requested=null;sync();});
 var previousReturn=document.getElementById('point-return');new MutationObserver(function(){document.getElementById('forecast-map-details').hidden=previousReturn.hidden;}).observe(previousReturn,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(sync).observe(document.querySelector('main'),{childList:true,subtree:true});
 window.ForecastMap={active:function(){return active;},sync:sync};
 if(q.get('mapDisplay')==='interactive')activate();
})();
