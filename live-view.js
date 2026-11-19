/* Mobile station map and observation tables, using only documented open feeds. */
(function(){
    'use strict';
    var css=document.createElement('style');
    css.textContent=`
      body.live-page > main { visibility:hidden; }
      body.live-page #point-return, body.live-page #point-preview-hint, body.live-page #live-open, body.point-detail-page #live-open { display:none; }
      #live-open { position:fixed; top:8px; left:8px; z-index:10; min-height:44px; padding:0 12px; border:1px solid #626e79; border-radius:9px; background:#20262e; color:#eee; font:inherit; }
      #live-sheet { position:fixed; inset:auto; margin:0; width:100%; max-width:none; height:100dvh; max-height:none; box-sizing:border-box;
        color:#eee; background:#1d2024; border:0; padding:12px; padding-top:calc(12px + env(safe-area-inset-top,0px));
        padding-bottom:calc(12px + env(safe-area-inset-bottom,0px)); display:flex; flex-direction:column; gap:8px; overflow:hidden; }
      #live-sheet:not([open]) { display:none; }
      #live-sheet::backdrop { background:#1d2024; }
      #live-sheet header { display:flex; align-items:center; gap:10px; flex:none; }
      #live-sheet h2 { font-size:17px; margin:0; flex:1; }
      #live-sheet button { color:#eee; background:#2b3036; border:1px solid #484d52; border-radius:9px; min-height:44px; padding:0 10px; font:inherit; font-size:13px; }
      #live-sheet button[aria-pressed=true] { background:#36536b; border-color:#89b8dd; }
      #live-sheet button:disabled { opacity:.4; }
      #live-tabs, #live-layers { display:flex; gap:6px; flex:none; }
      #live-tabs button, #live-layers button { flex:1; }
      #live-status { flex:none; color:#abb2ba; font-size:11px; margin:0; overflow-wrap:anywhere; max-height:70px; overflow:auto; }
      #live-map { flex:1; min-height:100px; border-radius:8px; background:#c8dde4; }
      #live-map .leaflet-control-zoom a { width:40px; height:40px; line-height:40px; }
      #live-map .leaflet-control-attribution { font-size:10px; }
      #live-list, #live-station { flex:1; min-height:0; overflow:auto; border:1px solid #353b42; border-radius:8px; }
      #live-sheet table { width:100%; border-spacing:0; font-size:12px; font-variant-numeric:tabular-nums; }
      #live-sheet th,#live-sheet td { text-align:left; padding:8px; border-bottom:1px solid #353b42; }
      #live-sheet thead th { position:sticky; top:0; background:#252d36; z-index:1; }
      #live-sheet td small { display:block; font-size:10px; color:#abb2ba; }
      #live-sheet .live-station-button { text-align:left; padding:4px; border:0; background:transparent; width:100%; }
      #live-station-name { font-size:16px; margin:12px 10px 4px; }
      #live-station-note { color:#abb2ba; font-size:11px; margin:0 10px 12px; }
      #live-footer { flex:none; display:flex; gap:12px; align-items:center; justify-content:space-between; color:#abb2ba; font-size:11px; }
      #live-footer a { color:#89b8dd; }
      #live-sheet [hidden] { display:none !important; }
      .live-icon { background:none; border:0; }
      .live-marker { display:flex; flex-direction:column; align-items:center; width:38px; color:#111; text-shadow:0 1px 2px white; font:600 11px system-ui; }
      .live-marker-symbol { display:flex; align-items:center; justify-content:center; width:25px; height:25px; border:2px solid #fff; border-radius:50%; box-shadow:0 0 0 1px #27343f; }
      .live-marker-arrow { display:block; width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-bottom:13px solid white; filter:drop-shadow(0 0 1px #000); }
      .live-marker-label { padding:0 3px; border-radius:3px; background:#ffffffe6; margin-top:1px; }
    `;
    document.head.appendChild(css);
    var launch=document.createElement('button');launch.id='live-open';launch.type='button';launch.textContent='Live';
    launch.disabled=true;
    launch.setAttribute('aria-label','Open live station observations');document.body.appendChild(launch);
    launch.addEventListener('click',function(){window.dispatchEvent(new Event('forecast-open-live'));});
    var sheet=document.createElement('dialog');sheet.id='live-sheet';sheet.setAttribute('aria-labelledby','live-title');
    sheet.innerHTML=`<header><button id="live-close" type="button">← Maps</button><h2 id="live-title">Live observations</h2><button id="live-forecast" type="button">Forecast →</button></header>
      <div id="live-tabs" aria-label="Observation view"><button data-tab="map" type="button">Map</button><button data-tab="nearby" type="button">Nearby</button><button data-tab="station" type="button">Station</button></div>
      <div id="live-layers" aria-label="Observation parameter"><button data-layer="wind" type="button">Wind</button><button data-layer="waves" type="button">Waves</button><button data-layer="level" type="button">Water level</button></div>
      <p id="live-status" role="status">Loading station observations…</p>
      <div id="live-map" role="region" aria-label="Observed weather station map"></div>
      <div id="live-list" hidden><table><thead><tr><th>Station</th><th>Observed</th><th>Time</th></tr></thead><tbody></tbody></table></div>
      <div id="live-station" hidden><h3 id="live-station-name"></h3><p id="live-station-note"></p><table><thead><tr><th>Measurement</th><th>Observed</th><th>Time</th></tr></thead><tbody></tbody></table></div>
      <div id="live-footer"><span><a href="https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning" target="_blank" rel="noopener">SMHI · CC BY 4.0</a></span><button id="live-copy" type="button">Copy link</button><button id="live-refresh" type="button">Refresh</button></div>`;
    document.body.appendChild(sheet);
    var byId=function(id){return document.getElementById(id);},options={},map=null,markers=null,tileLayer=null,library=null,mapPreparing=null,mapNeedsCenter=true;
    var all=[],data=null,checked=0,loading=null,selected=null,wantedStation=null,layer='wind',tab='map',anchor={lat:60.5,lon:18},requestId=0;
    var vv=window.visualViewport;
    function place(){
        var scale=vv?vv.scale:1,top=vv?vv.offsetTop:0,left=vv?vv.offsetLeft:0,width=vv?vv.width:innerWidth,height=vv?vv.height:innerHeight;
        if(!sheet.open){
            var safe=parseFloat(getComputedStyle(sheet).paddingTop)-12;
            launch.style.transformOrigin='top left';launch.style.transform='scale('+(1/scale)+')';
            launch.style.left=(left+8/scale)+'px';launch.style.top=(top+(8+safe)/scale)+'px';return;
        }
        sheet.style.transformOrigin='top left';sheet.style.transform='scale('+(1/scale)+')';
        sheet.style.left=left+'px';sheet.style.top=top+'px';sheet.style.width=(width*scale)+'px';sheet.style.height=(height*scale)+'px';
        if(map)map.invalidateSize({pan:false});
    }
    if(vv){vv.addEventListener('resize',place);vv.addEventListener('scroll',place);}window.addEventListener('resize',place);
    function time(stamp){return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(stamp));}
    function fullTime(stamp){return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false,timeZoneName:'short'}).format(new Date(stamp));}
    function save(){
        if(!sheet.open)return;
        var url=new URL(location.href),q=url.searchParams;q.set('view','live');q.set('detail','1');q.set('time','now');q.delete('row');
        q.set('liveLayer',layer);q.set('liveTab',tab);q.set('forecastView',options.forecastView||'graph');
        if(selected||wantedStation)q.set('station',selected?selected.id:wantedStation);else q.delete('station');
        var hash=new URLSearchParams(url.hash.slice(1));hash.delete('time');url.hash=hash.toString();
        history.replaceState(history.state,'',url.href);
    }
    function field(){return layer==='waves'?'wave':layer;}
    function layerSummary(){
        var count=all.filter(function(s){return s.readings[field()];}).length;
        return count+(layer==='waves'?' buoys · metres':layer==='level'?' stations · cm relative to local mean':' stations · m/s · wind generally hourly');
    }
    function chooseStation(s){selected=s;tab='station';render();save();}
    function cells(row,values){values.forEach(function(value){var c=document.createElement('td');c.textContent=value;row.appendChild(c);});}
    function renderTables(){
        var body=byId('live-list').querySelector('tbody');body.replaceChildren();
        ForecastLiveData.nearby(all,anchor,layer).slice(0,25).forEach(function(item){
            var s=item.station,r=s.readings[field()],row=document.createElement('tr'),name=document.createElement('td'),button=document.createElement('button');
            button.type='button';button.className='live-station-button';button.textContent=s.name;
            var km=document.createElement('small');km.textContent=Math.round(item.distanceKm)+' km from '+(options.point?'selected point':'map centre');button.appendChild(km);
            button.addEventListener('click',function(){chooseStation(s);});name.appendChild(button);row.appendChild(name);
            cells(row,[ForecastLiveData.format(field(),r.value),time(r.time)]);row.lastChild.title=fullTime(r.time);body.appendChild(row);
        });
        var selectedBody=byId('live-station').querySelector('tbody');selectedBody.replaceChildren();
        byId('live-station-name').textContent=selected?selected.name:'Select a station on the map';
        byId('live-station-note').textContent=selected?selected.owner+' · '+Math.round(ForecastLiveData.distance(anchor,selected))+' km from '+(options.point?'selected point':'map centre')+' · measured observations':'';
        var labels={wind:'Mean wind (10 min)',gust:'Wind gust',windDirection:'Wind direction (from)',wave:'Significant wave height',waveDirection:'Mean wave direction',level:'Water level (local mean)'};
        if(selected)Object.keys(labels).forEach(function(key){
            var r=selected.readings[key];if(!r)return;
            var row=document.createElement('tr');cells(row,[labels[key],ForecastLiveData.format(key,r.value),fullTime(r.time)]);
            if(r.provisional){var note=document.createElement('small');note.textContent='Provisional';row.lastChild.appendChild(note);}selectedBody.appendChild(row);
        });
    }
    function renderMarkers(){
        if(!map||!markers)return;markers.clearLayers();
        all.filter(function(s){return s.readings[field()];}).forEach(function(s){
            var r=s.readings[field()],color=layer==='level'?'#8bbcc9':ForecastColors.color(layer==='wind'?0:1,r.value),arrow='';
            var direction=s.readings.windDirection;
            if(layer==='wind'&&direction&&Math.abs(direction.time-r.time)<=600000)
                arrow='<span class="live-marker-arrow" style="transform:rotate('+(direction.value+180)+'deg)"></span>';
            var label=layer==='level'?ForecastWater.format(r.value):r.value.toFixed(1);
            var icon=L.divIcon({className:'live-icon',iconSize:[38,44],iconAnchor:[19,14],html:'<span class="live-marker"><span class="live-marker-symbol" style="background:'+color+'">'+arrow+'</span><span class="live-marker-label">'+label+'</span></span>'});
            var marker=L.marker([s.lat,s.lon],{icon:icon,title:s.name,keyboard:true}).addTo(markers);
            marker.on('click',function(){chooseStation(s);});
            var el=marker.getElement();if(el)el.setAttribute('aria-label',s.name+' · '+ForecastLiveData.format(field(),r.value)+' · '+fullTime(r.time));
        });
    }
    function render(){
        byId('live-map').hidden=tab!=='map';byId('live-list').hidden=tab!=='nearby';byId('live-station').hidden=tab!=='station';
        byId('live-tabs').querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.tab===tab));b.disabled=b.dataset.tab==='station'&&!selected;});
        byId('live-layers').querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.layer===layer));});
        byId('live-forecast').hidden=!options.canForecast;
        renderTables();renderMarkers();place();
        if(tab==='map')prepareMap();
    }
    function mapLibrary(){
        if(window.L)return Promise.resolve();if(library)return library;
        library=Promise.all([new Promise(function(resolve,reject){
            var link=document.createElement('link');link.rel='stylesheet';link.href='vendor/leaflet/leaflet.css';link.onload=resolve;link.onerror=reject;document.head.appendChild(link);
        }),new Promise(function(resolve,reject){
            var script=document.createElement('script');script.src='vendor/leaflet/leaflet.js';script.onload=resolve;script.onerror=reject;document.head.appendChild(script);
        })]);return library;
    }
    async function ensureMap(){
        await mapLibrary();if(!sheet.open)return;
        if(!map){
            map=L.map(byId('live-map'),{zoomControl:true,attributionControl:true,minZoom:4,maxZoom:15});
            tileLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
            markers=L.layerGroup().addTo(map);
            map.on('moveend',function(){if(!options.point){var c=map.getCenter();anchor={lat:c.lat,lon:c.lng};renderTables();}});
        }
        if(mapNeedsCenter){map.setView([anchor.lat,anchor.lon],options.point?7:5,{animate:false});mapNeedsCenter=false;}
        renderMarkers();place();
    }
    function prepareMap(){
        if(mapPreparing)return;
        mapPreparing=ensureMap().catch(function(){byId('live-status').textContent='Map could not load. Nearby station tables remain available.';})
            .finally(function(){mapPreparing=null;});
    }
    async function refresh(force){
        var id=++requestId;
        byId('live-status').textContent='Loading station observations…';
        try{
            if(force||!data||Date.now()-checked>600000){
                if(!loading)loading=(async function(){
                    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},15000);
                    try{var response=await fetch('https://raw.githubusercontent.com/ErikWahlstrom/dmi-vind-waves/live-data/live-observations.json?slot='+Math.floor(Date.now()/1200000),{signal:controller.signal});
                        if(!response.ok)throw Error('Station observations unavailable');return await response.json();
                    }finally{clearTimeout(timer);loading=null;}
                })();
                data=await loading;checked=Date.now();
            }
            if(id!==requestId||!sheet.open)return;
            all=ForecastLiveData.stations(data);
            var stationId=selected?selected.id:wantedStation;
            selected=stationId?all.find(function(s){return s.id===stationId;})||null:null;
            if(wantedStation&&selected&&!options.point)anchor={lat:selected.lat,lon:selected.lon};wantedStation=null;
            if(!selected&&tab==='station')tab='map';
            byId('live-status').textContent=all.length?layerSummary():'Station observations are out of date or unavailable';
            render();
        }catch(error){
            if(id!==requestId||!sheet.open)return;
            all=[];selected=null;if(tab==='station')tab='map';render();byId('live-status').textContent='Station observations temporarily unavailable. Try Refresh.';
        }
    }
    function close(target){
        if(!sheet.open)return;sheet.close();document.body.classList.remove('live-page');place();
        if(options[target])options[target]();
    }
    byId('live-close').addEventListener('click',function(){close('onMaps');});
    byId('live-forecast').addEventListener('click',function(){close('onForecast');});
    sheet.addEventListener('cancel',function(e){e.preventDefault();close('onMaps');});
    sheet.addEventListener('keydown',function(e){e.stopPropagation();});
    byId('live-refresh').addEventListener('click',function(){refresh(true);});
    byId('live-copy').addEventListener('click',async function(){save();try{await navigator.clipboard.writeText(location.href);byId('live-status').textContent='Live-view link copied.';}catch(_){byId('live-status').textContent=location.href;}});
    byId('live-tabs').addEventListener('click',function(e){var b=e.target.closest('[data-tab]');if(!b)return;tab=b.dataset.tab;render();save();});
    byId('live-layers').addEventListener('click',function(e){var b=e.target.closest('[data-layer]');if(!b)return;layer=b.dataset.layer;if(tab==='station')tab='map';render();save();
        byId('live-status').textContent=layerSummary();});
    document.addEventListener('visibilitychange',function(){if(!document.hidden&&sheet.open)refresh(false);});
    setInterval(function(){if(!document.hidden&&sheet.open)refresh(false);},600000);
    window.ForecastLive={open:async function(opts){
        options=opts;anchor=opts.point||{lat:60.5,lon:18};mapNeedsCenter=true;var q=new URLSearchParams(location.search);
        layer=['wind','waves','level'].includes(q.get('liveLayer'))?q.get('liveLayer'):'wind';
        tab=['map','nearby','station'].includes(q.get('liveTab'))?q.get('liveTab'):'map';
        var stationId=q.get('station');wantedStation=/^(met|sea)-\d+$/.test(stationId||'')?stationId:null;
        selected=wantedStation?all.find(function(s){return s.id===wantedStation;})||null:null;
        if(!sheet.open)sheet.showModal();document.body.classList.add('live-page');place();render();save();
        await refresh(false);save();
    },isOpen:function(){return sheet.open;}};
    place();
})();
