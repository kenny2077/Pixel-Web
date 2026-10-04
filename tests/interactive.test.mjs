import test from 'node:test';
import assert from 'node:assert/strict';
import { getBrowser, closeBrowser, snapshotPage } from '../lib/capture.mjs';
import * as live from '../lib/interaction.mjs';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { renderPreview } from '../lib/preview.mjs';
import { pixelPng } from '../lib/pixels.mjs';

test('interactive snapshots map generic controls to the live source page', async () => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent('<button id="menu" onclick="document.querySelector(\'nav\').hidden=false">Menu</button><nav hidden>Visible menu</nav><input aria-label="Search" name="q">');
    const snapshot = await snapshotPage(page, { interactive: true });
    assert.match(snapshot.html, /data-pixel-node=/);
    assert.ok(!snapshot.html.includes('disabled=""'));
    assert.equal(typeof live.performInteraction, 'function');
    const target = await page.locator('#menu').getAttribute('data-pixel-node');
    await page.evaluate(() => document.body.prepend(document.createElement('p')));
    await snapshotPage(page, { interactive: true });
    assert.equal(await page.locator('#menu').getAttribute('data-pixel-node'), target);
    await live.performInteraction(page, { target, kind: 'click' });
    assert.equal(await page.locator('nav').isVisible(), true);
    const input = await page.locator('input').getAttribute('data-pixel-node');
    await live.performInteraction(page, { target: input, kind: 'input', value: 'field guide' });
    assert.equal(await page.locator('input').inputValue(), 'field guide');
    await page.setContent('<textarea>Default</textarea><button onclick="setTimeout(()=>document.querySelector(\'p\').textContent=\'Results ready\',200)">Load results</button><p>Loading</p>');
    await page.locator('textarea').fill('Edited text');
    const edited = await snapshotPage(page, { interactive: true });
    assert.match(edited.html, />Edited text<\/textarea>/);
    const delayed = await page.locator('button').getAttribute('data-pixel-node');
    await live.performInteraction(page, { target: delayed, kind: 'click' });
    assert.equal(await page.locator('p').textContent(), 'Results ready');
  } finally { await page.close(); await closeBrowser(); }
});

test('delayed source controls finish before the refreshed snapshot', async () => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent('<button onclick="setTimeout(()=>document.querySelector(\'p\').textContent=\'Results ready\',200)">Load</button><p>Loading</p>');
    await snapshotPage(page, { interactive: true });
    await live.performInteraction(page, { target: await page.locator('button').getAttribute('data-pixel-node'), kind: 'click' });
    assert.equal(await page.locator('p').textContent(), 'Results ready');
  } finally { await page.close(); await closeBrowser(); }
});

test('the preview forwards ordinary input submit buttons to its parent', async () => {
  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const script = await readFile('public/preview-client.js', 'utf8');
    await context.route('https://fixture.example/preview-client.js', route => route.fulfill({contentType:'text/javascript',body:script}));
    await context.route('https://fixture.example/preview', route => route.fulfill({contentType:'text/html',body:renderPreview({title:'Fixture',html:'<body><input type="submit" value="Search" data-pixel-node="n2"></body>'})}));
    const page = await context.newPage();
    await page.setContent('<script>window.received=[];addEventListener("message",e=>received.push(e.data))</script><iframe src="https://fixture.example/preview" sandbox="allow-scripts" style="height:200px"></iframe>');
    await page.frameLocator('iframe').locator('input').click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>received.some(event=>event.action==='interact'&&event.target==='n2')),true);
  } finally { await context.close(); await closeBrowser(); }
});

test('readable image mode preserves thin interface lines better than coarse artwork mode', async () => {
  const width = 96, height = 192;
  const data = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if ((y % 12 === 3 && x > 12 && x < 84) || (x === 20 && y > 20 && y < 172)) data.fill(20, (y * width + x) * 4, (y * width + x) * 4 + 3);
  }
  const input = await sharp(data, {raw:{width,height,channels:4}}).png().toBuffer();
  const decode = async bytes => sharp(bytes).resize(width,height).ensureAlpha().raw().toBuffer();
  const coarse = await decode(await pixelPng(input,{width,height,cell:4,colors:24}));
  const readable = await decode(await pixelPng(input,{width,height,cell:4,colors:24,readable:true}));
  const error = output => output.reduce((sum,value,i)=>sum+Math.abs(value-data[i]),0);
  assert.ok(error(readable) < error(coarse) * .6, `${error(readable)} vs ${error(coarse)}`);
});

test('the full document includes content beyond the old element limit', async () => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(`<main>${'<p>Page content</p>'.repeat(3600)}<footer>Final page footer</footer></main>`);
    const snapshot = await snapshotPage(page);
    assert.ok(snapshot.elements > 3500);
    assert.match(snapshot.html, /Final page footer/);
    assert.ok(snapshot.height > 16000);
  } finally { await page.close(); await closeBrowser(); }
});

test('screen-reader-only clipping survives the pixel conversion', async () => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent('<h2 id="hidden" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%)">Hidden navigation label</h2><p>Visible page</p>');
    const before = await page.locator('#hidden').evaluate(node=>({clip:getComputedStyle(node).clip,path:getComputedStyle(node).clipPath}));
    const snapshot = await snapshotPage(page);
    await page.setContent(renderPreview(snapshot));
    const after = await page.locator('#hidden').evaluate(node=>({clip:getComputedStyle(node).clip,path:getComputedStyle(node).clipPath}));
    assert.deepEqual(after,before);
  } finally { await page.close(); await closeBrowser(); }
});

test('custom elements can override style without breaking snapshots', async () => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent('<script>customElements.define("fixture-text",class extends HTMLElement {get style(){return Symbol("style")}})</script><fixture-text style="color:rgb(12,34,56)">Visible custom text</fixture-text>');
    const snapshot = await snapshotPage(page, {interactive:true});
    assert.match(snapshot.html, /Visible custom text/);
    assert.match(snapshot.html, /color: rgb\(12, 34, 56\)/);
    assert.match(snapshot.html, /data-pixel-node=/);
  } finally {await page.close();await closeBrowser();}
});

test('SVG gradients and masks survive conversion without solid rectangles', async () => {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent('<svg width="155" height="30"><defs><linearGradient id="gradient"><stop offset="10%" stop-color="red"/><stop offset="90%" stop-color="green"/></linearGradient><mask id="mask"><path d="M0 15H155" stroke="white" stroke-width="2"/></mask></defs><rect width="155" height="30" fill="url(#gradient)" mask="url(#mask)"/></svg>');
    const snapshot = await snapshotPage(page);
    await page.setContent(renderPreview(snapshot));
    assert.equal(await page.locator('stop').first().getAttribute('offset'),'10%');
    assert.match(await page.locator('stop').first().evaluate(n=>getComputedStyle(n).stopColor), /255, 0, 0/);
    assert.match(await page.locator('rect').evaluate(n=>getComputedStyle(n).maskImage),/#mask/);
    assert.ok(!snapshot.html.includes('about:blank#'));
  } finally {await page.close();await closeBrowser();}
});

test('transparent canvas capture does not include overlaid HTML text', async () => {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent('<div style="position:relative"><canvas width="200" height="100"></canvas><h1 style="position:absolute;top:0">Overlay title</h1></div>');
    const snapshot = await snapshotPage(page);
    assert.ok(snapshot.images[0].source.startsWith('data:image/png'));
    const pixels = await sharp(Buffer.from(snapshot.images[0].source.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
    assert.equal(pixels.filter((_,i)=>i%4===3).some(alpha=>alpha>0),false);
  } finally {await page.close();await closeBrowser();}
});

test('capture waits for lazy content and retains scroll-revealed sections', async () => {
  const { preparePage } = await import('../lib/capture.mjs');
  const page = await (await getBrowser()).newPage({viewport:{width:640,height:400}});
  try {
    await page.setContent(`<aside style="position:fixed;opacity:0">Sticky duplicate</aside><main style="height:1600px"></main><section style="opacity:0;transform:translateY(24px)"><h2>Lower section</h2><img width="20" height="20"></section><div style="height:800px"></div><script>
      addEventListener("scroll",()=>document.querySelector("aside").style.opacity=scrollY>100?"1":"0");
      new IntersectionObserver(entries=>{for(const e of entries){e.target.style.opacity=e.isIntersecting?'1':'0';e.target.style.transform=e.isIntersecting?'none':'translateY(24px)';if(!e.isIntersecting)document.querySelector('img').removeAttribute('src');if(e.isIntersecting)setTimeout(()=>document.querySelector('img').src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"%3E%3Crect width="20" height="20" fill="red"/%3E%3C/svg%3E',80)}}).observe(document.querySelector('section'));
    </script>`);
        await preparePage(page);
    assert.equal(await page.locator('img').getAttribute('src'),null);
    const snapshot=await snapshotPage(page);
    assert.ok(snapshot.images[0].source.startsWith('data:image/svg+xml'));
    await page.setContent(renderPreview(snapshot));
    assert.equal(await page.locator('section').evaluate(n=>getComputedStyle(n).opacity),'1');
    assert.equal(await page.locator('aside').evaluate(n=>getComputedStyle(n).opacity),'0');
  } finally {await page.close();await closeBrowser();}
});

test('scroll interactions load additional source content',async()=>{
  const page=await(await getBrowser()).newPage({viewport:{width:640,height:400}});
  try{
    await page.setContent('<main style="height:2000px"></main><script>addEventListener("scroll",()=>setTimeout(()=>document.querySelector("main").textContent="Additional content",80),{once:true})</script>');
    await snapshotPage(page,{interactive:true});
    await live.performInteraction(page,{target:await page.locator('body').getAttribute('data-pixel-node'),kind:'scroll',value:2000});
    assert.equal(await page.locator('main').textContent(),'Additional content');
  }finally{await page.close();await closeBrowser();}
});

test('translucent controls retain their alpha so white labels remain readable',async()=>{
  const page=await(await getBrowser()).newPage();
  try{
    await page.setContent('<body style="background:#08082b"><a href="https://example.com" style="color:white;background:rgba(255,255,255,.12);backdrop-filter:blur(10px)">Sign up</a></body>');
    const snapshot=await snapshotPage(page);
    await page.setContent(renderPreview(snapshot));
    assert.equal(await page.locator('a').evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(255, 255, 255, 0.12)');
  }finally{await page.close();await closeBrowser();}
});

test('named grid areas keep the main content in the first viewport',async()=>{
  const page=await(await getBrowser()).newPage({viewport:{width:1280,height:800}});
  try{
    await page.setContent(`<style>.grid{display:grid;grid-template-columns:200px 900px;grid-template-rows:60px 1200px;grid-template-areas:"header header" "sidebar content"}header{grid-area:header}aside{grid-area:sidebar}main{grid-area:content}</style><div class="grid"><header>Header</header><aside>Sidebar</aside><main><h1>Article title</h1><p>Article content</p></main></div>`);
    const before=await page.locator('main').evaluate(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y}));
    const snapshot=await snapshotPage(page);
    await page.setContent(renderPreview(snapshot));
    assert.deepEqual(await page.locator('main').evaluate(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})),before);
  }finally{await page.close();await closeBrowser();}
});

test('pixel headings fit their original line count without overlapping the next block',async()=>{
  const browser=await getBrowser();const context=await browser.newContext({viewport:{width:1280,height:800}});
  try{
    const page=await context.newPage();
    await page.setContent('<h2 style="font:56px/1.1 Arial;width:175px;overflow-wrap:break-word;margin:0">Pricing</h2><p style="margin:0">Next block</p>');
    const sourceHeight=await page.locator('h2').evaluate(n=>n.getBoundingClientRect().height);
    const snapshot=await snapshotPage(page,{interactive:true});
    await context.route('https://fixture.example/preview-client.js',async route=>route.fulfill({contentType:'text/javascript',body:await readFile('public/preview-client.js','utf8')}));
    await context.route('https://fixture.example/page',async route=>route.fulfill({contentType:'text/html',body:renderPreview(snapshot)}));
    await page.goto('https://fixture.example/page');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);

    assert.ok(await page.locator('h2').evaluate(n=>n.getBoundingClientRect().height)<=sourceHeight+2);
  }finally{await context.close();await closeBrowser();}
});

test('unsupported large artwork uses its original static image instead of a blank placeholder',async()=>{
  const {transformArtwork}=await import('../lib/capture.mjs');
  const bytes=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="6000"><rect width="6000" height="6000" fill="green"/></svg>');
  const capture={snapshot:{images:[{id:'image-0',width:1000,height:1000}]},imageSources:new Map([['image-0',bytes]]),backgroundSources:new Map(),warnings:[]};
  const artwork=await transformArtwork(capture,{cell:2,colors:32});
  assert.equal(artwork.imageAssets.get('image-0'),bytes);
  assert.match(capture.warnings[0],/original static image/);
});

test('original font assets remain available for faithful typography fallback',async()=>{
  const {sourceFontCss}=await import('../lib/capture.mjs');
  const bytes=await readFile('public/fonts/pixelify.ttf');
  const resources=new Map([['https://example.com/style.css',Buffer.from('@font-face{font-family:"Fixture Original";font-weight:100 900;src:url(./font.ttf)}')],['https://example.com/font.ttf',bytes]]);
  const page=await(await getBrowser()).newPage();
  try{
    await page.setContent(renderPreview({title:'Font fixture',fontCss:sourceFontCss(resources),html:'<body><h2 style="font-family:Fixture Original">Original font</h2></body>'},{original:true}));
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.evaluate(()=>[...document.fonts].find(n=>n.family.includes('Fixture Original'))?.status),'loaded');
  }finally{await page.close();await closeBrowser();}
});

test('grid controls retain their centered source alignment',async()=>{
  const page=await(await getBrowser()).newPage({viewport:{width:1280,height:800}});
  try{
    await page.setContent('<div style="display:grid;justify-items:center;width:1000px"><div role="tablist" style="width:300px"><button>Individuals</button><button>Businesses</button></div></div>');
    const before=await page.getByRole('tablist').evaluate(n=>n.getBoundingClientRect().x);
    const snapshot=await snapshotPage(page);
    await page.setContent(renderPreview(snapshot));
    assert.equal(await page.getByRole('tablist').evaluate(n=>n.getBoundingClientRect().x),before);
  }finally{await page.close();await closeBrowser();}
});

test('constrained navigation text does not overlap the next row after pixel conversion',async()=>{
  const context=await(await getBrowser()).newContext({viewport:{width:1280,height:800}});
  try{
    const page=await context.newPage();
    await page.setContent('<ul style="padding:0;width:100px"><li style="position:relative;height:36px;font:14px/18px Arial;overflow-wrap:break-word">Individual award winners<span style="position:absolute;top:0;width:1px;height:1px"></span></li><li>Next entry</li></ul>');
    const height=await page.locator('li').first().evaluate(n=>n.scrollHeight);
    const snapshot=await snapshotPage(page,{interactive:true});
    await context.route('https://fixture.example/preview-client.js',async route=>route.fulfill({contentType:'text/javascript',body:await readFile('public/preview-client.js','utf8')}));
    await context.route('https://fixture.example/page',route=>route.fulfill({contentType:'text/html',body:renderPreview(snapshot)}));
    await page.goto('https://fixture.example/page');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
    assert.ok(await page.locator('li').first().evaluate(n=>n.scrollHeight)<=height+2);
  }finally{await context.close();await closeBrowser();}
});

test('embedded document elements become static images rather than disappearing',async()=>{
  const page=await(await getBrowser()).newPage();
  try{
    await page.setContent('<object width="200" height="100" title="Embedded document"></object><embed width="200" height="100">');
    const snapshot=await snapshotPage(page,{interactive:true});
    assert.equal(snapshot.images.length,2);
    assert.equal((snapshot.html.match(/data-pixel-pointer/g)||[]).length,2);
    assert.ok(!snapshot.html.includes('<object'));
    assert.ok(!snapshot.html.includes('<embed'));
  }finally{await page.close();await closeBrowser();}
});

test('animated canvas frames remain available as static artwork after scrolling away',async()=>{
  const page=await(await getBrowser()).newPage({viewport:{width:640,height:400}});
  try{
    await page.setContent('<canvas width="100" height="100"></canvas><div style="height:1000px"></div><script>const c=document.querySelector("canvas"),ctx=c.getContext("2d");function paint(){ctx.clearRect(0,0,100,100);if(scrollY<100){ctx.fillStyle="red";ctx.fillRect(0,0,100,100)}requestAnimationFrame(paint)}paint()</script>');
    const {preparePage}=await import('../lib/capture.mjs');await preparePage(page);
    await page.evaluate(()=>scrollTo(0,1000));await page.waitForTimeout(100);
    const snapshot=await snapshotPage(page);
    const pixels=await sharp(Buffer.from(snapshot.images[0].source.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
    assert.equal(pixels[3],255);
  }finally{await page.close();await closeBrowser();}
});

test('pixel styling preserves circular avatars and source control geometry',async()=>{
  const page=await(await getBrowser()).newPage();
  try{
    await page.setContent('<img alt="Avatar" style="width:100px;height:100px;border-radius:50%"><a href="https://example.com" style="display:inline-flex;align-items:center;height:40px;padding:0 12px;background:white;border-bottom:2px solid blue">Article</a><button style="height:42px;border-radius:8px">Follow</button>');
    const snapshot=await snapshotPage(page);
    const before=await page.locator('a').evaluate(n=>({height:n.getBoundingClientRect().height,shadow:getComputedStyle(n).boxShadow}));
    await page.setContent(renderPreview(snapshot));
    assert.equal(await page.locator('img').evaluate(n=>getComputedStyle(n).borderRadius),'50%');
    assert.equal(await page.locator('button').evaluate(n=>getComputedStyle(n).borderRadius),'8px');
    assert.deepEqual(await page.locator('a').evaluate(n=>({height:n.getBoundingClientRect().height,shadow:getComputedStyle(n).boxShadow})),before);
  }finally{await page.close();await closeBrowser();}
});

test('hover and pressed feedback preserve button bounds and source shape',async()=>{
  const page=await(await getBrowser()).newPage();
  try{
    await page.setContent('<button style="background:rgb(240,240,240);color:rgb(20,20,20);border-radius:10px;height:42px;padding:0 18px">Action</button>');
    const snapshot=await snapshotPage(page);
    await page.setContent(renderPreview(snapshot));
    const measure=()=>page.locator('button').evaluate(n=>({bg:getComputedStyle(n).backgroundColor,transition:getComputedStyle(n).transitionDuration,rect:n.getBoundingClientRect().toJSON()}));
    const before=await measure();
    await page.locator('button').hover();await page.waitForTimeout(220);
    const hovered=await measure();
    assert.notEqual(hovered.bg,before.bg);
    assert.notEqual(hovered.transition,'0s');
    assert.deepEqual(hovered.rect,before.rect);
    await page.mouse.down();await page.waitForTimeout(220);const pressed=await measure();await page.mouse.up();
    assert.notEqual(pressed.bg,hovered.bg);
    assert.deepEqual(pressed.rect,before.rect);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal((await measure()).transition,'0s');
  }finally{await page.close();await closeBrowser();}
});

test('clipped control labels fit horizontally without cutting their final letters',async()=>{
  const context=await(await getBrowser()).newContext({viewport:{width:1280,height:800}});
  try{
    const page=await context.newPage();
    await page.setContent('<a href="https://example.com"><span style="display:inline-block;width:175px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:56px/1.1 Arial">Pricing</span></a>');
    const before=await page.locator('span').evaluate(n=>n.scrollWidth);
    const snapshot=await snapshotPage(page,{interactive:true});
    await context.route('https://fixture.example/preview-client.js',async route=>route.fulfill({contentType:'text/javascript',body:await readFile('public/preview-client.js','utf8')}));
    await context.route('https://fixture.example/page',route=>route.fulfill({contentType:'text/html',body:renderPreview(snapshot)}));
    await page.goto('https://fixture.example/page');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
    assert.ok(await page.locator('span').evaluate(n=>n.scrollWidth)<=before+2);
    assert.equal(await page.locator('span').evaluate(n=>getComputedStyle(n).textOverflow),'ellipsis');
  }finally{await context.close();await closeBrowser();}
});

test('icon fonts and CSS glyphs retain their source family in pixel mode',async()=>{
  const page=await(await getBrowser()).newPage();
  try{
    await page.setContent('<style>.icon{font-family:"Font Awesome 6 Free";font-weight:900}.icon::before{content:"\\f0e0"}</style><a href="mailto:fixture@example.com" aria-label="Email"><i class="icon"></i></a>');
    const snapshot=await snapshotPage(page,{interactive:true});
    await page.setContent(renderPreview(snapshot));
    assert.equal(await page.locator('i span').textContent(),'\uf0e0');
    assert.match(await page.locator('i span').evaluate(n=>getComputedStyle(n).fontFamily),/Font Awesome/);
    assert.match(snapshot.html,/mailto:fixture@example.com/);
  }finally{await page.close();await closeBrowser();}
});

test('Chinese and English text load their pixel fonts while English-only pages omit the CJK payload',async()=>{
  const page=await(await getBrowser()).newPage();
  try{
    const html=renderPreview({title:'Mixed language',lang:'zh-CN',html:'<body><h1>Ling Yang 杨灵</h1><p>中文像素：研究方向、机器学习与人工智能。</p></body>'});
    await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
    assert.equal(await page.evaluate(()=>[...document.fonts].find(n=>n.family.includes('Fusion Pixel CJK'))?.status),'loaded');
    assert.match(await page.locator('p').evaluate(n=>getComputedStyle(n).fontFamily),/Fusion Pixel CJK/);
    assert.ok(!renderPreview({title:'English',html:'<body>Hello world</body>'}).includes('src:url(data:font/woff2'));
  }finally{await page.close();await closeBrowser();}
});

test('Chinese text inside input values also includes the CJK font',()=>{
  const html=renderPreview({title:'Search',html:'<body><input value="中文搜索"></body>'});
  assert.match(html,/font-family:'Fusion Pixel CJK'/);
});

test('multi-column references and break rules survive conversion',async()=>{
  const page=await(await getBrowser()).newPage({viewport:{width:1600,height:800}});
  try{
    await page.setContent('<div id="references" style="column-count:2;column-gap:32px;column-fill:balance;width:800px"><ol>'+Array.from({length:20},(_,i)=>`<li style="break-inside:avoid">Reference ${i} with several words</li>`).join('')+'</ol></div>');
    const snapshot=await snapshotPage(page);await page.setContent(renderPreview(snapshot));
    assert.equal(await page.locator('#references').evaluate(n=>getComputedStyle(n).columnCount),'2');
    assert.equal(await page.locator('li').first().evaluate(n=>getComputedStyle(n).breakInside),'avoid');
    const columns=await page.locator('li').evaluateAll(ns=>new Set(ns.map(n=>Math.round(n.getBoundingClientRect().left))).size);
    assert.equal(columns,2);
  }finally{await page.close();await closeBrowser();}
});

test('intrinsic grid rows grow and shrink with content while footer stays after the article',async()=>{
  const page=await(await getBrowser()).newPage();
  try{
    await page.setContent(`<style>#layout{display:grid;grid-template-rows:auto auto;grid-template-areas:"article" "footer"}main{grid-area:article}footer{grid-area:footer}</style><div id="layout"><main><div style="position:absolute;width:1px;height:1px"></div><p>Short article</p></main><footer>Footer</footer></div>`);
    const snapshot=await snapshotPage(page);await page.setContent(renderPreview(snapshot));
    await page.locator('p').evaluate(n=>n.textContent='Expanded article content '.repeat(300));
    const expanded=await page.locator('#layout').evaluate(n=>({footer:n.querySelector('footer').getBoundingClientRect().top,content:n.querySelector('p').getBoundingClientRect().bottom}));
    assert.ok(expanded.footer>=expanded.content,JSON.stringify(expanded));
    await page.locator('p').evaluate(n=>n.textContent='Short article');
    const gap=await page.locator('#layout').evaluate(n=>n.querySelector('footer').getBoundingClientRect().top-n.querySelector('p').getBoundingClientRect().bottom);
    assert.ok(gap<40,`Unexpected gap ${gap}`);
  }finally{await page.close();await closeBrowser();}
});

test('auto-height flow containers do not leave a frozen gap when their content shrinks',async()=>{
  const page=await(await getBrowser()).newPage();
  try{
    await page.setContent('<section id="files" style="position:relative"><span style="position:absolute;top:0">Overlay control</span><div id="rows" style="height:900px">Files</div></section><article id="readme">README</article>');
    const snapshot=await snapshotPage(page);await page.setContent(renderPreview(snapshot));
    await page.locator('#rows').evaluate(n=>n.style.height='100px');
    const gap=await page.locator('#readme').evaluate(n=>n.getBoundingClientRect().top-document.querySelector('#rows').getBoundingClientRect().bottom);
    assert.ok(Math.abs(gap)<2,`Frozen spacing ${gap}`);
  }finally{await page.close();await closeBrowser();}
});
