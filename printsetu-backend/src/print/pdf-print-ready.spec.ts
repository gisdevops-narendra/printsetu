import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from 'pdf-lib';
import { makePdfPrintReady } from './pdf-print-ready';

async function pdfWithAnnot(
  fields: Record<string, unknown>,
  withAppearance = true,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  page.drawText('body text');
  const ap = pdf.context.register(
    pdf.context.stream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 20] }),
  );
  const annot = pdf.context.obj({
    Type: 'Annot',
    Rect: [50, 700, 150, 720],
    ...(withAppearance ? { AP: { N: ap } } : {}),
    ...fields,
  });
  page.node.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.register(annot)]));
  return Buffer.from(await pdf.save());
}

async function annotFlags(bytes: Buffer): Promise<number> {
  const pdf = await PDFDocument.load(bytes);
  const annot = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
  return annot.lookupMaybe(PDFName.of('F'), PDFNumber)?.asNumber() ?? 0;
}

async function pdfWithLayer(printState: 'ON' | 'OFF', viewOff = false): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('layer text');
  const ocg = pdf.context.register(
    pdf.context.obj({ Type: 'OCG', Name: 'L', Usage: { Print: { PrintState: printState } } }),
  );
  const config: { Order: PDFRef[]; OFF?: PDFRef[] } = { Order: [ocg] };
  if (viewOff) config.OFF = [ocg];
  pdf.catalog.set(PDFName.of('OCProperties'), pdf.context.obj({ OCGs: [ocg], D: config }));
  return Buffer.from(await pdf.save());
}

async function layerPrintState(bytes: Buffer): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const ocgs = pdf.catalog
    .lookup(PDFName.of('OCProperties'), PDFDict)
    .lookup(PDFName.of('OCGs'), PDFArray);
  const ocg = pdf.context.lookup(ocgs.get(0) as PDFRef, PDFDict);
  const print = ocg.lookup(PDFName.of('Usage'), PDFDict).lookup(PDFName.of('Print'), PDFDict);
  return (print.get(PDFName.of('PrintState')) as PDFName).decodeText();
}

describe('makePdfPrintReady', () => {
  it('leaves an ordinary PDF alone', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('hello');
    expect(await makePdfPrintReady(Buffer.from(await pdf.save()))).toBeNull();
  });

  it('turns on printing for a visible annotation that lacked the Print flag', async () => {
    const out = await makePdfPrintReady(await pdfWithAnnot({ Subtype: 'FreeText' }));
    expect(out).not.toBeNull();
    expect((await annotFlags(out!)) & 4).toBe(4);
  });

  it('keeps other flags when adding Print', async () => {
    const out = await makePdfPrintReady(await pdfWithAnnot({ Subtype: 'FreeText', F: 128 })); // Locked
    expect(await annotFlags(out!)).toBe(128 | 4);
  });

  it('does not touch annotations that already print, are hidden, are popups or draw nothing', async () => {
    expect(await makePdfPrintReady(await pdfWithAnnot({ Subtype: 'FreeText', F: 4 }))).toBeNull();
    expect(await makePdfPrintReady(await pdfWithAnnot({ Subtype: 'FreeText', F: 2 }))).toBeNull();
    expect(await makePdfPrintReady(await pdfWithAnnot({ Subtype: 'FreeText', F: 32 }))).toBeNull();
    expect(await makePdfPrintReady(await pdfWithAnnot({ Subtype: 'Popup' }))).toBeNull();
    expect(await makePdfPrintReady(await pdfWithAnnot({ Subtype: 'Link' }, false))).toBeNull();
  });

  it('prints a layer that is shown on screen but set not to print', async () => {
    const out = await makePdfPrintReady(await pdfWithLayer('OFF'));
    expect(out).not.toBeNull();
    expect(await layerPrintState(out!)).toBe('ON');
  });

  it('leaves layers hidden on screen, or already printing, as they are', async () => {
    expect(await makePdfPrintReady(await pdfWithLayer('OFF', true))).toBeNull();
    expect(await makePdfPrintReady(await pdfWithLayer('ON'))).toBeNull();
  });

  it('returns null for data it cannot parse', async () => {
    expect(await makePdfPrintReady(Buffer.from('not a pdf'))).toBeNull();
  });
});
