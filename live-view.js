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
      #live-heading { flex:1; min-width:0; }
      #live-sheet h2 { font-size:17px; margin:0; flex:1; }
      #live-sheet button { color:#eee; background:#2b3036; border:1px solid #484d52; border-radius:9px; min-height:44px; padding:0 10px; font:inherit; font-size:13px; }
      #live-sheet #live-forecast { border-color:#6988a1; background:#30475a; color:#eef6ff; padding:0 10px; text-align:left; margin-top:4px; }
      #live-sheet button[aria-pressed=true] { background:#36536b; border-color:#89b8dd; }
      #live-sheet button:disabled { opacity:.4; }
      #live-tabs, #live-layers { display:flex; gap:6px; flex:none; }
      #live-tabs button, #live-layers button { flex:1; }
      #live-status { flex:none; color:#abb2ba; font-size:11px; margin:0; overflow-wrap:anywhere; max-height:70px; overflow:auto; }
      #live-map { flex:1; min-height:100px; border-radius:8px; background:#c8dde4; }
      #live-map .leaflet-control-zoom a { width:40px; height:40px; line-height:40px; }
      #live-map .leaflet-control-attribution { font-size:10px; }
      #live-list, #live-station { flex:1; min-height:0; overflow:auto; border:1px solid #353b42; border-radius:8px; }
      #live-sheet table { width:100%; border-spacing:0; font-size:15px; font-variant-numeric:tabular-nums; }
      #live-sheet th,#live-sheet td { text-align:left; padding:8px; border-bottom:1px solid #353b42; }
      #live-sheet thead th { position:sticky; top:0; background:#252d36; z-index:1; font-size:13px; }
      #live-sheet thead small { display:block; font-size:11px; font-weight:400; color:#bec8d1; }
      #live-sheet td small { display:block; font-size:11px; color:#bec8d1; }
      .live-provisional { color:#bec8d1; font-size:.75em; line-height:0; margin-inline-start:1px; }
      #live-sheet .live-station-button { text-align:left; padding:4px; border:0; background:transparent; width:100%; font-size:15px; }
      #live-station-name { font-size:16px; margin:12px 10px 4px; }
      #live-history-title { font-size:15px; margin:20px 10px 4px; }
      #live-history-note { font-size:11px; color:#abb2ba; margin:0 10px 10px; }
      #live-history-scroll { overflow:visible; }
      #live-history { table-layout:fixed; }
      #live-sheet #live-history thead th { top:44px; line-height:1.2; }
      #live-history td { font-size:16px; }
      #live-history tr[data-kind=forecast] { background:#24323d; }
      #live-history tr[data-present] { background:#30475a; }
      #live-history .live-timeline-divider th { position:static; padding:10px 5px; font-size:13px; text-align:left; background:#324451; }
      #live-timeline-nav { display:flex; gap:5px; position:sticky; top:0; z-index:3; background:#1d2024; }
      #live-timeline-nav button { flex:1; font-size:12px; padding:0 5px; }
      .live-timeline-direction { display:inline-block; margin-left:2px; font-size:13px; }
      .live-timeline-dot { display:block; width:4px; height:4px; border-radius:50%; margin:auto; box-shadow:0 0 0 1px #dfe7ef66; }
      #live-sheet #live-history th, #live-sheet #live-history td { padding:9px 4px; vertical-align:top; }
      #live-sheet #live-history th:not(:first-child), #live-history td:not(:first-child) { text-align:center; }
      #live-history td small { font-size:10px; }
      @media(max-width:380px) {
        #live-sheet #live-history th, #live-sheet #live-history td { padding-inline:2px; }
        #live-sheet #live-history thead th { font-size:12px; }
      }
      #live-history .live-hour-missing { color:#78818a; }
      #live-station-note { color:#abb2ba; font-size:11px; margin:0 10px 12px; }
      #live-footer { flex:none; display:flex; gap:12px; align-items:center; justify-content:space-between; color:#abb2ba; font-size:11px; }
      #live-footer a { color:#89b8dd; }
      #live-sheet [hidden] { display:none !important; }
      .live-icon { background:none; border:0; }
      .live-station-pin { position:absolute; left:0; top:0; width:4px; height:4px; box-sizing:border-box; background:#263b49; border:1px solid white; border-radius:50%; box-shadow:0 0 0 1px #263b4988; }
      .live-station-readings { --reading-height:20px; position:absolute; display:flex; left:6px; top:2px; transform:translateY(-50%); align-items:center; white-space:nowrap; gap:3px; }
      .live-station-readings[data-side=left] { left:auto; right:6px; }
      .live-station-values { display:flex; flex-direction:column; align-items:stretch; }
      .live-station-reading, #forecast-map .live-station-reading, #live-sheet .live-station-reading { display:block; text-align:left;
        box-sizing:border-box; min-height:var(--reading-height); margin:0; padding:0 2px; border:0; border-radius:3px; background:none; color:#16232b; cursor:pointer;
        font:700 15px/1 system-ui; font-variant-numeric:tabular-nums; white-space:nowrap; text-shadow:-1px -1px 1px white,1px 1px 1px white,1px -1px 1px white,-1px 1px 1px white; }
      .live-station-reading:hover, .live-station-reading:focus-visible { outline:1px solid #213d50; outline-offset:1px; border-radius:3px; }
      .live-marker-wave-arrow { margin-inline-start:2px; font-size:12px; }
      .live-marker-symbol { display:flex; flex-direction:column; flex:none; width:26px; border-radius:8px; overflow:hidden;
        box-shadow:0 0 0 1px #203946,0 1px 3px #2039465c; cursor:pointer; }
      .live-marker-symbol[data-single] { border-radius:50%; }
      .live-marker-glyph { display:grid; place-items:center; height:var(--reading-height); color:#172a37; font:700 17px/1 system-ui; }
      .live-marker-strength { display:block; transform:scale(var(--live-strength)); color:white; text-shadow:0 0 2px #14232d; }
      .live-marker-symbol[data-single] .live-marker-glyph { height:26px; }
      #live-key { margin:0; font-size:11px; color:#abb2ba; }
      .live-marker-wind { display:block; width:22px; height:20px; filter:drop-shadow(0 0 .8px #14232d); }

    `;
    document.head.appendChild(css);
    var launch=document.createElement('button');launch.id='live-open';launch.type='button';launch.textContent='Live';
    launch.disabled=true;
    launch.setAttribute('aria-label','Open live station observations');document.body.appendChild(launch);
    launch.addEventListener('click',function(){window.dispatchEvent(new Event('forecast-open-live'));});
    var sheet=document.createElement('dialog');sheet.id='live-sheet';sheet.setAttribute('aria-labelledby','live-title');
    sheet.innerHTML=`<header><button id="live-close" type="button">← Maps</button><div id="live-heading"><h2 id="live-title">Live observations</h2><button id="live-forecast" type="button" hidden>Last forecast point</button></div></header>
      <div id="live-tabs" aria-label="Observation view"><button data-tab="map" type="button">Map</button><button data-tab="nearby" type="button">Nearby</button><button data-tab="station" type="button">Station</button></div>
      <div id="live-layers" aria-label="Observation parameter"><button data-layer="wind" type="button">Wind</button><button data-layer="waves" type="button">Waves</button><button data-layer="level" type="button">Water level</button><button data-layer="temperature" type="button">Water °C</button></div>
      <p id="live-key">Coastal and offshore stations · Wind barbs and wave size show strength · Wind m/s · Waves m · Level cm · Water °C</p>
      <p id="live-status" role="status">Loading station observations…</p>
      <div id="live-map" role="region" aria-label="Observed weather station map"></div>
      <div id="live-list" hidden><table><thead><tr><th>Station</th><th>Observed</th><th>Time</th></tr></thead><tbody></tbody></table></div>
      <div id="live-station" hidden><h3 id="live-station-name"></h3><p id="live-station-note"></p><table id="live-current"><thead><tr><th>Measurement</th><th>Observed</th><th>Time</th></tr></thead><tbody></tbody></table><h3 id="live-history-title">Hourly timeline</h3><p id="live-history-note" role="status"></p><div id="live-timeline-nav" aria-label="Station timeline navigation"><button id="live-timeline-future" type="button">Forecast ↓</button><button id="live-timeline-now" type="button">Latest</button><button id="live-timeline-details" type="button">Details</button></div><div id="live-history-scroll"><table id="live-history" aria-label="Measured history and forecast hours"><thead></thead><tbody></tbody></table></div></div>
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
        var url=new URL(location.href),q=url.searchParams;q.set('view','live');q.set('detail','1');
        if(!q.has('time'))q.set('time',ForecastViewState.read(url.href).time);
        q.set('liveLayer',layer);q.set('liveTab',tab);q.set('forecastView',options.forecastView||'graph');
        if(selected||wantedStation)q.set('station',selected?selected.id:wantedStation);else q.delete('station');
        var hash=new URLSearchParams(url.hash.slice(1));hash.delete('time');url.hash=hash.toString();
        history.replaceState(history.state,'',url.href);
    }
    function field(){return layer==='waves'?'wave':layer;}
    function layerSummary(){
        if(tab==='station')return timelineStatus||'Loading station timeline…';
        var count=all.filter(function(s){return s.readings[field()];}).length;
        if(tab==='map'){
            var coastal=ForecastLiveData.coastal(all);
            return ['wind','wave','level','temperature'].map(function(key){return coastal.filter(function(s){return s.readings[key];}).length+' '+({wind:'wind stations',wave:'buoys',level:'water gauges',temperature:'temperature stations'}[key]);}).join(' · ');
        }
        if(layer==='temperature')return count+' stations · water temperature °C';
        return count+(layer==='waves'?' buoys · metres':layer==='level'?' stations · cm relative to local mean':' stations · m/s · wind generally hourly');
    }
    function chooseStation(s){selected=s;tab='station';render();save();byId('live-status').textContent=layerSummary();}
    function cells(row,values){values.forEach(function(value){var c=document.createElement('td');c.textContent=value;row.appendChild(c);});}
    function markProvisional(cell){
        var mark=document.createElement('sup');
        mark.className='live-provisional';mark.textContent='*';mark.title='Provisional observation';
        mark.setAttribute('role','img');mark.setAttribute('aria-label','Provisional observation');
        cell.appendChild(mark);
    }
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
            if(r.provisional)markProvisional(row.cells[1]);
            selectedBody.appendChild(row);
        });
    }
    function cancelHistory(){
        historySequence++;if(historyController)historyController.abort();historyController=null;historyStation=null;
    }
    function scrollToTimeline(selector){
        var table=byId('live-history'),target=table.querySelector(selector);if(!target)return;
        var panel=byId('live-station'),nav=byId('live-timeline-nav');
        var offset=target.getBoundingClientRect().top-panel.getBoundingClientRect().top-
            nav.getBoundingClientRect().height-table.tHead.getBoundingClientRect().height;
        panel.scrollTop+=offset*(vv?vv.scale:1)-panel.clientTop;
    }
    function travelArrow(from){return ['↓','↙','←','↖','↑','↗','→','↘'][Math.round(from/45)%8];}
    byId('live-timeline-future').addEventListener('click',function(){scrollToTimeline('.live-timeline-divider');});
    byId('live-timeline-now').addEventListener('click',function(){scrollToTimeline('[data-present]');});
    byId('live-timeline-details').addEventListener('click',function(){byId('live-station').scrollTop=0;});
    async function loadHistory(force){
        if(tab!=='station'||!selected||!sheet.open){cancelHistory();return;}
        var station=selected,identity=station.id;
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
        var rows=ForecastLiveTimeline.combine(history.rows,forecast.rows,Date.now(),history.latest,station.readings);
        byId('live-timeline-future').disabled=!rows.some(function(row){return row.kind==='forecast';});
        byId('live-timeline-now').disabled=!rows.length;
        timelineStatus=(rows.some(function(row){return row.kind==='forecast';})?'↓ Forecast':'Forecast unavailable')+' · ↑ Measured observations'+(forecast.summary&&forecast.summary.length?' · '+forecast.summary.join(' · '):'');
        byId('live-status').textContent=timelineStatus;
        note.textContent='Past rows show the first valid reading in each hour, with its measurement time below the value. Arrows show travel. — means unavailable. '+forecast.notes.join(' ')+
            (!history.rows.length?' Hourly history unavailable.':'');
        var header=document.createElement('tr');var quantities=['wind','wave','swell','level'].concat(station.readings.temperature?['temperature']:[]);
        [['Hour'],['Wind','m/s'],['Waves','m'],['Swell','m'],['Level','cm']].concat(station.readings.temperature?[['Water','°C']]:[]).forEach(function(labels){
            var th=document.createElement('th');th.scope='col';th.textContent=labels[0];
            if(labels[1]){var unit=document.createElement('small');unit.textContent=labels[1];th.append(' ',unit);}
            header.appendChild(th);
        });head.appendChild(header);
        if(!rows.length){note.textContent+=' No hourly data available. Try Refresh.';return;}
        var forecastStarted=false,dayLabel=new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric'});
        var present=rows.find(function(row){return row.kind==='latest';})||
            rows.filter(function(row){return row.kind==='observed';}).pop()||rows[0];
        rows.forEach(function(item){
            if(item.kind==='forecast'&&!forecastStarted){
                forecastStarted=true;var divider=document.createElement('tr'),label=document.createElement('th');
                divider.className='live-timeline-divider';label.colSpan=quantities.length+1;
                label.textContent='Forecast · future ↓';divider.appendChild(label);body.appendChild(divider);
            }
            var row=document.createElement('tr'),cell=document.createElement('td');row.dataset.kind=item.kind;row.dataset.time=item.time;
            if(item===present)row.dataset.present='true';
            var observation=item.kind==='observed'&&Object.keys(item.readings).length;
            var date=new Date(item.time),clock=document.createElement('time'),day=document.createElement('small');
            clock.dateTime=date.toISOString();clock.textContent=time(item.time);
            day.textContent=item.kind==='latest'?'Latest reading':dayLabel.format(date);
            cell.title=(item.kind==='forecast'?'Forecast':item.kind==='latest'?'Latest reading':observation?'Start of observation hour':'No observation for this hour')+' · '+fullTime(item.time);
            cell.append(clock,day);row.appendChild(cell);
            quantities.forEach(function(key,index){
                var r=item.readings[key],td=document.createElement('td');td.dataset.quantity=key;
                td.textContent=r?(key==='level'?(item.kind==='forecast'?'≈':'')+ForecastWater.format(r.value):r.value.toFixed(1)):'—';
                if(r&&r.provisional)markProvisional(td);
                if(r&&key!=='level'&&key!=='temperature'){
                    var direction=document.createElement('span'),dot=document.createElement('span');direction.className='live-timeline-direction';
                    direction.textContent=Number.isFinite(r.direction)?travelArrow(r.direction):'';
                    if(Number.isFinite(r.direction))direction.title='From '+Math.round(r.direction)+'°';
                    dot.className='live-timeline-dot';dot.style.background=ForecastColors.color(index,r.value);direction.appendChild(dot);td.appendChild(direction);
                }
                if(r&&(item.kind!=='forecast'||r.time!==item.time)){
                    var stamp=document.createElement('small'),measured=document.createElement('time');
                    measured.dateTime=new Date(r.time).toISOString();measured.textContent=time(r.time);
                    stamp.append('at ',measured);td.appendChild(stamp);
                }
                if(r)td.title=(item.kind==='forecast'?'Forecast':'Measured')+' '+fullTime(r.time)+(r.provisional?' · provisional':'');
                else td.className='live-hour-missing';row.appendChild(td);
            });body.appendChild(row);
        });
        requestAnimationFrame(function(){if(sequence===historySequence&&sheet.open)scrollToTimeline('[data-present]');});
    }
    function windBarb(speed,from){
        // Round the barb to 5 knots. The arrowhead points where the wind travels.
        var marks=Math.round(speed/2.57222),tail=21;
        var lines='M8.5 7.5 12 4 15.5 7.5 M12 4V21',flags='';
        while(marks>=10){flags+='M12 '+tail+'l6 -1 -6 -2z';tail-=3;marks-=10;}
        while(marks>=2){lines+=' M12 '+tail+'l6 -3';tail-=2.4;marks-=2;}
        if(marks)lines+=' M12 '+tail+'l3 -2';
        return '<svg class="live-marker-wind" viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate('+(from+180)+' 12 12)">'+
            '<path d="'+lines+'" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'+
            (flags?'<path d="'+flags+'" fill="white"/>':'')+'</g></svg>';
    }
    function drawMarkers(stations,group,onSelect){
        group.clearLayers();var positions=new Map();
        stations.forEach(function(s){
            var keys=['wind','wave','level','temperature'].filter(function(key){return s.readings[key];});
            if(!keys.length)return;
            var wave=s.readings.wave,waveDirection=s.readings.waveDirection;
            var waveFrom=wave&&waveDirection&&Math.abs(waveDirection.time-wave.time)<=600000?waveDirection.value:null;
            var glyphs=keys.map(function(key){
                var r=s.readings[key],color=key==='temperature'?'#e5a76b':key==='level'?'#8bbcc9':ForecastColors.color(key==='wind'?0:1,r.value);
                var symbol=key==='temperature'?'°':key==='wave'?'≋':key==='level'?'↕':'•',direction=s.readings.windDirection;
                if(key==='wind'&&direction&&Math.abs(direction.time-r.time)<=600000)
                    symbol=windBarb(r.value,direction.value);
                if(key==='wave'){
                    var strength=.6+.78*Math.min(r.value/4,1);
                    symbol='<span class="live-marker-strength" style="--live-strength:'+strength.toFixed(2)+'">'+symbol+'</span>';
                }
                return '<span class="live-marker-glyph" style="background:'+color+'">'+symbol+'</span>';
            }).join('');
            var values=keys.map(function(key){
                var r=s.readings[key];
                var label=key==='level'?ForecastWater.format(r.value):r.value.toFixed(1)+(key==='temperature'?'°':'');
                var arrow=key==='wave'&&waveFrom!==null?'<span class="live-marker-wave-arrow" aria-hidden="true">'+travelArrow(waveFrom)+'</span>':'';
                return '<button type="button" class="live-station-reading" data-measurement="'+key+'"><span class="live-marker-label">'+label+'</span>'+arrow+'</button>';
            }).join('');
            var icon=L.divIcon({className:'live-icon',iconSize:[5,5],iconAnchor:[2,2],html:
                '<span class="live-station-pin" aria-hidden="true"></span><span class="live-station-readings" data-count="'+keys.length+'">'+
                '<span class="live-marker-symbol" aria-hidden="true"'+(keys.length===1?' data-single':'')+'>'+glyphs+'</span>'+
                '<span class="live-station-values">'+values+'</span></span>'});
            var marker=L.marker([s.lat,s.lon],{icon:icon,title:s.name,keyboard:false}).addTo(group),el=marker.getElement();
            if(!el)return;
            var position=s.lat.toFixed(5)+','+s.lon.toFixed(5);
            if(!positions.has(position))positions.set(position,{count:0,bottom:[null,null]});
            var siblings=positions.get(position),side=siblings.count++%2,readings=el.querySelector('.live-station-readings');
            if(side)readings.dataset.side='left';
            var half=readings.offsetHeight/2,center=siblings.bottom[side]===null?2:siblings.bottom[side]+4+half;
            readings.style.top=center+'px';siblings.bottom[side]=center+half;
            el.dataset.liveStation=s.id;el.setAttribute('role','group');el.setAttribute('aria-label',s.name);
            el.querySelectorAll('[data-measurement]').forEach(function(button){
                var key=button.dataset.measurement,r=s.readings[key];button.dataset.station=s.id;
                var label=s.name+' · '+({wind:'Wind',wave:'Waves',level:'Water level',temperature:'Water temperature'}[key])+' · '+ForecastLiveData.format(key,r.value)+' · '+fullTime(r.time);
                if(key==='wave'&&waveFrom!==null)label+=' · From '+Math.round(waveFrom)+'°';
                button.setAttribute('aria-label',label);button.title=label;
            });
            L.DomEvent.disableClickPropagation(el);el.addEventListener('keydown',function(e){e.stopPropagation();});
            el.addEventListener('click',function(e){
                var button=e.target.closest('[data-measurement]');
                if(button||e.target.closest('.live-station-pin,.live-marker-symbol')||e.target===el){e.stopPropagation();onSelect(s,button?button.dataset.measurement:keys[0]);}
            });
            el.addEventListener('mouseenter',function(){marker.setZIndexOffset(10000);});
            el.addEventListener('mouseleave',function(){if(!el.contains(document.activeElement))marker.setZIndexOffset(0);});
            el.addEventListener('focusin',function(){marker.setZIndexOffset(10000);});
            el.addEventListener('focusout',function(e){if(!el.contains(e.relatedTarget))marker.setZIndexOffset(0);});
        });
    }

    function renderMarkers(){if(map&&markers)drawMarkers(ForecastLiveData.coastal(all),markers,function(s,key){layer=key==='wave'?'waves':key;chooseStation(s);});}

    function render(){
        byId('live-map').hidden=tab!=='map';byId('live-list').hidden=tab!=='nearby';byId('live-station').hidden=tab!=='station';
        byId('live-tabs').querySelectorAll('button').forEach(function(b){
            b.setAttribute('aria-pressed',String(b.dataset.tab===tab));
            b.hidden=options.sharedMap&&b.dataset.tab==='map';b.disabled=b.dataset.tab==='station'&&!selected;
        });
        byId('live-layers').querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.layer===layer));});
        var shortcut=byId('live-forecast');
        shortcut.hidden=!options.canForecast;
        shortcut.title=options.point?'Reopen '+options.point.lat.toFixed(3)+'° N, '+options.point.lon.toFixed(3)+'° E':'Reopen your last selected forecast location';
        byId('live-close').textContent=options.sharedMap?'← Live map':'← Maps';
        byId('live-title').textContent=tab==='station'&&selected?selected.name:'Live observations';
        byId('live-layers').hidden=tab!=='nearby';byId('live-key').hidden=tab!=='map';
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
    byId('live-tabs').addEventListener('click',function(e){var b=e.target.closest('[data-tab]');if(!b||b.hidden)return;tab=b.dataset.tab;render();save();if(all.length)byId('live-status').textContent=layerSummary();});
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
    },isOpen:function(){return sheet.open;},dismiss:function(){close('onMaps');}};
    place();
})();
