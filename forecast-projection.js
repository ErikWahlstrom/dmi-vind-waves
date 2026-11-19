/* Reproject the existing Lambert forecast raster onto geographic map tiles. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();else root.ForecastProjection=factory();
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 var rad=Math.PI/180,a=6378137,e=Math.sqrt(0.0066943799901413165);
 function t(phi){var s=e*Math.sin(phi);return Math.tan(Math.PI/4-phi/2)/Math.pow((1-s)/(1+s),e/2);}
 function m(phi){return Math.cos(phi)/Math.sqrt(1-e*e*Math.sin(phi)**2);}
 var n=Math.log(m(55*rad)/m(65*rad))/Math.log(t(55*rad)/t(65*rad)),F=m(55*rad)/(n*Math.pow(t(55*rad),n)),rho0=a*F*Math.pow(t(60*rad),n);
 function rho(lat){return a*F*Math.pow(t(lat*rad),n);}
 function project(lat,lon){var r=rho(lat),theta=n*(lon-20)*rad;return [r*Math.sin(theta),rho0-r*Math.cos(theta)];}
 function fit(points){
  var samples=points.filter(function(_,i){return i%Math.max(1,Math.floor(points.length/500))===0;}).map(function(p){return project(p[3],p[2]).concat(p[0],p[1]);});
  function regress(axis,out){var sum=0,value=0,square=0,cross=0; samples.forEach(function(p){sum+=p[axis];value+=p[out];square+=p[axis]**2;cross+=p[axis]*p[out];});var slope=(samples.length*cross-sum*value)/(samples.length*square-sum*sum);return [slope,(value-slope*sum)/samples.length];}
  if(samples.length<3)throw Error('Forecast geography unavailable');
  var x=regress(0,2),y=regress(1,3),error=0;
  samples.forEach(function(p){error=Math.max(error,Math.abs(p[0]*x[0]+x[1]-p[2]),Math.abs(p[1]*y[0]+y[1]-p[3]));});
  if(!Number.isFinite(error)||error>.001)throw Error('Unsupported forecast map projection');
  return {x:x,y:y,error:error};
 }
 function prepare(image){
  var data=new Uint8ClampedArray(image.data);
  for(var i=0;i<data.length;i+=4){if(Math.min(data[i],data[i+1],data[i+2])>=232)data[i+3]=0;}
  return {width:image.width,height:image.height,data:data};
 }
 function tile(source,transform,z,x,y){
  var result=new Uint8ClampedArray(256*256*4),scale=256*Math.pow(2,z),sin=[],cos=[],rhos=[];
  for(var j=0;j<256;j++){
   var theta=n*((x*256+j+.5)/scale*360-180-20)*rad;sin[j]=Math.sin(theta);cos[j]=Math.cos(theta);
   rhos[j]=rho(Math.atan(Math.sinh(Math.PI*(1-2*(y*256+j+.5)/scale)))/rad);
  }
  for(var row=0;row<256;row++)for(var col=0;col<256;col++){
   var sx=(rhos[row]*sin[col]*transform.x[0]+transform.x[1])*source.width,sy=((rho0-rhos[row]*cos[col])*transform.y[0]+transform.y[1])*source.height;
   if(sx<.172*source.width||sx>=.782*source.width-1||sy<.04*source.height||sy>=.94*source.height-1)continue;
   var ix=Math.floor(sx),iy=Math.floor(sy),dx=sx-ix,dy=sy-iy,alpha=0,r=0,g=0,b=0;
   for(var yy=0;yy<2;yy++)for(var xx=0;xx<2;xx++){
    var at=((iy+yy)*source.width+ix+xx)*4,weight=(xx?dx:1-dx)*(yy?dy:1-dy)*source.data[at+3]/255;
    alpha+=weight;r+=weight*source.data[at];g+=weight*source.data[at+1];b+=weight*source.data[at+2];
   }
   if(alpha){var target=(row*256+col)*4;result[target]=r/alpha;result[target+1]=g/alpha;result[target+2]=b/alpha;result[target+3]=alpha*255;}
  }
  return result;
 }
 return {project:project,fit:fit,prepare:prepare,tile:tile};
});
