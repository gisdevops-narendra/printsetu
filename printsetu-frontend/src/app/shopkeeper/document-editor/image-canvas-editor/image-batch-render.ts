import { FabricImage, Rect, StaticCanvas, filters } from 'fabric';
import {
  ColorEffect,
  ExportFormat,
  FitMode,
  MAX_EXPORT_PIXELS,
  MM_PER_INCH,
  PAPER_SIZES_MM,
  CanvasEditorPaperKey,
  TARGET_DPI,
  computePlacement,
} from './editor-core';

/** The settings that make sense to copy from one document to the others. */
export interface BatchParams {
  paperSize: CanvasEditorPaperKey;
  /** `crop` is per-image, so the batch renders it as `fill`. */
  fitMode: FitMode;
  marginMm: number;
  borderMm: number;
  borderColor: string;
  customWmm: number;
  customHmm: number;
  brightness: number;
  contrast: number;
  saturation: number;
  effect: ColorEffect;
  flipH: boolean;
  flipV: boolean;
  format: ExportFormat;
  quality: number;
}

export interface BatchResult {
  dataUrl: string;
  width: number;
  height: number;
  dpi: number;
  paperSize: CanvasEditorPaperKey;
  format: ExportFormat;
  quality: number;
}

/**
 * Renders one image with the given settings, headlessly (no on-screen
 * editor), at print resolution. Uses the same placement maths as the live
 * editor so the result matches what the shopkeeper saw on the first document.
 */
export async function renderImageBatch(url: string, p: BatchParams): Promise<BatchResult> {
  const paper = PAPER_SIZES_MM[p.paperSize];
  let width = Math.round((paper.width / MM_PER_INCH) * TARGET_DPI);
  let height = Math.round((paper.height / MM_PER_INCH) * TARGET_DPI);
  const largest = Math.max(width, height);
  if (largest > MAX_EXPORT_PIXELS) {
    const k = MAX_EXPORT_PIXELS / largest;
    width = Math.round(width * k);
    height = Math.round(height * k);
  }
  const pxPerMm = width / paper.width;

  // Same-origin blob URL: presigned MinIO URLs are cross-origin and would
  // taint the canvas (see ImageCanvasEditorComponent.loadImage).
  const blob = await (await fetch(url)).blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    const img = await FabricImage.fromURL(blobUrl, { crossOrigin: 'anonymous' });
    const canvas = new StaticCanvas(undefined, { width, height, backgroundColor: '#ffffff' });

    const mode = (p.fitMode === 'crop' ? 'fill' : p.fitMode) as Exclude<FitMode, 'crop'>;
    const margin = p.marginMm * pxPerMm;
    const content = { w: Math.max(10, width - 2 * margin), h: Math.max(10, height - 2 * margin) };
    const { scaleX, scaleY } = computePlacement(
      mode,
      { w: img.width, h: img.height },
      0,
      false,
      content,
      pxPerMm,
      { w: p.customWmm, h: p.customHmm },
    );
    img.set({
      left: width / 2,
      top: height / 2,
      originX: 'center',
      originY: 'center',
      scaleX,
      scaleY,
      flipX: p.flipH,
      flipY: p.flipV,
    });
    const list: FabricImage['filters'] = [
      new filters.Brightness({ brightness: p.brightness / 100 }),
      new filters.Contrast({ contrast: p.contrast / 100 }),
      new filters.Saturation({ saturation: p.saturation / 100 }),
    ];
    if (p.effect === 'grayscale') list.push(new filters.Grayscale());
    if (p.effect === 'bw') list.push(new filters.BlackWhite());
    img.filters = list;
    img.applyFilters();
    img.clipPath = new Rect({
      left: width / 2,
      top: height / 2,
      originX: 'center',
      originY: 'center',
      width: content.w,
      height: content.h,
      absolutePositioned: true,
    });
    canvas.add(img);

    if (p.borderMm > 0) {
      const px = p.borderMm * pxPerMm;
      const bw = Math.min(content.w, img.getScaledWidth());
      const bh = Math.min(content.h, img.getScaledHeight());
      if (bw > px * 2 && bh > px * 2) {
        canvas.add(
          new Rect({
            left: width / 2,
            top: height / 2,
            originX: 'center',
            originY: 'center',
            width: bw - px,
            height: bh - px,
            fill: 'transparent',
            stroke: p.borderColor,
            strokeWidth: px,
          }),
        );
      }
    }
    canvas.renderAll();
    const dataUrl = canvas.toDataURL({
      format: p.format,
      quality: p.format === 'jpeg' ? p.quality / 100 : 1,
      multiplier: 1,
    });
    canvas.dispose();
    return { dataUrl, width, height, dpi: TARGET_DPI, paperSize: p.paperSize, format: p.format, quality: p.quality };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
