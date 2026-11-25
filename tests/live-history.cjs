const assert=require('node:assert/strict'),history=require('../live-history.js');
const hour=3600000,now=Date.UTC(2026,10,19,9,30),stamp=Date.UTC(2026,10,19,9);
function data(key,unit,values,id='1'){return {station:{key:id},parameter:{key,unit},value:values};}
function r(value,date,quality='G'){return {value:String(value),date,quality};}
const parsed=history.parse(data(4,'meter per sekund',[r(7,stamp+600000),r(5,stamp,'Y'),r(6,stamp+300000),r(8,stamp-2*hour),r(50,stamp-26*hour),r(100,stamp),r(1,now+hour),r('',stamp)]),'met-1','wind',now);
assert.equal(parsed[stamp].value,5);assert.equal(parsed[stamp].provisional,true);assert.equal(parsed[stamp].time,stamp);
assert.equal(Object.keys(parsed).length,2);
const rows=history.rows({wind:parsed},now);assert.equal(rows.length,24);assert.equal(rows[0].readings.wind.value,5);assert.deepEqual(rows[1].readings,{});assert.equal(rows[2].readings.wind.value,8);
assert.deepEqual(history.parse(data(14,'cm',[r(12,stamp,'Y')]),'sea-1','level',now),{});
assert.equal(history.parse(data(14,'cm',[r(-12,stamp,'O')]),'sea-1','level',now)[stamp].value,-12);
assert.throws(()=>history.parse(data(4,'km/h',[]),'met-1','wind',now));
assert.throws(()=>history.parse(data(4,'meter per sekund',[],'2'),'met-1','wind',now));
assert.deepEqual(history.rows({},now),[]);
const temperature=history.parse(data(5,'°C',[{...r(6.1,stamp,'O'),depth:'0'},{...r(9,stamp+1000),depth:'5'},r(8,stamp+2000)]),'sea-1','temperature',now);
assert.equal(temperature[stamp].value,6.1);

assert.equal(history.vivaTime('2026-11-19 10:00:00'),stamp);
assert.equal(history.vivaTime('2026-07-19 10:00:00'),Date.UTC(2026,6,19,8));
for(const t of ['2026-10-25 02:30:00','2026-03-29 02:30:00','2026-02-30 10:00:00','bad'])assert.ok(Number.isNaN(history.vivaTime(t)));
const vh=(samples,ref=null)=>({GetHistoryResult:{StationHistory:samples,WaterLevelRef:ref,Felmeddelande:null}});
const vr=(value,time='2026-11-19 10:00:00')=>({Value:value,Time:time});
const vb=history.parseViva(vh([vr('5,4'),vr('5.5','2026-11-19 10:10:00'),vr('-'),vr('99'),vr('4','2026-11-18 01:00:00')]),'temperature',now);
assert.equal(vb[stamp].value,5.4);assert.equal(vb[stamp].provisional,true);assert.equal(vb[stamp].source,'viva');
assert.throws(()=>history.parseViva(vh([vr('25')],'RH2000'),'level',now));
assert.equal(history.parseViva(vh([vr('25')],'MVY'),'level',now)[stamp].value,25);
(async()=>{
 const original=global.fetch,realNow=Date.now;Date.now=()=>now;let calls=0,active=0;
 global.fetch=async url=>{calls++;assert.equal(++active,1,'History requests overlap');await new Promise(r=>setTimeout(r,1));active--;if(url.includes('/parameter/7/'))return new Response('',{status:404});return new Response(JSON.stringify(data(1,'m',[r(1.3,stamp)],'2')));};
 try{
  const station={id:'sea-2',readings:{wave:{value:1.3,time:stamp},waveDirection:{value:90,time:stamp}}};
 const result=await history.load(station);assert.equal(result.rows[0].readings.wave.value,1.3);assert.equal(result.latest.wave.time,stamp);assert.deepEqual(result.unavailable,['waveDirection']);
  await history.load(station);assert.equal(calls,2,'Cached station history downloaded again');
  await history.load(station,{force:true});assert.equal(calls,4);
  const urls=[];
  global.fetch=async url=>{urls.push(url);return new Response(JSON.stringify(url.includes('vivaoutputservice')?vh([vr('5.4')]):data(14,'cm',[r(23,stamp)],'35119')));};
  const merged={id:'sea-35119',vivaId:'33',readings:{level:{value:23,time:stamp},temperature:{value:5.4,time:stamp,source:'viva'}}};
  const mixed=await history.load(merged);assert.equal(mixed.rows[0].readings.temperature.value,5.4);assert.equal(mixed.rows[0].readings.level.value,23);
  assert.ok(urls.some(u=>u.includes('/station/35119/')));assert.ok(urls.some(u=>u.includes('/ViVaStationHistory/Vattentemp/33?')));
  await history.load({id:'viva-33',readings:{temperature:{value:5.4,time:stamp,source:'viva'}}});
  assert.equal(urls.filter(u=>u.includes('vivaoutputservice')).length,2);
  const controller=new AbortController();controller.abort();await assert.rejects(history.load({...station,id:'sea-3'},{signal:controller.signal}),{name:'AbortError'});
 }finally{global.fetch=original;Date.now=realNow;}
 console.log('History checks passed: first valid hourly sample, gaps, quality, units, station identity, partial failures, sequential loading, cache and cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
