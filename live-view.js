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
      #live-history-title { font-size:15px; margin:20px 10px 4px; }
      #live-history-note { font-size:11px; color:#abb2ba; margin:0 10px 10px; }
      #live-history-scroll { overflow:visible; }
      #live-history { table-layout:fixed; }
      #live-sheet #live-history thead th { font-size:10px; overflow-wrap:anywhere; top:44px; }
      #live-history td { font-size:12px; }
      #live-history tr[data-kind=forecast] { background:#24323d; }
      #live-history .live-timeline-divider th { position:static; padding:10px 5px; font-size:11px; text-align:left; background:#324451; }
      #live-timeline-nav { display:flex; gap:5px; position:sticky; top:0; z-index:3; background:#1d2024; }
      #live-timeline-nav button { flex:1; font-size:12px; padding:0 5px; }
      .live-timeline-direction { display:inline-block; margin-left:2px; font-size:13px; }
      .live-timeline-dot { display:block; width:4px; height:4px; border-radius:50%; margin:auto; box-shadow:0 0 0 1px #dfe7ef66; }
      #live-history th,#live-history td { padding:8px 5px; }
      #live-history td:not(:first-child) { text-align:right; font-variant-numeric:tabular-nums; }
      #live-history td small { font-size:9px; }
      #live-history .live-hour-missing { color:#78818a; }
      #live-station-note { color:#abb2ba; font-size:11px; margin:0 10px 12px; }
      #live-footer { flex:none; display:flex; gap:12px; align-items:center; justify-content:space-between; color:#abb2ba; font-size:11px; }
      #live-footer a { color:#89b8dd; }
      #live-sheet [hidden] { display:none !important; }
      .live-icon { background:none; border:0; }
      .live-station-pin { position:absolute; width:5px; height:5px; left:0; top:0; background:#21323d; border:1px solid white; border-radius:50%; box-shadow:0 0 0 1px #21323d88; }
      .live-station-readings { position:absolute; top:-12px; left:8px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); width:max-content;
        background:#fff; border:1px solid #596873; border-radius:6px; box-shadow:0 1px 3px #0004; overflow:visible; }
      .live-station-readings[data-count="1"] { grid-template-columns:1fr; }
      .live-station-readings::before { content:""; position:absolute; height:1px; width:5px; background:#596873; left:-5px; top:15px; }
      .live-station-readings[data-side="left"]::before { left:auto; right:-5px; }
      .live-station-reading, #live-sheet .live-station-reading, #forecast-map .live-station-reading { display:flex; align-items:center; justify-content:flex-start; gap:2px; box-sizing:border-box; min-width:46px; min-height:30px;
        margin:0; padding:2px 3px; border:0; border-radius:0; background:transparent; color:#14202a; cursor:pointer; font:600 11px/1.1 system-ui; font-variant-numeric:tabular-nums; white-space:nowrap; text-shadow:none; }
      .live-station-reading + .live-station-reading { box-shadow:inset 1px 0 #82909a33; }
      .live-station-reading:hover, .live-station-reading:focus-visible, #forecast-map .live-station-reading:hover, #forecast-map .live-station-reading:focus-visible { background:#e2edf3; outline:2px solid #36536b; outline-offset:-2px; }
      .live-marker-symbol { display:flex; align-items:center; justify-content:center; width:14px; height:14px; flex:none; border-radius:50%; font-size:15px; color:#14202a; }
      .live-marker-waves { border-radius:4px; }
      .live-marker-level { border-radius:3px; }
      #live-key { margin:0; font-size:11px; color:#abb2ba; }
      .live-marker-arrow { display:block; width:0; height:0; border-left:3px solid transparent; border-right:3px solid transparent; border-bottom:9px solid white; filter:drop-shadow(0 0 1px #000); }

    `;
    document.head.appendChild(css);
    var launch=document.createElement('button');launch.id='live-open';launch.type='button';launch.textContent='Live';
    launch.disabled=true;
    launch.setAttribute('aria-label','Open live station observations');document.body.appendChild(launch);
    launch.addEventListener('click',function(){window.dispatchEvent(new Event('forecast-open-live'));});
    var sheet=document.createElement('dialog');sheet.id='live-sheet';sheet.setAttribute('aria-labelledby','live-title');
    sheet.innerHTML=`<header><button id="live-close" type="button">← Maps</button><h2 id="live-title">Live observations</h2><button id="live-forecast" type="button">Forecast →</button></header>
      <div id="live-tabs" aria-label="Observation view"><button data-tab="map" type="button">Map</button><button data-tab="nearby" type="button">Nearby</button><button data-tab="station" type="button">Station</button></div>
      <div id="live-layers" aria-label="Observation parameter"><button data-layer="wind" type="button">Wind</button><button data-layer="waves" type="button">Waves</button><button data-layer="level" type="button">Water level</button><button data-layer="temperature" type="button">Water °C</button></div>
      <p id="live-key">↑ Wind (m/s) · ≋ Waves (m) · ↕ Water level (cm) · ° Water °C</p>
      <p id="live-status" role="status">Loading station observations…</p>
      <div id="live-map" role="region" aria-label="Observed weather station map"></div>
      <div id="live-list" hidden><table><thead><tr><th>Station</th><th>Observed</th><th>Time</th></tr></thead><tbody></tbody></table></div>
      <div id="live-station" hidden><h3 id="live-station-name"></h3><p id="live-station-note"></p><table id="live-current"><thead><tr><th>Measurement</th><th>Observed</th><th>Time</th></tr></thead><tbody></tbody></table><h3 id="live-history-title">Hourly timeline</h3><p id="live-history-note" role="status"></p><div id="live-timeline-nav" aria-label="Station timeline navigation"><button id="live-timeline-future" type="button">Future ↓</button><button id="live-timeline-now" type="button">Latest</button><button id="live-timeline-details" type="button">Details</button></div><div id="live-history-scroll"><table id="live-history" aria-label="Measured history and forecast hours"><thead></thead><tbody></tbody></table></div></div>
      <div id="live-footer"><span><a href="https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning" target="_blank" rel="noopener">SMHI · CC BY 4.0</a> · <a href="https://viva.sjofartsverket.se/om-viva" target="_blank" rel="noopener">Sjöfartsverket ViVa</a> · <a href="https://en.ilmatieteenlaitos.fi/open-data-licence" target="_blank" rel="noopener">FMI · CC BY 4.0</a><br><button class="app-reload" type="button" title="Reload the app and fetch fresh styles and scripts">Reload app</button></span><button id="live-copy" type="button">Copy link</button><button id="live-refresh" type="button">Refresh</button></div>`;
    document.body.appendChild(sheet);
    var byId=function(id){return document.getElementById(id);},options={},map=null,markers=null,tileLayer=null,library=null,mapPreparing=null,mapNeedsCenter=true;
    var all=[],data=null,checked=0,loading=null,selected=null,wantedStation=null,layer='wind',tab='map',anchor={lat:60.5,lon:18},requestId=0;
    var historyStation=null,historyController=null,historySequence=0,historyStarted=0,timelineStatus='';
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
    function fullTime(stamp){return new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false,timeZoneName:'short'}).format(new Date(stamp));}
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
        if(tab==='station')return timelineStatus||'Loading station timeline…';
        var count=all.filter(function(s){return s.readings[field()];}).length;
        if(tab==='map')return ['wind','wave','level','temperature'].map(function(key){return all.filter(function(s){return s.readings[key];}).length+' '+({wind:'wind stations',wave:'buoys',level:'water gauges',temperature:'temperature stations'}[key]);}).join(' · ');
        if(layer==='temperature')return count+' stations · water temperature °C';
        return count+(layer==='waves'?' buoys · metres':layer==='level'?' stations · cm relative to local mean':' stations · m/s · wind generally hourly');
    }
    function chooseStation(s){selected=s;tab='station';render();save();byId('live-status').textContent=layerSummary();}
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
        var selectedBody=byId('live-current').querySelector('tbody');selectedBody.replaceChildren();
        byId('live-station-name').textContent=selected?selected.name:'Select a station on the map';
        byId('live-station-note').textContent=selected?selected.owner+(selected.vivaId&&!selected.id.startsWith('viva-')?' · ViVa':'')+' · '+Math.round(ForecastLiveData.distance(anchor,selected))+' km from '+(options.point?'selected point':'map centre')+' · measured observations':'';
        var labels={wind:'Mean wind (10 min)',gust:'Wind gust',windDirection:'Wind direction (from)',wave:'Significant wave height',waveDirection:'Mean wave direction',level:'Water level (local mean)',temperature:'Water temperature (surface)'};
        if(selected)Object.keys(labels).forEach(function(key){
            var r=selected.readings[key];if(!r)return;
            var row=document.createElement('tr');cells(row,[key==='temperature'&&r.depth!==0?'Water temperature':key==='waveDirection'&&r.source==='fmi'?'Peak wave direction (from)':labels[key],ForecastLiveData.format(key,r.value),fullTime(r.time)+(r.source==='fmi'?' · FMI':r.source==='viva'?' · ViVa':'')]);
            if(r.provisional){var note=document.createElement('small');note.textContent='Provisional';row.lastChild.appendChild(note);}selectedBody.appendChild(row);
        });
    }
    function cancelHistory(){
        historySequence++;if(historyController)historyController.abort();historyController=null;historyStation=null;
    }
    function scrollToPresent(){
        var target=byId('live-history').querySelector('[data-present]');if(!target)return;
        var panel=byId('live-station'),head=byId('live-history').querySelector('thead');
        panel.scrollTop+=target.getBoundingClientRect().top-panel.getBoundingClientRect().top-44-head.getBoundingClientRect().height;
    }
    byId('live-timeline-future').addEventListener('click',function(){byId('live-station').scrollBy({top:byId('live-station').clientHeight*.75,behavior:'smooth'});});
    byId('live-timeline-now').addEventListener('click',scrollToPresent);
    byId('live-timeline-details').addEventListener('click',function(){byId('live-station').scrollTop=0;});
    async function loadHistory(force){
        if(tab!=='station'||!selected||!sheet.open){cancelHistory();return;}
        var station=selected,quantity=field();
        if(!station.readings[quantity])quantity=['wind','wave','level','temperature'].find(function(key){return station.readings[key];});
        var identity=station.id+'/'+quantity;
        if(!force&&historyStation===identity&&Date.now()-historyStarted<600000)return;
        timelineStatus='';cancelHistory();historyStation=identity;historyStarted=Date.now();var sequence=historySequence;
        var controller=new AbortController();historyController=controller;
        var table=byId('live-history'),head=table.querySelector('thead'),body=table.querySelector('tbody'),note=byId('live-history-note');
        head.replaceChildren();body.replaceChildren();note.textContent='Loading observations and forecast…';
        var results=await Promise.allSettled([
            ForecastLiveHistory.load(station,{signal:controller.signal,force:!!force}),
            options.getForecast?options.getForecast(station,controller.signal):Promise.resolve({rows:[],notes:['Forecast unavailable.']})
        ]);
        if(sequence!==historySequence||!sheet.open)return;
        var history=results[0].status==='fulfilled'?results[0].value:{rows:[],unavailable:['history']};
        var forecast=results[1].status==='fulfilled'?results[1].value:{rows:[],notes:['Forecast unavailable. Try Refresh.']};
        var rows=ForecastLiveTimeline.combine(history.rows,forecast.rows,quantity,Date.now());
        var names={wind:'wind',wave:'waves',level:'water level',temperature:'water temperature'};
        byId('live-timeline-future').disabled=!rows.some(function(row){return row.kind==='forecast';});
        byId('live-timeline-now').disabled=!rows.length;
        timelineStatus=(rows.some(function(row){return row.kind==='forecast';})?'↓ Forecast':'Forecast unavailable')+' · ↑ Measured '+names[quantity]+(forecast.summary&&forecast.summary.length?' · '+forecast.summary.join(' · '):'');
        byId('live-status').textContent=timelineStatus;
        note.textContent='↑ Past · ↓ Future · measured '+names[quantity]+' only · arrows show travel · — unavailable. '+forecast.notes.join(' ')+
            (!history.rows.length?' Hourly observations unavailable; current readings remain in Details.':'');
        var header=document.createElement('tr');var quantities=['wind','wave','swell','level'].concat(station.readings.temperature?['temperature']:[]);
        ['Hour','Wind m/s','Waves m','Swell m','Level cm'].concat(station.readings.temperature?['Water °C']:[]).forEach(function(label){var th=document.createElement('th');th.scope='col';th.textContent=label;header.appendChild(th);});head.appendChild(header);
        if(!rows.length){note.textContent+=' No hourly data available. Try Refresh.';return;}
        var forecastStarted=false;
        rows.forEach(function(item,i){
            if(item.kind==='forecast'&&!forecastStarted){
                forecastStarted=true;var divider=document.createElement('tr'),label=document.createElement('th');
                divider.className='live-timeline-divider';label.colSpan=quantities.length+1;
                label.textContent='Forecast · future ↓';divider.appendChild(label);body.appendChild(divider);
            }
            var row=document.createElement('tr'),cell=document.createElement('td');row.dataset.kind=item.kind;row.dataset.time=item.time;
            if((item.kind==='observed'&&(!rows[i+1]||rows[i+1].kind==='forecast'))||(!history.rows.length&&i===0))row.dataset.present='true';
            cell.textContent=time(item.time);
            var day=document.createElement('small');day.textContent=new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short'}).format(new Date(item.time));cell.appendChild(day);
            var kind=document.createElement('small');kind.textContent=item.kind==='forecast'?'Forecast':'Measured';cell.appendChild(kind);cell.title=fullTime(item.time);row.appendChild(cell);
            quantities.forEach(function(key,index){
                var r=item.readings[key],td=document.createElement('td');td.dataset.quantity=key;
                td.textContent=r?(key==='level'?(item.kind==='forecast'?'≈':'')+ForecastWater.format(r.value):r.value.toFixed(1)):'—';
                if(r&&key!=='level'&&key!=='temperature'){
                    var direction=document.createElement('span'),dot=document.createElement('span');direction.className='live-timeline-direction';
                    direction.textContent=Number.isFinite(r.direction)?['↓','↙','←','↖','↑','↗','→','↘'][Math.round(r.direction/45)%8]:'';
                    if(Number.isFinite(r.direction))direction.title='From '+Math.round(r.direction)+'°';
                    dot.className='live-timeline-dot';dot.style.background=ForecastColors.color(index,r.value);direction.appendChild(dot);td.appendChild(direction);
                }
                if(r&&r.time!==item.time){var measured=document.createElement('small');measured.textContent=time(r.time);td.appendChild(measured);}
                if(r){td.title=(item.kind==='forecast'?'Forecast':'Measured')+' '+fullTime(r.time)+(r.provisional?' · provisional':'');
                    if(r.provisional){var small=document.createElement('small');small.textContent='Prov.';small.title='Provisional observation';td.appendChild(small);}}
                else td.className='live-hour-missing';row.appendChild(td);
            });body.appendChild(row);
        });
        requestAnimationFrame(function(){if(sequence===historySequence&&sheet.open)scrollToPresent();});
    }
    function drawMarkers(stations,group,onSelect){
        group.clearLayers();var positions={};
        stations.forEach(function(s){
            var keys=['wind','wave','level','temperature'].filter(function(key){return s.readings[key];});
            if(!keys.length)return;
            var html=keys.map(function(key){
                var r=s.readings[key],color=key==='temperature'?'#e5a76b':key==='level'?'#8bbcc9':ForecastColors.color(key==='wind'?0:1,r.value);
                var symbol=key==='temperature'?'°':key==='wave'?'≋':key==='level'?'↕':'↑',direction=s.readings.windDirection;
                if(key==='wind'&&direction&&Math.abs(direction.time-r.time)<=600000)
                    symbol='<span class="live-marker-arrow" style="transform:rotate('+(direction.value+180)+'deg)"></span>';
                var label=key==='level'?ForecastWater.format(r.value):r.value.toFixed(1)+(key==='temperature'?'°':'');
                return '<button type="button" class="live-station-reading" data-measurement="'+key+'"><span aria-hidden="true" class="live-marker-symbol live-marker-'+(key==='wave'?'waves':key)+'" style="background:'+color+'">'+symbol+'</span><span class="live-marker-label">'+label+'</span></button>';
            }).join('');
            var icon=L.divIcon({className:'live-icon',iconSize:[7,7],iconAnchor:[3,3],html:'<span class="live-station-pin" aria-hidden="true"></span><span class="live-station-readings" data-count="'+keys.length+'">'+html+'</span>'});
            var marker=L.marker([s.lat,s.lon],{icon:icon,title:s.name,keyboard:false}).addTo(group),el=marker.getElement();
            if(!el)return;
            var position=s.lat.toFixed(5)+','+s.lon.toFixed(5),sibling=positions[position]||0;positions[position]=sibling+1;
            var readings=el.querySelector('.live-station-readings');
            if(sibling%2){readings.style.left='auto';readings.style.right='8px';readings.dataset.side='left';}
            if(sibling>1)readings.style.top=(-12+Math.floor(sibling/2)*(readings.getBoundingClientRect().height+3))+'px';
            el.dataset.liveStation=s.id;el.setAttribute('role','group');el.setAttribute('aria-label',s.name);
            el.querySelectorAll('[data-measurement]').forEach(function(button){
                var key=button.dataset.measurement,r=s.readings[key];button.dataset.station=s.id;
                var label=s.name+' · '+({wind:'Wind',wave:'Waves',level:'Water level',temperature:'Water temperature'}[key])+' · '+ForecastLiveData.format(key,r.value)+' · '+fullTime(r.time);
                button.setAttribute('aria-label',label);button.title=label;
            });
            L.DomEvent.disableClickPropagation(el);el.addEventListener('keydown',function(e){e.stopPropagation();});
            el.addEventListener('click',function(e){
                var button=e.target.closest('[data-measurement]');
                if(button||e.target.closest('.live-station-pin')||e.target===el){e.stopPropagation();onSelect(s,button?button.dataset.measurement:keys[0]);}
            });
            el.addEventListener('mouseenter',function(){marker.setZIndexOffset(10000);});
            el.addEventListener('mouseleave',function(){if(!el.contains(document.activeElement))marker.setZIndexOffset(0);});
            el.addEventListener('focusin',function(){marker.setZIndexOffset(10000);});
            el.addEventListener('focusout',function(e){if(!el.contains(e.relatedTarget))marker.setZIndexOffset(0);});
        });
    }

    function renderMarkers(){if(map&&markers)drawMarkers(all,markers,function(s,key){layer=key==='wave'?'waves':key;chooseStation(s);});}

    function render(){
        if(tab==='station'&&selected&&!selected.readings[field()]){
            var available=['wind','wave','level','temperature'].find(function(key){return selected.readings[key];});
            if(available)layer=available==='wave'?'waves':available;
        }
        byId('live-map').hidden=tab!=='map';byId('live-list').hidden=tab!=='nearby';byId('live-station').hidden=tab!=='station';
        byId('live-tabs').querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.tab===tab));b.disabled=b.dataset.tab==='station'&&!selected;b.hidden=b.dataset.tab==='map'&&!!options.sharedMap;});
        byId('live-layers').querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.layer===layer));b.hidden=tab==='station'&&(!selected||!selected.readings[b.dataset.layer==='waves'?'wave':b.dataset.layer]);});
        byId('live-forecast').hidden=!options.canForecast;
        byId('live-title').textContent=tab==='station'&&selected?selected.name:'Live observations';
        byId('live-layers').hidden=tab==='map';byId('live-layers').setAttribute('aria-label',tab==='station'?'Measured history quantity':'Nearby observation quantity');byId('live-key').hidden=tab!=='map';
        renderTables();renderMarkers();place();
        if(tab==='map')prepareMap();
        loadHistory(false);
    }
    function mapLibrary(){
        if(window.ForecastLeafletReady)return window.ForecastLeafletReady;
        if(window.L)return Promise.resolve();if(library)return library;
        library=Promise.all([new Promise(function(resolve,reject){
            var link=document.createElement('link');link.rel='stylesheet';link.href=ForecastApp.asset('vendor/leaflet/leaflet.css');link.onload=resolve;link.onerror=reject;document.head.appendChild(link);
        }),new Promise(function(resolve,reject){
            var script=document.createElement('script');script.src=ForecastApp.asset('vendor/leaflet/leaflet.js');script.onload=resolve;script.onerror=reject;document.head.appendChild(script);
        })]);window.ForecastLeafletReady=library;return library;
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
    async function snapshot(force){
            if(force||!data||Date.now()-checked>600000){
                if(!loading)loading=(async function(){
                    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},15000);
                    try{var response=await fetch('https://raw.githubusercontent.com/ErikWahlstrom/dmi-vind-waves/live-data/live-observations.json?slot='+Math.floor(Date.now()/1200000),{signal:controller.signal});
                        if(!response.ok)throw Error('Station observations unavailable');return await response.json();
                    }finally{clearTimeout(timer);loading=null;}
                })();
                data=await loading;checked=Date.now();
            }
        return data;
    }
    async function refresh(force){
        var id=++requestId;
        byId('live-status').textContent='Loading station observations…';
        try{
            data=await snapshot(force);
            if(id!==requestId||!sheet.open)return;
            all=ForecastLiveData.stations(data);
            var stationId=selected?selected.id:wantedStation;
            selected=stationId?all.find(function(s){return s.id===stationId||stationId==='viva-'+s.vivaId;})||null:null;
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
        if(!sheet.open)return;cancelHistory();sheet.close();document.body.classList.remove('live-page');place();
        if(options[target])options[target]();
    }
    byId('live-close').addEventListener('click',function(){close('onMaps');});
    byId('live-forecast').addEventListener('click',function(){close('onForecast');});
    sheet.addEventListener('cancel',function(e){e.preventDefault();close('onMaps');});
    sheet.addEventListener('keydown',function(e){e.stopPropagation();});
    byId('live-refresh').addEventListener('click',function(){refresh(true).then(function(){loadHistory(true);});});
    byId('live-copy').addEventListener('click',async function(){save();try{await navigator.clipboard.writeText(location.href);byId('live-status').textContent='Live-view link copied.';}catch(_){byId('live-status').textContent=location.href;}});
    byId('live-tabs').addEventListener('click',function(e){var b=e.target.closest('[data-tab]');if(!b)return;if(b.dataset.tab==='map'&&options.sharedMap){close('onMaps');return;}tab=b.dataset.tab;render();save();if(all.length)byId('live-status').textContent=layerSummary();});
    byId('live-layers').addEventListener('click',function(e){var b=e.target.closest('[data-layer]');if(!b)return;layer=b.dataset.layer;render();save();
        byId('live-status').textContent=layerSummary();});
    document.addEventListener('visibilitychange',function(){if(!document.hidden&&sheet.open)refresh(false);});
    setInterval(function(){if(!document.hidden&&sheet.open)refresh(false);},600000);
    window.ForecastLive={snapshot:snapshot,drawMarkers:drawMarkers,open:async function(opts){
        options=opts;anchor=opts.point||{lat:60.5,lon:18};mapNeedsCenter=true;var q=new URLSearchParams(location.search);
        layer=['wind','waves','level','temperature'].includes(q.get('liveLayer'))?q.get('liveLayer'):'wind';
        tab=['map','nearby','station'].includes(q.get('liveTab'))?q.get('liveTab'):'map';
        var stationId=q.get('station');wantedStation=/^(met|sea|viva|fmi)-\d+$/.test(stationId||'')?stationId:null;
        selected=wantedStation?all.find(function(s){return s.id===wantedStation;})||null:null;
        if(!sheet.open)sheet.showModal();document.body.classList.add('live-page');place();render();save();
        await refresh(false);save();
    },isOpen:function(){return sheet.open;}};
    place();
})();
