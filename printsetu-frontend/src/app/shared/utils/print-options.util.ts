import { ColorMode, PaperSize, SideMode } from '../../core/models/models';

/** Plain-language names for the print option codes the API uses. */
export const PAPER_LABELS: Record<PaperSize, string> = { A4: 'A4', A3: 'A3', LETTER: 'Letter', LEGAL: 'Legal' };
export const COLOR_LABELS: Record<ColorMode, string> = { BW: 'B&W', COLOR: 'Color' };
export const SIDE_LABELS: Record<SideMode, string> = { SIMPLEX: 'Single-sided', DUPLEX: 'Double-sided' };

/** "A4 · B&W · Single-sided", plus " · 2 copies" when copies is given. */
export function printOptionsLabel(o: {
  paperSize: PaperSize;
  colorMode: ColorMode;
  sideMode: SideMode;
  copies?: number;
}): string {
  const base = `${PAPER_LABELS[o.paperSize] ?? o.paperSize} · ${COLOR_LABELS[o.colorMode] ?? o.colorMode} · ${
    SIDE_LABELS[o.sideMode] ?? o.sideMode
  }`;
  return o.copies === undefined ? base : `${base} · ${o.copies} ${o.copies === 1 ? 'copy' : 'copies'}`;
}
