/* Opt-in location graphs. Data and maps always come from one immutable snapshot. */
(function () {
    'use strict';
    var style = document.createElement('style');
    style.textContent = `
      .imgwrap img { -webkit-touch-callout:none; user-select:none; -webkit-user-select:none; }
      .point-marker { position:absolute; width:12px; height:12px; margin:-8px; border:2px solid white;
        border-radius:50%; background:#172e3c; box-shadow:0 0 0 2px #172e3c; pointer-events:none; z-index:3; }
      #point-sheet { color:#eee; background:#1d2024; border:1px solid #484d52; border-radius:18px;
        position:fixed; inset:auto 8px 8px; margin:0 auto; width:calc(100% - 16px); max-width:700px;
        max-height:calc(85dvh - env(safe-area-inset-bottom,0px)); padding:14px;
        padding-bottom:calc(14px + env(safe-area-inset-bottom,0px)); box-sizing:border-box; overflow:auto; }
      #point-sheet::backdrop { background:rgba(0,0,0,.45); }
      #point-sheet header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      #point-sheet h2 { margin:0; font-size:17px; font-weight:600; }
      #point-sheet p { color:#abb2ba; font-size:12px; margin:5px 0 10px; }
      #point-sheet button { color:#eee; background:#2b3036; border:1px solid #484d52; border-radius:9px;
        min-width:44px; min-height:44px; font:inherit; }
      #point-sheet button:disabled { opacity:.4; }
      #point-place { display:flex; align-items:center; gap:12px; margin:8px 0; }
      #point-thumbnail { width:92px; height:102px; flex:none; border-radius:6px; background:#eef1f2; overflow:hidden; }
      #point-thumbnail svg { display:block; width:100%; height:100%; }
      #point-place p { margin:0; }
      #point-reading { margin:10px 0; display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
      #point-sheet #point-reading button { min-width:0; padding:8px 4px; font-size:12px; color:#abb2ba; text-align:left; }
      #point-sheet #point-reading button[aria-pressed="true"] { border-color:var(--point-color); color:var(--point-color); background:#252d36; }
      #point-reading strong { display:block; font-size:14px; color:#eee; font-weight:500; }
      #point-graphs { overflow-x:auto; overscroll-behavior-x:contain; border:1px solid #353b42;
        border-radius:9px; background:#181b1f; -webkit-overflow-scrolling:touch; }
      #point-graphs svg { display:block; max-width:none; touch-action:pan-x pan-y; }
      #point-hour { display:flex; align-items:center; gap:8px; margin-top:10px; }
      #point-hour time { flex:1; text-align:center; font-size:14px; font-variant-numeric:tabular-nums; }
      #point-sheet input { width:100%; min-height:32px; accent-color:#89b8dd; }
      #point-sheet [hidden] { display:none !important; }
      #point-preview-hint { position:fixed; top:8px; left:50%; transform:translateX(-50%); z-index:110;
        padding:9px 14px; border-radius:20px; color:white; background:#20262e; border:1px solid #626e79;
        font-size:12px; white-space:nowrap; box-shadow:0 2px 12px #0008; pointer-events:none; }
    `;
    document.head.appendChild(style);
    var hint = document.createElement('div');
    hint.id = 'point-preview-hint';
    hint.textContent = 'Preview · hold on the sea for hourly graphs';
    document.body.appendChild(hint);
    setTimeout(function () { hint.remove(); }, 12000);
    var sheet = document.createElement('dialog');
    sheet.id = 'point-sheet';
    sheet.setAttribute('aria-labelledby', 'point-title');
    sheet.innerHTML = `<header><h2 id="point-title">Hourly forecast</h2><button id="point-close" aria-label="Close hourly forecast">×</button></header>
      <div id="point-place" hidden>
        <div id="point-thumbnail"><svg xmlns="http://www.w3.org/2000/svg" viewBox="154.8 27 549 607.5" role="img" aria-label="Selected location on the Baltic map">
          <image id="point-thumb-image" width="900" height="675"/>
          <circle id="point-thumb-outline" r="19" fill="#172e3c" stroke="#172e3c" stroke-width="4" vector-effect="non-scaling-stroke"/>
          <circle id="point-thumb-dot" r="16" fill="#172e3c" stroke="white" stroke-width="2" vector-effect="non-scaling-stroke"/>
        </svg></div>
        <p id="point-location"></p>
      </div><p id="point-message" role="status"></p>
      <div id="point-content" hidden>
        <div id="point-hour"><button id="point-prev" aria-label="Previous hour">‹</button><time id="point-time"></time><button id="point-next" aria-label="Next hour">›</button></div>
        <div id="point-reading" aria-label="Choose a forecast quantity"></div><p>Swipe sideways. Tap an hour to show it on the maps.</p>
        <div id="point-graphs"></div>
        <input id="point-slider" type="range" min="0" step="1" aria-label="Location forecast hour">
        <p id="point-source"></p>
      </div>`;
    document.body.appendChild(sheet);
    var viewport = window.visualViewport, placementFrame = null;
    function viewportScale() { return viewport ? viewport.scale : 1; }
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
        sheet.style.width = Math.max(1, viewport.width * scale - 16) + 'px';
        sheet.style.maxHeight = (viewport.height * scale * .85) + 'px';
        var rect = sheet.getBoundingClientRect();
        sheet.style.left = (viewport.offsetLeft + (viewport.width - rect.width) / 2) + 'px';
        sheet.style.top = (viewport.offsetTop + viewport.height - rect.height - 8 / scale) + 'px';
    }
    function schedulePlacement() {
        if (placementFrame === null && sheet.open) placementFrame = requestAnimationFrame(placeSheet);
    }
    new ResizeObserver(schedulePlacement).observe(sheet);
    if (viewport) {
        viewport.addEventListener('resize', schedulePlacement);
        viewport.addEventListener('scroll', schedulePlacement);
    }
    window.addEventListener('resize', schedulePlacement);
    var byId = function (id) { return document.getElementById(id); };
    var content = byId('point-content'), message = byId('point-message'), slider = byId('point-slider');
    var selection = null, sequence = 0, indexCache = new Map(), tileCache = new Map();
    var graphWidth, selectedHour, closingFocus;
    function close() { sheet.close(); }
    byId('point-close').addEventListener('click', close);
    sheet.addEventListener('close', function () {
        sequence++;
        document.querySelectorAll('.point-marker').forEach(function (m) { m.remove(); });
        if (closingFocus && closingFocus.isConnected) closingFocus.focus({preventScroll:true});
    });
    function cached(cache, url) {
        if (!cache.has(url)) {
            cache.set(url, fetch(url).then(function (r) {
                if (!r.ok) throw Error('Location data could not be loaded. Close and try again.');
                return r.json();
            }).catch(function (error) { cache.delete(url); throw error; }));
            // Keep the preview bounded when a tab remains open across many runs.
            if (cache.size > 8) cache.delete(cache.keys().next().value);
        }
        return cache.get(url);
    }
    function imageRect(image) {
        var rect = image.getBoundingClientRect();
        var scale = Math.min(rect.width / 900, rect.height / 675);
        return {left:rect.left + (rect.width - 900 * scale) / 2,
            top:rect.top + (rect.height - 675 * scale) / 2, width:900 * scale, height:675 * scale};
    }
    function marker(point) {
        document.querySelectorAll('.point-marker').forEach(function (m) { m.remove(); });
        document.querySelectorAll('.imgwrap img').forEach(function (image) {
            var r = imageRect(image), parent = image.parentNode.getBoundingClientRect();
            var mark = document.createElement('span');
            mark.className = 'point-marker';
            mark.style.left = (r.left - parent.left + point[0] * r.width) + 'px';
            mark.style.top = (r.top - parent.top + point[1] * r.height) + 'px';
            image.parentNode.appendChild(mark);
        });
    }
    async function openPoint(image, clientX, clientY) {
        var rect = imageRect(image), x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
        if (x < .172 || x > .782 || y < .04 || y > .94) return;
        var snapshot = displayedFrame && displayedFrame.snapshot;
        var quantity = Math.max(0, ['img-win', 'img-hs', 'img-hsw'].indexOf(image.id));
        var request = ++sequence;
        closingFocus = image.parentNode;
        if (!sheet.open) sheet.showModal();
        hint.remove(); content.hidden = true; selection = null;
        byId('point-place').hidden = true;
        byId('point-title').textContent = 'Hourly forecast';
        byId('point-location').textContent = '';
        message.textContent = 'Loading hourly forecast…';
        placeSheet();
        try {
            if (!snapshot || snapshot.pointForecast !== 'point-index.json') {
                throw Error('Location data is being prepared. Refresh the page in a few minutes.');
            }
            var index = await cached(indexCache, snapshot.imageBase + snapshot.pointForecast);
            if (request !== sequence) return;
            if (index.schema !== 1 || index.identity !== snapshot.forecastIdentity ||
                index.times.length !== snapshot.frames.length || index.times.some(function (t, i) { return t !== snapshot.frames[i].time; })) {
                throw Error('Location data does not match these maps. Refresh and try again.');
            }
            var best = -1, distance = 9 * 9;
            index.points.forEach(function (point, i) {
                var d = Math.pow((point[0] - x) * 900, 2) + Math.pow((point[1] - y) * 675, 2);
                if (d < distance) { best = i; distance = d; }
            });
            if (best < 0) throw Error('No sea forecast here. Close and hold on a sea location.');
            var point = index.points[best];
            marker(point);
            byId('point-location').textContent = point[3].toFixed(3) + '° N, ' + point[2].toFixed(3) + '° E · nearest sea model point';
            var tile = await cached(tileCache, snapshot.imageBase + 'point-' + Math.floor(best / index.tileSize) + '.json');
            if (request !== sequence) return;
            if (tile.schema !== 1 || tile.identity !== index.identity || tile.count < 1 || tile.count > index.tileSize) throw Error('Invalid location data.');
            var binary = atob(tile.data), bytes = Uint8Array.from(binary, function (ch) { return ch.charCodeAt(0); });
            if (bytes.length !== index.times.length * tile.count * 6 * 2) throw Error('Incomplete location data.');
            var view = new DataView(bytes.buffer), local = best % index.tileSize;
            var values = index.times.map(function (_, hour) {
                return index.fields.map(function (_, field) {
                    var value = view.getUint16(((hour * tile.count + local) * 6 + field) * 2, true);
                    return value === 65535 ? null : value / index.scales[field];
                });
            });
            if (!displayedFrame || displayedFrame.snapshot.imageBase !== snapshot.imageBase) throw Error('The forecast updated. Close and select the location again.');
            selection = {snapshot:snapshot, index:index, values:values, point:point, quantity:quantity};
            message.textContent = ''; content.hidden = false;
            byId('point-place').hidden = false;
            ['point-thumb-outline', 'point-thumb-dot'].forEach(function (id) {
                byId(id).setAttribute('cx', point[0] * 900);
                byId(id).setAttribute('cy', point[1] * 675);
            });
            slider.max = index.times.length - 1;
            byId('point-source').textContent = snapshot.provider + ' · run ' + fmtLocal(new Date(snapshot.modelRun)) + ' · model forecast';
            drawGraphs();
            choose(displayedFrame.index - 1, false);
            placeSheet();
            var graph = byId('point-graphs');
            graph.scrollLeft = Math.max(0, 38 + selectedHour * 8 - graph.clientWidth / 2);
        } catch (error) {
            if (request === sequence) {
                message.textContent = error.message;
                document.querySelectorAll('.point-marker').forEach(function (m) { m.remove(); });
            }
        }
    }
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
        if (!selection || !button) return;
        var graph = byId('point-graphs'), scroll = graph.scrollLeft;
        selection.quantity = Number(button.dataset.quantity);
        drawGraphs();
        choose(selectedHour, false);
        graph.scrollLeft = scroll;
        placeSheet();
    });
    function drawGraphs() {
        var n = selection.values.length;
        graphWidth = 52 + (n - 1) * 8;
        var row = selection.quantity, field = row * 2;
        byId('point-title').textContent = quantities[row] + ' forecast';
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + graphWidth + '" height="282" aria-label="Hourly ' + quantities[row].toLowerCase() + ' forecast">';
        var peak = Math.max(row ? .5 : 1, ...selection.values.map(function (v) { return v[field] || 0; })) * 1.05;
        var magnitude = Math.pow(10, Math.floor(Math.log10(peak / 4)));
        var step = [1, 2, 2.5, 5, 10].find(function (v) { return v * magnitude >= peak / 4; }) * magnitude;
        var max = Math.ceil(peak / step) * step;
        svg += '<text x="8" y="18" fill="' + colors[row] + '" font-size="11">' + (row ? 'm' : 'm/s') + '</text>';
        for (var v = 0; v <= max + step / 2; v += step) {
            var y = 244 - v / max * 210;
            svg += '<path d="M34 ' + y + 'H' + graphWidth + '" stroke="#333b44" stroke-width=".6"/>';
            svg += '<text x="28" y="' + (y + 3) + '" text-anchor="end" fill="#939eaa" font-size="10">' + (+v.toFixed(2)) + '</text>';
        }
        var path = '', connected = false;
        selection.values.forEach(function (v, h) {
            if (v[field] === null) { connected = false; return; }
            path += (connected ? 'L' : 'M') + (38 + h * 8) + ' ' + (244 - v[field] / max * 210) + ' ';
            connected = true;
        });
        svg += '<path data-series="' + row + '" d="' + path + '" stroke="' + colors[row] + '" fill="none" stroke-width="2"/>';
        selection.index.times.forEach(function (t, h) {
            var date = new Date(t);
            if (h % 12 !== 0) return;
            var x = 38 + h * 8;
            svg += '<path d="M' + x + ' 34V244" stroke="#758393" stroke-opacity=".22"/>';
            svg += '<text x="' + x + '" y="274" text-anchor="middle" fill="#aeb8c4" font-size="10">' + date.getDate() + '/' + (date.getMonth() + 1) + ' ' + pad(date.getHours()) + ':00</text>';
        });
        svg += '<path id="point-cursor" d="M38 34V244" stroke="white" stroke-width="1.3"/></svg>';
        byId('point-graphs').innerHTML = svg;
    }
    function choose(hour, updateMaps) {
        if (!selection) return;
        if (!forecast || forecast.imageBase !== selection.snapshot.imageBase) {
            content.hidden = true;
            message.textContent = 'The forecast updated. Close and select the location again.';
            return;
        }
        hour = Math.max(0, Math.min(selection.values.length - 1, Math.round(hour)));
        selectedHour = hour; slider.value = hour;
        var date = new Date(selection.index.times[hour]);
        byId('point-time').textContent = fmtLocal(date);
        slider.setAttribute('aria-valuetext', fmtLocal(date));
        byId('point-prev').disabled = hour === 0;
        byId('point-next').disabled = hour === selection.values.length - 1;
        var values = selection.values[hour], reading = byId('point-reading');
        quantities.forEach(function (label, i) {
            var value = values[i * 2], direction = values[i * 2 + 1];
            var arrow = direction === null ? '' : ' ' + ['↓','↙','←','↖','↑','↗','→','↘'][Math.round(direction / 45) % 8];
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
        var x = 38 + hour * 8;
        byId('point-cursor').setAttribute('d', 'M' + x + ' 34V244');
        if (updateMaps) {
            var graph = byId('point-graphs');
            if (x < graph.scrollLeft + 35 || x > graph.scrollLeft + graph.clientWidth - 15) {
                graph.scrollLeft = Math.max(0, x - graph.clientWidth / 2);
            }
            show(hour + 1);
        }
    }
    byId('point-prev').addEventListener('click', function () { choose(selectedHour - 1, true); });
    byId('point-next').addEventListener('click', function () { choose(selectedHour + 1, true); });
    slider.addEventListener('input', function () { choose(Number(slider.value), true); });
    // Distinguish a graph tap from a horizontal swipe.
    var graphDown;
    byId('point-graphs').addEventListener('pointerdown', function (e) { graphDown = {x:e.clientX,y:e.clientY}; });
    byId('point-graphs').addEventListener('pointercancel', function () { graphDown = null; });
    byId('point-graphs').addEventListener('pointerup', function (e) {
        if (!graphDown || Math.hypot(e.clientX - graphDown.x, e.clientY - graphDown.y) * viewportScale() > 8) return;
        graphDown = null;
        var graph = byId('point-graphs');
        var rect = graph.getBoundingClientRect(), ratio = rect.width / graph.offsetWidth;
        choose(((e.clientX - rect.left) / ratio + graph.scrollLeft - graph.clientLeft - 38) / 8, true);
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
            if (!selection || !sheet.open || !displayedFrame) return;
            if (displayedFrame.snapshot.imageBase !== selection.snapshot.imageBase) {
                selection = null;
                content.hidden = true;
                message.textContent = 'The forecast updated. Close and select the location again.';
                document.querySelectorAll('.point-marker').forEach(function (m) { m.remove(); });
            } else if (selectedHour !== displayedFrame.index - 1) {
                choose(displayedFrame.index - 1, false);
            }
        }).observe(wrap, {childList:true});
    });
    document.addEventListener('pointerdown', function (e) { pointers.add(e.pointerId); if (pointers.size > 1) cancel(); }, true);
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
    window.addEventListener('blur', function () { pointers.clear(); cancel(); });
    window.addEventListener('resize', function () { if (selection && sheet.open) marker(selection.point); });
    // Keep the page's global map shortcuts from intercepting sheet controls.
    sheet.addEventListener('keydown', function (e) { if (e.key !== 'Escape') e.stopPropagation(); });
})();
