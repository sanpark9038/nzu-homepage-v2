const fs = require('fs');
const data = JSON.parse(fs.readFileSync('aegong_stats.json', 'utf8'));
const recent = data.filter(m => m.dt >= '2026-02-17');

const overallWins = recent.filter(m => m.res === 1).length;
const overallTotal = recent.length;

const vsT = recent.filter(m => m.race === 'T');
const vsP = recent.filter(m => m.race === 'P');
const vsZ = recent.filter(m => m.race === 'Z');

console.log('--- 30DAYS ---');
console.log(`TOTAL: ${overallWins}/${overallTotal} (${((overallWins/overallTotal)*100).toFixed(1)}%)`);
console.log(`vsT: ${vsT.filter(m=>m.res===1).length}/${vsT.length} (${(vsT.length>0?(vsT.filter(m=>m.res===1).length/vsT.length*100):0).toFixed(1)}%)`);
console.log(`vsP: ${vsP.filter(m=>m.res===1).length}/${vsP.length} (${(vsP.length>0?(vsP.filter(m=>m.res===1).length/vsP.length*100):0).toFixed(1)}%)`);
console.log(`vsZ: ${vsZ.filter(m=>m.res===1).length}/${vsZ.length} (${(vsZ.length>0?(vsZ.filter(m=>m.res===1).length/vsZ.length*100):0).toFixed(1)}%)`);

const maps = {};
data.forEach(m => { if(!maps[m.map]) maps[m.map]={w:0,t:0}; maps[m.map].t++; if(m.res===1) maps[m.map].w++; });
const topMaps = Object.keys(maps).filter(k=>maps[k].t>=5).map(k=>({n:k,w:maps[k].w,t:maps[k].t,r:maps[k].w/maps[k].t})).sort((a,b)=>b.r-a.r).slice(0,3);

console.log('--- TOP MAPS ---');
topMaps.forEach((m,i)=> console.log(`${i+1}. ${m.n}: ${m.w}/${m.t} (${(m.r*100).toFixed(1)}%)`));
