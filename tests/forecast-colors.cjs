const assert=require('node:assert/strict'),colors=require('../forecast-colors.js');
for(const [q,key] of [[0,'wind'],[1,'wave'],[2,'wave']]){
 const s=colors.scales[key];
 for(let i=0;i<s.colors.length;i++){
  assert.equal(colors.color(q,s.levels[i]),s.colors[i]);
  assert.equal(colors.color(q,(s.levels[i]+s.levels[i+1])/2),s.colors[i]);
  assert.equal(colors.color(q,s.levels[i+1]-.00001),s.colors[i]);
 }
 assert.equal(colors.color(q,s.levels.at(-1)),s.over);
 const stops=colors.stops(q,s.levels.at(-1)*1.1);
 assert.equal(stops[0].offset,0);assert.equal(stops.at(-1).offset,1);
 for(const value of s.levels.slice(1))assert.equal(stops.filter(x=>Math.abs(x.offset-value/(s.levels.at(-1)*1.1))<1e-10).length,2);
}
assert.equal(colors.color(0,null),null);assert.equal(colors.color(1,NaN),null);
console.log('Forecast color checks passed: shared wind/wave/swell thresholds, exact boundaries, over-range values and hard gradient transitions.');
