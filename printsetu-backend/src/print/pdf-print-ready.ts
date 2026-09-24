import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from 'pdf-lib';

// PDF annotation flags (PDF 32000-1 §12.5.3).
const ANNOT_HIDDEN = 1 << 1;
const ANNOT_PRINT = 1 << 2;
const ANNOT_NO_VIEW = 1 << 5;

/** Where the print-ready copy of an item's PDF is stored (overwritten on each dispatch, removed by retention). */
export function printReadyKey(document: { shopId: string; id: string }, itemId: string): string {
  return `${document.shopId}/${document.id}/print-ready/${itemId}.pdf`;
}

/**
 * PDFs can carry content that shows on screen but is skipped when printed:
 * annotations without the Print flag (text added with a viewer's "Add
 * text" / comment / markup tools, typical of files prepared on a computer)
 * and optional-content layers marked PrintState OFF. SumatraPDF (the Print
 * Agent's Windows engine) honours those flags, so such a page comes out
 * blank even though the customer and shopkeeper both see text.
 *
 * Returns a copy where everything visible on screen also prints, or null
 * when the PDF has nothing to fix (or can't be safely rewritten, e.g. it is
 * encrypted) — the caller then prints the file exactly as uploaded.
 */
export async function makePdfPrintReady(bytes: Buffer): Promise<Buffer | null> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    return null; // encrypted or unparseable by pdf-lib: leave it to the printer as-is
  }

  const annotsFixed = printVisibleAnnotations(pdf);
  const layersFixed = printVisibleLayers(pdf);
  if (!annotsFixed && !layersFixed) return null;

  return Buffer.from(await pdf.save());
}

function printVisibleAnnotations(pdf: PDFDocument): boolean {
  let changed = false;
  for (const page of pdf.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookupMaybe(i, PDFDict);
      if (!annot) continue;
      // Only annotations that actually draw something on screen: popups are
      // the note windows of comments, and without an appearance stream
      // nothing is drawn in either case.
      if (annot.get(PDFName.of('Subtype')) === PDFName.of('Popup')) continue;
      if (!annot.has(PDFName.of('AP'))) continue;
      const flags = annot.lookupMaybe(PDFName.of('F'), PDFNumber)?.asNumber() ?? 0;
      if (flags & (ANNOT_HIDDEN | ANNOT_NO_VIEW)) continue;
      if (flags & ANNOT_PRINT) continue;
      annot.set(PDFName.of('F'), PDFNumber.of(flags | ANNOT_PRINT));
      changed = true;
    }
  }
  return changed;
}

function printVisibleLayers(pdf: PDFDocument): boolean {
  const ocProperties = pdf.catalog.lookupMaybe(PDFName.of('OCProperties'), PDFDict);
  const ocgs = ocProperties?.lookupMaybe(PDFName.of('OCGs'), PDFArray);
  if (!ocProperties || !ocgs) return false;

  const defaults = ocProperties.lookupMaybe(PDFName.of('D'), PDFDict);
  const refsIn = (key: string): Set<string> =>
    new Set(
      (defaults?.lookupMaybe(PDFName.of(key), PDFArray)?.asArray() ?? [])
        .filter((entry): entry is PDFRef => entry instanceof PDFRef)
        .map((ref) => ref.toString()),
    );
  const baseOff = defaults?.get(PDFName.of('BaseState')) === PDFName.of('OFF');
  const on = refsIn('ON');
  const off = refsIn('OFF');

  let changed = false;
  for (const entry of ocgs.asArray()) {
    if (!(entry instanceof PDFRef)) continue;
    const visibleOnScreen = baseOff ? on.has(entry.toString()) : !off.has(entry.toString());
    if (!visibleOnScreen) continue;
    const printUsage = pdf.context
      .lookupMaybe(entry, PDFDict)
      ?.lookupMaybe(PDFName.of('Usage'), PDFDict)
      ?.lookupMaybe(PDFName.of('Print'), PDFDict);
    if (printUsage?.get(PDFName.of('PrintState')) !== PDFName.of('OFF')) continue;
    printUsage.set(PDFName.of('PrintState'), PDFName.of('ON'));
    changed = true;
  }
  return changed;
}
