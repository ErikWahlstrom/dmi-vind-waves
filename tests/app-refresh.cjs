const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('index.html','utf8').match(/<script data-app-bootstrap>([\s\S]*?)<\/script>/)[1];
function app(href,fail=false){
 const requests=[],navigations=[];
 const location={href,get origin(){return new URL(this.href).origin;},replace(url){navigations.push(url);}};
 const context={URL,location,AbortController,Date,Math,Promise,
  history:{state:{test:true},replaceState(state,unused,url){location.href=url;}},document:{addEventListener(){}},
  fetch:async(url,options)=>{requests.push({url,options});if(fail)throw Error('offline');return {};},
  setTimeout:(fn,delay)=>setTimeout(fn,delay===450?0:delay),clearTimeout};
 context.window=context;vm.runInNewContext(source,context);return {api:context.ForecastApp,location,requests,navigations};
}
(async()=>{
 const saved=app('https://example.test/site/?view=live&detail=1');assert.equal(new URL(saved.location.href).searchParams.get('mapLayer'),'live');assert.equal(new URL(saved.location.href).searchParams.get('detail'),'0');
 const details=app('https://example.test/site/?view=live&detail=1&liveTab=station&station=sea-33003');assert.equal(new URL(details.location.href).searchParams.get('view'),'live');
 const legacy=app('https://example.test/site/?view=live&mapDisplay=images');assert.equal(new URL(legacy.location.href).searchParams.get('view'),'live');
 const plain=app('https://example.test/site/?view=live&station=sea-33003&lat=60.85#time=12');
 assert.equal(plain.api.asset('live-view.js?v=6'),'live-view.js?v=6');
 const button={disabled:false,textContent:'Reload app'},pending=plain.api.reload(button);
 plain.location.href=plain.location.href.replace('60.85','60.90'); // Pending UI URL update.
 await pending;await plain.api.reload(button);
 assert.equal(plain.navigations.length,1,'Double tap must not navigate twice');
 assert.equal(plain.requests[0].options.cache,'reload');
 const navigation=new URL(plain.navigations[0]);assert.equal(navigation.searchParams.get('lat'),'60.90');assert.equal(navigation.searchParams.get('station'),'sea-33003');assert.equal(navigation.hash,'#time=12');assert(navigation.searchParams.get('_app_reload'));
 const fresh=app(navigation.href),token=navigation.searchParams.get('_app_reload');
 assert(!new URL(fresh.location.href).searchParams.has('_app_reload'),'Recovery token leaks into saved links');
 for(const file of ['live-view.js?v=6','forecast-colors.json?v=1','vendor/leaflet/leaflet.css'])assert.equal(new URL(fresh.api.asset(file)).searchParams.get('_app_reload'),token);
 assert.equal(fresh.api.asset('https://tile.openstreetmap.org/1/2/3.png'),'https://tile.openstreetmap.org/1/2/3.png','Do not alter provider URLs');
 const offline=app('https://example.test/site/?view=table',true);await offline.api.reload({});assert.equal(offline.navigations.length,1,'Failed prefetch prevents browser reload');
 console.log('App reload checks passed: document revalidation, fresh local assets, state/hash preservation, clean saved links, provider URLs, double taps and failed prefetch recovery.');
})().catch(error=>{console.error(error);process.exitCode=1;});
