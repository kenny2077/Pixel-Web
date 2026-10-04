import test from 'node:test';
import assert from 'node:assert/strict';
import {transformArtwork} from '../lib/capture.mjs';
import {renderPreview} from '../lib/preview.mjs';
import {execFileSync} from 'node:child_process';

test('PDF rendering includes every page and clickable annotations',async()=>{
  const {renderPdfDocument,pdfPython:python}=await import('../lib/pdf.mjs');
  const bytes=execFileSync(python,['-c',`import io,sys
from reportlab.pdfgen import canvas
b=io.BytesIO();c=canvas.Canvas(b,pagesize=(300,400));c.drawString(20,350,'First page');c.linkURL('https://example.com', (20,320,140,340));c.linkAbsolute('Next','second',Rect=(20,280,140,300));c.linkURL('javascript:alert(1)',(20,240,140,260));c.showPage();c.bookmarkPage('second');c.drawString(20,350,'Second page');c.save();sys.stdout.buffer.write(b.getvalue())`]);
  const result=await renderPdfDocument(bytes,'https://example.com/paper.pdf',640,800);
  assert.equal(result.snapshot.pages,2);
  assert.equal(result.imageSources.size,2);
  const transformed=await transformArtwork(result,{cell:2,colors:32,dither:false});
  assert.equal(transformed.imageAssets.size,2);
  assert.equal((renderPreview(result.snapshot,transformed).match(/src="data:image\/png/g)||[]).length,2);
  assert.match(result.snapshot.html,/https:\/\/example.com/);
  assert.match(result.snapshot.html,/id="pdf-page-2"/);
  assert.match(result.snapshot.html,/href="#pdf-page-2"/);
  assert.ok(!result.snapshot.html.includes('javascript:'));
  assert.ok([...result.imageSources.values()].every(bytes=>bytes.length>100));
});
