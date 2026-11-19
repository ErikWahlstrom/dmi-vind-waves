const assert=require('node:assert/strict'),state=require('../viewer-state.js');
const original={point:{lat:59.2,lon:20.833333},map:'waves',quantity:'swell',view:'table',detail:true,full:true,row:24,time:'now'};
const link=state.write('https://example.test/?preview=point&other=keep#time=2020-01-01T00:00:00Z',original);
assert.deepEqual(state.read(link),{...original,invalidPoint:false});
assert.ok(!new URL(link).searchParams.has('preview'));
assert.equal(new URL(link).searchParams.get('other'),'keep');
assert.equal(new URL(link).hash,'');
const exact=state.write(link,{...original,row:null,time:'2026-11-19T06:00:00Z'});
assert.equal(state.read(exact).time,'2026-11-19T06:00:00Z');
assert.equal(state.read(exact).row,null);
assert.equal(state.read('https://example.test/#time=2026-11-19T07:00:00+01:00').time,'2026-11-19T07:00:00+01:00');
assert.equal(state.read('https://example.test/?time=now#time=2026-11-19T06:00:00Z').time,'now');
for(const bad of ['lat=91&lon=20','lat=59&lon=NaN','lat=&lon=20','lat=59','lat=1e9&lon=20']) {
 const parsed=state.read('https://example.test/?'+bad);
 assert.equal(parsed.point,null);assert.equal(parsed.detail,false);assert.equal(parsed.invalidPoint,true);
}
const invalid=state.read('https://example.test/?view=script&map=script&quantity=script&full=yes&row=-5');
assert.equal(invalid.view,'graph');assert.equal(invalid.map,'wind');assert.equal(invalid.quantity,'wind');
assert.equal(invalid.full,false);assert.equal(invalid.row,null);
assert.equal(state.read(state.write(link,{...original,detail:false})).detail,false);
console.log('URL state checks passed: portable live/fixed links, all views, coordinates, map, quantity, row, and invalid input.');
assert.equal(state.read('https://example.test/?view=live').view,'live');
assert.equal(state.read('https://example.test/?view=live').detail,true);
assert.equal(state.read('https://example.test/?view=live&detail=0').detail,false);
