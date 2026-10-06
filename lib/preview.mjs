import { readFileSync } from 'node:fs';

let pixelFont = '';
const cjkFont=readFileSync(new URL('../public/fonts/fusion-pixel-cjk.woff2',import.meta.url)).toString('base64');
try { pixelFont = readFileSync(new URL('../public/fonts/pixelify.ttf', import.meta.url)).toString('base64'); } catch {}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataUrl = bytes => {
  const start = bytes.subarray(0, 200).toString();
  const type = /<svg|<\?xml/.test(start) ? 'svg+xml' : bytes[0] === 255 && bytes[1] === 216 ? 'jpeg' : start.startsWith('RIFF') ? 'webp' : start.startsWith('GIF') ? 'gif' : 'png';
  return `data:image/${type};base64,${bytes.toString('base64')}`;
};

export function renderPreview(snapshot, { imageAssets = new Map(), backgroundAssets = new Map(), textMode = 'all', original = false } = {}) {
  let html = snapshot.html;
  // One pass over the tags: per-image regular expressions rescanned multi-megabyte pages hundreds of times.
  html = html.replace(/<(img|input)\b[^>]*>/g, (tag, name) => {
    const marker = /data-pixel-image="([^"]*)"/.exec(tag);
    const bytes = marker && imageAssets.get(marker[1]);
    if (!bytes) return tag;
    const at = marker.index + marker[0].length, head = tag.slice(0, at), tail = tag.slice(at);
    if (/src="/.test(tail)) return head + tail.replace(/^([^>]*src=")[^"]*(")/, (_, before, after) => before + dataUrl(bytes) + after);
    // Canvas snapshots have no source attribute.
    return name === 'img' && !/src=/.test(tail) ? `${head} src="${dataUrl(bytes)}"${tail}` : tag;
  });
  const groups = new Map();
  for (const [id, bytes] of backgroundAssets) {
    const mode = snapshot.backgrounds?.find(bg => bg.id === id)?.mode || 'rendered';
    const key = bytes;
    if (!groups.has(key)) groups.set(key, { bytes, mode, selectors: [] });
    groups.get(key).selectors.push(`[data-pixel-background="${id}"]`);
  }
  const backgrounds = [...groups.values()].map(group => `${group.selectors.join(',')}{background-image:url("${dataUrl(group.bytes)}")!important;${group.mode === 'source' ? '' : 'background-size:100% 100%!important;background-repeat:no-repeat!important'}image-rendering:pixelated}`).join('\n') + (snapshot.backgrounds || []).filter(bg => bg.mode === 'source' && bg.sourcePosition).map(bg => `[data-pixel-background="${bg.id}"]{background-position:${bg.sourcePosition}!important;background-size:${bg.sourceSize}!important;background-repeat:${bg.sourceRepeat}!important}`).join('\n');
  const family = '"Pixelify Sans", "Fusion Pixel CJK", sans-serif';
  const chinese = !original && textMode !== 'original' && /\p{Script=Han}/u.test(snapshot.text || snapshot.html);
  const cjkRule=chinese?`@font-face{font-family:'Fusion Pixel CJK';src:url(data:font/woff2;base64,${cjkFont}) format('woff2');font-weight:400;font-display:swap}`:'';
  const fontRule = original ? '' : textMode === 'all' ? `body,body *:not(svg):not(path){font-family:${family}!important}` : textMode === 'original' ? '' : `[data-pixel-heading],[data-pixel-control],[data-pixel-heading] *,[data-pixel-control] *{font-family:${family}!important}`;
  const interactive = snapshot.html.includes('data-pixel-node=');
  return `<!doctype html><html lang="${escape(snapshot.lang || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'"><title>${escape(snapshot.title)} · ${original ? 'Original' : 'Pixel preview'}</title>${interactive ? '<script src="/preview-client.js" defer></script>' : ''}<style>
    ${snapshot.fontCss || ''}
    ${cjkRule}
    @font-face{font-family:'Pixelify Sans';src:url(data:font/ttf;base64,${pixelFont}) format('truetype');font-weight:400;font-display:swap}
    html{scroll-behavior:smooth;background:transparent;scrollbar-width:none} html::-webkit-scrollbar,body::-webkit-scrollbar{display:none} body{margin:0} *{animation:none!important;transition:none!important;box-sizing:border-box} img{image-rendering:${original ? 'auto' : 'pixelated'}}
    ${original ? '' : `
    [data-pixel-control]{transition:background-color 160ms cubic-bezier(.16,1,.3,1)!important}
    @media(hover:hover){
      [data-pixel-control]:not(:disabled):not([aria-disabled="true"]):hover{background-color:color-mix(in srgb,var(--pixel-control-bg),var(--pixel-control-fg) 8%)!important}
      a[href]:not([aria-disabled="true"]):hover{text-decoration-line:underline!important;text-decoration-thickness:2px!important;text-underline-offset:.16em!important}
    }
    [data-pixel-control]:not(:disabled):not([aria-disabled="true"]):active{background-color:color-mix(in srgb,var(--pixel-control-bg),var(--pixel-control-fg) 15%)!important}
    `}

    ${original ? '' : '[data-pixel-backdrop]{backdrop-filter:none!important}'}
    a[href],summary{cursor:pointer} a:focus-visible,summary:focus-visible,button:focus-visible,[role="button"]:focus-visible,[role="tab"]:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor!important;outline-offset:2px}
    a[data-pixel-offscreen]{opacity:0!important}a[data-pixel-offscreen]:focus-visible{opacity:1!important;transform:none!important}
    button[data-preview-button]{cursor:pointer}
    details{height:auto!important} details:not([open])>:not(summary){display:none!important}
    ${fontRule}\n${backgrounds}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}[data-pixel-control]{transition:none!important}}
  </style></head>${html.replace('<body', `<body data-pixel-text="${escape(original ? 'original' : textMode)}" data-pixel-source="${escape(snapshot.url || "")}" data-pixel-width="${snapshot.width || 0}"`)}</html>`;
}

export function renderOriginal(capture) {
  return renderPreview(capture.snapshot, { imageAssets: capture.imageSources, backgroundAssets: capture.backgroundSources, original: true });
}
