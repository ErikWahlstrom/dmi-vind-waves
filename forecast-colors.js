/* Shared with the Python renderer through forecast-colors.json. */
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory(require('./forecast-colors.json'));
    else root.ForecastColors=factory(root.ForecastMapScales);
})(typeof window==='object'?window:globalThis,function(scales){
    'use strict';
    ['wind','wave'].forEach(function(key){
        var s=scales[key];
        if(!s||s.levels.length!==s.colors.length+1||!s.levels.every(function(v,i){return Number.isFinite(v)&&(!i||v>s.levels[i-1]);})||
            !s.colors.concat(s.over).every(function(c){return /^#[0-9a-f]{6}$/i.test(c);}))throw Error('Invalid map color scale');
    });
    function scale(quantity){return scales[quantity===0||quantity==='wind'?'wind':'wave'];}
    function color(quantity,value){
        if(!Number.isFinite(value))return null;
        var s=scale(quantity);
        if(value>=s.levels[s.levels.length-1])return s.over;
        for(var i=s.colors.length-1;i>=0;i--)if(value>=s.levels[i])return s.colors[i];
        return s.colors[0];
    }
    function stops(quantity,max){
        if(!Number.isFinite(max)||max<=0)throw Error('Invalid color range');
        var s=scale(quantity),result=[{offset:0,color:s.colors[0]}];
        s.levels.slice(1).forEach(function(v,i){
            if(v>max)return;
            result.push({offset:v/max,color:s.colors[i]});
            result.push({offset:v/max,color:s.colors[i+1]||s.over});
        });
        result.push({offset:1,color:color(quantity,max)});
        return result;
    }
    return {color:color,stops:stops,scales:scales};
});
