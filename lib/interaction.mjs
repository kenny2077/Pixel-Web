async function setValue(control, value) {
  const { tag, type } = await control.evaluate(node => ({ tag: node.tagName, type: node.type }));
  if (tag === 'SELECT') return control.selectOption(String(value), { timeout: 4000 });
  if (['range', 'color'].includes(type)) return control.evaluate((node, next) => {
    node.value = next; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(value));
  return control.fill(String(value).slice(0, 4000), { timeout: 4000 });
}

export async function performInteraction(page, { target, kind, value, fields = [], position }) {
  if (!/^n\d+(?:_\d+)?$/.test(target || '')) throw new Error('This control is no longer available. Reload the page.');
  const scrollState = () => page.evaluate(() => {
    const text = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('script,style,template')) text.push(walker.currentNode.textContent);
    return JSON.stringify([
    location.href, document.documentElement.scrollHeight,
    text,
    [...document.links].map(link => [link.href, link.textContent]),
    [...document.images].map(image => image.currentSrc),
    [...document.querySelectorAll('input,select,textarea')].map(node => [node.value, node.checked]),
  ]);
  });
  const before = kind === 'scroll' ? await scrollState() : null;
  const active = new Set();
  const started = request => { if (['fetch','xhr','document'].includes(request.resourceType())) active.add(request); };
  const finished = request => active.delete(request);
  page.on('request', started); page.on('requestfinished', finished); page.on('requestfailed', finished);
  await page.evaluate(() => {
    window.__pixelwebChangedAt = Date.now();
    window.__pixelwebObserver = new MutationObserver(() => { window.__pixelwebChangedAt = Date.now(); });
    window.__pixelwebObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
  });
  try {
    for (const field of fields.slice(0, 30)) {
      if (/^n\d+(?:_\d+)?$/.test(field.target || '')) await setValue(page.locator(`[data-pixel-node="${field.target}"]`).first(), field.value);
    }
    const control = page.locator(`[data-pixel-node="${target}"]`).first();
    if (kind === 'scroll') await page.evaluate(y=>window.scrollTo(0,Math.max(0,Number(y)||0)),value);
    else if (kind === 'input') await setValue(control, value);
    else if (kind === 'click') await control.click({ timeout: 5000, ...(position && Number.isFinite(position.x) && Number.isFinite(position.y) ? { position: { x: Math.max(0, position.x), y: Math.max(0, position.y) } } : {}) });
    else if (kind === 'enter') { if (value !== undefined) await setValue(control, value); await control.press('Enter', { timeout: 5000 }); }
    else throw new Error('This interaction is not supported.');
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
    const until = Date.now() + 3500;
    const first = Date.now();
    while (Date.now() < until) {
      const quiet = await page.evaluate(() => Date.now() - (window.__pixelwebChangedAt || 0));
      if (!active.size && quiet >= 350 && Date.now() - first >= 350) break;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    return { changed: kind !== 'scroll' || before !== await scrollState() };
  } finally {
    page.off('request', started); page.off('requestfinished', finished); page.off('requestfailed', finished);
    await page.evaluate(() => window.__pixelwebObserver?.disconnect()).catch(() => {});
  }
}
