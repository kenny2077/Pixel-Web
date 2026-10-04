import ctypes
import json
import pathlib
import sys
import pypdfium2 as pdfium
import pypdfium2.raw as raw

source, output, width = sys.argv[1], pathlib.Path(sys.argv[2]), float(sys.argv[3])
with pdfium.PdfDocument(source) as document:
    pages = []
    for index in range(len(document)):
        page = document[index]
        w, h = page.get_size()
        # Render sequentially, keeping one page bitmap in memory.
        bitmap = page.render(scale=min(2, width / w))
        bitmap.to_pil().save(output / f'{index}.png')
        links, cursor, link = [], ctypes.c_int(0), raw.FPDF_LINK()
        while raw.FPDFLink_Enumerate(page.raw, ctypes.byref(cursor), ctypes.byref(link)):
            rect = raw.FS_RECTF()
            if not raw.FPDFLink_GetAnnotRect(link, ctypes.byref(rect)):
                continue
            href = ''
            action = raw.FPDFLink_GetAction(link)
            if action:
                size = raw.FPDFAction_GetURIPath(document.raw, action, None, 0)
                if size:
                    buffer = ctypes.create_string_buffer(size)
                    raw.FPDFAction_GetURIPath(document.raw, action, buffer, size)
                    href = buffer.value.decode('utf-8', errors='replace')
            if not href:
                dest = raw.FPDFLink_GetDest(document.raw, link)
                if dest:
                    target = raw.FPDFDest_GetDestPageIndex(document.raw, dest)
                    if target >= 0:
                        href = f'#pdf-page-{target + 1}'
            if href:
                links.append({'href': href, 'x': rect.left/w, 'y': (h-rect.top)/h, 'width': (rect.right-rect.left)/w, 'height': (rect.top-rect.bottom)/h})
        pages.append({'width': w, 'height': h, 'links': links})
        bitmap.close()
        page.close()
    (output / 'manifest.json').write_text(json.dumps({'pages': pages}))
