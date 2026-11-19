/* Full-resolution model directions, spaced in screen pixels at the current zoom. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ForecastArrows=factory();})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function decode(index,flow,identity,time){
  if(index.schema!==1||index.identity!==identity||flow.schema!==1||flow.identity!==identity||flow.time!==time||!Array.isArray(index.points)||flow.count!==index.points.length||
   JSON.stringify(index.fields)!==JSON.stringify(['wind','wind_dir','wave','wave_dir','swell','swell_dir'])||JSON.stringify(index.scales)!==JSON.stringify([100,10,100,10,100,10]))throw Error('Directions do not match this forecast hour');
  if(index.points.some(function(p){return !Array.isArray(p)||p.length!==4||!Number.isFinite(p[2])||!Number.isFinite(p[3])||Math.abs(p[2])>180||Math.abs(p[3])>90;}))throw Error('Invalid direction geography');
  var raw=atob(flow.data),bytes=Uint8Array.from(raw,function(c){return c.charCodeAt(0);});if(bytes.length!==flow.count*12)throw Error('Incomplete direction data');
  return {points:index.points,values:new DataView(bytes.buffer)};
 }
 function select(data,quantity,project,bounds,spacing){
  spacing=spacing||48;var cells=new Map(),threshold=quantity===0?.5:.1;
  data.points.forEach(function(point,i){
   var lon=point[2],lat=point[3];if(lat<bounds.south||lat>bounds.north||lon<bounds.west||lon>bounds.east)return;
   var value=data.values.getUint16((i*6+quantity*2)*2,true),direction=data.values.getUint16((i*6+quantity*2+1)*2,true);
   if(value===65535||direction===65535||value/100<threshold||direction>3600)return;
   var p=project(lat,lon),gx=Math.floor(p.x/spacing),gy=Math.floor(p.y/spacing),key=gx+','+gy,rank=(p.x-(gx+.5)*spacing)**2+(p.y-(gy+.5)*spacing)**2;
   if(!cells.has(key)||rank<cells.get(key).rank)cells.set(key,{index:i,lat:lat,lon:lon,direction:direction/10,value:value/100,x:p.x,y:p.y,gx:gx,gy:gy,rank:rank});
  });
  var accepted=[],grid=new Map();
  Array.from(cells.values()).sort(function(a,b){return a.rank-b.rank;}).forEach(function(p){
   for(var x=p.gx-1;x<=p.gx+1;x++)for(var y=p.gy-1;y<=p.gy+1;y++){var other=grid.get(x+','+y);if(other&&(other.x-p.x)**2+(other.y-p.y)**2<(spacing*.7)**2)return;}
   accepted.push(p);grid.set(p.gx+','+p.gy,p);
  });return accepted;
 }
 return {decode:decode,select:select};
});
