import { ColorMode, PaperSize, SideMode } from '../../core/models/models';
import { t, tn } from '../../core/i18n/i18n';

/** Plain-language names for the print option codes the API uses (translated on every read). */
export const PAPER_LABELS: Record<PaperSize, string> = {
  A4: 'A4',
  A3: 'A3',
  get LETTER() {
    return t('shared.letter');
  },
  get LEGAL() {
    return t('shared.legal');
  },
};
export const COLOR_LABELS: Record<ColorMode, string> = {
  get BW() {
    return t('shared.bw');
  },
  get COLOR() {
    return t('common.color');
  },
};
export const SIDE_LABELS: Record<SideMode, string> = {
  get SIMPLEX() {
    return t('shared.single_sided');
  },
  get DUPLEX() {
    return t('shared.double_sided');
  },
};

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
  return o.copies === undefined ? base : `${base} · ${tn('common.count.copies', o.copies)}`;
}
