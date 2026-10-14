const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const imageRequests = [];
const timers = [], backgroundImages = [];
const windowEvents = {};
let historyWrites = 0;
class PrefetchImage {
    constructor() { backgroundImages.push(this); }
    set src(value) { this.imageSrc = value; }
}
function element(id) {
    if (!elements.has(id)) elements.set(id, {
        textContent: '', style: {}, hidden: true,
        classList: { toggle() {}, add() {}, remove() {} },
        parentElement: { classList: { toggle() {}, remove() {} } },
        set src(value) { this.imageSrc = value; imageRequests.push(value); },
        get src() { return this.imageSrc; },
        getAttribute(name) { return this[name]; }, addEventListener() {}
    });
    return elements.get(id);
}
const context = vm.createContext({
    document: { getElementById: element, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener(name, fn) { windowEvents[name] = fn; }, matchMedia: () => ({}) },
    location: new URL('https://erikwahlstrom.github.io/dmi-vind-waves/?debug=1#time=2026-10-13T19:00:00Z'),
    history: { state: null, replaceState(state, title, href) { context.location.href = href; historyWrites++; } },
    localStorage: { getItem: () => null }, setInterval() {},
    setTimeout(fn) { timers.push(fn); return fn; },
    clearTimeout(fn) { const i = timers.indexOf(fn); if (i >= 0) timers.splice(i, 1); },
    URL, URLSearchParams, Image: PrefetchImage, Date, console
});
const source = fs.readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
vm.runInContext(source, context);
const data = {
    schema: 2, checked: '2026-10-14T06:00:00Z',
    imageBase: `https://raw.githubusercontent.com/ErikWahlstrom/dmi-vind-waves/${'a'.repeat(40)}/plots/`,
    frames: [0, 1, 4].map((h, i) => ({
        published: '2026-10-13T21:30:00Z',
        time: new Date(Date.parse('2026-10-13T18:00:00Z') + h * 3600000).toISOString(),
        files: Object.fromEntries(['win', 'hs', 'hsw'].map(t => [t, `${t}.ba.${i + 1}.png`]))
    }))
};
context.validateForecast(data);
assert.throws(() => context.validateForecast({ schema: 1 }));
assert.throws(() => context.validateForecast({...data, imageBase: 'https://ocean.dmi.dk/anim/plots/'}));
assert.throws(() => context.validateForecast({...data, frames: [...data.frames].reverse()}));
context.labels.push(element('label'));
context.fills.push(element('fill'));
context.refreshRun(data);
assert.equal(context.idx, 2); // a shared URL selects the requested UTC time
assert.equal(imageRequests.length, 3); // only the selected wind/wave/swell images
context.show(context.idx);
assert.equal(imageRequests.length, 3); // repeated selection does not re-request
context.show(context.idx === 3 ? 1 : 3);
assert.equal(imageRequests.length, 6); // only three more images when scrubbing
context.show(3);
assert.equal(historyWrites, 0); // scrubbing does not flood browser history
context.writeTimeUrl();
assert.equal(context.location.hash, '#time=2026-10-13T22:00:00Z');
assert.equal(context.location.search, '?debug=1'); // preserve existing query parameters
assert.equal(historyWrites, 1);
context.writeTimeUrl();
assert.equal(historyWrites, 1); // no repeated writes for the same selection
assert.equal(element('label').textContent, context.fmtLocal(new Date(data.frames[2].time)) + ' · 22 GMT'); // actual timestamp, not frame number
assert.equal(element('img-win').src, data.imageBase + 'win.ba.3.png');
assert.equal(element('fill').style.width, '100%');
const next = structuredClone(data);
next.imageBase = next.imageBase.replace('a'.repeat(40), 'b'.repeat(40));
next.frames.shift();
context.refreshRun(next);
assert.equal(context.idx, 2); // same wall-clock forecast survives a run update
assert.equal(element('label').textContent, context.fmtLocal(new Date(data.frames[2].time)) + ' · 22 GMT');
context.show(999);
assert.equal(context.idx, 2);
context.show(-100);
assert.equal(context.idx, 1);
assert.equal(backgroundImages.length, 0); // selected images load before background requests
const larger = structuredClone(data);
larger.imageBase = larger.imageBase.replace('a'.repeat(40), 'c'.repeat(40));
larger.frames = Array.from({length: 5}, (_, i) => ({
    ...data.frames[0], time: new Date(Date.parse(data.frames[0].time) + i * 3600000).toISOString(),
    files: Object.fromEntries(['win', 'hs', 'hsw'].map(t => [t, `${t}.ba.${i + 1}.png`]))
}));
context.refreshRun(larger);
timers.splice(0).forEach(fn => fn());
assert.equal(backgroundImages.length, 6); // bounded concurrency
assert.equal(context.prefetchState.total, 12); // remaining four sets of three
assert.ok(backgroundImages.every(im => im.imageSrc.startsWith(larger.imageBase)));
for (let i = 0; i < backgroundImages.length; i++) backgroundImages[i].onload();
assert.equal(backgroundImages.length, 12);
assert.equal(element('prefetchInfo').textContent, 'All images ready');
// A superseded snapshot must never resume its background queue or change status.
context.prefetch(larger);
const oldImages = backgroundImages.slice(-6);
context.refreshRun(next);
oldImages.forEach(im => im.onload());
assert.equal(element('prefetchInfo').textContent, '');
context.location.hash = '#time=2026-10-13T20:00:00Z';
windowEvents.hashchange();
assert.equal(context.idx, 1); // missing hour picks the closest available timestamp
assert.match(element('timeInfo').textContent, /nearest forecast/);
context.location.hash = '#time=2026-10-13T22:00:00Z';
windowEvents.hashchange();
assert.equal(context.idx, 2);
assert.equal(element('timeInfo').textContent, '');
for (const hash of ['#time=garbage', '#time=2026-02-30T12:00:00Z', '#time=2026-10-13T22:00:00', '']) {
    context.location.hash = hash;
    assert.equal(context.sharedTime(), null);
}
console.log('Timeline checks passed: shared URLs, UTC parsing, prefetching and snapshot transitions.');

(async function () {
    let requests = [];
    const latest = 'f'.repeat(40);
    context.fetch = async url => {
        requests.push(url);
        return { ok: true, json: async () => requests.length === 1 ? { object: { sha: latest } } : data };
    };
    assert.equal(await context.fetchRunInfo(), data);
    assert.match(requests[0], /api\.github\.com\/.*\/git\/ref\/heads\/data\?t=/);
    assert.equal(requests[1], context.RUNINFO_BASE + latest + '/run.json');

    requests = [];
    context.fetch = async url => {
        requests.push(url);
        return { ok: requests.length !== 1, json: async () => data };
    };
    assert.equal(await context.fetchRunInfo(), data);
    assert.match(requests[1], /\/data\/run\.json\?t=/); // availability during API rate limiting
    console.log('Manifest checks passed: current commit resolution and rate-limit fallback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
