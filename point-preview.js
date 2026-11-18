/* Location graphs. Data and maps always come from one immutable snapshot. */
(function () {
    'use strict';
    var style = document.createElement('style');
    style.textContent = `
      .imgwrap img { -webkit-touch-callout:none; user-select:none; -webkit-user-select:none; }
      .imgwrap .coastline-layer { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; pointer-events:none; z-index:1; }
      .point-marker { position:absolute; width:12px; height:12px; margin:-8px; border:2px solid white;
        border-radius:50%; background:#172e3c; box-shadow:0 0 0 2px #172e3c; pointer-events:none; z-index:3; }
      #point-sheet { color:#eee; background:#1d2024; border:1px solid #484d52; border-radius:18px;
        position:fixed; inset:auto 8px 8px; margin:0 auto; width:calc(100% - 16px); max-width:700px;
        max-height:calc(85dvh - env(safe-area-inset-bottom,0px)); padding:14px;
        padding-bottom:calc(14px + env(safe-area-inset-bottom,0px)); box-sizing:border-box; overflow:auto; }
      #point-sheet::backdrop { background:#1d2024; }
      body.point-detail-page > main { visibility:hidden; }
      body.point-detail-page #point-preview-hint { display:none; }
      #point-return { position:fixed; top:calc(8px + env(safe-area-inset-top,0px)); right:8px; z-index:10;
        min-height:44px; padding:0 12px; border:1px solid #626e79; border-radius:9px; background:#20262e; color:#eee; font:inherit; }
      #point-return[hidden] { display:none; }
      #point-sheet header { display:flex; align-items:center; justify-content:space-between; gap:12px;
        position:sticky; top:env(safe-area-inset-top,0px); z-index:3; background:#1d2024; }
      #point-sheet h2 { margin:0; font-size:17px; font-weight:600; }
      #point-sheet header h2 { flex:1; min-width:0; }
      #point-sheet header h2 small { display:block; font-size:10px; font-weight:400; color:#abb2ba; }
      #point-view-controls { display:flex; gap:6px; margin:8px 0; }
      #point-view-controls button[aria-pressed="true"] { background:#36536b; border-color:#89b8dd; }
      #point-share { display:flex; gap:6px; margin-top:8px; }
      #point-share button { flex:1; font-size:12px; }
      #point-share-message { overflow-wrap:anywhere; }
      #point-table-scroll { max-height:420px; overflow:auto; border:1px solid #353b42; border-radius:9px; overscroll-behavior:contain; }
      #point-table { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; font-variant-numeric:tabular-nums; }
      #point-table th, #point-table td { padding:8px 6px; text-align:right; white-space:nowrap; border-bottom:1px solid #353b42; }
      #point-table thead th { position:sticky; top:0; z-index:1; background:#252d36; text-align:center; }
      #point-table th:first-child { text-align:left; }
      #point-table .point-date th { text-align:left; background:#25282e; font-size:12px; color:#b8c2cd; }
      #point-table tr[data-light="night"] { background:#303236; }
      #point-table tr[data-light="twilight"] { background:#242629; }
      #point-table .point-solar th { text-align:left; font-size:11px; font-weight:400; color:#c2c6cc; padding:5px 10px; }
      #point-table tr[aria-selected="true"] td, #point-table tr[aria-selected="true"] th { background:#30475a; }
      #point-sheet #point-table button { min-width:0; min-height:34px; padding:3px 5px; border:0; background:transparent; font-size:13px; }
      #point-sheet.table-mode #point-hour, #point-sheet.table-mode #point-reading { display:none; }
      #point-sheet.table-mode:not(.location-editing) { display:flex; flex-direction:column; }
      #point-sheet.table-mode:not(.location-editing) #point-content { display:flex; flex-direction:column; min-height:0; flex:1; }
      #point-sheet.table-mode #point-table-view { display:flex; flex-direction:column; min-height:0; flex:1; }
      #point-sheet.table-mode #point-table-scroll { max-height:none; min-height:0; flex:1; }
      #point-sheet.full-mode { max-width:none; border:0; border-radius:0; display:flex; flex-direction:column;
        padding-top:calc(14px + env(safe-area-inset-top,0px)); padding-left:calc(14px + env(safe-area-inset-left,0px));
        padding-right:calc(14px + env(safe-area-inset-right,0px)); }
      #point-sheet.full-mode:not(.location-editing) #point-thumbnail { width:64px; height:71px; }
      #point-sheet #point-close { flex:none; padding:0 10px; font-size:14px; }
      #point-sheet.full-mode #point-content { display:flex; flex-direction:column; min-height:0; flex:1; }
      #point-sheet.full-mode #point-graph-help { display:none; }
      #point-sheet.full-mode #point-chart { flex:1 1 0; min-height:200px; }
      #point-sheet.full-mode #point-graphs { height:100%; }
      #point-sheet p { color:#abb2ba; font-size:12px; margin:5px 0 10px; }
      #point-sheet button { color:#eee; background:#2b3036; border:1px solid #484d52; border-radius:9px;
        min-width:44px; min-height:44px; font:inherit; }
      #point-sheet button:disabled { opacity:.4; }
      #point-place { display:flex; align-items:center; gap:12px; margin:8px 0; }
      #point-thumbnail { width:92px; height:102px; flex:none; border-radius:6px; background:#eef1f2; overflow:hidden; touch-action:manipulation; cursor:pointer; user-select:none; -webkit-user-select:none; }
      #point-sheet.location-editing #point-thumbnail { width:100%; height:300px; touch-action:none; cursor:grab; }
      #point-sheet.location-editing #point-thumbnail:active { cursor:grabbing; }
      #point-edit-actions { display:flex; gap:10px; margin-top:10px; padding-top:6px; position:sticky; bottom:0; background:#1d2024; }
      #point-edit-actions button { flex:1; }
      #point-sheet #point-edit-use { background:#36536b; border-color:#89b8dd; }
      #point-thumbnail svg { display:block; width:100%; height:100%; pointer-events:none; }
      #point-place p { margin:0; }
      #point-reading { margin:10px 0; display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
      #point-sheet #point-reading button { min-width:0; padding:8px 4px; font-size:12px; color:#abb2ba; text-align:left; }
      #point-sheet #point-reading button[aria-pressed="true"] { border-color:var(--point-color); color:var(--point-color); background:#252d36; }
      #point-reading strong { display:block; font-size:14px; color:#eee; font-weight:500; }
      #point-chart { position:relative; isolation:isolate; border:1px solid #353b42; border-radius:9px; overflow:hidden; background:#181b1f; }
      #point-graphs { position:relative; z-index:0; overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
      #point-graphs::-webkit-scrollbar { display:none; }
      #point-graphs svg { display:block; max-width:none; touch-action:pan-x pan-y; }
      #point-axis { position:absolute; z-index:1; left:0; top:0; width:34px; height:282px; background:#181b1fe8; pointer-events:none; }
      #point-cursor, #point-cursor-back { pointer-events:none; }
      #point-hour { display:flex; align-items:center; gap:8px; margin-top:10px; }
      #point-hour time { flex:1; text-align:center; font-size:14px; font-variant-numeric:tabular-nums; }
      #point-sheet [hidden] { display:none !important; }
      #point-sheet:not([open]) { display:none !important; }
      #point-light-legend { display:flex; flex-wrap:wrap; gap:4px 10px; font-size:11px !important; margin:5px 0 !important; }
      #point-light-legend span::before { content:''; display:inline-block; width:10px; height:8px; margin-right:4px; background:var(--swatch); border:1px solid #59616b; }
      #point-preview-hint { position:fixed; top:8px; left:50%; transform:translateX(-50%); z-index:110;
        padding:9px 14px; border-radius:20px; color:white; background:#20262e; border:1px solid #626e79;
        font-size:12px; white-space:nowrap; box-shadow:0 2px 12px #0008; pointer-events:none; }
    `;
    document.head.appendChild(style);
    var hint = document.createElement('div');
    hint.id = 'point-preview-hint';
    hint.textContent = 'Hold on the sea for hourly graphs';
    document.body.appendChild(hint);
    setTimeout(function () { hint.remove(); }, 12000);
    var sheet = document.createElement('dialog');
    sheet.id = 'point-sheet';
    sheet.setAttribute('aria-labelledby', 'point-title');
    sheet.innerHTML = `<header><button id="point-close" type="button" aria-label="Back to maps">← Maps</button><h2 id="point-title">Hourly forecast</h2></header>
      <div id="point-place" hidden>
        <div id="point-thumbnail" tabindex="0" role="button" aria-label="Enlarge map to adjust location" aria-expanded="false" aria-controls="point-editor"><svg xmlns="http://www.w3.org/2000/svg" viewBox="154.8 27 549 607.5" role="img" aria-label="Selected location on the Baltic map">
          <defs><clipPath id="point-thumb-clip"><rect x="154.8" y="27" width="549" height="607.5"/></clipPath></defs>
          <image id="point-thumb-image" width="900" height="675" clip-path="url(#point-thumb-clip)"/>
          <image id="point-thumb-coast" width="900" height="675" clip-path="url(#point-thumb-clip)"/>
          <circle id="point-thumb-outline" r="7" fill="#172e3c" stroke="#172e3c" stroke-width="4" vector-effect="non-scaling-stroke"/>
          <circle id="point-thumb-dot" r="4" fill="#172e3c" stroke="white" stroke-width="2" vector-effect="non-scaling-stroke"/>
        </svg></div>
        <p id="point-location"></p>
      </div><p id="point-message" role="status"></p>
      <div id="point-editor" hidden>
        <p>Move the map beneath the marker, then choose Use location.</p>
        <div id="point-edit-map"></div>
        <p id="point-edit-location" role="status"></p>
        <div id="point-edit-actions"><button id="point-edit-cancel" type="button">Cancel</button><button id="point-edit-use" type="button">Use location</button></div>
      </div>
      <div id="point-content" hidden>
        <div id="point-view-controls" aria-label="Forecast view"><button id="point-view-graph" type="button" aria-pressed="true">Graph</button><button id="point-view-table" type="button" aria-pressed="false">Table</button></div>
        <div id="point-hour"><button id="point-prev" aria-label="Previous hour">‹</button><time id="point-time"></time><button id="point-next" aria-label="Next hour">›</button></div>
        <div id="point-reading" aria-label="Choose a forecast quantity"></div><p id="point-graph-help">Drag the graph beneath the line to choose the hour.</p>
        <div id="point-chart"><div id="point-graphs" tabindex="0" role="slider" aria-label="Location forecast hour" aria-orientation="horizontal"></div><svg id="point-axis" aria-hidden="true"></svg></div>
        <p id="point-light-legend"><span style="--swatch:#181b1f">Daylight</span><span style="--swatch:#242629">Twilight</span><span style="--swatch:#303236">Night</span> ↑ Sunrise · ↓ Sunset</p>
        <div id="point-table-view" hidden><div id="point-table-scroll" tabindex="0" aria-label="Hourly forecast table"><table id="point-table"><thead><tr><th scope="col">Time</th><th scope="col">Wind<br>m/s</th><th scope="col">Waves<br>m</th><th scope="col">Swell<br>m</th></tr></thead><tbody></tbody></table></div></div>
        <p id="point-source"></p>
        <div id="point-share"><button id="point-link-live" type="button">Copy live link</button><button id="point-link-hour" type="button">Share this hour</button></div><p id="point-share-message" role="status"></p>
      </div>`;
    document.body.appendChild(sheet);
    var returnButton = document.createElement('button');
    returnButton.id = 'point-return'; returnButton.type = 'button'; returnButton.textContent = 'Forecast →';
    returnButton.setAttribute('aria-label', 'Return to location forecast'); returnButton.hidden = true;
    document.body.appendChild(returnButton);
    var viewport = window.visualViewport, placementFrame = null;
    function viewportScale() { return viewport ? viewport.scale : 1; }
    function placeReturn() {
        if (!viewport || returnButton.hidden) return;
        var scale = viewportScale(), safeTop = parseFloat(getComputedStyle(sheet).paddingTop) - 14;
        returnButton.style.right = 'auto';
        returnButton.style.transformOrigin = 'top left';
        returnButton.style.transform = 'scale(' + (1 / scale) + ')';
        returnButton.style.left = (viewport.offsetLeft + viewport.width - (returnButton.offsetWidth + 8) / scale) + 'px';
        returnButton.style.top = (viewport.offsetTop + (8 + safeTop) / scale) + 'px';
    }
    function placeSheet() {
        placementFrame = null;
        if (!sheet.open || !viewport) return;
        var scale = viewportScale();
        // Counter the page's pinch zoom only for the dialog. Keep the map and
        // its selected location at their existing zoom and scroll position.
        sheet.style.margin = '0';
        sheet.style.right = sheet.style.bottom = 'auto';
        sheet.style.transformOrigin = 'top left';
        sheet.style.transform = 'scale(' + (1 / scale) + ')';
        sheet.style.width = Math.max(1, viewport.width * scale) + 'px';
        sheet.style.maxHeight = sheet.style.height = (viewport.height * scale) + 'px';
        if (editing) sizeEditor();
        sheet.style.left = viewport.offsetLeft + 'px';
        sheet.style.top = viewport.offsetTop + 'px';
    }
    function schedulePlacement() {
        placeReturn();
        if (placementFrame === null && sheet.open) placementFrame = requestAnimationFrame(placeSheet);
    }
    new ResizeObserver(schedulePlacement).observe(sheet);
    if (viewport) {
        viewport.addEventListener('resize', schedulePlacement);
        viewport.addEventListener('scroll', schedulePlacement);
    }
    window.addEventListener('resize', schedulePlacement);
    var byId = function (id) { return document.getElementById(id); };
    var content = byId('point-content'), message = byId('point-message'), graph = byId('point-graphs');
    var selection = null, sequence = 0, indexCache = new Map(), tileCache = new Map();
    var graphWidth, graphPadding, graphViewportWidth = 0, selectedHour, closingFocus;
    var graphScrollFrame = null, mapTimer = null;
    var thumbnail = byId('point-thumbnail'), thumbWidth = 130, thumbHeight = thumbWidth * 102 / 92;
    var thumbnailDrag = null, relocating = false;
    var editing = false, editorCandidate = -1, editorScroll = 0;
    // Legacy full=0 links also open the dedicated forecast page.
    var initialState = ForecastViewState.read(location.href), detailView = initialState.view, fullView = true;
    var mapQuantity = initialState.map, linkTime = initialState.time === 'now' ? 'now' : 'selected';
    var restoring = true, restoreStarted = false, urlTimer = null;
    var graphHeight = 282, plotTop = 34, plotBottom = 244, plotHeight = 210;
    var savedPoint = initialState.point, returnPoint = null;
    var coastUrl = null, coastRequest = 0;
    function syncCoastline() {
        var snapshot = displayedFrame && displayedFrame.snapshot;
        var url = snapshot && snapshot.coastline === 'coastline.svg' ? snapshot.imageBase + snapshot.coastline : null;
        // Renderer 3 uses these exact map bounds too. A bundled geographic
        // layer keeps cached snapshots sharp during GitHub manifest caching.
        if (!url && snapshot && snapshot.generatorVersion === 3) url = new URL('coastline-v1.svg', document.baseURI).href;
        if (url === coastUrl) return;
        coastUrl = url;
        var request = ++coastRequest;
        document.querySelectorAll('.coastline-layer').forEach(function (layer) { layer.remove(); });
        byId('point-thumb-coast').removeAttribute('href');
        if (!url) return;
        var image = new Image();
        image.onload = function () {
            if (request !== coastRequest || !displayedFrame || displayedFrame.snapshot !== snapshot) return;
            document.querySelectorAll('.imgwrap').forEach(function (wrap) {
                var layer = document.createElement('img');
                layer.className = 'coastline-layer'; layer.alt = ''; layer.setAttribute('aria-hidden', 'true');
                layer.src = url;
                wrap.appendChild(layer);
            });
            byId('point-thumb-coast').setAttribute('href', url);
        };
        image.onerror = function () { if (request === coastRequest) coastUrl = null; };
        image.src = url;
    }
    function directionArrow(direction) {
        return direction === null ? '' : ['↓','↙','←','↖','↑','↗','→','↘'][Math.round(direction / 45) % 8];
    }
    function solarRange(padding) {
        var times = selection.index.times;
        return ForecastSolar.range(Date.parse(times[0]) - padding,
            Date.parse(times[times.length - 1]) + Math.max(1, padding), selection.point[3], selection.point[2]);
    }
    function drawTable() {
        var body = byId('point-table').tBodies[0], fragment = document.createDocumentFragment(), previousDate = '';
        var light = solarRange(0), labels = {dawn:'Dawn', sunrise:'↑ Sunrise', sunset:'↓ Sunset', dusk:'Dusk'};
        var entries = selection.index.times.map(function (stamp, hour) { return {time:Date.parse(stamp), hour:hour}; });
        entries = entries.concat(light.events);
        entries.sort(function (a, b) { return a.time - b.time || (a.type ? -1 : 1); });
        entries.forEach(function (entry) {
            var date = new Date(entry.time), dateLabel = fmtDate(date);
            if (dateLabel !== previousDate) {
                var day = document.createElement('tr'), heading = document.createElement('th');
                day.className = 'point-date'; heading.colSpan = 4; heading.scope = 'rowgroup'; heading.textContent = dateLabel;
                day.appendChild(heading); fragment.appendChild(day); previousDate = dateLabel;
            }
            if (entry.type) {
                var eventRow = document.createElement('tr'), eventLabel = document.createElement('th');
                eventRow.className = 'point-solar'; eventRow.dataset.solarEvent = entry.type; eventRow.dataset.time = entry.time;
                eventLabel.colSpan = 4; eventLabel.textContent = labels[entry.type] + ' · ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
                eventLabel.title = fmtLocal(date); eventRow.appendChild(eventLabel); fragment.appendChild(eventRow);
                return;
            }
            var hour = entry.hour;
            var row = document.createElement('tr'), time = document.createElement('th'), button = document.createElement('button');
            var band = light.bands.find(function (b) { return b.start <= entry.time && b.end > entry.time; });
            row.dataset.light = band.phase;
            row.dataset.hour = hour; time.scope = 'row'; button.type = 'button'; button.dataset.hour = hour;
            button.textContent = pad(date.getHours()) + ':' + pad(date.getMinutes());
            button.setAttribute('aria-label', fmtLocal(date)); button.title = fmtLocal(date);
            time.appendChild(button); row.appendChild(time);
            for (var i = 0; i < 3; i++) {
                var cell = document.createElement('td'), value = selection.values[hour][i * 2], direction = selection.values[hour][i * 2 + 1];
                cell.textContent = value === null ? '—' : value.toFixed(1) + ' ' + directionArrow(direction);
                cell.title = value === null ? 'No data' : 'Arrows show direction of travel';
                row.appendChild(cell);
            }
            fragment.appendChild(row);
        });
        body.replaceChildren(fragment);
    }
    function tableRow() {
        var scroller = byId('point-table-scroll'), cutoff = scroller.getBoundingClientRect().top + byId('point-table').tHead.getBoundingClientRect().height;
        var rows = byId('point-table').tBodies[0].querySelectorAll('tr[data-hour]');
        for (var i = 0; i < rows.length; i++) if (rows[i].getBoundingClientRect().bottom > cutoff + 1) return Number(rows[i].dataset.hour);
        return 0;
    }
    function scrollTable(hour) {
        var row = byId('point-table').querySelector('tr[data-hour="' + hour + '"]');
        if (!row) return;
        var scroller = byId('point-table-scroll'), rect = scroller.getBoundingClientRect(), ratio = rect.height / scroller.offsetHeight || 1;
        scroller.scrollTop += (row.getBoundingClientRect().top - rect.top - byId('point-table').tHead.getBoundingClientRect().height) / ratio;
    }
    function applyPresentation() {
        var table = detailView === 'table';
        sheet.classList.toggle('table-mode', table); sheet.classList.toggle('full-mode', fullView);
        byId('point-view-graph').setAttribute('aria-pressed', String(!table));
        byId('point-view-table').setAttribute('aria-pressed', String(table));
        ['point-graph-help', 'point-chart', 'point-light-legend'].forEach(function (id) { byId(id).hidden = table; });
        byId('point-table-view').hidden = !table;
        updateTitle();
    }
    function updateTitle() {
        if (!selection || editing) return;
        var title = byId('point-title');
        title.textContent = detailView === 'table' ? 'Hourly forecast' : quantities[selection.quantity] + ' forecast';
    }
    function switchView(view) {
        detailView = view; applyPresentation(); placeSheet();
        if (selection) {
            if (view === 'graph') { drawGraphs(); choose(selectedHour, false); }
            else scrollTable(selectedHour);
        }
        persistView();
    }
    byId('point-view-graph').addEventListener('click', function () { switchView('graph'); });
    byId('point-view-table').addEventListener('click', function () { switchView('table'); });
    returnButton.addEventListener('click', async function () {
        if (!returnPoint || !displayedFrame) return;
        var quantity = selection ? selection.quantity : ['wind', 'waves', 'swell'].indexOf(initialState.quantity);
        var image = document.getElementById(['img-win', 'img-hs', 'img-hsw'][['wind', 'waves', 'swell'].indexOf(mapQuantity)]);
        var rect = imageRect(image);
        await openPoint(image, rect.left + returnPoint[0] * rect.width, rect.top + returnPoint[1] * rect.height);
        if (sheet.open && selection) { selection.quantity = quantity; applyPresentation(); drawGraphs(); choose(selectedHour, false); }
    });
    byId('point-table').addEventListener('click', function (e) {
        var row = e.target.closest('[data-hour]');
        if (row) choose(Number(row.dataset.hour), true);
    });
    byId('point-table-scroll').addEventListener('scroll', function () {
        if (detailView === 'table') persistView();
    }, {passive:true});
    function stateForUrl(time) {
        return {point:savedPoint, map:mapQuantity, quantity:selection ? ['wind', 'waves', 'swell'][selection.quantity] : initialState.quantity,
            view:detailView, detail:sheet.open && !!selection, full:fullView,
            row:detailView === 'table' && selection && time === 'now' ? tableRow() : null, time:time};
    }
    function persistView() {
        if (restoring) return;
        clearTimeout(urlTimer);
        urlTimer = setTimeout(function () {
            var time = linkTime === 'now' || !selection ? 'now' : selection.index.times[selectedHour];
            var next = ForecastViewState.write(location.href, stateForUrl(time));
            if (next !== location.href) history.replaceState(history.state, '', next);
        }, 200);
    }
    async function shareLink(fixed) {
        if (!selection) return;
        byId('point-share-message').textContent = '';
        linkTime = fixed ? 'selected' : 'now';
        var next = ForecastViewState.write(location.href, stateForUrl(fixed ? selection.index.times[selectedHour] : 'now'));
        clearTimeout(urlTimer); history.replaceState(history.state, '', next);
        try {
            if (fixed && navigator.share) await navigator.share({title:'Baltic forecast · ' + fmtLocal(new Date(selection.index.times[selectedHour])), url:next});
            else { await navigator.clipboard.writeText(next); byId('point-share-message').textContent = fixed ? 'Link to this hour copied.' : 'Live link copied. It opens the latest forecast for this location.'; }
        } catch (error) {
            if (error.name !== 'AbortError') byId('point-share-message').textContent = next;
        }
    }
    byId('point-link-live').addEventListener('click', function () { shareLink(false); });
    byId('point-link-hour').addEventListener('click', function () { shareLink(true); });
    function close() { if (editing) finishEditor(); else sheet.close(); }
    byId('point-close').addEventListener('click', close);
    sheet.addEventListener('cancel', function (e) { if (editing) { e.preventDefault(); finishEditor(); } });
    sheet.addEventListener('close', function () {
        document.body.classList.remove('point-detail-page');
        returnButton.hidden = !returnPoint;
        placeReturn();
        sequence++;
        if (editing) finishEditor(false);
        thumbnailDrag = null; relocating = false; content.inert = false;
        var pendingMap = mapTimer !== null;
        clearTimeout(mapTimer);
        mapTimer = null;
        if (pendingMap && selection && forecast && forecast.imageBase === selection.snapshot.imageBase) show(selectedHour + 1);
        document.querySelectorAll('.point-marker').forEach(function (m) { m.remove(); });
        if (closingFocus && closingFocus.isConnected) closingFocus.focus({preventScroll:true});
        persistView();
    });
    function cached(cache, url) {
        if (!cache.has(url)) {
            cache.set(url, fetch(url).then(function (r) {
                if (!r.ok) throw Error('Location data could not be loaded. Close and try again.');
                return r.json();
            }).catch(function (error) { cache.delete(url); throw error; }));
            // Keep memory bounded when a tab remains open across many runs.
            if (cache.size > 8) cache.delete(cache.keys().next().value);
        }
        return cache.get(url);
    }
    async function pointIndex(snapshot) {
        if (!snapshot || snapshot.pointForecast !== 'point-index.json') throw Error('Location data is being prepared. Refresh the page in a few minutes.');
        var index = await cached(indexCache, snapshot.imageBase + snapshot.pointForecast);
        if (index.schema !== 1 || index.identity !== snapshot.forecastIdentity || index.times.length !== snapshot.frames.length ||
            index.times.some(function (t, i) { return t !== snapshot.frames[i].time; })) throw Error('Location data does not match these maps. Refresh and try again.');
        return index;
    }
    async function restoreView() {
        if (restoreStarted || !displayedFrame) return;
        restoreStarted = true;
        var target = document.getElementById(['img-win', 'img-hs', 'img-hsw'][['wind', 'waves', 'swell'].indexOf(initialState.map)]);
        if (!initialState.point) {
            restoring = false;
            if (initialState.invalidPoint) byId('timeInfo').textContent = 'Invalid saved location. Hold a sea point to select one.';
            if (new URLSearchParams(location.search).has('map')) target.parentNode.scrollIntoView({block:'start'});
            return;
        }
        var snapshot = displayedFrame.snapshot, token = ++sequence;
        try {
            var index = await pointIndex(snapshot), best = -1, distance = 20 * 20;
            index.points.forEach(function (point, i) {
                var d = Math.pow((point[3] - initialState.point.lat) * 111.32, 2) +
                    Math.pow((point[2] - initialState.point.lon) * 111.32 * Math.cos(initialState.point.lat * Math.PI / 180), 2);
                if (d < distance) { best = i; distance = d; }
            });
            if (token !== sequence) return;
            if (best < 0) throw Error('No nearby sea forecast for the saved location. Hold a sea point to select another.');
            var point = index.points[best];
            returnPoint = point;
            savedPoint = {lat:point[3], lon:point[2]};
            target.parentNode.scrollIntoView({block:'start'});
            if (initialState.detail) {
                var rect = imageRect(target);
                await openPoint(target, rect.left + point[0] * rect.width, rect.top + point[1] * rect.height);
                if (!selection || selection.point !== point) return;
                selection.quantity = ['wind', 'waves', 'swell'].indexOf(initialState.quantity);
                applyPresentation(); drawGraphs(); choose(selectedHour, false); placeSheet();
                if (detailView === 'table') scrollTable(initialState.row === null ? selectedHour : Math.min(initialState.row, index.times.length - 1));
            } else {
                marker(point);
                returnButton.hidden = false;
                placeReturn();
            }
        } catch (error) {
            byId('timeInfo').textContent = error.message;
        } finally { restoring = false; persistView(); }
    }
    function imageRect(image) {
        var rect = image.getBoundingClientRect();
        var scale = Math.min(rect.width / 900, rect.height / 675);
        return {left:rect.left + (rect.width - 900 * scale) / 2,
            top:rect.top + (rect.height - 675 * scale) / 2, width:900 * scale, height:675 * scale};
    }
    function marker(point) {
        document.querySelectorAll('.point-marker').forEach(function (m) { m.remove(); });
        document.querySelectorAll('.imgwrap > img[id^="img-"]').forEach(function (image) {
            var r = imageRect(image), parent = image.parentNode.getBoundingClientRect();
            var mark = document.createElement('span');
            mark.className = 'point-marker';
            mark.style.left = (r.left - parent.left + point[0] * r.width) + 'px';
            mark.style.top = (r.top - parent.top + point[1] * r.height) + 'px';
            image.parentNode.appendChild(mark);
        });
    }
    function nearest(index, x, y) {
        var best = -1, distance = 9 * 9;
        index.points.forEach(function (point, i) {
            var d = Math.pow(point[0] * 900 - x, 2) + Math.pow(point[1] * 675 - y, 2);
            if (d < distance) { best = i; distance = d; }
        });
        return best;
    }
    function setThumbnailCenter(x, y) {
        x = Math.max(154.8, Math.min(703.8, x));
        y = Math.max(27, Math.min(634.5, y));
        thumbnail.querySelector('svg').setAttribute('viewBox', [x - thumbWidth / 2, y - thumbHeight / 2, thumbWidth, thumbHeight].join(' '));
        ['point-thumb-outline', 'point-thumb-dot'].forEach(function (id) {
            byId(id).setAttribute('cx', x); byId(id).setAttribute('cy', y);
        });
    }
    async function loadLocation(index, best, snapshot, quantity, hour, request) {
        var point = index.points[best];
        var tile = await cached(tileCache, snapshot.imageBase + 'point-' + Math.floor(best / index.tileSize) + '.json');
        if (request !== sequence || !sheet.open) return;
        if (tile.schema !== 1 || tile.identity !== index.identity || tile.count < 1 || tile.count > index.tileSize) throw Error('Invalid location data.');
        var binary = atob(tile.data), bytes = Uint8Array.from(binary, function (ch) { return ch.charCodeAt(0); });
        if (bytes.length !== index.times.length * tile.count * 6 * 2) throw Error('Incomplete location data.');
        var view = new DataView(bytes.buffer), local = best % index.tileSize;
        var values = index.times.map(function (_, h) {
            return index.fields.map(function (_, field) {
                var value = view.getUint16(((h * tile.count + local) * 6 + field) * 2, true);
                return value === 65535 ? null : value / index.scales[field];
            });
        });
        if (!displayedFrame || displayedFrame.snapshot.imageBase !== snapshot.imageBase) throw Error('The forecast updated. Close and select the location again.');
        selection = {snapshot:snapshot, index:index, values:values, point:point, quantity:quantity};
        returnPoint = point;
        savedPoint = {lat:point[3], lon:point[2]};
        relocating = false; content.inert = false;
        message.textContent = ''; content.hidden = false;
        byId('point-share-message').textContent = '';
        byId('point-place').hidden = false;
        byId('point-location').textContent = point[3].toFixed(3) + '° N, ' + point[2].toFixed(3) + '° E · tap map to adjust';
        setThumbnailCenter(point[0] * 900, point[1] * 675);
        marker(point);
        graph.setAttribute('aria-valuemin', '0');
        graph.setAttribute('aria-valuemax', String(index.times.length - 1));
        byId('point-source').textContent = snapshot.provider + ' · run ' + fmtLocal(new Date(snapshot.modelRun)) + ' · model forecast';
        drawTable();
        applyPresentation();
        drawGraphs();
        choose(hour, false);
        placeSheet();
        persistView();
    }
    async function openPoint(image, clientX, clientY) {
        var rect = imageRect(image), x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
        if (x < .172 || x > .782 || y < .04 || y > .94) return;
        if (editing) finishEditor(false);
        var snapshot = displayedFrame && displayedFrame.snapshot;
        var quantity = Math.max(0, ['img-win', 'img-hs', 'img-hsw'].indexOf(image.id));
        mapQuantity = ['wind', 'waves', 'swell'][quantity];
        var request = ++sequence;
        closingFocus = image.parentNode;
        document.body.classList.add('point-detail-page'); returnButton.hidden = true;
        if (!sheet.open) sheet.showModal();
        hint.remove(); content.hidden = true; selection = null; relocating = false; content.inert = false;
        byId('point-place').hidden = true;
        byId('point-title').textContent = 'Hourly forecast';
        byId('point-location').textContent = '';
        message.textContent = 'Loading hourly forecast…';
        placeSheet();
        try {
            var index = await pointIndex(snapshot);
            if (request !== sequence) return;
            var best = nearest(index, x * 900, y * 675);
            if (best < 0) throw Error('No sea forecast here. Close and hold on a sea location.');
            await loadLocation(index, best, snapshot, quantity, displayedFrame.index - 1, request);
        } catch (error) {
            if (request === sequence) {
                message.textContent = error.message;
                document.querySelectorAll('.point-marker').forEach(function (m) { m.remove(); });
            }
        }
    }
    function sizeEditor() {
        if (!editing) return;
        var available = viewport ? viewport.height * viewportScale() : innerHeight;
        thumbnail.style.height = Math.max(120, Math.min(420, available * .85 - 210)) + 'px';
        var width = thumbnail.clientWidth || 92;
        thumbHeight = thumbWidth * thumbnail.clientHeight / width;
        // Keep the marker readable at the same physical size as the thumbnail.
        byId('point-thumb-dot').setAttribute('r', 4 * 92 / width);
        byId('point-thumb-outline').setAttribute('r', 7 * 92 / width);
        setThumbnailCenter(Number(byId('point-thumb-dot').getAttribute('cx')), Number(byId('point-thumb-dot').getAttribute('cy')));
    }
    function updateDraft() {
        if (!editing || !selection) return;
        editorCandidate = nearest(selection.index, Number(byId('point-thumb-dot').getAttribute('cx')), Number(byId('point-thumb-dot').getAttribute('cy')));
        byId('point-edit-use').disabled = editorCandidate < 0;
        var point = editorCandidate < 0 ? null : selection.index.points[editorCandidate];
        byId('point-edit-location').textContent = point ? point[3].toFixed(3) + '° N, ' + point[2].toFixed(3) + '° E · nearest sea model point' : 'No sea data here. Move the marker onto the sea.';
    }
    function beginEditor() {
        if (!selection || editing) return;
        sequence++;
        thumbnailDrag = null; relocating = false; content.inert = false; message.textContent = '';
        editing = true; editorScroll = sheet.scrollTop;
        sheet.classList.add('location-editing');
        byId('point-edit-map').appendChild(thumbnail);
        byId('point-editor').hidden = false;
        byId('point-place').hidden = true; content.hidden = true;
        byId('point-title').textContent = 'Adjust location';
        byId('point-close').setAttribute('aria-label', 'Return to forecast');
        byId('point-close').textContent = '← Forecast';
        thumbnail.setAttribute('role', 'group');
        thumbnail.setAttribute('aria-label', 'Move the map beneath the fixed marker, or use arrow keys');
        thumbnail.setAttribute('aria-expanded', 'true');
        sizeEditor();
        setThumbnailCenter(selection.point[0] * 900, selection.point[1] * 675);
        updateDraft(); placeSheet();
        sheet.scrollTop = 0;
        thumbnail.focus({preventScroll:true});
    }
    function finishEditor(focus) {
        if (!editing) return;
        thumbnailDrag = null; relocating = false; content.inert = false; editing = false;
        sheet.classList.remove('location-editing');
        byId('point-place').prepend(thumbnail);
        byId('point-editor').hidden = true;
        byId('point-place').hidden = false; content.hidden = false;
        thumbnail.style.height = '';
        thumbnail.setAttribute('role', 'button');
        thumbnail.setAttribute('aria-label', 'Enlarge map to adjust location');
        thumbnail.setAttribute('aria-expanded', 'false');
        byId('point-close').setAttribute('aria-label', 'Back to maps');
        byId('point-close').textContent = '← Maps';
        byId('point-thumb-dot').setAttribute('r', '4');
        byId('point-thumb-outline').setAttribute('r', '7');
        thumbHeight = thumbWidth * 102 / 92;
        if (selection) {
            setThumbnailCenter(selection.point[0] * 900, selection.point[1] * 675);
            applyPresentation();
            drawGraphs(); choose(selectedHour, false);
        }
        placeSheet(); sheet.scrollTop = editorScroll;
        if (focus !== false) thumbnail.focus({preventScroll:true});
    }
    function confirmEditor() {
        if (!editing || !selection || editorCandidate < 0) return;
        var point = selection.index.points[editorCandidate];
        finishEditor();
        setThumbnailCenter(point[0] * 900, point[1] * 675);
        commitThumbnail(point[0] * 900, point[1] * 675);
    }
    thumbnail.addEventListener('click', function () { if (!editing) beginEditor(); });
    byId('point-edit-cancel').addEventListener('click', function () { finishEditor(); });
    byId('point-edit-use').addEventListener('click', confirmEditor);
    function cancelThumbnail() {
        if (!thumbnailDrag) return;
        var drag = thumbnailDrag;
        sequence++;
        thumbnailDrag = null; relocating = false; content.inert = false;
        if (selection) setThumbnailCenter(drag.cx, drag.cy);
        message.textContent = ''; updateDraft();
    }
    async function commitThumbnail(x, y) {
        if (!selection) return;
        var saved = selection, hour = selectedHour, request = ++sequence;
        var best = nearest(saved.index, x, y);
        if (best < 0) {
            relocating = false; content.inert = false;
            setThumbnailCenter(saved.point[0] * 900, saved.point[1] * 675);
            message.textContent = 'No sea data there. Try a nearby sea location.';
            return;
        }
        relocating = true; content.inert = true;
        message.textContent = 'Loading this sea point…';
        try {
            await loadLocation(saved.index, best, saved.snapshot, saved.quantity, hour, request);
        } catch (error) {
            if (request !== sequence) return;
            relocating = false; content.inert = false;
            message.textContent = error.message;
            if (selection) setThumbnailCenter(selection.point[0] * 900, selection.point[1] * 675);
        }
    }
    thumbnail.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    thumbnail.addEventListener('pointerdown', function (e) {
        if (!editing || !selection || e.button !== 0 || pointers.size > 1 || thumbnailDrag) return;
        sequence++; // Supersede a previous location request, retaining its last valid data.
        relocating = false; content.inert = false; message.textContent = '';
        thumbnailDrag = {id:e.pointerId, x:e.clientX, y:e.clientY,
            cx:Number(byId('point-thumb-dot').getAttribute('cx')), cy:Number(byId('point-thumb-dot').getAttribute('cy')), moved:false};
        try { thumbnail.setPointerCapture(e.pointerId); } catch (_) { /* Synthetic browser checks have no native capture. */ }
        e.preventDefault();
    });
    thumbnail.addEventListener('pointermove', function (e) {
        var drag = thumbnailDrag;
        if (!drag || drag.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) * viewportScale() > 3) drag.moved = true;
        if (!drag.moved) return;
        var rect = thumbnail.getBoundingClientRect();
        setThumbnailCenter(drag.cx - (e.clientX - drag.x) * thumbWidth / rect.width,
            drag.cy - (e.clientY - drag.y) * thumbHeight / rect.height);
        updateDraft();
    });
    thumbnail.addEventListener('pointerup', function (e) {
        if (!thumbnailDrag || thumbnailDrag.id !== e.pointerId) return;
        var moved = thumbnailDrag.moved;
        thumbnailDrag = null;
        if (moved) updateDraft();
    });
    thumbnail.addEventListener('pointercancel', cancelThumbnail);
    thumbnail.addEventListener('lostpointercapture', cancelThumbnail);
    thumbnail.addEventListener('keydown', function (e) {
        if (!selection) return;
        if (!editing && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault(); e.stopPropagation(); beginEditor(); return;
        }
        if (!editing) return;
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmEditor(); return; }
        var dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -4;
        else if (e.key === 'ArrowRight') dx = 4;
        else if (e.key === 'ArrowUp') dy = -4;
        else if (e.key === 'ArrowDown') dy = 4;
        else return;
        e.preventDefault(); e.stopPropagation();
        var x = Number(byId('point-thumb-dot').getAttribute('cx')) + dx, y = Number(byId('point-thumb-dot').getAttribute('cy')) + dy;
        setThumbnailCenter(x, y); updateDraft();
    });
    var colors = ['#8cc9f3', '#69d9c1', '#b6a2ef'];
    var quantities = ['Wind', 'Waves', 'Swell'];
    quantities.forEach(function (label, i) {
        var button = document.createElement('button');
        button.type = 'button';
        button.dataset.quantity = i;
        button.setAttribute('aria-controls', 'point-graphs');
        button.setAttribute('aria-label', 'Show ' + label.toLowerCase() + ' graph');
        button.style.setProperty('--point-color', colors[i]);
        byId('point-reading').appendChild(button);
    });
    byId('point-reading').addEventListener('click', function (e) {
        var button = e.target.closest('button[data-quantity]');
        if (!selection || relocating || !button) return;
        selection.quantity = Number(button.dataset.quantity);
        drawGraphs();
        choose(selectedHour, false);
        placeSheet();
        persistView();
    });
    function sunlightSvg() {
        var first = Date.parse(selection.index.times[0]), last = Date.parse(selection.index.times[selection.index.times.length - 1]);
        var paddingMs = graphPadding / 8 * 3600000;
        var light = solarRange(paddingMs);
        var fills = {daylight:'#181b1f', twilight:'#242629', night:'#303236'}, svg = '';
        light.bands.forEach(function (band) {
            var x = graphPadding + (band.start - first) / 3600000 * 8;
            var width = (band.end - band.start) / 3600000 * 8;
            svg += '<rect data-light="' + band.phase + '" x="' + x + '" y="' + plotTop + '" width="' + width + '" height="' + plotHeight + '" fill="' + fills[band.phase] + '"><title>' + band.phase + '</title></rect>';
        });
        light.events.forEach(function (event) {
            if (event.type !== 'sunrise' && event.type !== 'sunset' || event.time < first || event.time > last) return;
            var x = graphPadding + (event.time - first) / 3600000 * 8, date = new Date(event.time);
            var label = (event.type === 'sunrise' ? '↑ ' : '↓ ') + pad(date.getHours()) + ':' + pad(date.getMinutes());
            svg += '<g data-solar-event="' + event.type + '" data-time="' + event.time + '"><title>' + event.type + ' · ' + fmtLocal(date) + '</title>';
            svg += '<path d="M' + x + ' ' + plotTop + 'V' + plotBottom + '" stroke="#c2c6cc" stroke-opacity=".65" stroke-dasharray="2 4"/>';
            svg += '<text x="' + x + '" y="' + (event.type === 'sunrise' ? 13 : 28) + '" text-anchor="middle" fill="#c2c6cc" font-size="10">' + label + '</text></g>';
        });
        return svg;
    }
    function drawGraphs() {
        if (!selection || detailView === 'table' || editing) return;
        var n = selection.values.length;
        graphViewportWidth = graph.clientWidth;
        graphHeight = fullView ? Math.max(200, byId('point-chart').clientHeight) : 282;
        plotBottom = graphHeight - 38; plotHeight = plotBottom - plotTop;
        // Half a viewport on either side lets both end hours reach the fixed
        // centre line. Scroll distance is exactly eight pixels per hour.
        graphPadding = graphViewportWidth / 2;
        graphWidth = graphViewportWidth + (n - 1) * 8;
        var row = selection.quantity, field = row * 2;
        updateTitle();
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + graphWidth + '" height="' + graphHeight + '" aria-label="Hourly ' + quantities[row].toLowerCase() + ' forecast">';
        svg += sunlightSvg();
        var peak = Math.max(row ? .5 : 1, ...selection.values.map(function (v) { return v[field] || 0; })) * 1.05;
        var magnitude = Math.pow(10, Math.floor(Math.log10(peak / 4)));
        var step = [1, 2, 2.5, 5, 10].find(function (v) { return v * magnitude >= peak / 4; }) * magnitude;
        var max = Math.ceil(peak / step) * step;
        var axis = '<text x="8" y="18" fill="' + colors[row] + '" font-size="11">' + (row ? 'm' : 'm/s') + '</text>';
        for (var v = 0; v <= max + step / 2; v += step) {
            var y = plotBottom - v / max * plotHeight;
            svg += '<path d="M0 ' + y + 'H' + graphWidth + '" stroke="#333b44" stroke-width=".6"/>';
            axis += '<text x="28" y="' + (y + 3) + '" text-anchor="end" fill="#939eaa" font-size="10">' + (+v.toFixed(2)) + '</text>';
        }
        var path = '', connected = false;
        selection.values.forEach(function (v, h) {
            if (v[field] === null) { connected = false; return; }
            path += (connected ? 'L' : 'M') + (graphPadding + h * 8) + ' ' + (plotBottom - v[field] / max * plotHeight) + ' ';
            connected = true;
        });
        svg += '<path data-series="' + row + '" d="' + path + '" stroke="' + colors[row] + '" fill="none" stroke-width="2"/>';
        selection.index.times.forEach(function (t, h) {
            var date = new Date(t);
            if (h % 12 !== 0) return;
            var x = graphPadding + h * 8;
            svg += '<path d="M' + x + ' ' + plotTop + 'V' + plotBottom + '" stroke="#758393" stroke-opacity=".22"/>';
            svg += '<text x="' + x + '" y="' + (graphHeight - 8) + '" text-anchor="middle" fill="#aeb8c4" font-size="10">' + date.getDate() + '/' + (date.getMonth() + 1) + ' ' + pad(date.getHours()) + ':00</text>';
        });
        // Paint the time marker in the same SVG as the bands and curve. This
        // avoids a separate composited HTML layer inside a counter-scaled modal.
        svg += '<rect id="point-cursor-back" x="0" y="' + plotTop + '" width="4" height="' + plotHeight + '" fill="#0009" aria-hidden="true"/>';
        svg += '<rect id="point-cursor" x="0" y="' + plotTop + '" width="2" height="' + plotHeight + '" fill="white" aria-hidden="true"/></svg>';
        graph.innerHTML = svg;
        byId('point-axis').innerHTML = axis;
        byId('point-axis').style.height = graphHeight + 'px';
        positionCursor();
    }
    function positionCursor() {
        if (!byId('point-cursor')) return;
        var x = graphPadding + graph.scrollLeft;
        byId('point-cursor-back').setAttribute('x', x - 2);
        byId('point-cursor').setAttribute('x', x - 1);
    }
    function choose(hour, updateMaps, alignGraph) {
        if (!selection || relocating) return;
        if (!forecast || forecast.imageBase !== selection.snapshot.imageBase) {
            content.hidden = true;
            message.textContent = 'The forecast updated. Close and select the location again.';
            return;
        }
        hour = Math.max(0, Math.min(selection.values.length - 1, Math.round(hour)));
        selectedHour = hour;
        var date = new Date(selection.index.times[hour]);
        byId('point-time').textContent = fmtLocal(date);
        graph.setAttribute('aria-valuenow', String(hour));
        graph.setAttribute('aria-valuetext', fmtLocal(date));
        byId('point-prev').disabled = hour === 0;
        byId('point-next').disabled = hour === selection.values.length - 1;
        var values = selection.values[hour], reading = byId('point-reading');
        quantities.forEach(function (label, i) {
            var value = values[i * 2], direction = values[i * 2 + 1];
            var arrow = direction === null ? '' : ' ' + directionArrow(direction);
            var cell = reading.children[i], strong = document.createElement('strong');
            cell.textContent = label;
            cell.setAttribute('aria-pressed', String(i === selection.quantity));
            strong.textContent = value === null ? 'No data' : value.toFixed(1) + (i ? ' m' : ' m/s') + arrow;
            cell.setAttribute('aria-label', label + ': ' + strong.textContent + '. Show ' + label.toLowerCase() + ' graph');
            strong.title = 'Arrows show direction of travel';
            cell.appendChild(strong);
        });
        var type = ['win', 'hs', 'hsw'][selection.quantity];
        byId('point-thumb-image').setAttribute('href', selection.snapshot.imageBase + selection.snapshot.frames[hour].files[type]);
        byId('point-thumbnail').dataset.hour = hour;
        byId('point-table').querySelectorAll('tr[aria-selected="true"]').forEach(function (row) { row.removeAttribute('aria-selected'); });
        var tableSelected = byId('point-table').querySelector('tr[data-hour="' + hour + '"]');
        if (tableSelected) tableSelected.setAttribute('aria-selected', 'true');
        if (alignGraph !== false) graph.scrollLeft = hour * 8;
        positionCursor();
        if (updateMaps) {
            // Keep the readout responsive during a fling, and request maps
            // once the user briefly pauses instead of decoding every hour.
            clearTimeout(mapTimer);
            mapTimer = setTimeout(function () {
                mapTimer = null;
                if (selection && sheet.open) show(selectedHour + 1);
            }, 120);
        }
        persistView();
    }
    byId('point-prev').addEventListener('click', function () { choose(selectedHour - 1, true); });
    byId('point-next').addEventListener('click', function () { choose(selectedHour + 1, true); });
    graph.addEventListener('scroll', function () {
        // Match native scroll immediately, even before the readout's next frame.
        positionCursor();
        if (graphScrollFrame !== null) return;
        graphScrollFrame = requestAnimationFrame(function () {
            graphScrollFrame = null;
            if (!selection || relocating || !sheet.open || content.hidden) return;
            var hour = Math.round(graph.scrollLeft / 8);
            if (hour !== selectedHour) choose(hour, true, false);
        });
    }, {passive:true});
    graph.addEventListener('keydown', function (e) {
        var hour = selectedHour;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') hour--;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') hour++;
        else if (e.key === 'Home') hour = 0;
        else if (e.key === 'End') hour = selection ? selection.values.length - 1 : 0;
        else if (e.key === 'PageDown') hour += 12;
        else if (e.key === 'PageUp') hour -= 12;
        else return;
        e.preventDefault();
        choose(hour, true);
    });
    new ResizeObserver(function () {
        if (selection && sheet.open && !content.hidden && detailView === 'graph' && (graph.clientWidth !== graphViewportWidth || fullView && graph.clientHeight !== graphHeight)) {
            drawGraphs();
            choose(selectedHour, false);
        }
    }).observe(graph);
    // Distinguish a graph tap from a horizontal swipe.
    var graphDown;
    byId('point-graphs').addEventListener('pointerdown', function (e) { graphDown = {x:e.clientX,y:e.clientY}; });
    byId('point-graphs').addEventListener('pointercancel', function () { graphDown = null; });
    byId('point-graphs').addEventListener('pointerup', function (e) {
        if (!graphDown || Math.hypot(e.clientX - graphDown.x, e.clientY - graphDown.y) * viewportScale() > 8) return;
        graphDown = null;
        var graph = byId('point-graphs');
        var rect = graph.getBoundingClientRect(), ratio = rect.width / graph.offsetWidth;
        choose(((e.clientX - rect.left) / ratio + graph.scrollLeft - graph.clientLeft - graphPadding) / 8, true);
    });
    // Delegate to wrappers because the viewer replaces image nodes each hour.
    var pointers = new Set(), press = null, timer = null;
    function cancel() { clearTimeout(timer); timer = null; press = null; }
    document.querySelectorAll('.imgwrap').forEach(function (wrap) {
        wrap.tabIndex = 0;
        wrap.setAttribute('role', 'button');
        wrap.setAttribute('aria-label', 'Hourly location forecast. Hold a sea location, or press Enter for the map centre.');
        wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        wrap.addEventListener('dragstart', function (e) { e.preventDefault(); });
        wrap.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || pointers.size > 1) return;
            var image = wrap.querySelector('img');
            if (!image.complete || !image.naturalWidth) return;
            cancel();
            press = {id:e.pointerId, x:e.clientX, y:e.clientY, image:image, fired:false};
            timer = setTimeout(function () {
                if (!press) return;
                press.fired = true;
                openPoint(press.image, press.x, press.y);
            }, 500);
        });
        wrap.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault(); e.stopPropagation();
            var image = wrap.querySelector('img'), r = imageRect(image);
            openPoint(image, r.left + r.width * .49, r.top + r.height * .57);
        });
        new MutationObserver(function () {
            syncCoastline();
            restoreView();
            if (!selection || !sheet.open || !displayedFrame) return;
            if (displayedFrame.snapshot.imageBase !== selection.snapshot.imageBase) {
                if (editing) finishEditor(false);
                sequence++;
                thumbnailDrag = null; relocating = false; content.inert = false;
                clearTimeout(mapTimer); mapTimer = null;
                selection = null;
                content.hidden = true;
                message.textContent = 'The forecast updated. Close and select the location again.';
                document.querySelectorAll('.point-marker').forEach(function (m) { m.remove(); });
            }
        }).observe(wrap, {childList:true});
    });
    document.addEventListener('pointerdown', function (e) {
        pointers.add(e.pointerId);
        if (pointers.size > 1) { cancel(); cancelThumbnail(); }
    }, true);
    document.addEventListener('pointermove', function (e) {
        if (press && press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) * viewportScale() > 10) cancel();
    }, {passive:true});
    document.addEventListener('pointerup', function (e) {
        pointers.delete(e.pointerId);
        // A mouse click also works; touch requires the deliberate hold.
        if (press && press.id === e.pointerId && !press.fired && e.pointerType === 'mouse') openPoint(press.image, press.x, press.y);
        cancel();
    });
    document.addEventListener('pointercancel', function (e) { pointers.delete(e.pointerId); cancel(); });
    window.addEventListener('scroll', cancel, {passive:true});
    window.addEventListener('blur', function () { pointers.clear(); cancel(); cancelThumbnail(); });
    window.addEventListener('resize', function () { if (selection && sheet.open) marker(selection.point); });
    var mapScrollTimer = null;
    window.addEventListener('scroll', function () {
        if (sheet.open || restoring) return;
        clearTimeout(mapScrollTimer);
        mapScrollTimer = setTimeout(function () {
            var centre = viewport ? viewport.offsetTop + viewport.height / 2 : innerHeight / 2, best = Infinity;
            document.querySelectorAll('.imgwrap > img[id^="img-"]').forEach(function (image, i) {
                var rect = image.getBoundingClientRect(), distance = Math.abs(rect.top + rect.height / 2 - centre);
                if (distance < best) { best = distance; mapQuantity = ['wind', 'waves', 'swell'][i]; }
            });
            persistView();
        }, 200);
    }, {passive:true});
    // Keep the page's global map shortcuts from intercepting sheet controls.
    sheet.addEventListener('keydown', function (e) { if (e.key !== 'Escape') e.stopPropagation(); });
    syncCoastline();
    applyPresentation();
    restoreView();
})();
