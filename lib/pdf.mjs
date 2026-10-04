import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertPublicUrl} from './urls.mjs';
import {publicResponse} from './egress.mjs';

const bundledPython='/Users/kenny/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
export const pdfPython=process.env.PIXELWEB_PYTHON || (existsSync(bundledPython)?bundledPython:'python3');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderPdfDocument(bytes,url,width=1280,height=800){
  if(bytes.length>24_000_000)throw new Error('This PDF is larger than 24 MB. Open the original PDF instead.');
  const directory=await mkdtemp(join(tmpdir(),'pixelweb-pdf-'));
  const started=performance.now();
  try{
    const input=join(directory,'source.pdf');await writeFile(input,bytes);
    const pageWidth=Math.max(280,Math.min(1000,width-32));
    await promisify(execFile)(pdfPython,[fileURLToPath(new URL('./pdf-render.py',import.meta.url)),input,directory,String(pageWidth*2)],{timeout:60_000,maxBuffer:1_000_000});
    const {pages}=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
    const images=[],imageSources=new Map();let totalHeight=0;
    const html=await Promise.all(pages.map(async(page,index)=>{
      const id=`image-${index}`,pageHeight=pageWidth*page.height/page.width;
      images.push({id,width:pageWidth,height:Math.ceil(pageHeight)});imageSources.set(id,await readFile(join(directory,`${index}.png`)));
      totalHeight+=pageHeight+16;
      const links=page.links.flatMap(link=>{
        let href=link.href;
        try{if(!href.startsWith('#')){const target=new URL(href,url);if(!['http:','https:','mailto:','tel:'].includes(target.protocol))return [];href=target.href;}}catch{return [];}
        return [`<a href="${escape(href)}" aria-label="${escape(href.startsWith('#')?'Go to PDF page '+href.split('-').at(-1):href)}" style="position:absolute;left:${link.x*100}%;top:${link.y*100}%;width:${link.width*100}%;height:${link.height*100}%"></a>`];
      }).join('');
      return `<section id="pdf-page-${index+1}" aria-label="PDF page ${index+1}" style="position:relative;width:100%;margin-bottom:16px;aspect-ratio:${page.width}/${page.height}"><img data-pixel-image="${id}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="PDF page ${index+1}" style="display:block;width:100%;height:100%">${links}</section>`;
    }));
    return {pdfBytes:bytes,snapshot:{html:`<body data-pixel-node="n1" data-pixel-static="true" style="margin:0;background:#252525"><main style="width:${pageWidth}px;max-width:calc(100% - 32px);margin:16px auto">${html.join('')}</main></body>`,title:new URL(url).pathname.split('/').at(-1)||'PDF document',url,width,viewportHeight:height,height:Math.ceil(totalHeight+32),pages:pages.length,elements:pages.length,images,backgrounds:[]},imageSources,backgroundSources:new Map(),warnings:[],timings:{captureMs:Math.round(performance.now()-started),loadMs:0}};
  }finally{await rm(directory,{recursive:true,force:true});}
}

export async function downloadPublicPdf(input){
  let url=input;
  for(let redirects=0;redirects<6;redirects++){
    url=await assertPublicUrl(url);
    const response=process.env.PIXELWEB_PUBLIC_SERVICE==='1'?await publicResponse(url):await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(25_000)});
    if([301,302,303,307,308].includes(response.status)){
      await response.body?.cancel();url=new URL(response.headers.get('location'),url).href;continue;
    }
    if(!response.ok)throw new Error(`The PDF returned HTTP ${response.status}.`);
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>24_000_000)throw new Error('This PDF is larger than 24 MB. Open the original PDF instead.');chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);
    if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('This address did not return a PDF document.');
    return bytes;
  }
  throw new Error('The PDF redirected too many times.');
}
