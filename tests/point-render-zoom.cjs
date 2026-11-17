// Optional browser regression: PLAYWRIGHT_MODULE=/path/to/playwright node tests/point-render-zoom.cjs
// Serve the repo on :8766 with output/point-fixture (see tests/point-preview.js).
// Uses real mobile zoom where supported (Chromium), plus WebKit raster checks
// of counter-scaled popups when its desktop runner cannot apply pinch zoom.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=process.env.PREVIEW_ORIGIN||'http://127.0.0.1:8766';
(async()=>{
 const html=await fs.readFile(path.join(root,'index.html'),'utf8');
 for(const [name,type,executablePath] of [
  ['chromium',chromium,process.env.CHROMIUM_EXECUTABLE_PATH],
  ['webkit',webkit,process.env.WEBKIT_EXECUTABLE_PATH]
 ]){
  const browser=await type.launch({headless:true,...(executablePath?{executablePath}:{})});
  try{
   for(const scale of [1,2,3]){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
    const page=await context.newPage();
    await page.route('**/*github*',r=>r.fulfill({status:503,body:'fixture'}));
    await page.route(base+'/?preview=point',r=>r.fulfill({contentType:'text/html',body:html.replace('initial-scale=1','initial-scale='+scale)}));
    await page.goto(base+'/?preview=point');
    await page.waitForSelector('#point-sheet',{state:'attached'});
    await page.evaluate(async()=>{
     const f=await(await fetch('/output/point-fixture/run.json')).json();
     f.imageBase=location.origin+'/output/point-fixture/plots/';
     refreshRun(f);window.fetchRunInfo=()=>Promise.resolve(f);
    });
    await page.waitForFunction(()=>displayedFrame&&document.querySelector('#prefetchInfo').textContent==='All images ready');
    await page.waitForTimeout(700); // Let initial viewport and shared-time updates settle.
    const actual=await page.evaluate(()=>visualViewport.scale);
    const nativeZoom=Math.abs(actual-scale)<.05;
    if(!nativeZoom){
     assert.equal(name,'webkit','Chromium must use real page zoom');
     await page.evaluate(scale=>{
      const vv=visualViewport,values={scale,width:390/scale,height:844/scale,offsetLeft:0,offsetTop:0};
      for(const key of Object.keys(values))Object.defineProperty(vv,key,{configurable:true,get:()=>values[key]});
     },scale);
    }
    // Hold through the application's touch path with browser zoom already active.
    const point=await page.evaluate(()=>{const r=document.querySelector('#img-win').getBoundingClientRect();return{x:r.left+r.width*.49,y:r.top+r.height*.57};});
    const touch={bubbles:true,pointerId:42,pointerType:'touch',button:0,clientX:point.x,clientY:point.y};
    await page.evaluate(t=>document.querySelector('.imgwrap').dispatchEvent(new PointerEvent('pointerdown',t)),touch);
    await page.waitForTimeout(620);
    await page.evaluate(t=>document.querySelector('.imgwrap').dispatchEvent(new PointerEvent('pointerup',t)),touch);
    await page.waitForFunction(()=>document.querySelector('#point-sheet').open&&!document.querySelector('#point-content').hidden);
    for(const hour of [0,6,12]){
     await page.evaluate(h=>{const g=document.querySelector('#point-graphs');g.scrollLeft=h*8;g.dispatchEvent(new Event('scroll'));},hour);
     await page.waitForFunction(h=>document.querySelector('#point-graphs').getAttribute('aria-valuenow')===String(h),hour);
     await page.waitForTimeout(50);
     const geometry=await page.evaluate(()=>{
      const marker=document.querySelector('#point-cursor'),r=marker.getBoundingClientRect(),g=document.querySelector('#point-graphs').getBoundingClientRect();
      return {actual:visualViewport.scale,left:visualViewport.offsetLeft,top:visualViewport.offsetTop,x:r.x,y:r.y,width:r.width,height:r.height,centre:g.x+g.width/2};
     });
     assert.ok(Math.abs(geometry.x+geometry.width/2-geometry.centre)<1,`${name}: marker is not centred`);
     assert.ok(Math.abs(geometry.width*geometry.actual-2)<.15,`${name}: marker loses physical width`);
     // Sample real rendered pixels, rather than relying on layout/hit-testing.
     const file=path.join(root,'output',`marker-${name}-zoom-${scale}-hour-${hour}.png`);
     await page.screenshot({path:file});
     const rasterScale=nativeZoom?geometry.actual:actual;
     const metrics={file,x:(geometry.x+geometry.width/2-geometry.left)*rasterScale*3,
      y:(geometry.y-geometry.top)*rasterScale*3,height:geometry.height*rasterScale*3};
     const check=String.raw`import sys,json
from PIL import Image
d=json.loads(sys.argv[1]); im=Image.open(d['file']).convert('RGB'); hits=0
for f in [.1,.25,.4,.55,.7,.85,.95]:
 y=round(d['y']+d['height']*f)
 hits+=any(min(im.getpixel((x,y)))>240 for x in range(round(d['x'])-4,round(d['x'])+5) if 0<=x<im.width and 0<=y<im.height)
assert hits==7, f'Time marker is missing from rendered pixels: {hits}/7'
`;
     execFileSync(process.env.PREVIEW_PYTHON||'python3',['-c',check,JSON.stringify(metrics)]);
     console.log(JSON.stringify({engine:name,scale,hour,nativeZoom,whiteSamples:7,...metrics}));
    }
    await context.close();
   }
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
