const assert=require('node:assert/strict'),p=require('../forecast-projection.js');
// Independent Cartopy/PROJ WGS84 Lambert reference coordinates (metres).
for(const [lat,lon,x,y] of [[61,18,-107798.91698382726,112631.7396526241],[54,10,-654296.6646561284,-617247.4854119688],[66,30,453131.1934169465,701774.8427770733]]){
 const actual=p.project(lat,lon);assert(Math.abs(actual[0]-x)<.001);assert(Math.abs(actual[1]-y)<.001);
}
// Actual projected image coordinates from the existing published renderer.
const fit=p.fit([[.426142,.440938,18,61],[.470288,.513516,20,60],[.528225,.153283,23,65]]);
assert(fit.error<.000002);
const [x,y]=p.project(60,20);assert(Math.abs((x*fit.x[0]+fit.x[1])-.470288)<.000002);assert(Math.abs((y*fit.y[0]+fit.y[1])-.513516)<.000002);
assert.throws(()=>p.fit([]));
const data=new Uint8ClampedArray([238,241,242,255,221,221,221,255,0,0,255,255]);
const clean=p.prepare({width:3,height:1,data});assert.equal(clean.data[3],0);assert.equal(clean.data[7],255);assert.equal(clean.data[11],255);assert.equal(data[3],255);
const raster={width:900,height:675,data:new Uint8ClampedArray(900*675*4)};for(let i=0;i<raster.data.length;i+=4){raster.data[i+2]=255;raster.data[i+3]=255;}
const pixels=p.tile(raster,fit,6,35,18);assert.equal(pixels.length,256*256*4);assert(pixels.some((v,i)=>i%4===3&&v>0));
console.log('Forecast map projection checks passed: independent PROJ coordinates, renderer calibration, transparent land, retained low values and geographic tile pixels.');
