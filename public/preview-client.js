(async () => {
  const source = document.body.dataset.pixelSource;
  const staticPage = document.body.dataset.pixelStatic === 'true';
  const sourceWidth = Number(document.body.dataset.pixelWidth);
  if (parent === window && source && Math.abs(innerWidth - sourceWidth) > 24) {
    location.replace(`/?url=${encodeURIComponent(source)}`); return;
  }
  const send = async payload => {
    if (parent !== window) return parent.postMessage({ type: 'pixelweb', scrollY, ...payload }, '*');
    if (payload.action === 'navigate') { location.href = `/?url=${encodeURIComponent(payload.url)}`; return; }
    if (payload.action !== 'interact') return;
    try {
      const params = new URLSearchParams(location.search);
      const response = await fetch('/api/interact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: location.pathname.split('/').at(-1), cell: Number(params.get('cell')) || 2, colors: Number(params.get('colors')) || 32, textMode: params.get('textMode') || 'all', dither: params.get('dither') === '1', ...payload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.noChange) { forwarding = false; return; }
      location.replace(`${result.previewUrl}&scroll=${scrollY}`);
    } catch (error) { forwarding = false; alert(error.message); }
  };
  let forwarding = false;
  const edits = new Map();
  let editTimer;
  const forward = (node, kind, value, position, restoreScroll) => {
    if (forwarding || !node?.dataset.pixelNode) return;
    clearTimeout(editTimer);
    forwarding = true;
    send({ action: 'interact', target: node.dataset.pixelNode, kind, value, position, ...(restoreScroll !== undefined ? { scrollY: restoreScroll } : {}), fields: [...edits].map(([target, value]) => ({ target, value })) });
  };
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (/^(mailto|tel):/.test(href)) return;
      if (href.startsWith('#')) {
        let name = href.slice(1);
        try { name = decodeURIComponent(name); } catch {}
        const destination = document.getElementById(name);
        if(staticPage){event.preventDefault();destination?.scrollIntoView();return;}
        event.preventDefault(); forward(anchor, 'click', undefined, undefined, destination ? destination.getBoundingClientRect().top + scrollY : scrollY); return;
      }
      event.preventDefault(); send({ action: 'navigate', url: href }); return;
    }
    const control = event.target.closest('button,[role="button"],[role="tab"],summary,input[type="checkbox"],input[type="radio"],input[type="submit"],input[type="button"],input[type="reset"],input[type="image"]');
    if (control) { event.preventDefault(); forward(control, 'click'); }
    const surface = event.target.closest('[data-pixel-pointer]');
    if (surface) { const box = surface.getBoundingClientRect(); event.preventDefault(); forward(surface, 'click', undefined, { x: event.clientX - box.left, y: event.clientY - box.top }); }
  });
  document.addEventListener('input', event => {
    if (event.target.matches('input:not([type="checkbox"]):not([type="radio"]),textarea')) edits.set(event.target.dataset.pixelNode, event.target.value);
  });
  document.addEventListener('change', event => {
    if (event.target.matches('select')) forward(event.target, 'input', event.target.value);
    else if (event.target.matches('input:not([type="checkbox"]):not([type="radio"]),textarea')) editTimer = setTimeout(() => forward(event.target, 'input', event.target.value), 180);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('input')) { event.preventDefault(); forward(event.target, 'enter', event.target.value); }
    else if (['Enter', ' '].includes(event.key) && event.target.matches('[role="button"],[role="tab"]')) { event.preventDefault(); forward(event.target, 'click'); }
  });
  document.addEventListener('submit', event => { event.preventDefault(); });
  let scrollTimer, userScroll = false;
  addEventListener('wheel',()=>{userScroll=true},{passive:true});
  addEventListener('touchmove',()=>{userScroll=true},{passive:true});
  addEventListener('keydown',event=>{if(['PageDown','End','ArrowDown',' '].includes(event.key))userScroll=true});
  document.addEventListener('scroll', () => {
    send({ action: 'scroll', height: document.documentElement.scrollHeight });
    clearTimeout(scrollTimer);
    if (!staticPage && userScroll && scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 180) scrollTimer = setTimeout(() => {userScroll=false;forward(document.body, 'scroll', document.documentElement.scrollHeight)}, 300);
  }, { passive: true });
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'pixelweb') return;
    if (event.data.action === 'restore') window.scrollTo(0, event.data.scrollY || 0);
    if (event.data.action === 'ready') forwarding = false;
  });
  await document.fonts.ready;
  if(document.body.dataset.pixelText !== 'original'){
    for(const heading of document.querySelectorAll('[data-pixel-text-height]')){
      if(heading.closest('[data-pixel-icon]'))continue;
      const limit=Number(heading.dataset.pixelTextHeight);
      const scrollLimit=Number(heading.dataset.pixelScrollHeight)||limit;
      const widthLimit=Number(heading.dataset.pixelScrollWidth);
      const exceeds=()=>heading.getBoundingClientRect().height>limit+2||heading.scrollHeight>scrollLimit+2||(widthLimit>0&&heading.scrollWidth>widthLimit+2);
      if(!exceeds())continue;
      const nodes=[heading,...heading.querySelectorAll('*')].filter(node=>!node.closest('[data-pixel-icon]'));
      const original=nodes.map(node=>({node,size:getComputedStyle(node).fontSize,line:getComputedStyle(node).lineHeight,family:node.style.fontFamily}));
      let scale=1;
      while(exceeds()&&scale>.8){
        scale-=.05;
        for(const {node,size,line} of original){node.style.setProperty('font-size',`${parseFloat(size)*scale}px`,'important');if(line!=='normal')node.style.setProperty('line-height',`${parseFloat(line)*scale}px`,'important');}
      }
      if(exceeds()){
        for(const {node,size,line,family} of original){node.style.setProperty('font-size',size,'important');node.style.setProperty('line-height',line,'important');node.style.setProperty('font-family',family||'sans-serif','important');}
      }
    }
  }
  send({ action: 'ready', height: document.documentElement.scrollHeight });
  if (parent === window) window.scrollTo(0, Number(new URLSearchParams(location.search).get('scroll')) || 0);
})();
