const assert=require('node:assert/strict'),history=require('../live-history.js');
const hour=3600000,now=Date.UTC(2026,10,19,9,30),stamp=Date.UTC(2026,10,19,9);
function data(key,unit,values,id='1'){return {station:{key:id},parameter:{key,unit},value:values};}
function r(value,date,quality='G'){return {value:String(value),date,quality};}
const parsed=history.parse(data(4,'meter per sekund',[r(5,stamp),r(7,stamp+600000,'Y'),r(6,stamp+300000),r(8,stamp-2*hour),r(50,stamp-26*hour),r(100,stamp),r(1,now+hour),r('',stamp)]),'met-1','wind',now);
assert.equal(parsed[stamp].value,7);assert.equal(parsed[stamp].provisional,true);assert.equal(parsed[stamp].time,stamp+600000);
assert.equal(Object.keys(parsed).length,2);
const rows=history.rows({wind:parsed},now);assert.equal(rows.length,24);assert.equal(rows[0].readings.wind.value,7);assert.deepEqual(rows[1].readings,{});assert.equal(rows[2].readings.wind.value,8);
assert.deepEqual(history.parse(data(14,'cm',[r(12,stamp,'Y')]),'sea-1','level',now),{});
assert.equal(history.parse(data(14,'cm',[r(-12,stamp,'O')]),'sea-1','level',now)[stamp].value,-12);
assert.throws(()=>history.parse(data(4,'km/h',[]),'met-1','wind',now));
assert.throws(()=>history.parse(data(4,'meter per sekund',[],'2'),'met-1','wind',now));
assert.deepEqual(history.rows({},now),[]);
(async()=>{
 const original=global.fetch,realNow=Date.now;Date.now=()=>now;let calls=0,active=0;
 global.fetch=async url=>{calls++;assert.equal(++active,1,'History requests overlap');await new Promise(r=>setTimeout(r,1));active--;if(url.includes('/parameter/7/'))return new Response('',{status:404});return new Response(JSON.stringify(data(1,'m',[r(1.3,stamp)],'2')));};
 try{
  const station={id:'sea-2',readings:{wave:{value:1.3,time:stamp},waveDirection:{value:90,time:stamp}}};
  const result=await history.load(station);assert.equal(result.rows[0].readings.wave.value,1.3);assert.deepEqual(result.unavailable,['waveDirection']);
  await history.load(station);assert.equal(calls,2,'Cached station history downloaded again');
  await history.load(station,{force:true});assert.equal(calls,4);
  const controller=new AbortController();controller.abort();await assert.rejects(history.load({...station,id:'sea-3'},{signal:controller.signal}),{name:'AbortError'});
 }finally{global.fetch=original;Date.now=realNow;}
 console.log('History checks passed: hourly latest sample, gaps, quality, units, station identity, partial failures, sequential loading, cache and cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
