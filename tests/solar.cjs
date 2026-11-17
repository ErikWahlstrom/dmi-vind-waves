const assert = require('node:assert/strict');
const solar = require('../solar.js');
const start = Date.parse('2013-03-05T00:00:00Z'), day = 86400000;
const result = solar.range(start, start+day, 50.5, 30.5);
// Independently published reference instants from SunCalc's tagged test suite:
// https://github.com/mourner/suncalc/blob/v1.9.0/test.js
for (const [type,time] of Object.entries({dawn:'04:02:17',sunrise:'04:34:56',sunset:'15:46:57',dusk:'16:19:36'})) {
    const event=result.events.find(e=>e.type===type);
    assert.ok(event && Math.abs(event.time-Date.parse('2013-03-05T'+time+'Z'))<1000, type);
}
assert.deepEqual(result.bands.map(b=>b.phase), ['night','twilight','daylight','twilight','night']);
function continuous(r,from,to) {
    assert.equal(r.bands[0].start,from);
    assert.equal(r.bands.at(-1).end,to);
    r.bands.forEach((b,i)=>{assert.ok(b.end>b.start);if(i)assert.equal(r.bands[i-1].end,b.start);});
}
continuous(result,start,start+day);
for (const [date,phase] of [['2026-06-21','daylight'],['2026-12-21','night']]) {
    const from=Date.parse(date+'T00:00:00Z'), r=solar.range(from,from+day,80,20);
    assert.deepEqual(r.bands.map(b=>b.phase),[phase]);
    assert.equal(r.events.length,0);
    continuous(r,from,from+day);
}
const winter=solar.range(Date.parse('2026-12-21T00:00:00Z'),Date.parse('2026-12-22T00:00:00Z'),70,20);
assert.ok(winter.bands.some(b=>b.phase==='twilight'));
assert.ok(!winter.bands.some(b=>b.phase==='daylight'), 'Polar night still has civil twilight');
const dstStart=Date.parse('2026-10-24T19:00:00Z'),dstEnd=Date.parse('2026-10-27T03:00:00Z');
continuous(solar.range(dstStart,dstEnd,59.3,18.1),dstStart,dstEnd);
const east=solar.range(start,start+day,50.5,40.5).events.find(e=>e.type==='sunrise');
assert.ok(east.time<result.events.find(e=>e.type==='sunrise').time,'Longitude changes sunrise');
console.log('Solar checks passed: reference times, civil twilight, polar day/night, longitude, and continuous UTC bands.');
