import { chromium } from 'playwright';
import { assertPublicUrl } from './urls.mjs';
import { pixelPng } from './pixels.mjs';
import { renderPdfDocument, downloadPublicPdf } from './pdf.mjs';
import { createHash } from 'node:crypto';
import { createEgressProxy } from './egress.mjs';
import { watchDownloads } from './download-budget.mjs';
import { sourceHttpError } from './source-errors.mjs';

// Cache only deterministic artwork, never a user's live page or form state.
const artworkCache = new Map();
let artworkCacheBytes = 0;
const artworkCacheLimit = 32 * 1024 * 1024;
async function cachedArtwork(bytes, options) {
  const key = createHash('sha256').update(bytes).update(JSON.stringify(options)).digest('hex');
  if (artworkCache.has(key)) {
    const output = artworkCache.get(key);
    artworkCache.delete(key); artworkCache.set(key, output);
    return { output, cached: true };
  }
  const output = await pixelPng(bytes, options);
  if (output.length <= artworkCacheLimit) {
    while (artworkCacheBytes + output.length > artworkCacheLimit || artworkCache.size >= 256) {
      const oldest = artworkCache.keys().next().value;
      artworkCacheBytes -= artworkCache.get(oldest).length; artworkCache.delete(oldest);
    }
    artworkCache.set(key, output); artworkCacheBytes += output.length;
  }
  return { output, cached: false };
}

// Cloud Run allows 120-second requests; leave room for artwork processing after capture.
const captureLimitMs = 90_000;
// Image, font and style bytes kept for one capture. Images past the limit fall back to slow element screenshots.
const maxResourceBytes = 64_000_000;
let browserPromise, egressPromise;
export async function getBrowser() {
  // Containers often mount a 64 MB /dev/shm; large pages crash Chromium unless it uses /tmp instead.
  if (!browserPromise) browserPromise = chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}), ...(process.platform === 'linux' ? { args: ['--disable-dev-shm-usage'] } : {}) }).then(browser => { browser.once('disconnected', () => { browserPromise = null; }); return browser; }).catch(error => { browserPromise = null; throw error; });
  return browserPromise;
}
// Start the browser (and hosted egress proxy) before the first conversion needs them.
export async function warmCapture() {
  await getBrowser();
  if (process.env.PIXELWEB_PUBLIC_SERVICE === '1' && !egressPromise) egressPromise = createEgressProxy().catch(error => { egressPromise = null; throw error; });
  await egressPromise;
}
export async function closeBrowser() {
  if (browserPromise) { await (await browserPromise).close(); browserPromise = null; }
  if (egressPromise) { await (await egressPromise).close(); egressPromise = null; }
}

export async function createCaptureContext(browser, width, height = 800) {
  const hosted = process.env.PIXELWEB_PUBLIC_SERVICE === '1';
  if (hosted && !egressPromise) egressPromise = createEgressProxy().catch(error => { egressPromise = null; throw error; });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: 'block', ...(hosted ? { proxy: { server: (await egressPromise).url, bypass: '<-loopback>' } } : {}) });
  await context.routeWebSocket('**/*', socket => socket.close());
  // Previews keep one still frame. Pausing once playback starts saves decoding CPU and most video buffering.
  await context.addInitScript(() => document.addEventListener('playing', event => { if (event.target instanceof HTMLMediaElement) event.target.pause(); }, true));
  if (hosted) {
    context.downloadState = { total: 0 };
    context.on('page', page => { page.on('popup', popup => popup.close().catch(() => {})); });
  }
  return context;
}

export async function collectResources(tasks, timeoutMs = 1200) {
  let timer;
  try { await Promise.race([Promise.allSettled(tasks), new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })]); }
  finally { clearTimeout(timer); }
}

export function spriteSource(background) {
  const urls = [...background.image.matchAll(/url\("([^\"]+)"\)/g)];
  if (urls.length !== 1) return null;
  const otherLayers = background.image.replace(urls[0][0], '');
  const colors = otherLayers.match(/rgba?\([^)]*\)/g) || [];
  if (otherLayers.trim() && (!colors.length || colors.some(color => !/^rgba\([^)]*,\s*0\)$/.test(color)))) return null;
  return { url: urls[0][1], position: background.position?.split(',').at(-1).trim() || '0% 0%', size: background.size?.split(',').at(-1).trim() || 'auto', repeat: background.repeat?.split(',').at(-1).trim() || 'repeat' };
}

// Visit the document before freezing it; scroll observers must run while content is visible.
export async function preparePage(page) {
  await page.addStyleTag({ content: 'html,*{scroll-behavior:auto!important}*{transition-duration:0s!important;animation-delay:0s!important;animation-play-state:running!important;content-visibility:visible!important}' });
  await page.evaluate(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    await Promise.race([document.fonts.ready, wait(1200)]);
    window.__pixelwebRevealed = new WeakMap();
    window.__pixelwebImageSources = new WeakMap();
    window.__pixelwebCanvasSources = new WeakMap();
    for (const image of document.images) image.loading = 'eager';
    // Each step waits a short minimum for debounced handlers, then longer only while the document keeps changing.
    // The quiet window outlasts typical follow-up timers, such as a lazy loader that sets src 80 ms later.
    let changed = performance.now();
    const observer = new MutationObserver(() => { changed = performance.now(); });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
    const settle = async (quiet, minimum, limit) => {
      const started = performance.now();
      await frame(); await frame();
      while (performance.now() - started < limit && (performance.now() - started < minimum || performance.now() - changed < quiet)) await wait(16);
    };
    const until = performance.now() + 20_000;
    let y = 0;
    while (performance.now() < until) {
      for (; y < document.documentElement.scrollHeight && performance.now() < until; y += Math.max(200, innerHeight * .75)) {
        window.scrollTo(0, y);
        await settle(100, 80, 200);
        for (const animation of document.getAnimations()) {
          const timing = animation.effect?.getComputedTiming();
          if (timing && Number.isFinite(timing.endTime)) { try { animation.finish(); } catch {} }
        }
        await Promise.race([Promise.allSettled([...document.images].filter(n=>{const r=n.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}).map(n=>n.decode())), wait(180)]);
        // Read WebGL during the frame, before its drawing buffer is discarded.
        await new Promise(resolve=>requestAnimationFrame(()=>{
          for(const canvas of document.querySelectorAll('canvas')){
            const rect=canvas.getBoundingClientRect();
            if(rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight){try{window.__pixelwebCanvasSources.set(canvas,canvas.toDataURL('image/png'))}catch{}}
          }
          resolve();
        }));
        for (const image of document.images) if (image.currentSrc) window.__pixelwebImageSources.set(image, image.currentSrc);
        for (const node of document.querySelectorAll('body *')) {
          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight) continue;
          const style = getComputedStyle(node);
          if (Number(style.opacity) > 0 && style.visibility === 'visible') window.__pixelwebRevealed.set(node, {opacity:style.opacity,transform:style.transform});
        }
      }
      // Feeds can append after the last step; continue only if the page grew while it settled.
      const height = document.documentElement.scrollHeight;
      await settle(150, 150, 600);
      if (document.documentElement.scrollHeight <= height) break;
    }
    observer.disconnect();
    window.scrollTo(0, 0);
    await wait(200);
  });
  await page.addStyleTag({ content: '*{animation-play-state:paused!important;transition:none!important}' });
}

export async function snapshotPage(page, { interactive = false } = {}) {
  return page.evaluate(async ({ interactive }) => {
    if (interactive && !window.__pixelwebNodeIds) {
      window.__pixelwebNodeIds = new WeakMap();
      window.__pixelwebNodeSeed = crypto.getRandomValues(new Uint32Array(1))[0];
      window.__pixelwebNextNode = 0;
    }
    const properties = `display visibility clip clip-path position top right bottom left z-index float clear box-sizing width min-width max-width min-height max-height margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-self align-content justify-content justify-items justify-self gap row-gap column-gap column-count column-width column-fill column-span column-rule break-inside break-before break-after grid-template-columns grid-template-rows grid-template-areas grid-auto-columns grid-auto-rows grid-auto-flow grid-column grid-row order color background-color background-image background-size background-position background-repeat border-top border-right border-bottom border-left border-radius box-shadow font-family font-size font-weight font-style font-stretch font-variation-settings font-feature-settings line-height letter-spacing text-align text-indent text-decoration text-overflow text-transform white-space word-break overflow-wrap overflow-x overflow-y vertical-align object-fit object-position list-style-type list-style-position opacity fill fill-opacity fill-rule stroke stroke-width stroke-opacity stop-color stop-opacity mask-image mask-type mask-mode mask-size mask-position mask-repeat text-anchor dominant-baseline aspect-ratio transform transform-origin isolation mix-blend-mode pointer-events`.split(' ');
    const excluded = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BASE', 'TEMPLATE']);
    // Omit declarations the preview would reproduce anyway: inherited values equal to the parent's,
    // and other values equal to the browser default for the same element. Defaults come from a blank
    // standards-mode frame; geometry and context-dependent properties are always kept.
    const inherited = new Set('visibility color font-family font-style font-stretch font-variation-settings font-feature-settings line-height letter-spacing text-align text-indent text-transform white-space word-break overflow-wrap fill fill-opacity fill-rule stroke stroke-width stroke-opacity text-anchor dominant-baseline pointer-events'.split(' '));
    // The preview stylesheet sets box-sizing on every element, so its source value is always explicit.
    const kept = new Set('box-sizing width height min-width min-height max-width max-height font-size font-weight list-style-type list-style-position transform-origin'.split(' '));
    let blank = null;
    const sandbox = document.createElement('iframe');
    try {
      sandbox.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:800px;border:0;visibility:hidden';
      // Unusual inherited values on the holder reveal which properties an element's browser style sets.
      sandbox.srcdoc = '<!doctype html><html><body><div style="visibility:hidden;color:rgb(1,2,3);font-family:pixelweb-probe;font-style:oblique 13deg;font-stretch:75%;font-variation-settings:\'wght\' 1;font-feature-settings:\'smcp\';line-height:7px;letter-spacing:3px;text-align:right;text-indent:5px;text-transform:lowercase;white-space:break-spaces;word-break:break-all;overflow-wrap:anywhere;fill:rgb(1,2,3);fill-opacity:.5;fill-rule:evenodd;stroke:rgb(1,2,3);stroke-width:3px;stroke-opacity:.5;text-anchor:end;dominant-baseline:hanging;pointer-events:none"></div></body></html>';
      const loaded = new Promise(resolve => { sandbox.onload = resolve; setTimeout(resolve, 1000); });
      document.documentElement.appendChild(sandbox);
      await loaded;
      if (sandbox.contentDocument?.compatMode === 'CSS1Compat' && sandbox.contentDocument.body?.firstChild) blank = sandbox.contentDocument;
    } catch {}
    const defaults = new Map();
    function defaultsFor(clone, fontSize) {
      const attributes = ['href', 'title', 'type', 'open', 'disabled', 'multiple', 'checked', 'selected'].map(name => clone.getAttribute(name) === null ? '' : name === 'type' ? clone.getAttribute(name) : name);
      const key = `${clone.localName}|${fontSize}|${attributes.join('|')}`;
      if (!defaults.has(key)) {
        const holder = blank.body.firstChild, probe = blank.createElement(clone.localName);
        // Browser margins and similar defaults are em-based; resolve them at the source font size.
        probe.style.fontSize = fontSize;
        ['href', 'title', 'type', 'open', 'disabled', 'multiple', 'checked', 'selected'].forEach((name, index) => { if (attributes[index]) probe.setAttribute(name, clone.getAttribute(name)); });
        holder.appendChild(probe);
        const probeStyle = getComputedStyle(probe), holderStyle = getComputedStyle(holder), values = new Map();
        for (const property of properties) {
          const value = probeStyle.getPropertyValue(property);
          // An inherited value can be omitted only when this element's browser style does not set it.
          values.set(property, inherited.has(property) ? (value === holderStyle.getPropertyValue(property) ? null : undefined) : value);
        }
        probe.remove();
        defaults.set(key, values);
      }
      return defaults.get(key);
    }
    // Stamp source IDs in one batch. Writing between layout reads invalidates styles.
    if (interactive) {
      const stamp = node => {
        if (node.nodeType !== Node.ELEMENT_NODE || excluded.has(node.tagName)) return;
        if (!window.__pixelwebNodeIds.has(node)) window.__pixelwebNodeIds.set(node, `n${window.__pixelwebNodeSeed}_${++window.__pixelwebNextNode}`);
        const target = window.__pixelwebNodeIds.get(node);
        if (node.getAttribute('data-pixel-node') !== target) node.setAttribute('data-pixel-node', target);
        for (const child of (node.shadowRoot?.children || node.children)) stamp(child);
      };
      stamp(document.body);
    }
    const images = [], backgrounds = [];
    let elements = 0;
    function background(style, width, height, clone, inline = clone.style) {
      if (style.backgroundImage === 'none' || width <= 0 || height <= 0) return;
      const id = `background-${backgrounds.length}`;
      backgrounds.push({ id, image: style.backgroundImage, color: style.backgroundColor, size: style.backgroundSize, position: style.backgroundPosition, repeat: style.backgroundRepeat, filter: style.filter, width: Math.ceil(width), height: Math.ceil(height) });
      clone.setAttribute('data-pixel-background', id);
      inline.backgroundImage = 'none';
    }
    function preserveGlyph(element, style, text='') {
      if(!/icon|symbol|awesome/i.test(style.fontFamily)&&!/[\uE000-\uF8FF]/u.test(text))return;
      element.setAttribute('data-pixel-icon','');
      const declaration=document.createElement('span').style;
      declaration.cssText=element.getAttribute('style')||'';
      declaration.setProperty('font-family',style.fontFamily,'important');
      element.setAttribute('style',declaration.cssText);
    }
    function pseudo(node, selector) {
      const style = getComputedStyle(node, selector);
      if (style.content === 'none' || style.content === 'normal' || style.display === 'none') return null;
      const span = document.createElement('span');
      span.setAttribute('aria-hidden', 'true');
      for (const property of properties) span.style.setProperty(property, style.getPropertyValue(property));
      span.style.height = style.height;
      span.style.filter = 'none';
      if (style.content.startsWith('"') && style.content.endsWith('"')) {
        try { span.textContent = JSON.parse(style.content); } catch { span.textContent = style.content.slice(1, -1); }
      }
      preserveGlyph(span,style,span.textContent);
      background(style, parseFloat(style.width) || node.clientWidth, parseFloat(style.height) || node.clientHeight, span);
      return span;
    }
    function copy(node, parentStyle) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
      if (node.nodeType !== Node.ELEMENT_NODE || excluded.has(node.tagName)) return null;
      elements++;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const clone = node.tagName === 'FORM' ? document.createElement('div') : node.cloneNode(false);
      // Custom elements can override the native style accessor. Serialize CSS independently.
      const inline = document.createElement('div').style;
      // Copy only semantic/geometry attributes. Source code, submitted values and embedded documents never travel.
      for (const attr of [...clone.attributes]) {
        if (!/^(id|class|role|title|alt|lang|dir|open|aria-[\w-]+|viewBox|xmlns|d|fill|stroke|stroke-width|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|points|width|height|preserveAspectRatio|offset|gradientUnits|gradientTransform|spreadMethod|maskUnits|maskContentUnits|transform|colspan|rowspan)$/i.test(attr.name)) clone.removeAttribute(attr.name);
      }
      if (interactive) {
        const target = window.__pixelwebNodeIds.get(node);
        clone.setAttribute('data-pixel-node', target);
        for (const name of ['type', 'name', 'for', 'tabindex', 'placeholder', 'checked', 'selected', 'multiple', 'readonly', 'min', 'max', 'step']) if (node.hasAttribute(name)) clone.setAttribute(name, node.getAttribute(name));
        if (node.tagName === 'INPUT' && node.type !== 'password') clone.setAttribute('value', node.value);
        if (node.tagName === 'INPUT') clone.toggleAttribute('checked', node.checked);
        if (node.tagName === 'OPTION') { clone.setAttribute('value', node.value); clone.toggleAttribute('selected', node.selected); }
        if (node.disabled) clone.setAttribute('disabled', '');
      }
      if (node.localName === 'use') {
        const reference = node.getAttribute('href') || node.getAttribute('xlink:href');
        if (reference?.startsWith('#')) clone.setAttribute('href', reference);
      }
      const values = {};
      for (const property of properties) {
        const value = style.getPropertyValue(property);
        values[property] = value.includes('url(') ? value.replace(/url\(["']?([^"')]+)["']?\)/g, (match, address) => {
        try { const target = new URL(address, location.href); return target.hash && target.origin === location.origin && target.pathname === location.pathname && target.search === location.search ? `url("${target.hash}")` : match; } catch { return match; }
      }) : value;
      }
      const revealed = window.__pixelwebRevealed?.get(node);
      if (revealed && Number(style.opacity) === 0 && style.display !== 'none' && !node.hidden && node.getAttribute('aria-hidden') !== 'true') {
        let pinned = false;
        for (let ancestor = node; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          if (['fixed','sticky'].includes(getComputedStyle(ancestor).position)) { pinned = true; break; }
        }
        if (!pinned) { values.opacity = revealed.opacity; values.transform = revealed.transform; }
      }
      values.filter = 'none';
      if (node === document.body || node.tagName === 'DETAILS') values.width = 'auto';
      if (node.tagName === 'DETAILS') { values['max-height'] = 'none'; values['min-height'] = '0'; }
      const positionedChildren = [...node.children].some(child => getComputedStyle(child).position === 'absolute');
      if (!node.textContent.trim() || positionedChildren || style.backgroundImage !== 'none' || parseFloat(style.textIndent) < 0 || ['IMG', 'CANVAS', 'VIDEO', 'SVG', 'OBJECT', 'EMBED'].includes(node.tagName)) values.height = style.height;
      // Typed OM keeps intrinsic track sizing; resolved CSS pixels freeze document flow.
      try {
        const computed=node.computedStyleMap();
        for(const property of ['grid-template-rows','grid-auto-rows']){
          const value=computed.get(property)?.toString();
          if(value)values[property]=value;
        }
        if(!['IMG','CANVAS','VIDEO','SVG','OBJECT','EMBED','IFRAME','INPUT','BUTTON','SELECT','TEXTAREA'].includes(node.tagName)){
          const height=computed.get('height')?.toString();
          if(height)values.height=height;
        }
      }catch{}
      if (node.tagName === 'A') {
        const sourceHref = node.getAttribute('href');
        if (rect.bottom <= 0) clone.setAttribute('data-pixel-offscreen', '');
        try {
          const target = new URL(sourceHref || '', location.href);
          if (['http:', 'https:', 'mailto:', 'tel:'].includes(target.protocol)) {
            const anchor = target.origin === location.origin && target.pathname === location.pathname && target.search === location.search && target.hash;
            clone.setAttribute('href', anchor || target.href);
            if (!anchor) { clone.setAttribute('target', '_blank'); clone.setAttribute('rel', 'noopener noreferrer'); }
          }
        } catch {}
        if (interactive && (!sourceHref || sourceHref === '#' || /^javascript:/i.test(sourceHref))) {
          clone.removeAttribute('href'); clone.setAttribute('role', 'button'); clone.setAttribute('tabindex', '0');
        }
      }
      if (!interactive && ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName)) { clone.setAttribute('disabled', ''); clone.removeAttribute('value'); }
      if (node.tagName === 'BUTTON') { clone.setAttribute('type', 'button'); clone.setAttribute('data-preview-button', ''); }
      if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BUTTON', 'SUMMARY'].includes(node.tagName)) {
        clone.setAttribute('data-pixel-heading', '');

      }
      if (rect.height > 0 && (['H1','H2','H3','H4','H5','H6','BUTTON','SUMMARY','LI','A','P','LABEL','TD','TH','DT','DD'].includes(node.tagName) || ['button','tab'].includes(node.getAttribute('role')) || (['hidden','clip'].includes(style.overflowX) && [...node.childNodes].some(child=>child.nodeType===Node.TEXT_NODE && child.textContent.trim())))) {
        clone.setAttribute('data-pixel-text-height',String(rect.height));
        clone.setAttribute('data-pixel-scroll-height',String(Math.max(rect.height,node.scrollHeight)));
        if(['hidden','clip'].includes(style.overflowX))clone.setAttribute('data-pixel-scroll-width',String(Math.max(rect.width,node.scrollWidth)));
      }
      const bordered = parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderRadius) > 0;
      const control = ['BUTTON','SUMMARY'].includes(node.tagName) || ['button','tab'].includes(node.getAttribute('role')) || (node.tagName === 'INPUT' && ['submit','button','reset'].includes(node.type)) || (node.tagName === 'A' && (bordered || style.backgroundColor !== 'rgba(0, 0, 0, 0)'));
      if(control){
        clone.setAttribute('data-pixel-control','');
        values['--pixel-control-bg']=style.backgroundColor;
        values['--pixel-control-fg']=style.color;
        if(style.display!=='inline') values.height=style.height;
      }
      if (bordered) clone.setAttribute('data-pixel-surface', '');
      if (node.tagName === 'IMG' || (node.tagName === 'INPUT' && node.type === 'image')) {
        const id = `image-${images.length}`;
        images.push({ id, source: node.currentSrc || window.__pixelwebImageSources?.get(node) || node.src, width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
        clone.setAttribute('data-pixel-image', id);
        clone.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
      }
      if (['CANVAS', 'VIDEO', 'IFRAME', 'OBJECT', 'EMBED'].includes(node.tagName)) {
        const id = `image-${images.length}`;
        let source = node.poster || '';
        if (['CANVAS','VIDEO'].includes(node.tagName)) {
          try {
            const canvas = node.tagName === 'CANVAS' ? node : document.createElement('canvas');
            if (node.tagName === 'VIDEO') {
              if (node.readyState < 2) throw new Error('Video frame not ready');
              canvas.width = node.videoWidth; canvas.height = node.videoHeight;
              canvas.getContext('2d').drawImage(node, 0, 0);
            }
            source = window.__pixelwebCanvasSources?.get(canvas) || canvas.toDataURL('image/png');
          } catch {}
        }
        images.push({ id, source, mediaSource: node.tagName === 'VIDEO' ? node.currentSrc : '', ...(['IFRAME','OBJECT','EMBED'].includes(node.tagName) ? { box: { x: Math.max(0, rect.x), y: Math.max(0, rect.y + scrollY), width: Math.max(1, Math.ceil(rect.width)), height: Math.max(1, Math.ceil(rect.height)) } } : {}), width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
        const image = document.createElement('img');
        if (interactive) image.setAttribute('data-pixel-node', node.getAttribute('data-pixel-node'));
        if (interactive) image.setAttribute('data-pixel-pointer', '');
        image.setAttribute('alt', node.title || (['IFRAME','OBJECT','EMBED'].includes(node.tagName) ? 'Embedded page' : 'Static media'));
        image.setAttribute('data-pixel-image', id);
        for (const [property, value] of Object.entries(values)) image.style.setProperty(property, value);
        return image;
      }
      // Author borders and backgrounds turn off native control appearance, so controls keep every declaration.
      const browser = blank && parentStyle && clone.namespaceURI === 'http://www.w3.org/1999/xhtml' && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'METER', 'PROGRESS'].includes(node.tagName) ? defaultsFor(clone, style.fontSize) : null;
      inline.cssText = Object.entries(values).filter(([property, value]) => {
        if (!browser?.has(property) || kept.has(property)) return true;
        const fallback = browser.get(property);
        return inherited.has(property) ? fallback !== null || value !== parentStyle.getPropertyValue(property) : value !== fallback;
      }).map(([property, value]) => `${property}:${value}`).join(';');
      if (style.backdropFilter !== 'none') {
        inline.setProperty('backdrop-filter', style.backdropFilter);
        clone.setAttribute('data-pixel-backdrop', '');
      }
      background(style, node.clientWidth || rect.width, node.clientHeight || rect.height, clone, inline);
      clone.setAttribute('style', inline.cssText);
      preserveGlyph(clone,style,[...node.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE).map(child=>child.textContent).join(''));
      const before = pseudo(node, '::before');
      if (before) clone.appendChild(before);
      for (const child of (node.shadowRoot?.childNodes || node.childNodes)) { const result = copy(child, style); if (result) clone.appendChild(result); }
      const after = pseudo(node, '::after');
      if (after) clone.appendChild(after);
      if (interactive && node.tagName === 'TEXTAREA') clone.textContent = node.value;
      return clone;
    }
    let body;
    try { body = copy(document.body); } finally { sandbox.remove(); }
    body.removeAttribute('data-pixel-text');
    return { html: body.outerHTML, images, backgrounds, title: document.title, lang: document.documentElement.lang || 'en', elements, width: innerWidth, viewportHeight: innerHeight, height: document.documentElement.scrollHeight, url: location.href };
  }, { interactive });
}

export async function captureWebsite(input, width = 1280, { live = false, height = 800 } = {}) {
  const started = performance.now();
  const url = await assertPublicUrl(input);
  const browser = await getBrowser();
  const context = await createCaptureContext(browser, width, height);
  let keepSession = false;
  let downloadBudget;
  const deadline = setTimeout(() => context.close().catch(() => {}), captureLimitMs);
  deadline.unref();
  const resourceBuffers = new Map(), tasks = [];
  let resourceBytes = 0;
  const hosts = new Map();
  try {
    await context.route('**/*', async route => {
      const request = route.request();
      if (['CONNECT', 'TRACE'].includes(request.method())) return route.abort();
      try {
        const address = new URL(request.url());
        if (!['http:', 'https:'].includes(address.protocol)) return route.abort();
        if (!hosts.has(address.hostname)) hosts.set(address.hostname, assertPublicUrl(address.href));
        await hosts.get(address.hostname);
        return route.continue();
      } catch { return route.abort(); }
    });
    const page = await context.newPage();
    if (context.downloadState) downloadBudget = await watchDownloads(page, { state: context.downloadState });
    page.setDefaultTimeout(8000);
    let pdfResponse;
    page.on('response', response => {
      if (response.request().isNavigationRequest() && response.headers()['content-type']?.includes('application/pdf')) pdfResponse = response;
    });
    let collection = Promise.resolve();
    page.on('requestfinished', request => {
      // Only artwork, fonts and styles are kept; other responses (such as capped video ranges) never enter the queue.
      if (!['image', 'font', 'stylesheet'].includes(request.resourceType())) return;
      const collect = async () => {
      const response = await request.response();
      if (!response) return;
        try {
          if (Number(response.headers()['content-length']) > 6_000_000 || resourceBytes >= maxResourceBytes) return;
          const bytes = await response.body();
          if (bytes.length <= 6_000_000 && resourceBytes + bytes.length < maxResourceBytes) { resourceBytes += bytes.length; resourceBuffers.set(response.url(), bytes); }
        } catch {}
      };
      collection = collection.then(collect).catch(() => {}); tasks.push(collection);
    });
    let response;
    try { response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 }); }
    catch(error) { if(!pdfResponse) throw error; }
    if (pdfResponse || response?.headers()['content-type']?.includes('application/pdf')) {
      const result = await renderPdfDocument(await downloadPublicPdf((pdfResponse || response).url()), (pdfResponse || response).url(), width, height);
      result.timings.captureMs = Math.round(performance.now() - started);
      return result;
    }
    if (response && response.status() >= 400) throw Object.assign(sourceHttpError(response.status()), { sourceUrl: url });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    // Interaction refreshes must finish inside the server's 50-second source deadline.
    const refresh = (finishBy = performance.now() + 35_000) => capturePageAssets(page, { context, resourceBuffers, tasks, started: performance.now(), finishBy, interactive: live });
    const result = await refresh(started + captureLimitMs - 20_000);
    result.timings.navigationMs = Math.round(performance.now() - started - result.timings.captureMs);
    if (live) {
      keepSession = true;
      const expiry = setTimeout(() => context.close().catch(() => {}), 10 * 60_000);
      expiry.unref();
      result.session = { page, refresh, close: async () => { clearTimeout(expiry); await context.close(); } };
    }
    return result;
  } catch (error) { throw downloadBudget?.error || error; }
  finally { clearTimeout(deadline); if (!keepSession) await context.close(); }
}

// Slow per-asset fallbacks (video frames, element screenshots, rendered backgrounds) stop after finishBy,
// so heavy pages return with warnings instead of hitting the capture deadline.
async function capturePageAssets(page, { context, resourceBuffers, tasks, started, finishBy = Infinity, interactive }) {
    await preparePage(page);
    const prepared = performance.now();
    await collectResources(tasks);
    const collected = performance.now();
    const snapshot = await snapshotPage(page, { interactive });
    const loaded = performance.now();
    const imageSources = new Map();
    const warnings = [];
    let mediaPage;
    for (const image of snapshot.images) {
      try {
        let bytes = resourceBuffers.get(image.source);
        if (!bytes && image.source.startsWith('data:')) {
          const [header, ...body] = image.source.split(',');
          bytes = header.endsWith(';base64') ? Buffer.from(body.join(','), 'base64') : Buffer.from(decodeURIComponent(body.join(',')));
        }
        const late = performance.now() > finishBy;
        if (!bytes && !late && image.mediaSource && image.width > 0 && image.height > 0) {
          if (!mediaPage) { mediaPage = await context.newPage(); if (context.downloadState) await watchDownloads(mediaPage, { state: context.downloadState }); }
          await mediaPage.setViewportSize({width:Math.min(1280,image.width),height:Math.min(1200,image.height)});
          await mediaPage.setContent('<body style="margin:0"><video muted autoplay style="width:100vw;height:100vh;object-fit:contain"></video></body>');
          await mediaPage.locator('video').evaluate((node, source)=>{node.src=source},image.mediaSource);
          await mediaPage.waitForFunction(()=>document.querySelector('video').readyState>=2,{},{timeout:3000});
          bytes = await mediaPage.screenshot({omitBackground:true});
        }
        if (!bytes && !late && image.box) bytes = await page.screenshot({ clip: image.box });
        if (!bytes && !late) {
          const locator = page.locator('img').filter({ visible: true });
          // Match by current URL rather than source order; responsive sources may differ.
          const index = await locator.evaluateAll((nodes, source) => nodes.findIndex(node => node.currentSrc === source), image.source);
          if (index >= 0) bytes = await locator.nth(index).screenshot({ timeout: 1500 });
        }
        if (bytes) imageSources.set(image.id, bytes);
        else if (image.width > 0 && image.height > 0) warnings.push(`Could not capture image: ${image.id}`);
      } catch { warnings.push(`Could not capture image: ${image.id}`); }
    }
    await mediaPage?.close();
    const backgroundSources = new Map();
    const assetPage = await context.newPage();
    if (context.downloadState) await watchDownloads(assetPage, { state: context.downloadState });
    const backgroundsByStyle = new Map();
    for (const bg of snapshot.backgrounds) {
      // CSS sprite sheets are decoded once; their individual positions stay in HTML.
      const sprite = spriteSource(bg);
      const source = sprite?.url;
      let sourceBytes = source && resourceBuffers.get(source);
      if (!sourceBytes && source?.startsWith('data:')) {
        const [header, ...body] = source.split(',');
        try { sourceBytes = header.endsWith(';base64') ? Buffer.from(body.join(','), 'base64') : Buffer.from(decodeURIComponent(body.join(','))); } catch {}
      }
      if (sourceBytes && bg.filter === 'none') {
        bg.mode = 'source';
        bg.sourcePosition = sprite.position;
        bg.sourceSize = sprite.size;
        bg.sourceRepeat = sprite.repeat;
        backgroundSources.set(bg.id, sourceBytes);
        continue;
      }
      const key = JSON.stringify([bg.image, bg.color, bg.width, bg.height, bg.filter, bg.size, bg.position, bg.repeat]);
      if (backgroundsByStyle.has(key)) { backgroundSources.set(bg.id, backgroundsByStyle.get(key)); continue; }
      if (performance.now() > finishBy) { warnings.push(`Skipped background after the time limit: ${bg.id}`); continue; }
      try {
        await assetPage.setViewportSize({ width: Math.min(1280, bg.width), height: Math.min(1200, bg.height) });
        await assetPage.setContent('<!doctype html><html><body style="margin:0"><div id="art"></div></body></html>');
        await assetPage.locator('#art').evaluate((node, spec) => {
          Object.assign(node.style, { width: '100vw', height: '100vh', backgroundImage: spec.image, backgroundColor: spec.color, backgroundSize: spec.size, backgroundPosition: spec.position, backgroundRepeat: spec.repeat, filter: spec.filter });
        }, bg);
        if (bg.image.includes('url(')) await assetPage.waitForLoadState('networkidle', { timeout: 1000 }).catch(() => {});
        const bytes = await assetPage.screenshot({ omitBackground: true });
        backgroundSources.set(bg.id, bytes);
        backgroundsByStyle.set(key, bytes);
      } catch { warnings.push(`Could not capture background: ${bg.id}`); }
    }
    await assetPage.close();
    snapshot.fontCss = sourceFontCss(resourceBuffers);
    return { snapshot, imageSources, backgroundSources, warnings, timings: { captureMs: Math.round(performance.now() - started), loadMs: Math.round(loaded - started), prepareMs: Math.round(prepared - started), resourcesMs: Math.round(collected - prepared), snapshotMs: Math.round(loaded - collected), assetsMs: Math.round(performance.now() - loaded) } };
}

export function sourceFontCss(resources){
  const rules=[];
  for(const [url,bytes] of resources){
    if(!bytes.subarray(0,500).toString().includes('@font-face')&&!url.split('?')[0].endsWith('.css'))continue;
    for(const match of bytes.toString().matchAll(/@font-face\s*\{([^}]+)\}/g)){
      const declaration=match[1];
      const family=declaration.match(/font-family\s*:\s*([^;]+)/i)?.[1];
      if(!family||! /^[\w\s"',-]+$/.test(family))continue;
      for(const source of declaration.matchAll(/url\(["']?([^"')]+)["']?\)/g)){
        let address;try{address=new URL(source[1],url).href}catch{continue}
        const data=resources.get(address);if(!data)continue;
        const descriptors=['font-weight','font-style','font-stretch'].map(name=>{
          const value=declaration.match(new RegExp(`${name}\\s*:\\s*([^;]+)`,'i'))?.[1];
          return value&&/^[\w\s%.+-]+$/.test(value)?`${name}:${value};`:'';
        }).join('');
        rules.push(`@font-face{font-family:${family};${descriptors}src:url(data:font/woff2;base64,${data.toString('base64')});font-display:swap}`);break;
      }
    }
  }
  return rules.join('\n');
}

export async function transformArtwork(capture, options) {
  const started = performance.now();
  const imageAssets = new Map(), backgroundAssets = new Map();
  let cacheHits = 0;
  const specs = new Map(capture.snapshot.images.map(image => [image.id, image]));
  for (const [id, bytes] of capture.imageSources) {
    const spec = specs.get(id);
    try {
      const result = await cachedArtwork(bytes, { readable: true, width: Math.max(1, Math.ceil(spec.width)), height: Math.max(1, Math.ceil(spec.height)) });
      imageAssets.set(id, result.output); if (result.cached) cacheHits++;
    }
    catch { imageAssets.set(id,bytes);capture.warnings.push(`Used original static image: ${id}`); }
  }
  for (const [id, bytes] of capture.backgroundSources) {
    try {
      const result = await cachedArtwork(bytes, { cell: options.cell, colors: options.colors, dither: options.dither, width: 1280, height: 1200 });
      backgroundAssets.set(id, result.output); if (result.cached) cacheHits++;
    }
    catch { backgroundAssets.set(id,bytes);capture.warnings.push(`Used original background: ${id}`); }
  }
  return { imageAssets, backgroundAssets, cacheHits, transformMs: Math.round(performance.now() - started) };
}
