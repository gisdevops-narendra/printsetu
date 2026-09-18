import { Component, ElementRef, Injector, OnInit, ViewChild, afterNextRender, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { SliderModule } from 'primeng/slider';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { ColorMode, EditState, PaperSize, PrintJobItemRow, PrintJobRow, SideMode } from '../../core/models/models';

type CropDraft = { x: number; y: number; width: number; height: number };

// Approximate portrait width:height ratios for the Final Preview paper
// frame — a visual aid only, not used for anything that gets printed.
const PAPER_RATIOS: Record<PaperSize, number> = {
  A4: 210 / 297,
  A3: 297 / 420,
  LETTER: 8.5 / 11,
  LEGAL: 8.5 / 14,
};

const DEFAULT_EDIT_STATE: EditState = { rotation: 0, crop: null, brightness: 0, contrast: 0, sharpness: 0 };

/**
 * Dedicated full-page shop workspace for reviewing/editing every document
 * in a print job before it's sent to the printer (replaces the old
 * window.open()-per-document popup in QueueComponent). See
 * /home/narendra/.claude/plans/scalable-noodling-lecun.md for the design.
 *
 * Orientation (SRS extension "paper size/orientation/copies") is expressed
 * through the Rotate tool rather than a separate dropdown — PrintJobItem
 * has no independent orientation field, and rotating 90°/270° already
 * turns portrait into landscape for both the printed file and this
 * preview's paper frame.
 */
@Component({
  selector: 'app-document-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    SelectModule,
    InputNumberModule,
    SliderModule,
    ProgressSpinnerModule,
    TooltipModule,
  ],
  template: `
    <div class="editor-page">
      @if (loading()) {
        <div class="flex justify-content-center p-6"><p-progressSpinner strokeWidth="4" /></div>
      } @else if (!job()) {
        <p class="text-color-secondary">Print job not found.</p>
      } @else {
        <header class="editor-header">
          <button type="button" class="back-link" (click)="backToQueue()">
            <i class="pi pi-arrow-left"></i> Back to queue
          </button>
          <div class="editor-header__title">
            <h1 class="page-title m-0">Token #{{ job()!.tokenNumber }}</h1>
            <p class="page-subtitle m-0">
              Document {{ selectedIndex() + 1 }} of {{ job()!.items.length }} &middot; {{ selectedItem()?.document?.originalName }}
            </p>
          </div>
          <div class="flex align-items-center gap-2">
            <p-button icon="pi pi-chevron-left" [text]="true" severity="secondary" [disabled]="selectedIndex() === 0" (onClick)="prev()" />
            <p-button icon="pi pi-chevron-right" [text]="true" severity="secondary" [disabled]="selectedIndex() >= job()!.items.length - 1" (onClick)="next()" />
          </div>
        </header>

        <div class="editor-body">
          <!-- Left rail: document list + reorder + delete -->
          <aside class="rail rail--left">
            <h3 class="rail__heading">Documents</h3>
            <ul class="doc-list">
              @for (item of job()!.items; track item.id; let i = $index) {
                <li class="doc-list__item" [class.is-active]="i === selectedIndex()" (click)="selectIndex(i)">
                  <i class="pi pi-file"></i>
                  <span class="doc-list__name">{{ item.document?.originalName }}</span>
                  @if (item.renderedS3Key) {
                    <i class="pi pi-pencil doc-list__edited" pTooltip="Edited"></i>
                  }
                  <div class="doc-list__actions" (click)="$event.stopPropagation()">
                    <button type="button" class="icon-btn" [disabled]="i === 0" (click)="moveItem(i, -1)" title="Move up">
                      <i class="pi pi-arrow-up"></i>
                    </button>
                    <button type="button" class="icon-btn" [disabled]="i === job()!.items.length - 1" (click)="moveItem(i, 1)" title="Move down">
                      <i class="pi pi-arrow-down"></i>
                    </button>
                    <button
                      type="button"
                      class="icon-btn icon-btn--danger"
                      [disabled]="job()!.items.length === 1"
                      (click)="removeItem(item)"
                      title="Remove from job"
                    >
                      <i class="pi pi-trash"></i>
                    </button>
                  </div>
                </li>
              }
            </ul>
          </aside>

          <!-- Center: preview / editor canvas -->
          <main class="preview">
            <div class="preview__toolbar">
              <p-button icon="pi pi-search-minus" [text]="true" severity="secondary" (onClick)="zoomOut()" />
              <span class="text-sm text-color-secondary">{{ (zoom() * 100).toFixed(0) }}%</span>
              <p-button icon="pi pi-search-plus" [text]="true" severity="secondary" (onClick)="zoomIn()" />
              <p-button label="Reset zoom" [text]="true" size="small" severity="secondary" (onClick)="resetZoom()" />
              <span class="flex-spacer"></span>
              <p-button
                [label]="finalPreview() ? 'Back to editing' : 'Final Preview'"
                [icon]="finalPreview() ? 'pi pi-pencil' : 'pi pi-eye'"
                severity="secondary"
                [outlined]="true"
                size="small"
                (onClick)="finalPreview.set(!finalPreview())"
              />
            </div>

            @if (previewLoading()) {
              <div class="preview__frame flex align-items-center justify-content-center">
                <p-progressSpinner strokeWidth="4" />
              </div>
            } @else if (finalPreview()) {
              <div class="paper-frame" [style.aspect-ratio]="paperAspectRatio()">
                <img [src]="previewUrl()" class="paper-frame__img" />
              </div>
            } @else {
              <div
                #previewContainer
                class="preview__frame"
                [class.is-cropping]="cropMode()"
                (mousedown)="onCropStart($event)"
                (mousemove)="onCropMove($event)"
                (mouseup)="onCropEnd()"
                (mouseleave)="onCropEnd()"
              >
                <div class="preview__zoomed" [style.transform]="'scale(' + zoom() + ')'">
                  @if (isPdf()) {
                    <canvas #pdfCanvas></canvas>
                  } @else if (previewUrl()) {
                    <img [src]="previewUrl()" (load)="onImageLoad($event)" />
                  }
                </div>
                @if (cropDraft()) {
                  <div
                    class="crop-rect"
                    [style.left.%]="cropDraft()!.x * 100"
                    [style.top.%]="cropDraft()!.y * 100"
                    [style.width.%]="cropDraft()!.width * 100"
                    [style.height.%]="cropDraft()!.height * 100"
                  ></div>
                }
              </div>
            }
          </main>

          <!-- Right rail: editing tools + per-document print settings -->
          <aside class="rail rail--right">
            <h3 class="rail__heading">Edit</h3>
            <div class="tool-group">
              <p-button icon="pi pi-refresh" label="Rotate 90°" severity="secondary" [outlined]="true" size="small" (onClick)="rotate(90)" [disabled]="savingEdit()" />
              <p-button
                [label]="cropMode() ? 'Cancel crop' : 'Crop'"
                icon="pi pi-crop"
                severity="secondary"
                [outlined]="true"
                size="small"
                (onClick)="toggleCropMode()"
                [disabled]="savingEdit()"
              />
              @if (cropMode() && cropDraft()) {
                <p-button label="Apply crop" icon="pi pi-check" size="small" (onClick)="applyCrop()" [loading]="savingEdit()" />
              }
              @if (selectedItem()?.editState?.crop) {
                <p-button label="Clear crop" icon="pi pi-times" [text]="true" size="small" severity="secondary" (onClick)="clearCrop()" [disabled]="savingEdit()" />
              }
            </div>

            <div class="tool-group" [class.is-disabled]="isPdf()" [pTooltip]="isPdf() ? 'Brightness/contrast/sharpness are only supported for image documents' : ''">
              <label class="tool-label">Brightness</label>
              <p-slider [(ngModel)]="editDraft.brightness" [min]="-100" [max]="100" [disabled]="isPdf()" (onSlideEnd)="commitEdit()" />
              <label class="tool-label">Contrast</label>
              <p-slider [(ngModel)]="editDraft.contrast" [min]="-100" [max]="100" [disabled]="isPdf()" (onSlideEnd)="commitEdit()" />
              <label class="tool-label">Sharpness</label>
              <p-slider [(ngModel)]="editDraft.sharpness" [min]="0" [max]="100" [disabled]="isPdf()" (onSlideEnd)="commitEdit()" />
            </div>

            @if (hasEdits()) {
              <p-button label="Reset all edits" icon="pi pi-undo" [text]="true" size="small" severity="secondary" (onClick)="resetEdits()" [disabled]="savingEdit()" />
            }

            <h3 class="rail__heading mt-4">Print settings</h3>
            @if (selectedItem(); as item) {
              <div class="settings-form">
                <label class="tool-label">Paper size</label>
                <p-select [options]="paperSizes" [(ngModel)]="settingsDraft.paperSize" (onChange)="commitSettings()" />
                <label class="tool-label">Color mode</label>
                <p-select [options]="colorModes" [(ngModel)]="settingsDraft.colorMode" (onChange)="commitSettings()" />
                <label class="tool-label">Sides</label>
                <p-select [options]="sideModes" [(ngModel)]="settingsDraft.sideMode" (onChange)="commitSettings()" />
                <label class="tool-label">Copies</label>
                <p-inputNumber [(ngModel)]="settingsDraft.copies" [min]="1" [max]="999" (onInput)="commitSettings()" />
                <p class="text-sm text-color-secondary mt-2">Line amount: {{ job()!.currency }} {{ item.amount }}</p>
              </div>
            }
          </aside>
        </div>

        <footer class="editor-footer">
          <span class="text-color-secondary">Job total: {{ job()!.currency }} {{ job()!.amount }}</span>
          <p-button label="Confirm &amp; Print" icon="pi pi-print" [loading]="printing()" (onClick)="confirmAndPrint()" />
        </footer>
      }
    </div>
  `,
  styles: [
    `
      .editor-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }
      .editor-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #e2e8f0;
        margin-bottom: 1rem;
      }
      .editor-header__title {
        flex: 1 1 auto;
        min-width: 0;
      }
      .back-link {
        background: none;
        border: none;
        padding: 0;
        color: #64748b;
        font-weight: 600;
        font-size: 0.8125rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        white-space: nowrap;
      }
      .back-link:hover {
        color: var(--p-primary-600);
      }

      .editor-body {
        flex: 1 1 auto;
        display: grid;
        grid-template-columns: 220px 1fr 260px;
        gap: 1rem;
        min-height: 0;
      }
      @media (max-width: 960px) {
        .editor-body {
          grid-template-columns: 1fr;
        }
      }

      .rail {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 0.875rem;
        overflow-y: auto;
      }
      .rail__heading {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #64748b;
        margin: 0 0 0.625rem 0;
      }

      .doc-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }
      .doc-list__item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.625rem;
        border-radius: 8px;
        border: 1px solid transparent;
        cursor: pointer;
        background: #fff;
      }
      .doc-list__item.is-active {
        border-color: var(--p-primary-300);
        background: var(--p-primary-50);
      }
      .doc-list__name {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.8125rem;
      }
      .doc-list__edited {
        color: var(--p-primary-600);
        font-size: 0.7rem;
      }
      .doc-list__actions {
        display: flex;
        gap: 0.125rem;
      }
      .icon-btn {
        border: none;
        background: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        font-size: 0.7rem;
      }
      .icon-btn:hover:not(:disabled) {
        background: #e2e8f0;
        color: #334155;
      }
      .icon-btn:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .icon-btn--danger:hover:not(:disabled) {
        background: #fee2e2;
        color: #dc2626;
      }

      .preview {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }
      .preview__toolbar {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        margin-bottom: 0.625rem;
      }
      .flex-spacer {
        flex: 1 1 auto;
      }
      .preview__frame {
        flex: 1 1 auto;
        position: relative;
        overflow: auto;
        background: #0f172a0d;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 360px;
        user-select: none;
      }
      .preview__frame.is-cropping {
        cursor: crosshair;
      }
      .preview__zoomed {
        transform-origin: center center;
        max-width: 100%;
        max-height: 100%;
      }
      .preview__zoomed img,
      .preview__zoomed canvas {
        max-width: 100%;
        max-height: 70vh;
        display: block;
      }
      .crop-rect {
        position: absolute;
        border: 2px dashed var(--p-primary-500);
        background: rgba(99, 102, 241, 0.15);
        pointer-events: none;
      }

      .paper-frame {
        width: min(100%, 420px);
        margin: 0 auto;
        background: #fff;
        border: 1px solid #cbd5e1;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .paper-frame__img {
        max-width: 100%;
        max-height: 100%;
      }

      .tool-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      .tool-group.is-disabled {
        opacity: 0.55;
      }
      .tool-label {
        font-size: 0.7rem;
        font-weight: 600;
        color: #64748b;
        margin-top: 0.375rem;
      }

      .settings-form {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }

      .editor-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 1rem;
        margin-top: 1rem;
        border-top: 1px solid #e2e8f0;
      }
    `,
  ],
})
export class DocumentEditorComponent implements OnInit {
  @ViewChild('previewContainer') previewContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('pdfCanvas') pdfCanvas?: ElementRef<HTMLCanvasElement>;

  job = signal<PrintJobRow | null>(null);
  loading = signal(true);
  jobId!: string;

  selectedIndex = signal(0);
  selectedItem = computed<PrintJobItemRow | null>(() => this.job()?.items[this.selectedIndex()] ?? null);
  isPdf = computed(() => this.selectedItem()?.document?.mimeType === 'application/pdf');

  previewUrl = signal<string | null>(null);
  previewLoading = signal(false);

  zoom = signal(1);
  finalPreview = signal(false);
  savingEdit = signal(false);
  printing = signal(false);

  editDraft: EditState = { ...DEFAULT_EDIT_STATE };
  hasEdits = computed(() => !!this.selectedItem()?.renderedS3Key);

  cropMode = signal(false);
  cropDraft = signal<CropDraft | null>(null);
  private cropStart: { x: number; y: number } | null = null;

  paperSizes: PaperSize[] = ['A4', 'A3', 'LETTER', 'LEGAL'];
  colorModes: ColorMode[] = ['BW', 'COLOR'];
  sideModes: SideMode[] = ['SIMPLEX', 'DUPLEX'];
  settingsDraft: { paperSize: PaperSize; colorMode: ColorMode; sideMode: SideMode; copies: number } = {
    paperSize: 'A4',
    colorMode: 'BW',
    sideMode: 'SIMPLEX',
    copies: 1,
  };

  paperAspectRatio = computed(() => {
    const item = this.selectedItem();
    if (!item) return 1;
    const ratio = PAPER_RATIOS[item.paperSize];
    const landscape = (item.editState?.rotation ?? 0) % 180 === 90;
    return landscape ? 1 / ratio : ratio;
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly shopkeeperService: ShopkeeperService,
    private readonly confirmationService: ConfirmationService,
    private readonly messageService: MessageService,
    private readonly injector: Injector,
  ) {}

  ngOnInit(): void {
    this.jobId = this.route.snapshot.paramMap.get('id')!;
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.shopkeeperService.getJob(this.jobId).subscribe({
      next: (job) => {
        this.job.set(job);
        this.loading.set(false);
        const clampedIndex = Math.min(this.selectedIndex(), Math.max(job.items.length - 1, 0));
        this.selectIndex(clampedIndex);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Could not load this print job.' });
      },
    });
  }

  selectIndex(index: number): void {
    this.selectedIndex.set(index);
    this.zoom.set(1);
    this.cropMode.set(false);
    this.cropDraft.set(null);
    const item = this.selectedItem();
    this.editDraft = item?.editState ? { ...item.editState } : { ...DEFAULT_EDIT_STATE };
    if (item) {
      this.settingsDraft = {
        paperSize: item.paperSize,
        colorMode: item.colorMode,
        sideMode: item.sideMode,
        copies: item.copies,
      };
    }
    this.loadPreview();
  }

  next(): void {
    if (this.selectedIndex() < (this.job()?.items.length ?? 1) - 1) this.selectIndex(this.selectedIndex() + 1);
  }

  prev(): void {
    if (this.selectedIndex() > 0) this.selectIndex(this.selectedIndex() - 1);
  }

  private loadPreview(): void {
    const item = this.selectedItem();
    if (!item) return;
    this.previewLoading.set(true);
    this.shopkeeperService.itemPreviewUrl(this.jobId, item.id).subscribe({
      next: (res) => {
        this.previewUrl.set(res.url);
        this.previewLoading.set(false);
        if (this.isPdf()) {
          // The <canvas #pdfCanvas> only exists once Angular has flushed the
          // @if(isPdf()) branch triggered by the signal writes above — a bare
          // setTimeout(0) races that flush (ViewChild can still be stale),
          // so wait for Angular's own next-render hook instead.
          afterNextRender(() => this.renderPdfPreview(res.url), { injector: this.injector });
        }
      },
      error: () => {
        this.previewLoading.set(false);
        this.messageService.add({
          severity: 'warn',
          summary: 'Preview unavailable',
          detail: 'Ask your admin to enable document preview for this shop.',
        });
      },
    });
  }

  private async renderPdfPreview(url: string): Promise<void> {
    const canvas = this.pdfCanvas?.nativeElement;
    if (!canvas) return;
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs';
    // Fetch the bytes ourselves and hand pdf.js raw `data` rather than a
    // `url` — pdf.js's own fetch-range-request transport conflicts with
    // zone.js's patched fetch/ReadableStream (throws deep inside pdf.js:
    // "Cannot set properties of undefined (setting 'onPull')"). These
    // preview files are small scanned documents, so fetching the whole
    // thing upfront is cheap and sidesteps that transport entirely.
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const canvasContext = canvas.getContext('2d')!;
    await page.render({ canvasContext, viewport }).promise;
  }

  onImageLoad(_event: Event): void {
    // Hook available for future use (e.g. auto-fit zoom); intentionally a no-op today.
  }

  // ---- Reorder / delete ----

  moveItem(index: number, delta: number): void {
    const job = this.job();
    if (!job) return;
    const target = index + delta;
    if (target < 0 || target >= job.items.length) return;
    const items = [...job.items];
    [items[index], items[target]] = [items[target], items[index]];
    this.job.set({ ...job, items });
    this.selectedIndex.set(target);
    this.shopkeeperService.reorderItems(this.jobId, items.map((i) => i.id)).subscribe({
      next: (updated) => this.job.set(updated),
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Could not reorder documents.' });
        this.load();
      },
    });
  }

  removeItem(item: PrintJobItemRow): void {
    this.confirmationService.confirm({
      message: `Remove "${item.document?.originalName}" from this print job?`,
      header: 'Remove document',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.shopkeeperService.deleteItem(this.jobId, item.id).subscribe({
          next: (updated) => {
            this.job.set(updated);
            this.selectIndex(Math.min(this.selectedIndex(), updated.items.length - 1));
            this.messageService.add({ severity: 'success', summary: 'Document removed' });
          },
          error: (err) => {
            this.messageService.add({
              severity: 'error',
              summary: 'Could not remove document',
              detail: err?.error?.message,
            });
          },
        });
      },
    });
  }

  // ---- Zoom ----

  zoomIn(): void {
    this.zoom.set(Math.min(3, this.zoom() + 0.25));
  }
  zoomOut(): void {
    this.zoom.set(Math.max(0.5, this.zoom() - 0.25));
  }
  resetZoom(): void {
    this.zoom.set(1);
  }

  // ---- Rotate / crop / brightness-contrast-sharpness ----

  rotate(delta: 90): void {
    this.editDraft = { ...this.editDraft, rotation: (((this.editDraft.rotation + delta) % 360) + 360) % 360 as EditState['rotation'] };
    this.commitEdit();
  }

  toggleCropMode(): void {
    this.cropMode.set(!this.cropMode());
    this.cropDraft.set(null);
  }

  onCropStart(event: MouseEvent): void {
    if (!this.cropMode() || this.finalPreview()) return;
    const rect = this.previewContainer!.nativeElement.getBoundingClientRect();
    this.cropStart = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    this.cropDraft.set({ x: this.cropStart.x, y: this.cropStart.y, width: 0, height: 0 });
  }

  onCropMove(event: MouseEvent): void {
    if (!this.cropStart || !this.previewContainer) return;
    const rect = this.previewContainer.nativeElement.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const start = this.cropStart;
    this.cropDraft.set({
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    });
  }

  onCropEnd(): void {
    this.cropStart = null;
  }

  applyCrop(): void {
    const crop = this.cropDraft();
    if (!crop || crop.width < 0.02 || crop.height < 0.02) {
      this.messageService.add({ severity: 'warn', summary: 'Draw a larger crop area first.' });
      return;
    }
    this.editDraft = { ...this.editDraft, crop };
    this.cropMode.set(false);
    this.commitEdit();
  }

  clearCrop(): void {
    this.editDraft = { ...this.editDraft, crop: null };
    this.commitEdit();
  }

  commitEdit(): void {
    const item = this.selectedItem();
    if (!item) return;
    this.savingEdit.set(true);
    this.shopkeeperService.editItem(this.jobId, item.id, this.editDraft).subscribe({
      next: (res) => {
        this.savingEdit.set(false);
        this.cropDraft.set(null);
        this.patchSelectedItem({ editState: res.editState, renderedS3Key: res.renderedS3Key });
        this.loadPreview();
      },
      error: (err) => {
        this.savingEdit.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not apply edit',
          detail: err?.error?.message,
        });
      },
    });
  }

  resetEdits(): void {
    const item = this.selectedItem();
    if (!item) return;
    this.shopkeeperService.resetItemEdit(this.jobId, item.id).subscribe({
      next: () => {
        this.editDraft = { ...DEFAULT_EDIT_STATE };
        this.patchSelectedItem({ editState: null, renderedS3Key: null });
        this.loadPreview();
        this.messageService.add({ severity: 'success', summary: 'Reverted to original' });
      },
    });
  }

  // ---- Per-document print settings ----

  commitSettings(): void {
    const item = this.selectedItem();
    if (!item) return;
    this.shopkeeperService.updateItemSettings(this.jobId, item.id, this.settingsDraft).subscribe({
      next: (updated) => this.job.set(updated),
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Could not update print settings',
          detail: err?.error?.message,
        });
      },
    });
  }

  private patchSelectedItem(patch: Partial<PrintJobItemRow>): void {
    const job = this.job();
    if (!job) return;
    const items = job.items.map((i, idx) => (idx === this.selectedIndex() ? { ...i, ...patch } : i));
    this.job.set({ ...job, items });
  }

  // ---- Confirm & print ----

  confirmAndPrint(): void {
    this.confirmationService.confirm({
      message: `Send ${this.job()!.items.length} document(s) to the printer now?`,
      header: 'Confirm print',
      icon: 'pi pi-print',
      accept: () => {
        this.printing.set(true);
        this.shopkeeperService.print(this.jobId).subscribe({
          next: (res) => {
            this.printing.set(false);
            this.messageService.add({ severity: 'success', summary: res.message });
            this.router.navigate(['/shop/queue']);
          },
          error: () => this.printing.set(false),
        });
      },
    });
  }

  backToQueue(): void {
    this.router.navigate(['/shop/queue']);
  }
}
