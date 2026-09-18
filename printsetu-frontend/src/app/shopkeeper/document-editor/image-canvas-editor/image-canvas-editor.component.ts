import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { Subject, debounceTime } from 'rxjs';
import { Canvas, FabricImage, Point, Rect, StaticCanvas, filters, type TPointerEventInfo } from 'fabric';

export type CanvasEditorPaperKey = 'A4' | 'A3' | 'LETTER' | '4X6' | '5X7' | 'PASSPORT';

export interface CanvasEditorSaveResult {
  imageData: string;
  width: number;
  height: number;
  dpi: number;
  paperSize: CanvasEditorPaperKey;
}

const VIEWPORT_W = 800;
const VIEWPORT_H = 600;
const TARGET_DPI = 300;
const LOW_DPI_THRESHOLD = 150;
const MAX_EXPORT_PIXELS = 6000;

const PAPER_SIZES_MM: Record<CanvasEditorPaperKey, { label: string; width: number; height: number }> = {
  A4: { label: 'A4', width: 210, height: 297 },
  A3: { label: 'A3', width: 297, height: 420 },
  LETTER: { label: 'Letter', width: 215.9, height: 279.4 },
  '4X6': { label: '4×6"', width: 101.6, height: 152.4 },
  '5X7': { label: '5×7"', width: 127, height: 177.8 },
  PASSPORT: { label: 'Passport (35×45mm)', width: 35, height: 45 },
};

/**
 * Free-form client-side photo editor (image documents only — PDFs keep the
 * server-side pdf-lib rotate/crop tool). Everything here — pan/zoom, the
 * paper-size guide, the aspect-locked crop rect, brightness/contrast/
 * saturation, rotation/straighten — is composited live on a Fabric.js
 * canvas, and `save()` exports one final high-res raster the parent
 * uploads as-is (see ShopkeeperService.uploadRenderedImage). The server
 * never re-applies these edits — what's on screen here is what prints.
 */
@Component({
  selector: 'app-image-canvas-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, SliderModule, ToggleSwitchModule, TooltipModule, ProgressSpinnerModule],
  template: `
    <div class="ce">
      <div class="ce__main">
        <div class="ce__toolbar">
          <div class="tb-field">
            <span class="tb-label">Paper</span>
            <p-select
              [options]="paperOptions"
              [(ngModel)]="paperSizeValue"
              optionLabel="label"
              optionValue="key"
              size="small"
              appendTo="body"
              styleClass="tb-select"
              (onChange)="onPaperSizeChange()"
            />
          </div>
          <label class="tb-field tb-switch">
            <p-toggleswitch [(ngModel)]="bleedValue" (onChange)="onBleedChange()" />
            <span>3mm bleed</span>
          </label>

          <span class="flex-spacer"></span>

          <div class="zoom-controls">
            <button type="button" class="icon-btn" (click)="zoomBy(1 / 1.25)" title="Zoom out"><i class="pi pi-search-minus"></i></button>
            <button type="button" class="zoom-controls__value" (click)="fitView()" title="Fit to view">{{ (viewZoom() * 100).toFixed(0) }}%</button>
            <button type="button" class="icon-btn" (click)="zoomBy(1.25)" title="Zoom in"><i class="pi pi-search-plus"></i></button>
          </div>
          <p-button
            label="Preview"
            icon="pi pi-eye"
            size="small"
            severity="secondary"
            [outlined]="!printPreview()"
            (onClick)="togglePrintPreview()"
          />
        </div>

        <div class="ce__stage">
          <div class="ce__canvas" #stageRef>
            <canvas #canvasRef width="800" height="600"></canvas>
          </div>

          @if (loading()) {
            <div class="ce__overlay"><p-progressSpinner strokeWidth="4" /></div>
          }
          @if (dpiWarning()) {
            <div class="dpi-banner">
              <i class="pi pi-exclamation-triangle"></i>
              <span>May look blurry at {{ paperLabel() }} &mdash; {{ effectiveDpi() }} DPI (300 recommended)</span>
            </div>
          }
        </div>
      </div>

      <aside class="ce__inspector">
        <div class="ce__panels">
          <section class="panel">
            <h4 class="panel__title"><i class="pi pi-crop"></i> Crop</h4>
            <div class="btn-row">
              <p-button icon="pi pi-expand" label="Fit page" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="fitToPage()" />
              <p-button icon="pi pi-undo" label="Reset" size="small" severity="secondary" [text]="true" styleClass="w-full" (onClick)="resetCrop()" />
            </div>
            @if (effectiveDpi() !== null) {
              <div class="dpi-chip" [class.is-low]="dpiWarning()">
                <i class="pi" [ngClass]="dpiWarning() ? 'pi-exclamation-circle' : 'pi-check-circle'"></i>
                <span>{{ effectiveDpi() }} DPI at {{ paperLabel() }}</span>
              </div>
            }
          </section>

          <section class="panel">
            <h4 class="panel__title"><i class="pi pi-sync"></i> Rotate</h4>
            <div class="btn-row">
              <p-button icon="pi pi-replay" label="Left" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="rotate(-90)" />
              <p-button icon="pi pi-refresh" label="Right" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="rotate(90)" />
            </div>
            <div class="slider-row">
              <div class="slider-row__head">
                <label>Straighten</label>
                <span class="slider-row__value">{{ fineAngle() > 0 ? '+' : '' }}{{ fineAngle() }}°</span>
              </div>
              <p-slider [(ngModel)]="fineAngleValue" [min]="-45" [max]="45" (onChange)="applyRotation()" />
            </div>
          </section>

          <section class="panel">
            <div class="panel__head">
              <h4 class="panel__title"><i class="pi pi-sliders-h"></i> Adjust</h4>
              <button type="button" class="link-btn" (click)="resetAdjustments()">Reset</button>
            </div>
            <div class="slider-row">
              <div class="slider-row__head">
                <label>Brightness</label>
                <span class="slider-row__value">{{ brightness() }}</span>
              </div>
              <p-slider [(ngModel)]="brightnessValue" [min]="-100" [max]="100" (ngModelChange)="onAdjustmentChange()" />
            </div>
            <div class="slider-row">
              <div class="slider-row__head">
                <label>Contrast</label>
                <span class="slider-row__value">{{ contrast() }}</span>
              </div>
              <p-slider [(ngModel)]="contrastValue" [min]="-100" [max]="100" (ngModelChange)="onAdjustmentChange()" />
            </div>
            <div class="slider-row">
              <div class="slider-row__head">
                <label>Saturation</label>
                <span class="slider-row__value">{{ saturation() }}</span>
              </div>
              <p-slider [(ngModel)]="saturationValue" [min]="-100" [max]="100" (ngModelChange)="onAdjustmentChange()" />
            </div>
          </section>
        </div>

        <div class="ce__actions">
          <div class="btn-row btn-row--actions">
            <p-button label="Discard" severity="secondary" [outlined]="true" size="small" styleClass="w-full" (onClick)="cancelled.emit()" [disabled]="saving || exporting()" />
            <p-button label="Save edit" icon="pi pi-check" [pTooltip]="'Exports ' + paperLabel() + ' at ' + TARGET_DPI + ' DPI'" tooltipPosition="top" size="small" styleClass="w-full" (onClick)="applyAndSave()" [loading]="saving || exporting()" [disabled]="loading()" />
          </div>
        </div>
      </aside>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        --ink: #0f172a;
        --muted: #64748b;
        --line: #e2e8f0;
        --surface: #ffffff;
        --soft: #f8fafc;
      }
      .ce {
        height: 100%;
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 248px;
        gap: 1rem;
      }
      @media (max-width: 1180px) {
        :host {
          height: auto;
        }
        .ce {
          height: auto;
          grid-template-columns: 1fr;
          grid-template-rows: auto auto;
        }
        .ce__stage {
          flex: 0 0 auto;
          height: 60vh;
        }
        .ce__panels {
          overflow: visible;
        }
      }
      .ce__main {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
        min-width: 0;
        min-height: 0;
      }

      /* ---------- Toolbar ---------- */
      .ce__toolbar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem 0.875rem;
        flex: 0 0 auto;
      }
      .flex-spacer {
        flex: 1 1 auto;
      }
      .tb-field {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      .tb-label {
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
      }
      .tb-switch {
        cursor: pointer;
        font-size: 0.8125rem;
        font-weight: 500;
        color: #475569;
      }
      .zoom-controls {
        display: inline-flex;
        align-items: center;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 0.125rem;
      }
      .zoom-controls__value {
        border: none;
        background: none;
        min-width: 3.25rem;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #334155;
        cursor: pointer;
        font-variant-numeric: tabular-nums;
      }
      .icon-btn {
        border: none;
        background: none;
        color: #64748b;
        cursor: pointer;
        width: 2rem;
        height: 2rem;
        border-radius: 8px;
        font-size: 0.8125rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .icon-btn:hover {
        background: #eef2ff;
        color: var(--p-primary-600);
      }

      /* ---------- Stage ---------- */
      .ce__stage {
        position: relative;
        flex: 1 1 auto;
        min-height: 320px;
        border: 1px solid var(--line);
        border-radius: 14px;
        overflow: hidden;
        background-color: #eef1f6;
        background-image: radial-gradient(#cfd6e2 1px, transparent 1px);
        background-size: 18px 18px;
      }
      /* Absolutely positioned so Fabric's own pixel-sized wrapper can never
         feed back into the stage's size (it's resized from this box). */
      .ce__canvas {
        position: absolute;
        inset: 0;
      }
      .ce__canvas canvas {
        display: block;
      }
      .ce__overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(238, 241, 246, 0.8);
        z-index: 3;
      }
      .dpi-banner {
        position: absolute;
        top: 0.75rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        max-width: calc(100% - 1.5rem);
        background: #fffbeb;
        border: 1px solid #fcd34d;
        color: #92400e;
        border-radius: 999px;
        padding: 0.375rem 0.875rem;
        font-size: 0.75rem;
        font-weight: 500;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
      }


      /* ---------- Inspector ---------- */
      .ce__inspector {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-height: 0;
      }
      .ce__panels {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .panel {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .panel__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .panel__title {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
        display: flex;
        align-items: center;
        gap: 0.4rem;
      }
      .btn-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
      }
      .btn-row--actions {
        grid-template-columns: 1fr 1.5fr;
      }
      .btn-row--actions ::ng-deep .p-button-label {
        white-space: nowrap;
      }
      .link-btn {
        border: none;
        background: none;
        padding: 0;
        color: var(--p-primary-600);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
      }
      .link-btn:hover {
        text-decoration: underline;
      }
      .slider-row {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .slider-row__head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
      }
      .slider-row__head label {
        font-size: 0.8125rem;
        font-weight: 500;
        color: #334155;
      }
      .slider-row__value {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--muted);
        font-variant-numeric: tabular-nums;
        min-width: 2.5rem;
        text-align: right;
      }
      .dpi-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.375rem 0.625rem;
        border-radius: 8px;
        background: #ecfdf5;
        color: #047857;
      }
      .dpi-chip.is-low {
        background: #fffbeb;
        color: #b45309;
      }
      .ce__actions {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 0.625rem;
      }

    `,
  ],
})
export class ImageCanvasEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasRef') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('stageRef') stageRef!: ElementRef<HTMLDivElement>;

  @Input({ required: true }) imageUrl!: string;
  /** True while the parent is uploading the exported file. */
  @Input() saving = false;

  @Output() save = new EventEmitter<CanvasEditorSaveResult>();
  @Output() cancelled = new EventEmitter<void>();

  readonly TARGET_DPI = TARGET_DPI;
  readonly paperOptions = (Object.keys(PAPER_SIZES_MM) as CanvasEditorPaperKey[]).map((key) => ({
    key,
    label: PAPER_SIZES_MM[key].label,
  }));

  loading = signal(true);
  exporting = signal(false);
  viewZoom = signal(1);
  paperSize = signal<CanvasEditorPaperKey>('A4');
  showBleed = signal(false);
  brightness = signal(0);
  contrast = signal(0);
  saturation = signal(0);
  rotationSnap = signal<0 | 90 | 180 | 270>(0);
  fineAngle = signal(0);
  printPreview = signal(false);
  effectiveDpi = signal<number | null>(null);

  dpiWarning = computed(() => {
    const dpi = this.effectiveDpi();
    return dpi !== null && dpi < LOW_DPI_THRESHOLD;
  });
  paperLabel = computed(() => PAPER_SIZES_MM[this.paperSize()].label);

  // ngModel two-way bindings for PrimeNG controls (kept separate from the
  // signals above, which drive canvas state imperatively).
  get paperSizeValue(): CanvasEditorPaperKey {
    return this.paperSize();
  }
  set paperSizeValue(v: CanvasEditorPaperKey) {
    this.paperSize.set(v);
  }
  get bleedValue(): boolean {
    return this.showBleed();
  }
  set bleedValue(v: boolean) {
    this.showBleed.set(v);
  }
  get brightnessValue(): number {
    return this.brightness();
  }
  set brightnessValue(v: number) {
    this.brightness.set(v);
  }
  get contrastValue(): number {
    return this.contrast();
  }
  set contrastValue(v: number) {
    this.contrast.set(v);
  }
  get saturationValue(): number {
    return this.saturation();
  }
  set saturationValue(v: number) {
    this.saturation.set(v);
  }
  get fineAngleValue(): number {
    return this.fineAngle();
  }
  set fineAngleValue(v: number) {
    this.fineAngle.set(v);
  }

  private canvas!: Canvas;
  private image!: FabricImage;
  private guideRect!: Rect;
  private bleedRect?: Rect;
  private cropRect!: Rect;

  private brightnessFilter = new filters.Brightness({ brightness: 0 });
  private contrastFilter = new filters.Contrast({ contrast: 0 });
  private saturationFilter = new filters.Saturation({ saturation: 0 });

  private readonly filterChange$ = new Subject<void>();
  private resizeObserver?: ResizeObserver;
  private baseScale = 1;
  private isPanning = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  async ngAfterViewInit(): Promise<void> {
    const stage = this.stageRef.nativeElement;
    this.canvas = new Canvas(this.canvasRef.nativeElement, {
      width: stage.clientWidth || VIEWPORT_W,
      height: stage.clientHeight || VIEWPORT_H,
      selection: false,
      preserveObjectStacking: true,
      defaultCursor: 'grab',
    });
    this.setupPanZoom();
    this.fitView();
    // Scene coordinates stay a fixed 800x600 "world"; the canvas element
    // itself follows its container and the viewport transform scales the
    // world to fit, so the editor never clips or overflows at any width.
    this.resizeObserver = new ResizeObserver(() => this.fitView());
    this.resizeObserver.observe(stage);
    this.canvas.on('object:modified', (e) => {
      if (e.target === this.cropRect) this.updateDpi();
    });
    this.canvas.on('object:scaling', (e) => {
      if (e.target !== this.cropRect) return;
      // Force uniform scaling so the rect's fixed width:height ratio
      // (set to the paper guide's aspect ratio whenever it's (re)created)
      // never drifts during an interactive corner-drag resize.
      e.target.set({ scaleY: e.target.scaleX });
      this.updateDpi();
    });

    this.filterChange$.pipe(debounceTime(50)).subscribe(() => this.applyLiveFilters());

    await this.loadImage();
    this.drawPaperGuide();
    this.fitToPage();
    this.loading.set(false);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.filterChange$.complete();
    this.canvas?.dispose();
  }

  // ---- View (fit / zoom) ----

  /** Resizes the canvas to its stage and fits the whole 800x600 world in it. */
  fitView(): void {
    if (!this.canvas) return;
    const el = this.stageRef.nativeElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    this.canvas.setDimensions({ width: w, height: h });
    this.baseScale = Math.min(w / VIEWPORT_W, h / VIEWPORT_H);
    const s = this.baseScale;
    this.canvas.setViewportTransform([s, 0, 0, s, (w - VIEWPORT_W * s) / 2, (h - VIEWPORT_H * s) / 2]);
    this.viewZoom.set(1);
    this.canvas.requestRenderAll();
  }

  zoomBy(factor: number): void {
    const el = this.stageRef.nativeElement;
    this.zoomTo(this.canvas.getZoom() * factor, new Point(el.clientWidth / 2, el.clientHeight / 2));
  }

  private zoomTo(zoom: number, point: Point): void {
    const clamped = Math.max(this.baseScale * 0.5, Math.min(this.baseScale * 6, zoom));
    this.canvas.zoomToPoint(point, clamped);
    this.viewZoom.set(Math.round((clamped / this.baseScale) * 100) / 100);
  }

  // ---- Load ----

  private async loadImage(): Promise<void> {
    // Fetch bytes ourselves and load from a same-origin blob: URL — the
    // source is a presigned MinIO URL on a different origin than the app,
    // and canvas.toDataURL()/toBlob() throw a SecurityError on a
    // cross-origin image unless the object store sends CORS headers. A
    // blob: URL is always same-origin, so this sidesteps needing MinIO
    // CORS configuration entirely (same trick already used for the PDF
    // preview's pdf.js fetch).
    const blob = await (await fetch(this.imageUrl)).blob();
    const blobUrl = URL.createObjectURL(blob);
    try {
      const img = await FabricImage.fromURL(blobUrl, { crossOrigin: 'anonymous' });
      this.image = img;
      const naturalW = img.width;
      const naturalH = img.height;
      const scale = Math.min((VIEWPORT_W * 0.85) / naturalW, (VIEWPORT_H * 0.85) / naturalH);
      img.set({
        left: VIEWPORT_W / 2,
        top: VIEWPORT_H / 2,
        originX: 'center',
        originY: 'center',
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented: false,
      });
      img.filters = [this.brightnessFilter, this.contrastFilter, this.saturationFilter];
      img.applyFilters();
      this.canvas.add(img);
      this.canvas.sendObjectToBack(img);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  // ---- Pan / zoom ----

  private setupPanZoom(): void {
    this.canvas.on('mouse:wheel', (opt: TPointerEventInfo<WheelEvent>) => {
      const delta = opt.e.deltaY;
      this.zoomTo(this.canvas.getZoom() * 0.999 ** delta, opt.viewportPoint);
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

    this.canvas.on('mouse:down', (opt: TPointerEventInfo) => {
      // Only pan when not grabbing the crop rect itself.
      if (opt.target) return;
      this.isPanning = true;
      this.canvas.setCursor('grabbing');
      this.canvas.selection = false;
      this.lastPointerX = opt.viewportPoint.x;
      this.lastPointerY = opt.viewportPoint.y;
    });
    this.canvas.on('mouse:move', (opt: TPointerEventInfo) => {
      if (!this.isPanning) return;
      const vpt = this.canvas.viewportTransform;
      vpt[4] += opt.viewportPoint.x - this.lastPointerX;
      vpt[5] += opt.viewportPoint.y - this.lastPointerY;
      this.lastPointerX = opt.viewportPoint.x;
      this.lastPointerY = opt.viewportPoint.y;
      this.canvas.requestRenderAll();
    });
    this.canvas.on('mouse:up', () => {
      this.isPanning = false;
      this.canvas.setCursor('grab');
      this.canvas.selection = false;
    });
  }

  // ---- Paper guide ----

  onPaperSizeChange(): void {
    this.drawPaperGuide();
    this.fitToPage();
  }

  onBleedChange(): void {
    this.drawPaperGuide();
  }

  private drawPaperGuide(): void {
    if (this.guideRect) this.canvas.remove(this.guideRect);
    if (this.bleedRect) {
      this.canvas.remove(this.bleedRect);
      this.bleedRect = undefined;
    }
    const size = PAPER_SIZES_MM[this.paperSize()];
    const aspect = size.width / size.height;
    const maxW = VIEWPORT_W * 0.6;
    const maxH = VIEWPORT_H * 0.6;
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    this.guideRect = new Rect({
      left: VIEWPORT_W / 2,
      top: VIEWPORT_H / 2,
      originX: 'center',
      originY: 'center',
      width: w,
      height: h,
      fill: 'transparent',
      stroke: '#94a3b8',
      strokeWidth: 1.5,
      strokeUniform: true,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
    });
    this.canvas.add(this.guideRect);

    if (this.showBleed()) {
      const pxPerMm = w / size.width;
      const bleedPx = 3 * pxPerMm;
      this.bleedRect = new Rect({
        left: VIEWPORT_W / 2,
        top: VIEWPORT_H / 2,
        originX: 'center',
        originY: 'center',
        width: Math.max(1, w - bleedPx * 2),
        height: Math.max(1, h - bleedPx * 2),
        fill: 'transparent',
        stroke: '#f59e0b',
        strokeWidth: 1,
        strokeUniform: true,
        strokeDashArray: [3, 3],
        selectable: false,
        evented: false,
      });
      this.canvas.add(this.bleedRect);
    }
    this.canvas.requestRenderAll();
  }

  // ---- Crop ----

  fitToPage(): void {
    // Largest guide-aspect-ratio rectangle that fits entirely within the
    // image's current displayed bounds ("contain" fit), so the crop never
    // extends past the actual photo — even when the paper guide's aspect
    // ratio doesn't match the source image's.
    const guideAspect = this.guideRect.width / this.guideRect.height;
    const imgW = this.image.getScaledWidth();
    const imgH = this.image.getScaledHeight();
    let w = imgW;
    let h = w / guideAspect;
    if (h > imgH) {
      h = imgH;
      w = h * guideAspect;
    }
    if (this.cropRect) {
      this.canvas.remove(this.cropRect);
    }
    this.cropRect = new Rect({
      left: this.image.left,
      top: this.image.top,
      originX: 'center',
      originY: 'center',
      width: w,
      height: h,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      fill: 'rgba(79,70,229,0.08)',
      stroke: '#4f46e5',
      strokeWidth: 2,
      strokeUniform: true,
      cornerColor: '#ffffff',
      cornerStrokeColor: '#4f46e5',
      cornerSize: 11,
      touchCornerSize: 28,
      cornerStyle: 'circle',
      transparentCorners: false,
      borderColor: '#4f46e5',
      lockRotation: true,
      lockScalingFlip: true,
    });
    this.cropRect.setControlsVisibility({ mtr: false });
    this.canvas.add(this.cropRect);
    this.canvas.setActiveObject(this.cropRect);
    this.canvas.requestRenderAll();
    this.updateDpi();
  }

  resetCrop(): void {
    this.fitToPage();
  }

  private updateDpi(): void {
    const size = PAPER_SIZES_MM[this.paperSize()];
    const naturalCropWidthPx = this.cropRect.getScaledWidth() / this.image.scaleX;
    const dpi = naturalCropWidthPx / (size.width / 25.4);
    this.effectiveDpi.set(Math.round(dpi));
  }

  // ---- Rotation ----

  rotate(delta: 90 | -90): void {
    this.rotationSnap.set((((this.rotationSnap() + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270);
    this.applyRotation();
  }

  applyRotation(): void {
    this.image.set({ angle: this.rotationSnap() + this.fineAngle() });
    this.canvas.requestRenderAll();
    this.updateDpi();
  }

  // ---- Adjustments ----

  onAdjustmentChange(): void {
    this.filterChange$.next();
  }

  resetAdjustments(): void {
    this.brightness.set(0);
    this.contrast.set(0);
    this.saturation.set(0);
    this.applyLiveFilters();
  }

  togglePrintPreview(): void {
    this.printPreview.set(!this.printPreview());
    this.applyLiveFilters();
  }

  private applyLiveFilters(): void {
    this.brightnessFilter.brightness = this.brightness() / 100;
    this.contrastFilter.contrast = this.contrast() / 100;
    this.saturationFilter.saturation = this.saturation() / 100;

    const live = [this.brightnessFilter, this.contrastFilter, this.saturationFilter];
    // Visual cue only (SRS item 7: "not color-accurate") — never included
    // in the exported/printed file, see applyAndSave().
    if (this.printPreview()) {
      live.push(new filters.Saturation({ saturation: -0.35 }), new filters.Contrast({ contrast: -0.08 }));
    }
    this.image.filters = live;
    this.image.applyFilters();
    this.canvas.requestRenderAll();
  }

  // ---- Export ----

  async applyAndSave(): Promise<void> {
    this.exporting.set(true);
    try {
      const size = PAPER_SIZES_MM[this.paperSize()];
      const cropWorldWidth = this.cropRect.getScaledWidth();
      const cropWorldHeight = this.cropRect.getScaledHeight();

      let multiplier = (TARGET_DPI * (size.width / 25.4)) / cropWorldWidth;
      const outW = cropWorldWidth * multiplier;
      const outH = cropWorldHeight * multiplier;
      const largestSide = Math.max(outW, outH);
      if (largestSide > MAX_EXPORT_PIXELS) {
        multiplier *= MAX_EXPORT_PIXELS / largestSide;
      }

      const finalW = Math.round(cropWorldWidth * multiplier);
      const finalH = Math.round(cropWorldHeight * multiplier);

      const cropLeft = this.cropRect.left - this.cropRect.getScaledWidth() / 2;
      const cropTop = this.cropRect.top - this.cropRect.getScaledHeight() / 2;

      const exportCanvas = new StaticCanvas(undefined, { width: finalW, height: finalH });
      exportCanvas.viewportTransform = [multiplier, 0, 0, multiplier, -cropLeft * multiplier, -cropTop * multiplier];

      const clone = await this.image.clone();
      // Real adjustments only — the print-preview CMYK hint never ships.
      clone.filters = [this.brightnessFilter, this.contrastFilter, this.saturationFilter];
      clone.applyFilters();
      exportCanvas.add(clone);
      exportCanvas.renderAll();

      const imageData = exportCanvas.toDataURL({ format: 'jpeg', quality: 0.92, multiplier: 1 });
      exportCanvas.dispose();

      this.save.emit({
        imageData,
        width: finalW,
        height: finalH,
        dpi: TARGET_DPI,
        paperSize: this.paperSize(),
      });
    } finally {
      this.exporting.set(false);
    }
  }
}
