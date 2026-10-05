// PDF mínimo (uma página, imagens JPEG em posição e tamanho exatos em mm, retângulos de corte e uma linha de texto).
// Sem dependências: JPEG entra como /DCTDecode. Testado no Node (tests/geometry.test.mjs).
const enc = new TextEncoder();
const mm = (v) => (v * 72) / 25.4;

export function buildPdf({ pageW = 210, pageH = 297, jpeg, jpegW, jpegH, cells, cellW, cellH, text = '' }) {
  const parts = []; const offsets = []; let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  const ascii = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/([()\\])/g, '\\$1');
  let content = '0.75 G 0.3 w\n';
  for (const c of cells) {
    const x = mm(c.x), y = mm(pageH - c.y - cellH), w = mm(cellW), h = mm(cellH);
    content += `q ${w.toFixed(3)} 0 0 ${h.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm /Im0 Do Q\n${x.toFixed(3)} ${y.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)} re S\n`;
  }
  if (ascii) content += `BT /F1 8 Tf 0.45 g ${mm(12).toFixed(2)} ${mm(pageH - 8).toFixed(2)} Td (${ascii}) Tj ET\n`;
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${mm(pageW).toFixed(3)} ${mm(pageH).toFixed(3)}] /Resources << /XObject << /Im0 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${jpegW} /Height ${jpegH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream']);
  const cb = enc.encode(content);
  obj(5, [`<< /Length ${cb.length} >>\nstream\n`, cb, '\nendstream']);
  obj(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const xref = len;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let p = 0; for (const b of parts) { out.set(b, p); p += b.length; }
  return out;
}
