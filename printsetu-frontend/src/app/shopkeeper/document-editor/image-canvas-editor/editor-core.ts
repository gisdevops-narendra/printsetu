import { t } from '../../../core/i18n/i18n';
/**
 * Types, constants and pure placement maths shared by the interactive image
 * canvas editor and the "apply to all documents" batch renderer, so both
 * always agree on exactly where an image lands on the printed page.
 */

export type CanvasEditorPaperKey = 'A4' | 'A3' | 'LETTER' | '4X6' | '5X7' | 'PASSPORT';

/** How the image is placed on the page. `crop` is the free crop box. */
export type FitMode = 'crop' | 'fit' | 'fill' | 'stretch' | 'center' | 'custom';
export type ColorEffect = 'none' | 'grayscale' | 'bw';
export type ExportFormat = 'jpeg' | 'png';

export const TARGET_DPI = 300;
export const MM_PER_INCH = 25.4;
export const MAX_EXPORT_PIXELS = 6000;

export const PAPER_SIZES_MM: Record<CanvasEditorPaperKey, { label: string; width: number; height: number }> = {
  A4: { label: 'A4', width: 210, height: 297 },
  A3: { label: 'A3', width: 297, height: 420 },
  LETTER: { get label() { return t('imageEditor.letter'); }, width: 215.9, height: 279.4 },
  '4X6': { label: '4×6"', width: 101.6, height: 152.4 },
  '5X7': { label: '5×7"', width: 127, height: 177.8 },
  PASSPORT: { get label() { return t('imageEditor.passport_35_45mm'); }, width: 35, height: 45 },
};

export interface Placement {
  scaleX: number;
  scaleY: number;
}

/**
 * Scale that places an image on a content area for a given fit mode.
 *
 * @param natural   image size in its own pixels
 * @param angle     total rotation in degrees (bounding box maths)
 * @param quarter   true when rotated 90/270 (used by stretch/custom, which
 *                  size the image along its own edges as displayed)
 * @param content   the area the image may occupy, in output units
 * @param pxPerMm   output units per printed millimetre
 * @param custom    exact printed size in mm (custom mode only)
 */
export function computePlacement(
  mode: Exclude<FitMode, 'crop'>,
  natural: { w: number; h: number },
  angle: number,
  quarter: boolean,
  content: { w: number; h: number },
  pxPerMm: number,
  custom: { w: number; h: number },
): Placement {
  const rad = (angle * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const unitW = natural.w * c + natural.h * s;
  const unitH = natural.w * s + natural.h * c;

  switch (mode) {
    case 'fit': {
      const k = Math.min(content.w / unitW, content.h / unitH);
      return { scaleX: k, scaleY: k };
    }
    case 'fill': {
      const k = Math.max(content.w / unitW, content.h / unitH);
      return { scaleX: k, scaleY: k };
    }
    case 'stretch':
      // Stretched along the image's own edges (the fine straighten angle is
      // ignored so the result is always exactly the content area).
      return quarter
        ? { scaleX: content.h / natural.w, scaleY: content.w / natural.h }
        : { scaleX: content.w / natural.w, scaleY: content.h / natural.h };
    case 'center': {
      const actual = (pxPerMm * MM_PER_INCH) / TARGET_DPI;
      const k = Math.min(actual, content.w / unitW, content.h / unitH);
      return { scaleX: k, scaleY: k };
    }
    case 'custom': {
      const wPx = custom.w * pxPerMm;
      const hPx = custom.h * pxPerMm;
      return quarter
        ? { scaleX: hPx / natural.w, scaleY: wPx / natural.h }
        : { scaleX: wPx / natural.w, scaleY: hPx / natural.h };
    }
  }
}
