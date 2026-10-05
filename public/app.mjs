const $ = selector => document.querySelector(selector);
let capture = null, version = 'pixel', pending = false, styleTimer, savedScroll = 0;
const visited = [];
const presets = { balanced: {cell:2,colors:32,dither:false}, bold:{cell:4,colors:16,dither:false}, soft:{cell:2,colors:32,dither:true} };
const options = () => ({cell:Number($('#cell').value),colors:Number($('#colors').value),dither:$('#dither').checked,textMode:$('input[name="text-mode"]:checked').value});
function message(text,error=false){$('#status').textContent=text;$('#status').title=text;$('#status').classList.toggle('error',error);}
function busy(value,kind='convert'){
  pending=value;$('#convert').disabled=value;$('#loading-state').hidden=!value||kind==='scroll';
  for(const control of document.querySelectorAll('.settings input,.settings button'))control.disabled=value;
  $('#loading-title').textContent=kind==='interact'?'Updating page…':kind==='style'?'Changing pixels…':'Loading website…';
  $('#loading-detail').textContent=kind==='interact'?'Applying your action to the live website.':'Reading the full page and preserving image details.';
  if(!value&&capture&&(Math.abs($('#preview-stage').clientWidth-capture.width)>24||Math.abs($('#preview-stage').clientHeight-capture.viewportHeight)>24))window.dispatchEvent(new Event('resize'));
}
async function post(path,body){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'This website could not be loaded.'),{code:result.code,sourceUrl:result.sourceUrl});return result;
}
function showPage(scroll=0){
  if(!capture)return;savedScroll=scroll;
  $('#preview-frame').src=version==='pixel'?capture.previewUrl:capture.originalUrl;
  $('#frame-wrap').hidden=false;$('#empty-state').hidden=true;document.body.classList.add('has-page');
  $('#capture-title').textContent=capture.title;$('#open-preview').href=`/?url=${encodeURIComponent(capture.url)}`;$('#open-preview').setAttribute('aria-disabled','false');
  $('#open-preview').textContent='Open page';
  $('#back').disabled=visited.length===0;updateVersion();
}
async function convert(url=$('#website-url').value.trim(),remember=true){
  if(pending||!url)return;clearTimeout(styleTimer);busy(true);message('Loading the entire page…');
  try{
    const previous=capture?.url;
    const width=$('#preview-stage').clientWidth;
    const height=$('#preview-stage').clientHeight;
    capture=await post('/api/convert',{url,width,height,...options()});
    if(remember&&previous&&previous!==capture.url)visited.push(previous);
    $('#website-url').value=capture.url;version='pixel';showPage();
    history.replaceState(null,'',`/?url=${encodeURIComponent(capture.url)}`);
    $('#timing').textContent=`${(capture.timings.totalMs/1000).toFixed(2)} s`;
    message(capture.warnings.length?`Page loaded. ${capture.warnings.length} artwork elements need attention.`:'Page ready. Links continue in pixel mode.');
  }catch(error){message(error.message,true);if(error.code==='SOURCE_ACCESS_DENIED'&&error.sourceUrl){$('#open-preview').href=error.sourceUrl;$('#open-preview').textContent='Open original';$('#open-preview').setAttribute('aria-disabled','false');}}
  finally{busy(false);}
}
async function restyle(){
  if(!capture||pending)return;busy(true,'style');
  try{
    const result=await post('/api/style',{id:capture.id,...options()});capture.previewUrl=result.previewUrl;version='pixel';showPage(savedScroll);
    $('#timing').textContent=result.cached?'Cached style':`${(result.transformMs/1000).toFixed(2)} s`;message('Style updated.');
  }catch(error){message(error.message,true);}finally{busy(false);}
}
async function interact(action){
  if(!capture||pending)return;
  if(action.kind==='scroll'){
    if(capture.lastScrollHeight===action.value){$('#preview-frame').contentWindow.postMessage({type:'pixelweb',action:'ready'},'*');return;}
    capture.lastScrollHeight=action.value;
  }else delete capture.lastScrollHeight;
  busy(true,action.kind==='scroll'?'scroll':'interact');
  try{
    const result=await post('/api/interact',{id:capture.id,...options(),target:action.target,kind:action.kind,value:action.value,fields:action.fields,position:action.position});
    if(result.noChange){$('#preview-frame').contentWindow.postMessage({type:'pixelweb',action:'ready'},'*');return;}
    Object.assign(capture,result);$('#website-url').value=capture.url;showPage(action.scrollY);message('Page updated.');
  }catch(error){message(error.message,true);$('#preview-frame').contentWindow.postMessage({type:'pixelweb',action:'ready'},'*');}
  finally{busy(false);}
}
window.addEventListener('message',event=>{
  if(event.source!==$('#preview-frame').contentWindow||event.data?.type!=='pixelweb')return;
  const action=event.data;
  if(action.action==='ready')$('#preview-frame').contentWindow.postMessage({type:'pixelweb',action:'restore',scrollY:savedScroll},'*');
  else if(action.action==='scroll')savedScroll=action.scrollY;
  else if(action.action==='navigate')convert(action.url);
  else if(action.action==='interact')interact(action);
});
function updateVersion(){for(const [id,value]of[['pixel-view','pixel'],['original-view','original']]){$(`#${id}`).classList.toggle('active',version===value);$(`#${id}`).setAttribute('aria-pressed',String(version===value));}}
function updateControls(){$('#cell-value').value=`${$('#cell').value} px`;$('#colors-value').value=$('#colors').value;}
$('#convert-form').addEventListener('submit',event=>{event.preventDefault();convert();});
$('#back').addEventListener('click',()=>{if(!pending&&visited.length)convert(visited.pop(),false);});
$('#settings-toggle').addEventListener('click',()=>{const panel=$('#settings-panel');panel.hidden=!panel.hidden;$('#settings-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
for(const [id,value]of[['pixel-view','pixel'],['original-view','original']])$(`#${id}`).addEventListener('click',()=>{version=value;showPage(savedScroll);});
for(const button of document.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>{
  const preset=presets[button.dataset.preset];$('#cell').value=preset.cell;$('#colors').value=preset.colors;$('#dither').checked=preset.dither;
  for(const sibling of document.querySelectorAll('[data-preset]')){const selected=sibling===button;sibling.classList.toggle('selected',selected);sibling.setAttribute('aria-pressed',String(selected));}updateControls();restyle();
});
for(const input of document.querySelectorAll('.settings input'))input.addEventListener('input',()=>{updateControls();clearTimeout(styleTimer);styleTimer=setTimeout(restyle,200);});
const initial=new URLSearchParams(location.search).get('url')||'https://en.wikipedia.org/wiki/Pixel_art';$('#website-url').value=initial;convert(initial);
let resizeTimer;
window.addEventListener('resize',()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(async()=>{
    const width=$('#preview-stage').clientWidth;
    const height=$('#preview-stage').clientHeight;
    if(!capture||pending||(Math.abs(width-capture.width)<24&&Math.abs(height-capture.viewportHeight)<24))return;
    busy(true,'style');
    try{Object.assign(capture,await post('/api/style',{id:capture.id,width,height,...options()}));showPage(savedScroll);message('Page resized.');}
    catch(error){message(error.message,true);}finally{busy(false);}
  },400);
});
