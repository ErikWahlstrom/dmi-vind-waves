const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const imageRequests = [];
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
    window: { addEventListener() {}, matchMedia: () => ({}) },
    localStorage: { getItem: () => null }, setInterval() {}, Date, console
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
assert.equal(imageRequests.length, 3); // only the selected wind/wave/swell images
context.show(context.idx);
assert.equal(imageRequests.length, 3); // repeated selection does not re-request
context.show(context.idx === 3 ? 1 : 3);
assert.equal(imageRequests.length, 6); // only three more images when scrubbing
context.show(3);
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
console.log('Timeline checks passed: actual timestamps, pinned images, validation and run transitions.');
