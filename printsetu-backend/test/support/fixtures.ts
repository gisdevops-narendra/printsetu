/**
 * Builds a real, minimal, structurally-valid single-page PDF (not just a
 * `%PDF-` magic-byte stub) so the full pipeline — FileValidationService's
 * signature check, storage, and the real PyMuPDF doc-analysis service —
 * can actually open it and report a page count, exercising the genuine
 * upload -> analysis integration path instead of stopping at "looks like
 * a PDF". Byte offsets in the xref table are computed from the buffer
 * being built, not hardcoded, so this stays correct if the content above
 * ever changes.
 */
export function buildMinimalPdf(): Buffer {
  const streamContent = 'BT /F1 24 Tf 50 100 Td (Hello PrintSetu) Tj ET\n';
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'latin1')} >>\nstream\n${streamContent}endstream\nendobj\n`,
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += obj;
  }

  const xrefStart = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(body + xref + trailer, 'latin1');
}
