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
 body.forecast-map-mode footer #status { grid-row:1; min-height:14px; }
 body.forecast-map-mode footer #timeInfo { grid-row:2; }
 body.forecast-map-mode footer .app-reload { grid-column:1; grid-row:3; }
 body.forecast-map-mode footer #refreshBtn,body.forecast-map-mode footer #forecast-map-refresh { grid-column:2; grid-row:3; }
 body.forecast-map-mode footer #sourceInfo { grid-row:4; }
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
 #forecast-map-message { margin:0; height:28px; min-height:28px; flex:none; overflow:auto; font-size:10px; line-height:14px; color:#abb2ba; }
 body.forecast-map-live-mode #bar,body.forecast-map-live-mode #forecast-map-key,body.forecast-map-live-mode #sourceInfo,body.forecast-map-live-mode #status,body.forecast-map-live-mode #timeInfo { visibility:hidden!important; pointer-events:none; }
 body.forecast-map-live-mode #refreshBtn { display:none!important; }
 #forecast-map-refresh[hidden] { display:none!important; }
 #forecast-map-shell [hidden] { display:none!important; }
 `;document.head.appendChild(style);
 var shell=document.createElement('section');shell.id='forecast-map-shell';shell.innerHTML=`<div id="forecast-map-nav"><button id="forecast-map-images" type="button">Images</button><strong>Forecast map</strong><button id="forecast-map-details" type="button" hidden>Details</button></div><div id="forecast-map-quantities"><button data-quantity="0" type="button">Wind</button><button data-quantity="1" type="button">Waves</button><button data-quantity="2" type="button">Swell</button><button data-quantity="live" type="button">Live</button></div><div id="forecast-map" tabindex="0" role="region" aria-label="Interactive forecast map. Hold a sea location for hourly details."></div><div id="forecast-map-key" aria-label="Forecast colour scale"></div><p id="forecast-map-message" role="status"></p>`;
 document.querySelector('main').prepend(shell);
 var launch=document.createElement('button');launch.id='forecast-map-launch';launch.type='button';launch.textContent='Try interactive map';document.querySelector('footer').prepend(launch);
 var map=null,layer=null,vectorLayer=null,liveMarkers=null,liveRequest=0,centerAnchor=null,resizing=false,vectorCache=new Map(),maskCache=new Map(),flowCache=new Map(),geographyCache=new Map(),arrowState=null,debounceFrame=null,prefetchTimer=null,prefetchEpoch=0,current=null,requested=null,indexCache=new Map(),imageCache=new Map(),sequence=0,selected=0,active=false,loading=false;
 var liveCredit=false,liveAttribution='Observations: <a href="https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning">SMHI · CC BY 4.0</a>';
 var q=new URLSearchParams(location.search),liveMode=q.get('mapLayer')==='live';selected=Math.max(0,['wind','waves','swell'].indexOf(q.get('map')));
 function message(text){document.getElementById('forecast-map-message').textContent=text;}
 function save(){var url=new URL(location.href);url.searchParams.set('mapDisplay',active?'interactive':'images');if(liveMode)url.searchParams.set('mapLayer','live');else url.searchParams.delete('mapLayer');url.searchParams.set('map',['wind','waves','swell'][selected]);history.replaceState(history.state,'',url);}
 function library(){
  if(window.ForecastLeafletReady)return window.ForecastLeafletReady;
  if(window.L)return Promise.resolve();
  return window.ForecastLeafletReady=Promise.all([new Promise(function(resolve,reject){var link=document.createElement('link');link.rel='stylesheet';link.href=ForecastApp.asset('vendor/leaflet/leaflet.css');link.onload=resolve;link.onerror=reject;document.head.appendChild(link);}),new Promise(function(resolve,reject){var script=document.createElement('script');script.src=ForecastApp.asset('vendor/leaflet/leaflet.js');script.onload=resolve;script.onerror=reject;document.head.appendChild(script);})]);
 }
 function key(){
  if(map&&liveCredit!==liveMode){map.attributionControl[liveMode?'addAttribution':'removeAttribution'](liveAttribution);liveCredit=liveMode;}
  document.body.classList.toggle('forecast-map-live-mode',active&&liveMode);
  document.getElementById('bar').inert=active&&liveMode;
  document.getElementById('bar').setAttribute('aria-hidden',String(active&&liveMode));
  document.querySelector('#forecast-map-nav strong').textContent=liveMode?'Live stations':'Forecast map';
  document.getElementById('forecast-map-refresh').hidden=!liveMode;
  document.getElementById('forecast-map-details').hidden=liveMode||document.getElementById('point-return').hidden;
  window.dispatchEvent(new CustomEvent('forecast-map-quantity',{detail:selected}));
  shell.querySelectorAll('[data-quantity]').forEach(function(b){b.setAttribute('aria-pressed',String(liveMode?b.dataset.quantity==='live':b.dataset.quantity!=='live'&&Number(b.dataset.quantity)===selected));});
  var shown=vectorLayer?['win','hs','hsw'].indexOf(vectorLayer.getElement().dataset.kind):-1;legend(shown<0?selected:shown);
 }
 function legend(quantity){
  var scale=ForecastColors.scales[quantity?'wave':'wind'],legend=document.getElementById('forecast-map-key');legend.replaceChildren();
  scale.colors.concat(scale.over).forEach(function(color,i){var span=document.createElement('span');span.style.borderColor=color;span.textContent=scale.levels[i];span.title=scale.levels[i]+(i+1<scale.levels.length?'–'+scale.levels[i+1]:'+')+(quantity?' m':' m/s');legend.appendChild(span);});
 }

 async function ensureMap(){
  await library();if(map)return;
  map=L.map('forecast-map',{minZoom:4,maxZoom:12,tapHold:true});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  var lat=Number(q.get('lat')),lon=Number(q.get('lon'));
  if(q.has('lat')&&q.has('lon')&&Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=53&&lat<=67&&lon>=9&&lon<=32)map.setView([lat,lon],7);else map.fitBounds([[54,12],[66,30]]);
  var Raster=L.GridLayer.extend({createTile:function(coords){var canvas=document.createElement('canvas');canvas.width=canvas.height=256;if(current){var rgba=ForecastProjection.tile(current.source,current.transform,coords.z,coords.x,coords.y);canvas.getContext('2d').putImageData(new ImageData(rgba,256,256),0,0);}return canvas;}});
  layer=new Raster({opacity:.72,keepBuffer:1,maxNativeZoom:10}).addTo(map);
  if(liveMode){map.attributionControl.addAttribution(liveAttribution);liveCredit=true;}
  var hold=null,start=null,pointers=new Set(),last=0;
  function cancel(){clearTimeout(hold);hold=null;}
  function select(latlon){if(liveMode)return;if(Date.now()-last<800)return;last=Date.now();window.ForecastOpenPoint(latlon.lat,latlon.lng,selected);}
  var node=map.getContainer();
  node.addEventListener('pointerdown',function(e){pointers.add(e.pointerId);cancel();if(pointers.size!==1||e.button!==0)return;start={x:e.clientX,y:e.clientY};var point=map.mouseEventToLatLng(e);hold=setTimeout(function(){hold=null;select(point);},550);});
  node.addEventListener('pointermove',function(e){if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)cancel();});
  ['pointerup','pointercancel','lostpointercapture'].forEach(function(name){node.addEventListener(name,function(e){pointers.delete(e.pointerId);cancel();});});
  centerAnchor=map.getCenter();map.on('moveend',function(){if(!resizing)centerAnchor=map.getCenter();});
  map.on('zoomend moveend',function(){sizeArrows();adaptiveArrows();});
  liveMarkers=L.layerGroup();
  map.on('movestart zoomstart',cancel);map.on('contextmenu',function(e){L.DomEvent.preventDefault(e.originalEvent);select(e.latlng);});
  new ResizeObserver(function(){if(map&&active){var center=centerAnchor||map.getCenter();resizing=true;map.invalidateSize({pan:false});map.panTo(center,{animate:false});resizing=false;}}).observe(shell);
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
 function safeSVG(text,expected){
  if(text.length>8000000)throw Error('Vector forecast is too large');
  var svg=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;
  var tags=['svg','g','path','defs','clipPath'],attrs=['xmlns','viewBox','fill','fill-rule','clip-rule','clip-path','stroke','stroke-width','id','d','transform','data-arrow','data-x','data-y','data-angle','data-identity','data-time','data-kind'];
  [svg].concat(Array.from(svg.querySelectorAll('*'))).forEach(function(el){
   if(!tags.includes(el.localName)||el.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('Invalid vector geometry');
   Array.from(el.attributes).forEach(function(a){if(!attrs.includes(a.name)||a.value.includes('url(')&&a.value!=='url(#forecast-sea)')throw Error('Unsupported vector attributes');});
  });
  if(!/^0 0 1000 [0-9.]+$/.test(svg.getAttribute('viewBox')||''))throw Error('Invalid vector bounds');
  if(expected&&(svg.dataset.identity!==expected.identity||svg.dataset.time!==expected.time||svg.dataset.kind!==expected.kind))throw Error('Vector forecast does not match this hour');
  return svg;
 }
 function textFile(url,low){var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},20000);return fetch(url,{signal:controller.signal,priority:low?'low':'high'}).then(function(r){if(!r.ok)throw Error('Vector forecast unavailable');return r.text();}).finally(function(){clearTimeout(timer);});}
 function vectorFile(url,expected,low){
  if(!vectorCache.has(url)){if(vectorCache.size>11)vectorCache.delete(vectorCache.keys().next().value);vectorCache.set(url,textFile(url,low).then(function(text){return safeSVG(text,expected);}).catch(function(e){vectorCache.delete(url);throw e;}));}return vectorCache.get(url);
 }
 function seaMask(snapshot){
  if(!maskCache.has(snapshot.imageBase)){maskCache.clear();maskCache.set(snapshot.imageBase,textFile(snapshot.imageBase+snapshot.vectorMap.mask).then(function(text){var svg=safeSVG(text);var defs=svg.querySelector('defs');if(!defs)throw Error('Vector coast mask unavailable');return defs;}).catch(function(e){maskCache.delete(snapshot.imageBase);throw e;}));}return maskCache.get(snapshot.imageBase);
 }
 function sizeArrows(target){
  var rendering=target&&target.getElement?target:vectorLayer;if(!rendering)return;var svg=rendering.getElement(),width=svg.getBoundingClientRect().width;if(!width)return;
  var scale=14*1000/width;
  svg.querySelectorAll('[data-arrow]').forEach(function(g){g.setAttribute('transform','translate('+g.dataset.x+' '+g.dataset.y+') rotate('+g.dataset.angle+') scale('+scale+')');});
 }
 function geography(snapshot){
  if(!geographyCache.has(snapshot.imageBase)){geographyCache.clear();geographyCache.set(snapshot.imageBase,textFile(snapshot.imageBase+snapshot.pointForecast).then(JSON.parse).then(function(data){if(data.identity!==snapshot.forecastIdentity||JSON.stringify(data.times)!==JSON.stringify(snapshot.frames.map(function(f){return f.time;})))throw Error('Direction geography mismatch');return data;}).catch(function(e){geographyCache.delete(snapshot.imageBase);throw e;}));}return geographyCache.get(snapshot.imageBase);
 }
 function flowFile(frame,low){
  if(frame.snapshot.vectorMap.arrowFormat!=='points-v1')return Promise.resolve(null);
  var step=frame.snapshot.frames[frame.index-1],url=frame.snapshot.imageBase+step.flow;
  if(!flowCache.has(url)){if(flowCache.size>9)flowCache.delete(flowCache.keys().next().value);flowCache.set(url,Promise.all([geography(frame.snapshot),textFile(url,low).then(JSON.parse)]).then(function(parts){return ForecastArrows.decode(parts[0],parts[1],frame.snapshot.forecastIdentity,step.time);}).catch(function(e){flowCache.delete(url);throw e;}));}return flowCache.get(url);
 }
 function adaptiveArrows(target,data,quantity){
  if(!target){if(liveMode||!arrowState||!vectorLayer)return;target=vectorLayer;data=arrowState.data;quantity=arrowState.quantity;}
  if(!data)return;
  var svg=target.getElement(),group=svg.querySelector('[data-adaptive-arrows]');
  if(!group){svg.querySelectorAll('[data-arrow]').forEach(function(g){g.remove();});group=document.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('data-adaptive-arrows','1');svg.querySelector('g[clip-path]').appendChild(group);}
  var b=map.getBounds(),arrows=ForecastArrows.select(data,quantity,function(lat,lon){return map.latLngToContainerPoint([lat,lon]);},{south:b.getSouth(),north:b.getNorth(),west:b.getWest(),east:b.getEast()});
  var fragment=document.createDocumentFragment(),south=53.5,north=66.2,west=9,east=31.5,h=svg.viewBox.baseVal.height;
  function mercator(lat){return Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));}
  var top=mercator(north),span=top-mercator(south);
  arrows.forEach(function(a){var g=document.createElementNS('http://www.w3.org/2000/svg','g'),path=document.createElementNS('http://www.w3.org/2000/svg','path');g.dataset.arrow='1';g.dataset.x=(a.lon-west)/(east-west)*1000;g.dataset.y=(top-mercator(a.lat))/span*h;g.dataset.angle=a.direction+180;path.setAttribute('d','M0 -.6L.24 -.12H.08V.6H-.08V-.12H-.24Z');path.setAttribute('fill','#17212a');path.setAttribute('stroke','#fff');path.setAttribute('stroke-width','.035');g.appendChild(path);fragment.appendChild(g);});
  group.replaceChildren(fragment);sizeArrows(target);
 }
 function canPresent(frame){return active&&!liveMode&&map&&frame&&frame.snapshot.vectorMap&&frame.snapshot.frames[frame.index-1].vectors;}
 function layerURL(frame,quantity){return frame.snapshot.imageBase+frame.snapshot.frames[frame.index-1].vectors[['win','hs','hsw'][quantity]];}
 function prefetchNearby(frame){
  clearTimeout(prefetchTimer);var epoch=++prefetchEpoch,quantity=selected;
  prefetchTimer=setTimeout(async function(){for(var offset of [1,-1,2,-2]){
   if(epoch!==prefetchEpoch||!active||liveMode||document.hidden)return;var hour=frame.index+offset;if(hour<1||hour>frame.snapshot.frames.length)continue;
   var next={snapshot:frame.snapshot,index:hour},step=next.snapshot.frames[hour-1];
   try{await Promise.all([vectorFile(layerURL(next,quantity),{identity:next.snapshot.forecastIdentity,time:step.time,kind:['win','hs','hsw'][quantity]},true),flowFile(next,true)]);}catch(_){}
  }},180);
 }
 async function prepareFrame(frame){
  var quantity=selected,kind=['win','hs','hsw'][quantity],step=frame.snapshot.frames[frame.index-1],url=layerURL(frame,quantity),token=++sequence;
  requested=url;clearTimeout(prefetchTimer);prefetchEpoch++;if(debounceFrame)debounceFrame();
  var showing=vectorLayer?vectorLayer.getElement().dataset.time:null,shownKind=vectorLayer?{win:'Wind',hs:'Waves',hsw:'Swell'}[vectorLayer.getElement().dataset.kind]:'';
  message((showing?'Showing '+shownKind+' '+fmtLocal(new Date(showing))+' · ':'')+'Loading '+['wind','waves','swell'][quantity]+' '+fmtLocal(new Date(step.time))+'…');
  if(typeof mapScrubbing!=='undefined'&&mapScrubbing&&!vectorCache.has(url))await new Promise(function(resolve){var timer;function finish(){clearTimeout(timer);if(debounceFrame===finish)debounceFrame=null;resolve();}timer=setTimeout(finish,65);debounceFrame=finish;});
  if(token!==sequence||!canPresent(frame))throw new DOMException('Superseded','AbortError');
  var parts=await Promise.all([vectorFile(url,{identity:frame.snapshot.forecastIdentity,time:step.time,kind:kind}),seaMask(frame.snapshot),flowFile(frame)]);
  if(token!==sequence||!canPresent(frame))throw new DOMException('Superseded','AbortError');
  var svg=parts[0].cloneNode(true);svg.prepend(parts[1].cloneNode(true));svg.setAttribute('preserveAspectRatio','none');
  var next=L.svgOverlay(svg,frame.snapshot.vectorMap.bounds,{opacity:0,interactive:false}).addTo(map);sizeArrows(next);adaptiveArrows(next,parts[2],quantity);
  await new Promise(function(resolve){requestAnimationFrame(resolve);});
  return {discard:function(){if(next!==vectorLayer)next.remove();},commit:function(){
   if(token!==sequence||!canPresent(frame)){next.remove();return false;}
   var previous=vectorLayer;vectorLayer=next;arrowState=parts[2]?{data:parts[2],quantity:quantity}:null;
   next.setOpacity(.72);legend(quantity);if(previous)previous.remove();layer.remove();current=null;
   message(['Wind · m/s','Waves · m','Swell · m'][quantity]+' · '+fmtLocal(new Date(step.time))+' · hold at sea for details');prefetchNearby(frame);return true;
  }};
 }
 async function refreshLive(force){
  if(!map||!active||!liveMode)return;var request=++liveRequest;message('Loading live stations…');
  try{
   var data=await ForecastLive.snapshot(force);if(request!==liveRequest||!active||!liveMode)return;
   var stations=ForecastLiveData.stations(data);liveMarkers.addTo(map);ForecastLive.drawMarkers(stations,liveMarkers,function(station,measurement){
    var url=new URL(location.href);url.searchParams.set('liveTab','station');url.searchParams.set('station',station.id);url.searchParams.set('liveLayer',measurement==='wave'?'waves':measurement);history.replaceState(history.state,'',url);window.dispatchEvent(new CustomEvent('forecast-open-live',{detail:{station:true}}));
   });
   message(stations.length?'Live · '+stations.length+' stations · ↑ wind (m/s) · ≋ waves (m) · ↕ level (cm) · tap a station':'Live observations are out of date or unavailable');
  }catch(error){if(request===liveRequest){liveMarkers.clearLayers();message('Live stations unavailable. Try Refresh stations.');}}
 }
 var refreshButton=document.createElement('button');refreshButton.id='forecast-map-refresh';refreshButton.type='button';refreshButton.textContent='Refresh stations';refreshButton.hidden=true;document.querySelector('footer').appendChild(refreshButton);refreshButton.addEventListener('click',function(){refreshLive(true);});
 setInterval(function(){if(!document.hidden)refreshLive(false);},600000);
 document.addEventListener('visibilitychange',function(){if(!document.hidden)refreshLive(false);});
 async function sync(){
  if(!active||!map||liveMode||!displayedFrame||pendingFrame)return;
  var frame=displayedFrame,kind=['win','hs','hsw'][selected],vectors=frame.snapshot.vectorMap&&frame.snapshot.frames[frame.index-1].vectors,url=frame.snapshot.imageBase+(vectors?vectors[kind]:frame.snapshot.frames[frame.index-1].files[kind]);
  if(requested===url)return;
  if(vectors){
   if(vectorLayer&&vectorLayer.getElement().dataset.identity===frame.snapshot.forecastIdentity&&vectorLayer.getElement().dataset.time===frame.snapshot.frames[frame.index-1].time&&vectorLayer.getElement().dataset.kind===kind){sequence++;requested=url;message(['Wind · m/s','Waves · m','Swell · m'][selected]+' · '+fmtLocal(new Date(frame.snapshot.frames[frame.index-1].time))+' · hold at sea for details');return;}
   try{var prepared=await prepareFrame(frame);prepared.commit();}catch(error){if(error.name!=='AbortError')message('Forecast layer unavailable. Current layer kept; tap a quantity to retry.');}return;
  }
  requested=url;var token=++sequence;
  try{var values=await Promise.all([source(url),index(frame.snapshot)]);if(token!==sequence||!active||liveMode)return;if(vectorLayer){vectorLayer.remove();vectorLayer=null;}current={source:values[0],transform:values[1]};if(!map.hasLayer(layer))layer.addTo(map);layer.redraw();layer.setOpacity(.72);message(['Wind · m/s','Waves · m','Swell · m'][selected]+' · '+fmtLocal(new Date(frame.snapshot.frames[frame.index-1].time))+' · hold at sea for details');}catch(error){if(token===sequence)message('Forecast layer unavailable. Current layer kept; tap a quantity to retry.');}
 }
 async function activate(){
  if(loading)return;loading=true;active=true;prefetchState=null;document.body.classList.add('forecast-map-mode');key();
  try{await ensureMap();map.invalidateSize({pan:false});requested=null;if(liveMode)refreshLive(false);else if(forecast&&forecast.vectorMap){pendingFrame=null;show(idx);}else sync();save();}
  catch(error){active=false;document.body.classList.remove('forecast-map-mode');document.getElementById('status').textContent='Interactive map unavailable. Images remain available.';}
  finally{loading=false;}
 }
 launch.addEventListener('click',activate);
 document.getElementById('forecast-map-images').addEventListener('click',async function(){
  var token=++sequence;pendingFrame=null;liveRequest++;clearTimeout(prefetchTimer);prefetchEpoch++;
  if(forecast){var ok=await show(idx,true);if(token!==sequence)return;if(!ok){message('Images unavailable. Current map kept.');return;}}
  active=false;refreshButton.hidden=true;document.getElementById('bar').inert=false;document.getElementById('bar').removeAttribute('aria-hidden');document.body.classList.remove('forecast-map-mode','forecast-map-live-mode');save();if(forecast)prefetch(forecast);
 });

 document.getElementById('forecast-map-details').addEventListener('click',function(){document.getElementById('point-return').click();});
 document.getElementById('forecast-map-quantities').addEventListener('click',function(e){var b=e.target.closest('[data-quantity]');if(!b)return;liveMode=b.dataset.quantity==='live';if(!liveMode)selected=Number(b.dataset.quantity);sequence++;liveRequest++;pendingFrame=null;clearTimeout(prefetchTimer);prefetchEpoch++;if(liveMode){layer.setOpacity(0);if(vectorLayer)vectorLayer.setOpacity(0);}if(liveMarkers)liveMarkers.remove();key();save();requested=null;if(liveMode)refreshLive(false);else{if(vectorLayer)vectorLayer.setOpacity(.72);if(forecast&&forecast.vectorMap)show(idx);else sync();}});
 var previousReturn=document.getElementById('point-return');new MutationObserver(function(){document.getElementById('forecast-map-details').hidden=previousReturn.hidden||liveMode;}).observe(previousReturn,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(sync).observe(document.querySelector('main'),{childList:true,subtree:true});
 window.ForecastMap={active:function(){return active;},canPresent:canPresent,prepareFrame:prepareFrame,finishScrub:function(){if(debounceFrame)debounceFrame();},failed:function(){if(active&&!liveMode)message('Update unavailable · current forecast kept. Try again.');},view:function(){if(!map)return null;var c=map.getCenter();return {lat:c.lat,lon:c.lng,zoom:map.getZoom()};},sync:sync,showLive:function(){document.querySelector('#forecast-map-quantities [data-quantity=live]').click();}};
 if(q.get('mapDisplay')==='interactive')activate();
})();
