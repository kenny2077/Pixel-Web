import {captureWebsite,transformArtwork,getBrowser,closeBrowser} from '../lib/capture.mjs';
import {renderPreview} from '../lib/preview.mjs';
import {writeFile} from 'node:fs/promises';
const urls=['https://github.com/kenny2077?tab=repositories','https://github.com/','https://www.youtube.com/results?search_query=Parrot','https://survival.auroraforgelab.com/','https://en.wikipedia.org/wiki/Pixel_art','https://developer.mozilla.org/en-US/'];
const results=[];
try{
 for(const url of urls){
  const start=performance.now();let c;
  try{
   c=await captureWebsite(url,1280,{live:true,height:800});
   const art=await transformArtwork(c,{cell:2,colors:32,dither:false});
   const q=await(await getBrowser()).newPage({viewport:{width:1280,height:800}});
   await q.setContent(renderPreview(c.snapshot,art));
   const metrics=await q.evaluate(()=>({height:document.documentElement.scrollHeight,text:document.body.innerText.length,hiddenHeadings:[...document.querySelectorAll('h1,h2')].filter(n=>n.getBoundingClientRect().width>5&&getComputedStyle(n).display!=='none'&&Number(getComputedStyle(n).opacity)===0).map(n=>n.textContent.trim().slice(0,100)),masks:[...document.querySelectorAll('svg rect')].filter(n=>getComputedStyle(n).maskImage!=='none').length,embeddedImages:[...document.images].filter(n=>n.src.startsWith('data:')&&n.naturalWidth>1).length}));
   await q.close();
   const row={url,ms:Math.round(performance.now()-start),sourceHeight:c.snapshot.height,sourceImages:c.snapshot.images.length,warnings:c.warnings,...metrics};results.push(row);console.log(JSON.stringify(row));
  }catch(error){const row={url,error:error.message};results.push(row);console.log(JSON.stringify(row));}
  finally{await c?.session.close();}
 }
 await writeFile('artifacts/compatibility-check.json',JSON.stringify(results,null,2));
}finally{await closeBrowser()}
