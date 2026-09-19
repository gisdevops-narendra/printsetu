import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
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
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { Subject, debounceTime } from 'rxjs';
import {
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  FabricObject,
  IText,
  Line,
  PencilBrush,
  Point,
  Rect,
  Shadow,
  StaticCanvas,
  filters,
  util,
  type TPointerEventInfo,
} from 'fabric';
import { PixelOp, applyOp, maxUpscale, sizeOf } from './image-pixel-ops';
import { BatchParams } from './image-batch-render';
import {
  BUILTIN_PRESETS,
  EditorPreset,
  EditorVersion,
  addVersion,
  clearStamp,
  loadPresets,
  loadStamp,
  loadVersions,
  saveStamp,
  savePresets,
} from './editor-storage';

import {
  CanvasEditorPaperKey,
  ColorEffect,
  ExportFormat,
  FitMode,
  MAX_EXPORT_PIXELS,
  MM_PER_INCH,
  PAPER_SIZES_MM,
  TARGET_DPI,
  computePlacement,
} from './editor-core';

export type { CanvasEditorPaperKey } from './editor-core';

export interface CanvasEditorSaveResult {
  imageData: string;
  width: number;
  height: number;
  dpi: number;
  paperSize: CanvasEditorPaperKey;
  format: ExportFormat;
  quality: number;
}

type InspectorTab = 'layout' | 'adjust' | 'annotate' | 'fix' | 'output';
type EditorTool = 'select' | 'draw' | 'highlight' | 'erase' | 'spot' | 'redeye' | 'perspective';
type AnnotationKind = 'text' | 'shape' | 'logo' | 'path';

/** What the annotate panel shows/edits for the currently selected object. */
interface SelectionInfo {
  kind: AnnotationKind;
  fill: string;
  stroke: string;
  strokeMm: number;
  opacity: number;
  fontFamily: string;
  fontPt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: string;
}

type SizeUnit = 'mm' | 'cm' | 'in';

interface Geometry {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

interface EditorSnapshot {
  paperSize: CanvasEditorPaperKey;
  showBleed: boolean;
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
  rotationSnap: 0 | 90 | 180 | 270;
  fineAngle: number;
  flipH: boolean;
  flipV: boolean;
  image: { left: number; top: number; scaleX: number; scaleY: number };
  crop: { left: number; top: number; width: number; height: number };
  ops: PixelOp[];
  /** Fabric JSON of every annotation (image sources replaced by `ref:` ids). */
  annotations: Record<string, unknown>[];
}

const VIEWPORT_W = 800;
const VIEWPORT_H = 600;
const LOW_DPI_THRESHOLD = 150;
const HISTORY_LIMIT = 60;
const PT_MM = 25.4 / 72;

const FIT_MODES: { key: FitMode; label: string; icon: string; hint: string }[] = [
  { key: 'crop', label: 'Crop', icon: 'pi-crop', hint: 'Free crop: drag the box to choose what prints.' },
  { key: 'fit', label: 'Fit', icon: 'pi-window-minimize', hint: 'Whole image on the page, with white space if the shapes differ.' },
  { key: 'fill', label: 'Fill', icon: 'pi-window-maximize', hint: 'Covers the whole page. Edges may be cut off.' },
  { key: 'stretch', label: 'Stretch', icon: 'pi-arrows-alt', hint: 'Stretched to the page. The image may distort.' },
  { key: 'center', label: 'Center', icon: 'pi-bullseye', hint: 'Actual size at 300 DPI, centered. Shrinks only if it is too big.' },
  { key: 'custom', label: 'Custom', icon: 'pi-sliders-v', hint: 'An exact printed size, centered on the page.' },
];

const UNIT_FACTOR: Record<SizeUnit, number> = { mm: 1, cm: 0.1, in: 1 / MM_PER_INCH };
const UNIT_DECIMALS: Record<SizeUnit, number> = { mm: 1, cm: 2, in: 2 };

/**
 * Free-form client-side photo editor (image documents only — PDFs keep the
 * server-side pdf-lib rotate/crop tool). Everything here is composited live
 * on a Fabric.js canvas, and `save()` exports one final high-res raster the
 * parent uploads as-is (see ShopkeeperService.uploadRenderedImage). The
 * server never re-applies these edits — what's on screen here is what prints.
 *
 * Page model: the crop rect always *is* the printed page (aspect-locked to
 * the chosen paper). In `crop` mode the user drags/resizes it over the
 * photo. In every other fit mode it is locked to the paper guide and the
 * *image* is scaled/positioned instead, clipped to the page minus the
 * margin. Border and bleed are overlay rects drawn (and exported) on top.
 */
@Component({
  selector: 'app-image-canvas-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    SelectModule,
    SliderModule,
    InputTextModule,
    ToggleSwitchModule,
    TooltipModule,
    ProgressSpinnerModule,
  ],
  template: `
    <div class="ce">
      <div class="ce__main">
        <div class="ce__toolbar">
          <div class="icon-group">
            <button type="button" class="icon-btn" (click)="undo()" [disabled]="!canUndo()" pTooltip="Undo (Ctrl+Z)" tooltipPosition="bottom">
              <i class="pi pi-undo"></i>
            </button>
            <button type="button" class="icon-btn" (click)="redo()" [disabled]="!canRedo()" pTooltip="Redo (Ctrl+Y)" tooltipPosition="bottom">
              <i class="pi pi-undo" style="transform: scaleX(-1)"></i>
            </button>
          </div>
          <button type="button" class="tb-btn" (click)="resetAll()" [disabled]="!canUndo()" pTooltip="Discard every change and start over" tooltipPosition="bottom">
            <i class="pi pi-times-circle"></i> <span class="tb-label">Reset all</span>
          </button>
          <button
            type="button"
            class="tb-btn"
            [class.is-held]="compareOn()"
            (pointerdown)="setCompare(true)"
            (pointerup)="setCompare(false)"
            (pointerleave)="setCompare(false)"
            (pointercancel)="setCompare(false)"
            pTooltip="Hold to see the original colors"
            tooltipPosition="bottom"
          >
            <i class="pi pi-clone"></i> <span class="tb-label">Compare</span>
          </button>

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
          @if (busy()) {
            <div class="ce__overlay">
              <div class="busy"><p-progressSpinner strokeWidth="4" /><span>{{ busyLabel() }}</span></div>
            </div>
          }
          @if (perspectiveActive()) {
            <div class="compare-tag compare-tag--info">Drag the corners onto the page, then Apply (Fix tab)</div>
          }
          @if (compareOn()) {
            <div class="compare-tag">Original</div>
          }
          @if (dpiWarning()) {
            <div class="dpi-banner">
              <i class="pi pi-exclamation-triangle"></i>
              <span>May look blurry at {{ paperLabel() }} &mdash; {{ effectiveDpi() }} DPI (300 recommended)</span>
            </div>
          }
        </div>
      </div>

      <aside class="ce__inspector" [class.is-open]="sheetOpen()">
        <button type="button" class="sheet-handle" (click)="sheetOpen.set(!sheetOpen())" [attr.aria-expanded]="sheetOpen()" aria-label="Show or hide controls">
          <span class="sheet-handle__bar"></span>
        </button>
        <div class="tabs">
          @for (t of tabDefs; track t.key) {
            <button type="button" [class.is-on]="tab() === t.key" (click)="onTabClick(t.key)" [attr.aria-label]="t.label">
              <i class="pi" [ngClass]="t.icon"></i>
              <span>{{ t.label }}</span>
            </button>
          }
        </div>

        <div class="ce__panels">
          @if (tab() === 'layout') {
            <section class="panel">
              <div class="group">
                <div class="slider-row__head">
                  <label class="group__label">Paper</label>
                  <label class="bleed-toggle">
                    <p-toggleswitch [(ngModel)]="bleedValue" (onChange)="onBleedChange()" />
                    <span>3mm bleed</span>
                  </label>
                </div>
                <p-select
                  [options]="paperOptions"
                  [(ngModel)]="paperSizeValue"
                  optionLabel="label"
                  optionValue="key"
                  size="small"
                  appendTo="body"
                  styleClass="w-full"
                  (onChange)="onPaperSizeChange()"
                />
              </div>

              <div class="group">
                <label class="group__label">Placement</label>
                <div class="mode-grid">
                  @for (m of fitModes; track m.key) {
                    <button type="button" class="mode" [class.is-on]="fitMode() === m.key" (click)="setFitMode(m.key)">
                      <i class="pi" [ngClass]="m.icon"></i>
                      <span>{{ m.label }}</span>
                    </button>
                  }
                </div>
                <p class="hint">{{ activeHint() }}</p>
                @if (fitMode() === 'crop') {
                  <p-button label="Reset crop" icon="pi pi-undo" size="small" severity="secondary" [text]="true" (onClick)="resetCrop()" />
                }
              </div>

              <div class="group">
                <div class="slider-row__head">
                  <label class="group__label">Margin</label>
                  <span class="slider-row__value">{{ marginMm() }} mm</span>
                </div>
                <p-slider [ngModel]="marginMm()" (ngModelChange)="onMarginChange($event)" [min]="0" [max]="marginMax()" [disabled]="fitMode() === 'crop'" />
                @if (fitMode() === 'crop') {
                  <p class="hint">Margins apply in Fit, Fill, Stretch, Center and Custom.</p>
                }
              </div>

              <div class="group">
                <div class="slider-row__head">
                  <label class="group__label">Border</label>
                  <span class="slider-row__value">{{ borderMm() }} mm</span>
                </div>
                <div class="border-row">
                  <p-slider class="border-row__slider" [ngModel]="borderMm()" (ngModelChange)="onBorderChange($event)" [min]="0" [max]="10" [step]="0.5" />
                  <input type="color" class="swatch" [value]="borderColor()" (input)="onBorderColor($event)" title="Border color" />
                </div>
              </div>

              <div class="group">
                <div class="slider-row__head">
                  <label class="group__label">Exact size</label>
                  <p-select
                    [options]="unitOptions"
                    [ngModel]="unit()"
                    (ngModelChange)="setUnit($event)"
                    size="small"
                    appendTo="body"
                    styleClass="unit-select"
                  />
                </div>
                <div class="size-row">
                  <input pInputText type="number" min="0" [step]="unitStep()" [(ngModel)]="sizeWDraft" (change)="commitSize('w')" (keydown.enter)="commitSize('w')" aria-label="Width" />
                  <span class="size-row__x">&times;</span>
                  <input pInputText type="number" min="0" [step]="unitStep()" [(ngModel)]="sizeHDraft" (change)="commitSize('h')" (keydown.enter)="commitSize('h')" aria-label="Height" />
                  <button type="button" class="icon-btn lock" [class.is-on]="lockAspect()" (click)="lockAspect.set(!lockAspect())" [pTooltip]="lockAspect() ? 'Aspect ratio locked' : 'Aspect ratio unlocked'" tooltipPosition="left">
                    <i class="pi" [ngClass]="lockAspect() ? 'pi-lock' : 'pi-lock-open'"></i>
                  </button>
                </div>
              </div>

            </section>
          } @else if (tab() === 'adjust') {
            <section class="panel">
              <div class="group">
                <label class="group__label">Rotate &amp; flip</label>
                <div class="btn-row">
                  <p-button icon="pi pi-replay" label="Left" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="rotate(-90)" />
                  <p-button icon="pi pi-refresh" label="Right" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="rotate(90)" />
                  <p-button icon="pi pi-arrows-h" label="Flip H" size="small" severity="secondary" [outlined]="!flipH()" styleClass="w-full" (onClick)="flip('h')" />
                  <p-button icon="pi pi-arrows-v" label="Flip V" size="small" severity="secondary" [outlined]="!flipV()" styleClass="w-full" (onClick)="flip('v')" />
                </div>
              </div>
              <div class="group">
                <div class="slider-row__head">
                  <label class="group__label">Straighten</label>
                  <span class="slider-row__value">{{ fineAngle() > 0 ? '+' : '' }}{{ fineAngle() }}°</span>
                </div>
                <p-slider [(ngModel)]="fineAngleValue" [min]="-45" [max]="45" (onChange)="applyRotation()" />
              </div>
            </section>

            <section class="panel">
              <div class="group">
                <label class="group__label">Color</label>
                <div class="chips">
                  <button type="button" class="chip" [class.is-on]="effect() === 'none'" (click)="setEffect('none')">Original</button>
                  <button type="button" class="chip" [class.is-on]="effect() === 'grayscale'" (click)="setEffect('grayscale')">Grayscale</button>
                  <button type="button" class="chip" [class.is-on]="effect() === 'bw'" (click)="setEffect('bw')">Black &amp; white</button>
                </div>
              </div>
              <div class="group">
                <div class="slider-row__head">
                  <label class="group__label">Brightness</label>
                  <span class="slider-row__value">{{ brightness() }}</span>
                </div>
                <p-slider [(ngModel)]="brightnessValue" [min]="-100" [max]="100" (ngModelChange)="onAdjustmentChange()" />
              </div>
              <div class="group">
                <div class="slider-row__head">
                  <label class="group__label">Contrast</label>
                  <span class="slider-row__value">{{ contrast() }}</span>
                </div>
                <p-slider [(ngModel)]="contrastValue" [min]="-100" [max]="100" (ngModelChange)="onAdjustmentChange()" />
              </div>
              <div class="group">
                <div class="slider-row__head">
                  <label class="group__label">Saturation</label>
                  <span class="slider-row__value">{{ saturation() }}</span>
                </div>
                <p-slider [(ngModel)]="saturationValue" [min]="-100" [max]="100" (ngModelChange)="onAdjustmentChange()" />
              </div>
              <button type="button" class="link-btn" (click)="resetAdjustments()">Reset color &amp; adjustments</button>
            </section>
          } @else if (tab() === 'annotate') {
            <section class="panel">
              <div class="group">
                <label class="group__label">Add</label>
                <div class="btn-row">
                  <p-button icon="pi pi-align-left" label="Text" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="addText()" />
                  <p-button icon="pi pi-tag" label="Watermark" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="addText(true)" />
                  <p-button icon="pi pi-stop" label="Box" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="addShape('rect')" />
                  <p-button icon="pi pi-circle" label="Circle" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="addShape('ellipse')" />
                  <p-button icon="pi pi-minus" label="Line" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="addShape('line')" />
                  <p-button icon="pi pi-window-maximize" label="Frame" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="addShape('frame')" />
                </div>
              </div>
              <div class="group">
                <label class="group__label">Logo / stamp</label>
                <div class="btn-row">
                  <p-button icon="pi pi-upload" label="Upload" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="logoInput.click()" />
                  <p-button icon="pi pi-star" label="Saved logo" size="small" severity="secondary" [outlined]="true" styleClass="w-full" [disabled]="!stamp()" (onClick)="useSavedLogo()" />
                </div>
                <input #logoInput type="file" accept="image/*" hidden (change)="onLogoFile($event)" />
                @if (stamp()) {
                  <button type="button" class="link-btn" (click)="removeSavedLogo()">Forget saved logo</button>
                }
              </div>
            </section>

            <section class="panel">
              <div class="group">
                <div class="slider-row__head">
                  <label class="group__label">Draw</label>
                  <input type="color" class="swatch" [value]="brushColor()" (input)="brushColor.set($any($event.target).value); configureBrush()" title="Pen / shape color" />
                </div>
                <div class="btn-row btn-row--3">
                  <p-button icon="pi pi-pencil" label="Pen" size="small" severity="secondary" [outlined]="tool() !== 'draw'" styleClass="w-full" (onClick)="toggleTool('draw')" />
                  <p-button icon="pi pi-palette" label="Marker" size="small" severity="secondary" [outlined]="tool() !== 'highlight'" styleClass="w-full" (onClick)="toggleTool('highlight')" />
                  <p-button icon="pi pi-eraser" label="Erase" size="small" severity="secondary" [outlined]="tool() !== 'erase'" styleClass="w-full" (onClick)="toggleTool('erase')" />
                </div>
                <div class="slider-row__head">
                  <label class="group__label">Thickness</label>
                  <span class="slider-row__value">{{ brushMm() }} mm</span>
                </div>
                <p-slider [ngModel]="brushMm()" (ngModelChange)="brushMm.set($event); configureBrush()" [min]="0.3" [max]="8" [step]="0.1" />
                @if (tool() === 'erase') {
                  <p class="hint">Click a pen or marker stroke to remove it.</p>
                }
              </div>
            </section>

            @if (selection(); as sel) {
              <section class="panel panel--selection">
                <div class="slider-row__head">
                  <label class="group__label">Selected {{ sel.kind === 'path' ? 'drawing' : sel.kind }}</label>
                  <button type="button" class="link-btn danger" (click)="deleteSelection()">Delete</button>
                </div>
                @if (sel.kind === 'text') {
                  <p-select [options]="fontFamilies" [ngModel]="sel.fontFamily" (ngModelChange)="selFont($event)" size="small" appendTo="body" styleClass="w-full" />
                  <div class="size-row size-row--text">
                    <input pInputText type="number" min="4" [ngModel]="sel.fontPt" (change)="selFontPt(+$any($event.target).value)" aria-label="Font size (pt)" />
                    <span class="size-row__x">pt</span>
                    <input type="color" class="swatch" [value]="hexOf(sel.fill)" (input)="selFill($any($event.target).value)" title="Text color" />
                  </div>
                  <div class="chips">
                    <button type="button" class="chip" [class.is-on]="sel.bold" (click)="selToggle('bold')"><b>B</b></button>
                    <button type="button" class="chip" [class.is-on]="sel.italic" (click)="selToggle('italic')"><i>I</i></button>
                    <button type="button" class="chip" [class.is-on]="sel.underline" (click)="selToggle('underline')"><u>U</u></button>
                    @for (a of textAligns; track a) {
                      <button type="button" class="chip" [class.is-on]="sel.align === a" (click)="selAlign(a)">{{ a }}</button>
                    }
                  </div>
                }
                @if (sel.kind === 'shape') {
                  <div class="size-row size-row--text">
                    <span class="group__label">Outline</span>
                    <span></span>
                    <input type="color" class="swatch" [value]="hexOf(sel.stroke)" (input)="selStroke($any($event.target).value)" title="Outline color" />
                  </div>
                  <div class="slider-row__head">
                    <label class="group__label">Line width</label>
                    <span class="slider-row__value">{{ sel.strokeMm }} mm</span>
                  </div>
                  <p-slider [ngModel]="sel.strokeMm" (ngModelChange)="selStrokeMm($event)" [min]="0.2" [max]="10" [step]="0.1" />
                  <label class="bleed-toggle">
                    <p-toggleswitch [ngModel]="sel.fill !== 'transparent'" (ngModelChange)="selFilled($event)" />
                    <span>Filled</span>
                    @if (sel.fill !== 'transparent') {
                      <input type="color" class="swatch" [value]="hexOf(sel.fill)" (input)="selFill($any($event.target).value)" title="Fill color" />
                    }
                  </label>
                }
                <div class="slider-row__head">
                  <label class="group__label">Opacity</label>
                  <span class="slider-row__value">{{ (sel.opacity * 100).toFixed(0) }}%</span>
                </div>
                <p-slider [ngModel]="sel.opacity * 100" (ngModelChange)="selOpacity($event)" [min]="5" [max]="100" />
                <div class="btn-row btn-row--3">
                  <p-button icon="pi pi-copy" label="Copy" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="duplicateSelection()" />
                  <p-button icon="pi pi-arrow-up" label="Front" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="layer('front')" />
                  <p-button icon="pi pi-arrow-down" label="Back" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="layer('back')" />
                </div>
                @if (sel.kind === 'logo') {
                  <button type="button" class="link-btn" (click)="saveSelectionAsLogo()">Save as my shop logo</button>
                }
              </section>
            }
          } @else if (tab() === 'fix') {
            <section class="panel">
              <div class="group">
                <label class="group__label">Retouch</label>
                <div class="btn-row">
                  <p-button icon="pi pi-bullseye" label="Spot fix" size="small" severity="secondary" [outlined]="tool() !== 'spot'" styleClass="w-full" (onClick)="toggleTool('spot')" />
                  <p-button icon="pi pi-eye" label="Red-eye" size="small" severity="secondary" [outlined]="tool() !== 'redeye'" styleClass="w-full" (onClick)="toggleTool('redeye')" />
                </div>
                <div class="slider-row__head">
                  <label class="group__label">Brush size</label>
                  <span class="slider-row__value">{{ spotMm() }} mm</span>
                </div>
                <p-slider [ngModel]="spotMm()" (ngModelChange)="spotMm.set($event)" [min]="1" [max]="20" [step]="0.5" />
                @if (tool() === 'spot' || tool() === 'redeye') {
                  <p class="hint">{{ tool() === 'spot' ? 'Click a blemish or dust speck to heal it.' : 'Click the center of each red pupil.' }}</p>
                }
              </div>
            </section>

            <section class="panel">
              <div class="group">
                <label class="group__label">Straighten a photographed page</label>
                @if (!perspectiveActive()) {
                  <p-button icon="pi pi-th-large" label="Correct perspective" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="startPerspective()" />
                  <p class="hint">Drag four corner handles onto the page corners; it is flattened into a straight rectangle.</p>
                } @else {
                  <p class="hint">Drag the handles onto the page corners, then apply.</p>
                  <div class="btn-row">
                    <p-button label="Cancel" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="cancelPerspective()" />
                    <p-button icon="pi pi-check" label="Apply" size="small" styleClass="w-full" (onClick)="applyPerspective()" />
                  </div>
                }
              </div>
            </section>

            <section class="panel">
              <div class="group">
                <label class="group__label">Remove plain background</label>
                <div class="slider-row__head">
                  <label class="group__label">Tolerance</label>
                  <span class="slider-row__value">{{ bgTol() }}</span>
                </div>
                <p-slider [ngModel]="bgTol()" (ngModelChange)="bgTol.set($event)" [min]="5" [max]="80" />
                <div class="size-row size-row--text">
                  <span class="group__label">Replace with</span>
                  <span></span>
                  <input type="color" class="swatch" [value]="bgColor()" (input)="bgColor.set($any($event.target).value)" title="Replacement color" />
                </div>
                <p-button icon="pi pi-images" label="Remove background" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="removeBackground()" />
                <p class="hint">Best on an even, plain background such as a passport photo.</p>
              </div>
            </section>

            <section class="panel">
              <div class="group">
                <label class="group__label">Resolution</label>
                @if (upscaleFactor(); as k) {
                  <p-button [label]="'Upscale ×' + k + ' (to ~300 DPI)'" icon="pi pi-arrows-alt" size="small" severity="secondary" [outlined]="true" styleClass="w-full" (onClick)="upscale()" />
                  <p class="hint">Resamples the photo larger with sharpening. It cannot add real detail.</p>
                } @else {
                  <p class="hint">
                    {{
                      opsView().length
                        ? 'Pixel edits applied.'
                        : (effectiveDpi() ?? 999) < 300
                          ? 'Below 300 DPI, but the photo is too large to upscale safely.'
                          : 'Resolution is already good for this size.'
                    }}
                  </p>
                }
                @if (opsView().length) {
                  <button type="button" class="link-btn" (click)="clearPixelEdits()">Undo all retouch &amp; pixel edits</button>
                }
              </div>
            </section>
          } @else {
            <section class="panel">
              <div class="group">
                <label class="group__label">File format</label>
                <p-select [options]="formatOptions" optionLabel="label" optionValue="value" [ngModel]="exportFormat()" (ngModelChange)="exportFormat.set($event)" size="small" appendTo="body" styleClass="w-full" />
                @if (exportFormat() === 'jpeg') {
                  <div class="slider-row__head">
                    <label class="group__label">Quality</label>
                    <span class="slider-row__value">{{ exportQuality() }}</span>
                  </div>
                  <p-slider [ngModel]="exportQuality()" (ngModelChange)="exportQuality.set($event)" [min]="60" [max]="100" />
                } @else {
                  <p class="hint">Lossless. Larger file, best for text and line art.</p>
                }
              </div>
            </section>

            <section class="panel">
              <div class="group">
                <label class="group__label">Presets</label>
                @for (p of presets(); track p.id) {
                  <div class="list-row">
                    <span class="list-row__name">{{ p.name }}</span>
                    <button type="button" class="link-btn" (click)="applyPreset(p)">Apply</button>
                    @if (!p.builtin) {
                      <button type="button" class="icon-btn icon-btn--sm" (click)="deletePreset(p.id)" title="Delete preset"><i class="pi pi-trash"></i></button>
                    }
                  </div>
                }
                <div class="size-row size-row--save">
                  <input pInputText type="text" placeholder="Save current as…" [(ngModel)]="presetName" (keydown.enter)="saveCurrentAsPreset()" />
                  <p-button icon="pi pi-check" size="small" [disabled]="!presetName.trim()" (onClick)="saveCurrentAsPreset()" />
                </div>
              </div>
            </section>

            @if (otherImageCount > 0) {
              <section class="panel">
                <div class="group">
                  <label class="group__label">All documents</label>
                  <p-button
                    [label]="'Apply to ' + otherImageCount + ' other image' + (otherImageCount === 1 ? '' : 's')"
                    icon="pi pi-clone"
                    size="small"
                    severity="secondary"
                    [outlined]="true"
                    styleClass="w-full"
                    [loading]="batchBusy"
                    (onClick)="emitApplyAll()"
                  />
                  <p class="hint">Copies paper, placement, margin, border, color and adjustments. Crop, annotations and retouching stay per document.</p>
                </div>
              </section>
            }

            @if (historyKey) {
              <section class="panel">
                <div class="group">
                  <label class="group__label">Saved versions</label>
                  @if (!baseIsOriginal) {
                    <p class="hint">This document was edited elsewhere, so earlier versions cannot be restored here.</p>
                  } @else if (!versions().length) {
                    <p class="hint">Each time you save, a version appears here so you can go back.</p>
                  }
                  @if (baseIsOriginal) {
                    @for (v of versions(); track v.id) {
                      <div class="list-row">
                        <img class="thumb" [src]="v.thumb" alt="" />
                        <span class="list-row__name">{{ v.label }}<small>{{ v.savedAt | date: 'MMM d, h:mm a' }}</small></span>
                        <button type="button" class="link-btn" (click)="restoreVersion(v)">Restore</button>
                      </div>
                    }
                  }
                </div>
              </section>
            }
          }
        </div>

        <div class="ce__actions">
          @if (effectiveDpi() !== null) {
            <div class="dpi-chip" [class.is-low]="dpiWarning()">
              <i class="pi" [ngClass]="dpiWarning() ? 'pi-exclamation-circle' : 'pi-check-circle'"></i>
              <span>{{ effectiveDpi() }} DPI at {{ paperLabel() }}</span>
            </div>
          }
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
        --ink: var(--tx-0f172a);
        --muted: var(--tx-64748b);
        --line: var(--bd-e2e8f0);
        --surface: var(--bg-ffffff);
        --soft: var(--bg-f8fafc);
      }
      .ce {
        height: 100%;
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 264px;
        gap: 1rem;
      }
      .sheet-handle {
        display: none;
      }

      /* ---------- Tablet / phone ----------
         The preview never scrolls away. Landscape tablets keep the desktop
         side panel (the grid above), just with a lower stage minimum. Portrait
         tablets and phones use a bottom sheet: preview on top filling the
         screen, the tab bar pinned below it, and the controls sliding up
         from the tab bar when a tab is tapped. */
      @media (max-width: 1180px) {
        .ce .ce__stage {
          min-height: 8rem;
        }
        .ce .ce__toolbar {
          flex-wrap: nowrap;
          overflow-x: auto;
          gap: 0.375rem;
        }
        .ce .ce__toolbar > * {
          flex: 0 0 auto;
        }
        .ce .ce__toolbar .flex-spacer {
          flex: 1 0 0.5rem;
        }
      }
      @media (max-width: 700px), (max-width: 1180px) and (orientation: portrait) {
        .ce {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .ce .ce__main {
          flex: 1 1 auto;
          min-height: 0;
        }
        .ce .ce__stage {
          flex: 1 1 auto;
        }
        .ce .tb-label {
          display: none;
        }
        /* Icon-only Preview button so the whole toolbar fits without scrolling. */
        .ce .ce__toolbar ::ng-deep .p-button-label {
          display: none;
        }
        .ce .tb-btn {
          padding: 0 0.625rem;
        }
        .ce .ce__inspector {
          flex: 0 0 auto;
          gap: 0.25rem;
          padding: 0 0.5rem 0.5rem;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 16px;
          box-shadow: 0 -6px 20px rgba(15, 23, 42, 0.08);
        }
        .ce .sheet-handle {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          height: 1.25rem;
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
        }
        .ce .sheet-handle__bar {
          width: 2.25rem;
          height: 0.25rem;
          border-radius: 999px;
          background: var(--bg-cbd5e1);
        }
        .ce .ce__inspector .tabs button {
          padding: 0.5rem 0.125rem;
          min-height: 2.75rem;
        }
        .ce .ce__panels {
          flex: 0 0 auto;
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.22s ease;
        }
        .ce .ce__inspector.is-open .ce__panels {
          max-height: min(30dvh, 16rem);
          overflow-y: auto;
        }
        .ce .ce__panels .panel {
          border: none;
          padding: 0.5rem 0.25rem;
          border-bottom: 1px solid var(--line);
          border-radius: 0;
        }
        .ce .ce__panels .panel:last-child {
          border-bottom: none;
        }
        .ce .ce__actions {
          flex-direction: row;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem 0 0;
          border: none;
          background: transparent;
        }
        .ce .ce__actions .btn-row--actions {
          flex: 1 1 auto;
          min-width: 0;
        }
        .ce .ce__actions .dpi-chip {
          flex: 0 0 auto;
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
        gap: 0.5rem 0.625rem;
        flex: 0 0 auto;
      }
      .flex-spacer {
        flex: 1 1 auto;
      }
      .icon-group,
      .zoom-controls {
        display: inline-flex;
        align-items: center;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 0.125rem;
      }
      .tb-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        height: 2.25rem;
        padding: 0 0.75rem;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
        color: var(--tx-334155);
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        touch-action: none;
      }
      .tb-btn:hover:not(:disabled) {
        border-color: var(--p-primary-300);
        color: var(--accent-text-600);
      }
      .tb-btn:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .tb-btn.is-held {
        background: var(--p-primary-600);
        border-color: var(--p-primary-600);
        color: #fff;
      }
      .zoom-controls__value {
        border: none;
        background: none;
        min-width: 3.25rem;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-334155);
        cursor: pointer;
        font-variant-numeric: tabular-nums;
      }
      .icon-btn {
        border: none;
        background: none;
        color: var(--tx-64748b);
        cursor: pointer;
        width: 2rem;
        height: 2rem;
        border-radius: 8px;
        font-size: 0.8125rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .icon-btn:hover:not(:disabled) {
        background: var(--bg-eef2ff);
        color: var(--accent-text-600);
      }
      .icon-btn:disabled {
        opacity: 0.35;
        cursor: default;
      }

      /* ---------- Stage ---------- */
      .ce__stage {
        position: relative;
        flex: 1 1 auto;
        min-height: 320px;
        border: 1px solid var(--line);
        border-radius: 14px;
        overflow: hidden;
        background-color: var(--bg-eef1f6);
        background-image: radial-gradient(var(--dot-grid) 1px, transparent 1px);
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
      .compare-tag {
        position: absolute;
        top: 0.75rem;
        left: 0.75rem;
        z-index: 2;
        background: rgba(15, 23, 42, 0.8);
        color: #fff;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-radius: 999px;
        padding: 0.25rem 0.75rem;
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
        background: var(--bg-fffbeb);
        border: 1px solid var(--bd-fcd34d);
        color: var(--tx-92400e);
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
        gap: 0.5rem;
        min-height: 0;
      }
      .tabs {
        display: flex;
        background: var(--bg-eef1f6);
        border-radius: 10px;
        padding: 0.1875rem;
        flex: 0 0 auto;
      }
      .tabs button {
        flex: 1 1 0;
        border: none;
        background: none;
        padding: 0.4375rem 0.5rem;
        border-radius: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--muted);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
      }
      .tabs button.is-on {
        background: var(--surface);
        color: var(--ink);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
      }
      .ce__panels {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        /* The app hides scrollbars globally; this list is long enough that
           users need to see that it scrolls. */
        scrollbar-width: thin;
        scrollbar-color: #cbd5e1 transparent;
      }
      .panel {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .bleed-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--tx-475569);
        cursor: pointer;
      }
      .group__label {
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
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
        align-self: flex-start;
        border: none;
        background: none;
        padding: 0;
        color: var(--accent-text-600);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
      }
      .link-btn:hover {
        text-decoration: underline;
      }
      .hint {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.4;
        color: var(--muted);
      }

      .mode-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.375rem;
      }
      .mode {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        padding: 0.4375rem 0.25rem;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
        color: var(--tx-475569);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.12s ease;
      }
      .mode i {
        font-size: 1rem;
      }
      .mode:hover {
        border-color: var(--p-primary-300);
        background: var(--soft);
      }
      .mode.is-on {
        border-color: var(--p-primary-500);
        background: var(--p-primary-50);
        color: var(--accent-text-700);
      }

      .slider-row__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .slider-row__value {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--muted);
        font-variant-numeric: tabular-nums;
      }
      .border-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .border-row__slider {
        flex: 1 1 auto;
        min-width: 0;
      }
      .swatch {
        flex: 0 0 auto;
        width: 1.75rem;
        height: 1.75rem;
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: none;
        cursor: pointer;
      }
      .size-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.375rem;
      }
      .size-row input {
        width: 100%;
        padding: 0.375rem 0.5rem;
        font-size: 0.8125rem;
      }
      .size-row__x {
        color: var(--muted);
        font-size: 0.8125rem;
      }
      .icon-btn.lock.is-on {
        color: var(--accent-text-600);
        background: var(--p-primary-50);
      }
      :host ::ng-deep .unit-select {
        width: 5.5rem;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.375rem;
      }
      .chip {
        border: 1px solid var(--line);
        background: var(--surface);
        color: var(--tx-475569);
        border-radius: 999px;
        padding: 0.3125rem 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
      }
      .chip:hover {
        border-color: var(--p-primary-300);
      }
      .chip.is-on {
        border-color: var(--p-primary-500);
        background: var(--p-primary-50);
        color: var(--accent-text-700);
      }

      .tabs button {
        flex-direction: column;
        gap: 0.125rem;
        padding: 0.375rem 0.125rem;
        font-size: 0.625rem;
        letter-spacing: 0.01em;
      }
      .tabs button i {
        font-size: 0.9375rem;
      }
      .btn-row--3 {
        grid-template-columns: repeat(3, 1fr);
      }
      .btn-row--3 ::ng-deep .p-button-label,
      .btn-row ::ng-deep .p-button-label {
        font-size: 0.75rem;
      }
      .size-row--text {
        grid-template-columns: minmax(0, 1fr) auto auto;
      }
      .size-row input.swatch {
        width: 1.75rem;
        padding: 0;
      }
      .size-row--save {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .link-btn.danger {
        color: var(--tx-dc2626);
      }
      .compare-tag--info {
        left: 50%;
        transform: translateX(-50%);
        background: var(--p-primary-600);
        text-transform: none;
        letter-spacing: 0;
        font-weight: 600;
      }
      .busy {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-334155);
      }
      .list-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0;
        border-bottom: 1px solid var(--line);
      }
      .list-row:last-of-type {
        border-bottom: none;
      }
      .list-row__name {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--tx-334155);
        display: flex;
        flex-direction: column;
      }
      .list-row__name small {
        color: var(--muted);
        font-size: 0.6875rem;
        font-weight: 400;
      }
      .thumb {
        width: 2.25rem;
        height: 2.25rem;
        object-fit: cover;
        border-radius: 6px;
        border: 1px solid var(--line);
      }
      .icon-btn--sm {
        width: 1.5rem;
        height: 1.5rem;
        font-size: 0.7rem;
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
      .dpi-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.3125rem 0.625rem;
        border-radius: 8px;
        background: var(--bg-ecfdf5);
        color: var(--tx-047857);
      }
      .dpi-chip.is-low {
        background: var(--bg-fffbeb);
        color: var(--tx-b45309);
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
  /** Storage key for this document's saved edit history (its print-job item id). */
  @Input() historyKey = '';
  /** Editor state to reopen with (only valid when the loaded image is the original upload). */
  @Input() initialState: unknown | null = null;
  /** True when the loaded image is the untouched upload, so saved versions can be restored. */
  @Input() baseIsOriginal = true;
  /** How many other image documents "Apply to all" would update. */
  @Input() otherImageCount = 0;
  @Input() batchBusy = false;
  @Output() applyAll = new EventEmitter<BatchParams>();

  @Output() save = new EventEmitter<CanvasEditorSaveResult>();
  @Output() cancelled = new EventEmitter<void>();

  readonly TARGET_DPI = TARGET_DPI;
  readonly fitModes = FIT_MODES;
  readonly paperOptions = (Object.keys(PAPER_SIZES_MM) as CanvasEditorPaperKey[]).map((key) => ({
    key,
    label: PAPER_SIZES_MM[key].label,
  }));
  readonly unitOptions: SizeUnit[] = ['mm', 'cm', 'in'];

  loading = signal(true);
  exporting = signal(false);
  viewZoom = signal(1);
  tab = signal<InspectorTab>('layout');
  /** Phone/portrait-tablet bottom sheet: controls slide up over the bottom of the screen. */
  sheetOpen = signal(false);

  paperSize = signal<CanvasEditorPaperKey>('A4');
  showBleed = signal(false);
  fitMode = signal<FitMode>('crop');
  marginMm = signal(0);
  borderMm = signal(0);
  borderColor = signal('#000000');

  brightness = signal(0);
  contrast = signal(0);
  saturation = signal(0);
  effect = signal<ColorEffect>('none');
  rotationSnap = signal<0 | 90 | 180 | 270>(0);
  fineAngle = signal(0);
  flipH = signal(false);
  flipV = signal(false);
  compareOn = signal(false);
  printPreview = signal(false);
  effectiveDpi = signal<number | null>(null);

  unit = signal<SizeUnit>('mm');
  lockAspect = signal(true);
  imgWmm = signal(0);
  imgHmm = signal(0);
  // Plain fields (not signals): bound with ngModel to the number inputs and
  // committed on change/enter, so typing is never overwritten mid-keystroke.
  sizeWDraft = 0;
  sizeHDraft = 0;
  private customWmm = 0;
  private customHmm = 0;

  // ---- Tools / annotations / pixel ops ----
  tool = signal<EditorTool>('select');
  busy = signal(false);
  busyLabel = signal('Processing…');
  brushMm = signal(1.5);
  brushColor = signal('#dc2626');
  spotMm = signal(4);
  bgTol = signal(28);
  bgColor = signal('#ffffff');
  selection = signal<SelectionInfo | null>(null);
  opsView = signal<PixelOp[]>([]);
  perspectiveActive = signal(false);
  stamp = signal<string | null>(null);
  readonly tabDefs: { key: InspectorTab; label: string; icon: string }[] = [
    { key: 'layout', label: 'Layout', icon: 'pi-th-large' },
    { key: 'adjust', label: 'Adjust', icon: 'pi-sliders-h' },
    { key: 'annotate', label: 'Annotate', icon: 'pi-pencil' },
    { key: 'fix', label: 'Fix', icon: 'pi-wrench' },
    { key: 'output', label: 'Output', icon: 'pi-download' },
  ];
  readonly fontFamilies = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact'];
  readonly textAligns = ['left', 'center', 'right'];

  // ---- Output / presets / versions ----
  exportFormat = signal<ExportFormat>('jpeg');
  exportQuality = signal(92);
  presets = signal<EditorPreset[]>([...BUILTIN_PRESETS]);
  presetName = '';
  versions = signal<EditorVersion[]>([]);
  readonly formatOptions: { label: string; value: ExportFormat }[] = [
    { label: 'JPEG (photos)', value: 'jpeg' },
    { label: 'PNG (sharp text)', value: 'png' },
  ];

  canUndo = signal(false);
  canRedo = signal(false);

  dpiWarning = computed(() => {
    const dpi = this.effectiveDpi();
    return dpi !== null && dpi < LOW_DPI_THRESHOLD;
  });
  paperLabel = computed(() => PAPER_SIZES_MM[this.paperSize()].label);
  activeHint = computed(() => FIT_MODES.find((m) => m.key === this.fitMode())?.hint ?? '');
  marginMax = computed(() => {
    const p = PAPER_SIZES_MM[this.paperSize()];
    return Math.max(1, Math.min(40, Math.floor(Math.min(p.width, p.height) / 2) - 2));
  });
  unitStep = computed(() => (this.unit() === 'in' ? 0.05 : this.unit() === 'cm' ? 0.1 : 1));

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
  private bleedRect!: Rect;
  private borderRect!: Rect;
  private cropRect!: Rect;

  // Kept alive for the editor's lifetime: image.clone() (used by the export)
  // re-loads the image from this URL, so revoking it early breaks Save.
  private blobUrl?: string;

  private brightnessFilter = new filters.Brightness({ brightness: 0 });
  private contrastFilter = new filters.Contrast({ contrast: 0 });
  private saturationFilter = new filters.Saturation({ saturation: 0 });

  private readonly filterChange$ = new Subject<void>();
  private readonly historyChange$ = new Subject<void>();
  private resizeObserver?: ResizeObserver;
  private baseScale = 1;
  private isPanning = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private baseImage!: HTMLImageElement;
  private opsList: PixelOp[] = [];
  private opsCache = new Map<string, HTMLCanvasElement>();
  private appliedOpsKey = '[]';
  private restoreToken = 0;
  private annotationToken = 0;
  private srcRegistry = new Map<string, string>();
  private srcIds = new Map<string, string>();
  private perspectiveObjects: FabricObject[] = [];
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch?: { dist: number; cx: number; cy: number };

  private history: EditorSnapshot[] = [];
  private historyPos = -1;
  private initialSnapshot?: EditorSnapshot;
  private restoring = false;

  private get paper() {
    return PAPER_SIZES_MM[this.paperSize()];
  }

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
    // Opening/closing the bottom sheet resizes the stage: re-fit only if the
    // user hasn't zoomed, otherwise keep their view and just resize.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.viewZoom() === 1) this.fitView();
      else this.resizeStage();
    });
    this.resizeObserver.observe(stage);

    this.canvas.on('object:moving', (e) => {
      if (e.target === this.cropRect) this.refreshOverlays();
    });
    this.canvas.on('object:scaling', (e) => {
      if (e.target !== this.cropRect) return;
      // Force uniform scaling so the rect's fixed width:height ratio
      // (set to the paper guide's aspect ratio whenever it's (re)created)
      // never drifts during an interactive corner-drag resize.
      e.target.set({ scaleY: e.target.scaleX });
      this.refreshOverlays();
    });
    this.canvas.on('object:modified', (e) => {
      if (e.target === this.cropRect) {
        this.refreshOverlays();
        this.pushHistory();
      } else if (this.isAnn(e.target)) {
        this.syncSelection();
        this.pushHistory();
      }
    });
    this.canvas.on('selection:created', () => this.syncSelection());
    this.canvas.on('selection:updated', () => this.syncSelection());
    this.canvas.on('selection:cleared', () => this.syncSelection());
    this.canvas.on('text:editing:exited', () => {
      this.syncSelection();
      this.pushHistory();
    });
    this.canvas.on('text:changed', () => this.historyChange$.next());
    this.canvas.on('path:created', (e) => {
      const path = (e as unknown as { path: FabricObject }).path;
      this.tagAnn(path, 'path');
      path.set({ selectable: true, evented: true, perPixelTargetFind: true });
      this.arrangeLayers();
      this.pushHistory();
    });
    this.canvas.on('object:moving', (e) => {
      if (this.perspectiveHandles.includes(e.target as Circle)) this.updatePerspectiveLines();
    });

    this.setupGestures();
    this.filterChange$.pipe(debounceTime(50)).subscribe(() => this.applyLiveFilters());
    this.historyChange$.pipe(debounceTime(400)).subscribe(() => this.pushHistory());

    await this.loadImage();
    this.drawPaperGuide();
    this.createOverlayRects();
    this.createCropRect();
    this.fitToPage();
    this.initialSnapshot = this.snapshot();
    this.pushHistory();
    this.presets.set([...BUILTIN_PRESETS, ...loadPresets()]);
    this.stamp.set(loadStamp());
    this.refreshVersions();
    this.loading.set(false);
    if (this.initialState) {
      await this.restore(this.initialState as EditorSnapshot);
      this.pushHistory();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.filterChange$.complete();
    this.historyChange$.complete();
    this.canvas?.dispose();
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    // Let inputs keep their own native undo / arrow keys.
    if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
    const active = this.canvas?.getActiveObject();
    if (active instanceof IText && active.isEditing) return;

    const key = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void this.undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        void this.redo();
      } else if (key === 'd') {
        e.preventDefault();
        void this.duplicateSelection();
      }
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this.nudge(-step, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.nudge(step, 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.nudge(0, -step);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.nudge(0, step);
        break;
      case 'Delete':
      case 'Backspace':
        if (this.selection()) {
          e.preventDefault();
          this.deleteSelection();
        }
        break;
      case 'Escape':
        if (this.perspectiveActive()) this.cancelPerspective();
        else if (this.tool() !== 'select') this.setTool('select');
        else this.canvas.discardActiveObject();
        this.canvas.requestRenderAll();
        break;
      case '+':
      case '=':
        this.zoomBy(1.25);
        break;
      case '-':
        this.zoomBy(1 / 1.25);
        break;
      case '0':
        this.fitView();
        break;
    }
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

  private resizeStage(): void {
    if (!this.canvas) return;
    const el = this.stageRef.nativeElement;
    if (!el.clientWidth || !el.clientHeight) return;
    this.canvas.setDimensions({ width: el.clientWidth, height: el.clientHeight });
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
    this.blobUrl = URL.createObjectURL(blob);
    {
      const img = await FabricImage.fromURL(this.blobUrl, { crossOrigin: 'anonymous' });
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
      this.baseImage = img.getElement() as HTMLImageElement;
      img.filters = this.buildFilters();
      img.applyFilters();
      this.canvas.add(img);
      this.canvas.sendObjectToBack(img);
    }
  }

  // ---- Pan / zoom ----

  private setupPanZoom(): void {
    this.canvas.on('mouse:wheel', (opt: TPointerEventInfo<WheelEvent>) => {
      const e = opt.e;
      const wheelMouse = e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
      if (e.ctrlKey) {
        // Trackpad pinch arrives as ctrl+wheel.
        this.zoomTo(this.canvas.getZoom() * 0.99 ** e.deltaY, opt.viewportPoint);
      } else if (wheelMouse) {
        this.zoomTo(this.canvas.getZoom() * 0.999 ** e.deltaY, opt.viewportPoint);
      } else {
        // Two-finger trackpad scroll pans.
        const vpt = this.canvas.viewportTransform;
        vpt[4] -= e.deltaX;
        vpt[5] -= e.deltaY;
        this.canvas.requestRenderAll();
      }
      e.preventDefault();
      e.stopPropagation();
    });

    this.canvas.on('mouse:down', (opt: TPointerEventInfo) => {
      const tool = this.tool();
      if ((tool === 'spot' || tool === 'redeye') && !this.busy()) {
        void this.retouchAt(opt.scenePoint, tool);
        return;
      }
      if (tool === 'erase') {
        if (opt.target && this.annKind(opt.target) === 'path') {
          this.canvas.remove(opt.target);
          this.pushHistory();
        }
        return;
      }
      // Drawing owns the pointer; grabbing a crop box / annotation / handle
      // is not a pan either.
      if (this.canvas.isDrawingMode || opt.target) return;
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

  // ---- Geometry helpers ----

  /** Axis-aligned size the image occupies on the page (world px), given a scale. */
  private imageBounds(scaleX = this.image.scaleX, scaleY = this.image.scaleY): { w: number; h: number } {
    const rad = ((this.image.angle ?? 0) * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const sw = this.image.width * scaleX;
    const sh = this.image.height * scaleY;
    return { w: sw * c + sh * s, h: sw * s + sh * c };
  }

  // Fabric's getScaledWidth()/Height() include the stroke, which would skew
  // every mm<->px conversion; the crop box's true size is width * scale.
  private get cropW(): number {
    return this.cropRect.width * this.cropRect.scaleX;
  }
  private get cropH(): number {
    return this.cropRect.height * this.cropRect.scaleY;
  }

  private get quarterTurned(): boolean {
    return this.rotationSnap() === 90 || this.rotationSnap() === 270;
  }

  /** World px per printed mm — the crop rect always represents the paper width. */
  private pxPerMm(): number {
    return this.cropW / this.paper.width;
  }

  /** The page in layout modes: the (fixed) paper guide. */
  private guideGeometry(): Geometry {
    return { cx: VIEWPORT_W / 2, cy: VIEWPORT_H / 2, w: this.guideRect.width, h: this.guideRect.height };
  }

  /** Area the image is allowed to occupy: the crop box, or the page minus margin. */
  private contentGeometry(): Geometry {
    if (this.fitMode() === 'crop') {
      return { cx: this.cropRect.left, cy: this.cropRect.top, w: this.cropW, h: this.cropH };
    }
    const g = this.guideGeometry();
    const margin = this.marginMm() * (g.w / this.paper.width);
    return { cx: g.cx, cy: g.cy, w: Math.max(10, g.w - 2 * margin), h: Math.max(10, g.h - 2 * margin) };
  }

  private makeContentClip(): Rect {
    const c = this.contentGeometry();
    return new Rect({
      left: c.cx,
      top: c.cy,
      originX: 'center',
      originY: 'center',
      width: c.w,
      height: c.h,
      absolutePositioned: true,
    });
  }

  // ---- Paper guide / overlay rects ----

  onPaperSizeChange(): void {
    this.drawPaperGuide();
    if (this.fitMode() === 'crop') this.fitToPage();
    else this.applyLayout();
    this.pushHistory();
  }

  /** The white "sheet" shown behind the image in the layout (non-crop) modes. */
  private drawPaperGuide(): void {
    if (this.guideRect) this.canvas.remove(this.guideRect);
    const size = this.paper;
    const aspect = size.width / size.height;
    const maxW = VIEWPORT_W * 0.8;
    const maxH = VIEWPORT_H * 0.8;
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
      fill: '#ffffff',
      stroke: '#cbd5e1',
      strokeWidth: 1,
      strokeUniform: true,
      shadow: new Shadow({ color: 'rgba(15,23,42,0.18)', blur: 24, offsetX: 0, offsetY: 6 }),
      selectable: false,
      evented: false,
      visible: this.fitMode() !== 'crop',
    });
    this.canvas.add(this.guideRect);
    if (this.image) this.arrangeLayers();
  }

  private createOverlayRects(): void {
    this.bleedRect = new Rect({
      originX: 'center',
      originY: 'center',
      fill: 'transparent',
      stroke: 'var(--tx-f59e0b)',
      strokeWidth: 1,
      strokeUniform: true,
      strokeDashArray: [3, 3],
      selectable: false,
      evented: false,
      visible: false,
    });
    this.borderRect = new Rect({
      originX: 'center',
      originY: 'center',
      fill: 'transparent',
      strokeUniform: true,
      selectable: false,
      evented: false,
      visible: false,
    });
    this.canvas.add(this.bleedRect, this.borderRect);
  }

  /** Enforces draw order, bottom to top: guide, image, border, annotations, bleed, crop box. */
  private arrangeLayers(): void {
    const annotations = this.annotationObjects().reverse();
    const topToBottom = [this.cropRect, this.bleedRect, ...annotations, this.borderRect, this.image, this.guideRect];
    for (const obj of topToBottom) {
      if (obj) this.canvas.sendObjectToBack(obj);
    }
  }

  onBleedChange(): void {
    this.refreshOverlays();
    this.pushHistory();
  }

  private updateBleed(): void {
    if (!this.showBleed()) {
      this.bleedRect.set({ visible: false });
      return;
    }
    const inset = 3 * this.pxPerMm();
    this.bleedRect.set({
      visible: true,
      left: this.cropRect.left,
      top: this.cropRect.top,
      width: Math.max(1, this.cropW - inset * 2),
      height: Math.max(1, this.cropH - inset * 2),
    });
    this.bleedRect.setCoords();
  }

  /** Frame drawn just inside the visible image edge (image ∩ content area). */
  private borderGeometry(): { left: number; top: number; width: number; height: number; strokeWidth: number; color: string } | null {
    const mm = this.borderMm();
    if (mm <= 0) return null;
    const px = mm * this.pxPerMm();
    const c = this.contentGeometry();
    const b = this.imageBounds();
    const left = Math.max(c.cx - c.w / 2, this.image.left - b.w / 2);
    const right = Math.min(c.cx + c.w / 2, this.image.left + b.w / 2);
    const top = Math.max(c.cy - c.h / 2, this.image.top - b.h / 2);
    const bottom = Math.min(c.cy + c.h / 2, this.image.top + b.h / 2);
    const w = right - left;
    const h = bottom - top;
    if (w <= px * 2 || h <= px * 2) return null;
    return {
      left: (left + right) / 2,
      top: (top + bottom) / 2,
      // Stroke is centered on the edge, so shrink by one stroke width to
      // keep the whole frame inside the visible image.
      width: w - px,
      height: h - px,
      strokeWidth: px,
      color: this.borderColor(),
    };
  }

  private updateBorder(): void {
    const g = this.borderGeometry();
    if (!g) {
      this.borderRect.set({ visible: false });
      return;
    }
    this.borderRect.set({
      visible: true,
      left: g.left,
      top: g.top,
      width: g.width,
      height: g.height,
      strokeWidth: g.strokeWidth,
      stroke: g.color,
    });
    this.borderRect.setCoords();
  }

  /** Re-syncs everything derived from the crop box / image geometry. */
  private refreshOverlays(): void {
    if (!this.image || !this.cropRect || !this.bleedRect) return;
    this.updateBleed();
    this.updateBorder();
    this.syncSizeReadout();
    this.updateDpi();
    this.canvas.requestRenderAll();
  }

  // ---- Crop box ----

  private createCropRect(): void {
    this.cropRect = new Rect({
      originX: 'center',
      originY: 'center',
      width: 100,
      height: 100,
      cornerColor: '#ffffff',
      cornerStrokeColor: '#4f46e5',
      cornerSize: 11,
      touchCornerSize: 28,
      cornerStyle: 'circle',
      transparentCorners: false,
      borderColor: '#4f46e5',
      strokeUniform: true,
      lockRotation: true,
      lockScalingFlip: true,
    });
    this.cropRect.setControlsVisibility({ mtr: false });
    this.canvas.add(this.cropRect);
    this.styleCropRect('active');
    this.arrangeLayers();
  }

  /**
   * `active`: blue and draggable (crop mode). `locked`: same look but inert
   * (crop mode while another tool owns the pointer). `page`: quiet outline of
   * the fixed page (every other fit mode).
   */
  private styleCropRect(mode: 'active' | 'locked' | 'page'): void {
    if (mode === 'page') {
      this.canvas.discardActiveObject();
      this.cropRect.set({
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        stroke: 'var(--tx-94a3b8)',
        strokeWidth: 1,
        fill: 'transparent',
      });
      return;
    }
    const active = mode === 'active';
    this.cropRect.set({
      selectable: active,
      evented: active,
      hasControls: active,
      hasBorders: active,
      stroke: 'var(--tx-4f46e5)',
      strokeWidth: 2,
      fill: 'rgba(79,70,229,0.08)',
    });
    if (active) this.canvas.setActiveObject(this.cropRect);
    else if (this.canvas.getActiveObject() === this.cropRect) this.canvas.discardActiveObject();
  }

  /** Largest paper-aspect box that fits inside the image (crop mode only). */
  fitToPage(): void {
    const aspect = this.paper.width / this.paper.height;
    const b = this.imageBounds();
    let w = b.w;
    let h = w / aspect;
    if (h > b.h) {
      h = b.h;
      w = h * aspect;
    }
    this.cropRect.set({ left: this.image.left, top: this.image.top, width: w, height: h, scaleX: 1, scaleY: 1, angle: 0 });
    this.cropRect.setCoords();
    this.applyLayout();
  }

  resetCrop(): void {
    this.fitToPage();
    this.pushHistory();
  }

  private updateDpi(): void {
    // Image pixels per printed inch: independent of the crop box coverage.
    const scale = Math.max(this.image.scaleX, this.image.scaleY);
    this.effectiveDpi.set(Math.round((MM_PER_INCH * this.pxPerMm()) / scale));
  }

  // ---- Layout / placement (fit, fill, stretch, center, custom) ----

  setFitMode(mode: FitMode): void {
    if (mode === this.fitMode()) return;
    this.changeFitMode(mode);
    this.pushHistory();
  }

  private changeFitMode(mode: FitMode): void {
    if (mode === this.fitMode()) {
      this.applyLayout();
      return;
    }
    if (mode === 'custom') {
      this.customWmm = this.imgWmm();
      this.customHmm = this.imgHmm();
    }
    const leavingCrop = this.fitMode() === 'crop';
    this.fitMode.set(mode);
    if (mode === 'crop') {
      this.fitToPage();
    } else {
      // The page is the fixed guide from here on; recompute placement.
      if (leavingCrop) this.cropRect.set({ scaleX: 1, scaleY: 1 });
      this.applyLayout();
    }
  }

  /** Applies the current fit mode: places/scales/clips the image and syncs overlays. */
  private applyLayout(): void {
    if (!this.image || !this.cropRect) return;
    if (this.fitMode() === 'crop') {
      this.image.clipPath = undefined;
      this.guideRect.set({ visible: false });
    } else {
      const g = this.guideGeometry();
      this.cropRect.set({ left: g.cx, top: g.cy, width: g.w, height: g.h, scaleX: 1, scaleY: 1, angle: 0 });
      this.cropRect.setCoords();
      this.guideRect.set({ visible: true });
      this.placeImageForMode();
      this.image.clipPath = this.makeContentClip();
    }
    this.image.setCoords();
    this.syncInteractivity();
    this.refreshOverlays();
  }

  private placeImageForMode(): void {
    const g = this.guideGeometry();
    const pxPerMm = g.w / this.paper.width;
    const content = this.contentGeometry();
    const img = this.image;
    if (this.fitMode() === 'crop') return;
    const { scaleX: sx, scaleY: sy } = computePlacement(
      this.fitMode() as Exclude<FitMode, 'crop'>,
      { w: img.width, h: img.height },
      img.angle ?? 0,
      this.quarterTurned,
      content,
      pxPerMm,
      { w: this.customWmm, h: this.customHmm },
    );
    img.set({ left: g.cx, top: g.cy, scaleX: sx, scaleY: sy });
  }

  // ---- Margin / border ----

  onMarginChange(value: number): void {
    this.marginMm.set(value);
    if (this.fitMode() !== 'crop') this.applyLayout();
    this.historyChange$.next();
  }

  onBorderChange(value: number): void {
    this.borderMm.set(value);
    this.refreshOverlays();
    this.historyChange$.next();
  }

  onBorderColor(event: Event): void {
    this.borderColor.set((event.target as HTMLInputElement).value);
    this.refreshOverlays();
    this.historyChange$.next();
  }

  // ---- Exact size ----

  setUnit(unit: SizeUnit): void {
    this.unit.set(unit);
    this.syncSizeReadout();
  }

  private toUnit(mm: number): number {
    const f = 10 ** UNIT_DECIMALS[this.unit()];
    return Math.round(mm * UNIT_FACTOR[this.unit()] * f) / f;
  }

  private fromUnit(value: number): number {
    return value / UNIT_FACTOR[this.unit()];
  }

  /** Reads the image's printed size (along its own edges, as displayed) into the inputs. */
  private syncSizeReadout(): void {
    const pxPerMm = this.pxPerMm();
    if (!pxPerMm) return;
    const localW = this.image.width * this.image.scaleX;
    const localH = this.image.height * this.image.scaleY;
    const w = (this.quarterTurned ? localH : localW) / pxPerMm;
    const h = (this.quarterTurned ? localW : localH) / pxPerMm;
    this.imgWmm.set(w);
    this.imgHmm.set(h);
    this.sizeWDraft = this.toUnit(w);
    this.sizeHDraft = this.toUnit(h);
  }

  commitSize(axis: 'w' | 'h'): void {
    const raw = axis === 'w' ? this.sizeWDraft : this.sizeHDraft;
    if (!(raw > 0)) {
      this.syncSizeReadout();
      return;
    }
    let wMm = axis === 'w' ? this.fromUnit(raw) : this.imgWmm();
    let hMm = axis === 'h' ? this.fromUnit(raw) : this.imgHmm();
    if (this.lockAspect()) {
      // Aspect of the image itself (height / width as displayed).
      const nW = this.image.width;
      const nH = this.image.height;
      const ratio = this.quarterTurned ? nW / nH : nH / nW;
      if (axis === 'w') hMm = wMm * ratio;
      else wMm = hMm / ratio;
    }
    this.customWmm = Math.min(3000, Math.max(1, wMm));
    this.customHmm = Math.min(3000, Math.max(1, hMm));
    this.fitMode.set('custom');
    this.applyLayout();
    this.pushHistory();
  }

  // ---- Rotation / flip ----

  rotate(delta: 90 | -90): void {
    this.rotationSnap.set((((this.rotationSnap() + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270);
    this.applyRotation();
    this.pushHistory();
  }

  flip(axis: 'h' | 'v'): void {
    if (axis === 'h') this.flipH.set(!this.flipH());
    else this.flipV.set(!this.flipV());
    this.applyRotation();
    this.pushHistory();
  }

  applyRotation(): void {
    this.applyOrientation();
    if (this.fitMode() === 'crop') this.refreshOverlays();
    else this.applyLayout();
    this.historyChange$.next();
  }

  /** Writes rotation + flips onto the image. */
  private applyOrientation(): void {
    // Fabric flips in the object's own axes *before* rotating, so once the
    // image is turned a quarter the user's "horizontal" flip is Fabric's Y.
    const swap = this.quarterTurned;
    this.image.set({
      angle: this.rotationSnap() + this.fineAngle(),
      flipX: swap ? this.flipV() : this.flipH(),
      flipY: swap ? this.flipH() : this.flipV(),
    });
    this.image.setCoords();
  }

  // ---- Color / adjustments ----

  onAdjustmentChange(): void {
    this.filterChange$.next();
    this.historyChange$.next();
  }

  setEffect(effect: ColorEffect): void {
    this.effect.set(effect);
    this.applyLiveFilters();
    this.pushHistory();
  }

  resetAdjustments(): void {
    this.brightness.set(0);
    this.contrast.set(0);
    this.saturation.set(0);
    this.effect.set('none');
    this.applyLiveFilters();
    this.pushHistory();
  }

  setCompare(on: boolean): void {
    if (this.compareOn() === on) return;
    this.compareOn.set(on);
    this.applyLiveFilters();
  }

  togglePrintPreview(): void {
    this.printPreview.set(!this.printPreview());
    this.applyLiveFilters();
  }

  private buildFilters(opts: { preview?: boolean; original?: boolean } = {}): FabricImage['filters'] {
    if (opts.original) return [];
    this.brightnessFilter.brightness = this.brightness() / 100;
    this.contrastFilter.contrast = this.contrast() / 100;
    this.saturationFilter.saturation = this.saturation() / 100;
    const list: FabricImage['filters'] = [this.brightnessFilter, this.contrastFilter, this.saturationFilter];
    if (this.effect() === 'grayscale') list.push(new filters.Grayscale());
    if (this.effect() === 'bw') list.push(new filters.BlackWhite());
    // Visual cue only (SRS item 7: "not color-accurate") — never included
    // in the exported/printed file, see applyAndSave().
    if (opts.preview) list.push(new filters.Saturation({ saturation: -0.35 }), new filters.Contrast({ contrast: -0.08 }));
    return list;
  }

  private applyLiveFilters(): void {
    this.image.filters = this.buildFilters({ preview: this.printPreview(), original: this.compareOn() });
    this.image.applyFilters();
    this.canvas.requestRenderAll();
  }

  // ---- Annotations (text, watermark, logo, shapes, drawings) ----

  private isAnn(o: FabricObject | undefined | null): boolean {
    return !!o && !!(o as unknown as { data?: { ann?: boolean } }).data?.ann;
  }

  private annKind(o: FabricObject): AnnotationKind | null {
    return (o as unknown as { data?: { kind?: AnnotationKind } }).data?.kind ?? null;
  }

  private annotationObjects(): FabricObject[] {
    return this.canvas.getObjects().filter((o) => this.isAnn(o));
  }

  private tagAnn(o: FabricObject, kind: AnnotationKind): void {
    (o as unknown as { data: unknown }).data = { ann: true, kind };
  }

  private pageCenter(): { x: number; y: number } {
    return { x: this.cropRect.left, y: this.cropRect.top };
  }

  private addAnnotation(o: FabricObject, kind: AnnotationKind): void {
    this.tagAnn(o, kind);
    o.set({ selectable: true, evented: true, cornerColor: '#ffffff', cornerStrokeColor: '#0f766e', cornerStyle: 'circle', cornerSize: 10, transparentCorners: false, borderColor: '#0f766e' });
    this.canvas.add(o);
    this.arrangeLayers();
    this.canvas.setActiveObject(o);
    this.syncSelection();
    this.canvas.requestRenderAll();
    this.pushHistory();
  }

  addText(watermark = false): void {
    const pxMm = this.pxPerMm();
    const c = this.pageCenter();
    const t = new IText(watermark ? 'CONFIDENTIAL' : 'Your text', {
      left: c.x,
      top: c.y,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Inter',
      fontSize: (watermark ? 42 : 20) * PT_MM * pxMm,
      fill: watermark ? 'var(--tx-64748b)' : 'var(--tx-111827)',
      fontWeight: watermark ? 'bold' : 'normal',
      opacity: watermark ? 0.25 : 1,
      angle: watermark ? -30 : 0,
    });
    this.addAnnotation(t, 'text');
    if (!watermark) {
      t.enterEditing();
      t.selectAll();
    }
  }

  addShape(kind: 'rect' | 'ellipse' | 'line' | 'frame'): void {
    const pxMm = this.pxPerMm();
    const c = this.pageCenter();
    const w = this.cropW;
    const h = this.cropH;
    const common = { stroke: this.brushColor(), strokeUniform: true, fill: 'transparent' };
    const sw = 1.5 * pxMm;
    let o: FabricObject;
    if (kind === 'line') {
      o = new Line([c.x - w * 0.2, c.y, c.x + w * 0.2, c.y], { stroke: this.brushColor(), strokeWidth: sw, strokeUniform: true });
    } else if (kind === 'ellipse') {
      o = new Ellipse({ left: c.x, top: c.y, originX: 'center', originY: 'center', rx: w * 0.18, ry: h * 0.1, strokeWidth: sw, ...common });
    } else if (kind === 'frame') {
      const g = this.contentGeometry();
      const fw = 3 * pxMm;
      o = new Rect({ left: g.cx, top: g.cy, originX: 'center', originY: 'center', width: g.w - fw, height: g.h - fw, strokeWidth: fw, ...common });
    } else {
      o = new Rect({ left: c.x, top: c.y, originX: 'center', originY: 'center', width: w * 0.35, height: h * 0.2, strokeWidth: sw, ...common });
    }
    this.addAnnotation(o, 'shape');
  }

  // ---- Logo / stamp ----

  async onLogoFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const dataUrl = await this.readScaledDataUrl(file, 600);
    await this.addLogo(dataUrl);
  }

  private readScaledDataUrl(file: File, maxSide: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Unreadable image'));
        img.onload = () => {
          const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * k));
          c.height = Math.max(1, Math.round(img.naturalHeight * k));
          c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async addLogo(dataUrl: string): Promise<void> {
    const img = await FabricImage.fromURL(dataUrl);
    const w = this.cropW;
    const h = this.cropH;
    const scale = (w * 0.26) / img.width;
    img.set({
      originX: 'center',
      originY: 'center',
      scaleX: scale,
      scaleY: scale,
      left: this.cropRect.left + w / 2 - (img.width * scale) / 2 - w * 0.04,
      top: this.cropRect.top + h / 2 - (img.height * scale) / 2 - h * 0.03,
      opacity: 0.9,
    });
    this.addAnnotation(img, 'logo');
  }

  useSavedLogo(): void {
    const s = this.stamp();
    if (s) void this.addLogo(s);
  }

  saveSelectionAsLogo(): void {
    const o = this.canvas.getActiveObject();
    if (!o || this.annKind(o) !== 'logo') return;
    const src = (o as FabricImage).getSrc();
    if (saveStamp(src)) this.stamp.set(src);
  }

  removeSavedLogo(): void {
    clearStamp();
    this.stamp.set(null);
  }

  // ---- Selection editing ----

  syncSelection(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.isAnn(o)) {
      this.selection.set(null);
      return;
    }
    const pxMm = this.pxPerMm();
    const t = o as IText;
    const wasSelected = this.selection() !== null;
    this.selection.set({
      kind: this.annKind(o)!,
      fill: typeof o.fill === 'string' ? o.fill : 'transparent',
      stroke: typeof o.stroke === 'string' ? o.stroke : '#000000',
      strokeMm: Math.round(((o.strokeWidth || 0) / pxMm) * 10) / 10,
      opacity: o.opacity ?? 1,
      fontFamily: t.fontFamily ?? 'Inter',
      fontPt: Math.round(((t.fontSize ?? 0) * (t.scaleY ?? 1)) / pxMm / PT_MM),
      bold: t.fontWeight === 'bold',
      italic: t.fontStyle === 'italic',
      underline: !!t.underline,
      align: t.textAlign ?? 'left',
    });
    // Newly selected: bring its settings into view inside the (scrollable) panel/sheet.
    if (!wasSelected) {
      setTimeout(
        () => this.stageRef?.nativeElement.closest('.ce')?.querySelector('.panel--selection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
        60,
      );
    }
  }

  private editSelected(apply: (o: FabricObject) => void): void {
    const o = this.canvas.getActiveObject();
    if (!o || !this.isAnn(o)) return;
    apply(o);
    o.setCoords();
    this.canvas.requestRenderAll();
    this.syncSelection();
    this.historyChange$.next();
  }

  hexOf(color: string): string {
    return /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
  }

  selFilled(on: boolean): void {
    this.editSelected((o) => o.set({ fill: on ? this.hexOf(this.selection()?.stroke ?? 'var(--tx-dc2626)') : 'transparent' }));
  }
  selFill(v: string): void {
    this.editSelected((o) => o.set({ fill: v }));
  }
  selStroke(v: string): void {
    this.editSelected((o) => o.set({ stroke: v }));
  }
  selStrokeMm(v: number): void {
    this.editSelected((o) => o.set({ strokeWidth: Math.max(0.1, v) * this.pxPerMm() }));
  }
  selOpacity(v: number): void {
    this.editSelected((o) => o.set({ opacity: v / 100 }));
  }
  selFont(v: string): void {
    this.editSelected((o) => o.set({ fontFamily: v }));
  }
  selFontPt(v: number): void {
    this.editSelected((o) => o.set({ fontSize: Math.max(4, v) * PT_MM * this.pxPerMm(), scaleX: 1, scaleY: 1 }));
  }
  selToggle(prop: 'bold' | 'italic' | 'underline'): void {
    this.editSelected((o) => {
      const t = o as IText;
      if (prop === 'bold') t.set({ fontWeight: t.fontWeight === 'bold' ? 'normal' : 'bold' });
      else if (prop === 'italic') t.set({ fontStyle: t.fontStyle === 'italic' ? 'normal' : 'italic' });
      else t.set({ underline: !t.underline });
    });
  }
  selAlign(v: string): void {
    this.editSelected((o) => o.set({ textAlign: v }));
  }

  deleteSelection(): void {
    const o = this.canvas.getActiveObject();
    if (!o || !this.isAnn(o)) return;
    this.canvas.remove(o);
    this.canvas.discardActiveObject();
    this.syncSelection();
    this.canvas.requestRenderAll();
    this.pushHistory();
  }

  async duplicateSelection(): Promise<void> {
    const o = this.canvas.getActiveObject();
    if (!o || !this.isAnn(o)) return;
    const copy = await o.clone(['data']);
    copy.set({ left: (o.left ?? 0) + 12, top: (o.top ?? 0) + 12 });
    this.canvas.add(copy);
    this.arrangeLayers();
    this.canvas.setActiveObject(copy);
    this.syncSelection();
    this.canvas.requestRenderAll();
    this.pushHistory();
  }

  layer(direction: 'front' | 'back'): void {
    const o = this.canvas.getActiveObject();
    if (!o || !this.isAnn(o)) return;
    if (direction === 'front') this.canvas.bringObjectToFront(o);
    else this.canvas.sendObjectToBack(o);
    this.arrangeLayers();
    this.canvas.requestRenderAll();
    this.pushHistory();
  }

  // ---- Tools (draw / highlight / erase / retouch / perspective) ----

  /**
   * Bottom-sheet behaviour on small screens: tapping a tab opens the sheet on
   * it; tapping the active tab again tucks it away so the whole preview shows.
   * (On desktop the panels are always visible and this is a plain tab switch.)
   */
  onTabClick(tab: InspectorTab): void {
    if (this.tab() === tab && this.sheetOpen()) {
      this.sheetOpen.set(false);
      return;
    }
    this.selectTab(tab);
    this.sheetOpen.set(true);
  }

  selectTab(tab: InspectorTab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    if (this.tool() !== 'select') this.setTool('select');
    else this.syncInteractivity();
  }

  setTool(tool: EditorTool): void {
    if (this.perspectiveActive() && tool !== 'perspective') this.cancelPerspective();
    this.tool.set(tool);
    const drawing = tool === 'draw' || tool === 'highlight';
    this.canvas.isDrawingMode = drawing;
    if (drawing) this.configureBrush();
    this.canvas.defaultCursor = tool === 'spot' || tool === 'redeye' || tool === 'erase' ? 'crosshair' : 'grab';
    if (tool !== 'select') this.canvas.discardActiveObject();
    this.syncSelection();
    this.syncInteractivity();
  }

  toggleTool(tool: EditorTool): void {
    this.setTool(this.tool() === tool ? 'select' : tool);
  }

  configureBrush(): void {
    if (!this.canvas) return;
    const brush = new PencilBrush(this.canvas);
    const widthPx = this.brushMm() * this.pxPerMm();
    if (this.tool() === 'highlight') {
      brush.color = this.hexToRgba(this.brushColor(), 0.35);
      brush.width = widthPx * 4;
    } else {
      brush.color = this.brushColor();
      brush.width = widthPx;
    }
    this.canvas.freeDrawingBrush = brush;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const n = parseInt(this.hexOf(hex).slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  /** Crop box is only draggable in crop mode on the layout tab; elsewhere it must not steal clicks. */
  private syncInteractivity(): void {
    if (!this.cropRect) return;
    const crop = this.fitMode() === 'crop';
    const editable = crop && this.tab() !== 'annotate' && this.tool() === 'select' && !this.perspectiveActive();
    this.styleCropRect(editable ? 'active' : crop ? 'locked' : 'page');
    this.canvas.requestRenderAll();
  }

  // ---- Pixel ops (upscale, background, retouch, perspective) ----

  /** Bitmap for an op list, replayed from the original and cached by prefix. */
  private async computeOps(ops: PixelOp[]): Promise<CanvasImageSource> {
    if (ops.length === 0) return this.baseImage;
    const hit = this.opsCache.get(JSON.stringify(ops));
    if (hit) return hit;
    let src: CanvasImageSource = this.baseImage;
    let start = 0;
    for (let n = ops.length - 1; n >= 1; n--) {
      const cached = this.opsCache.get(JSON.stringify(ops.slice(0, n)));
      if (cached) {
        src = cached;
        start = n;
        break;
      }
    }
    for (let i = start; i < ops.length; i++) {
      src = await applyOp(src, ops[i]);
      this.cachePut(JSON.stringify(ops.slice(0, i + 1)), src as HTMLCanvasElement);
    }
    return src;
  }

  private cachePut(key: string, canvas: HTMLCanvasElement): void {
    this.opsCache.set(key, canvas);
    // Bitmaps are large; keep only the few most recent.
    while (this.opsCache.size > 3) {
      const oldest = this.opsCache.keys().next().value as string;
      this.opsCache.delete(oldest);
    }
  }

  /** Makes the image show `ops` applied to the original, keeping its printed size. */
  private async setOps(ops: PixelOp[], label = 'Processing…'): Promise<void> {
    const key = JSON.stringify(ops);
    this.opsList = ops;
    this.opsView.set(ops);
    if (key === this.appliedOpsKey) return;
    this.busyLabel.set(label);
    this.busy.set(true);
    try {
      const el = await this.computeOps(ops);
      const before = this.image.width / this.image.height;
      const oldW = this.image.width;
      const oldH = this.image.height;
      this.image.setElement(el as HTMLImageElement | HTMLCanvasElement);
      this.image.set({
        scaleX: (this.image.scaleX * oldW) / this.image.width,
        scaleY: (this.image.scaleY * oldH) / this.image.height,
      });
      this.image.setCoords();
      this.appliedOpsKey = key;
      const aspectChanged = Math.abs(before - this.image.width / this.image.height) > 0.002;
      if (aspectChanged && this.fitMode() === 'crop') this.fitToPage();
      else this.applyLayout();
    } finally {
      this.busy.set(false);
    }
  }

  private async pushOp(op: PixelOp, label: string): Promise<void> {
    await this.setOps([...this.opsList, op], label);
    this.pushHistory();
  }

  /** Whole-number upscale that would bring the image to 300 DPI (0 = not useful/possible). */
  upscaleFactor(): number {
    const dpi = this.effectiveDpi();
    if (!dpi || dpi >= TARGET_DPI || this.opsList.some((o) => o.t === 'upscale')) return 0;
    const k = Math.min(maxUpscale(this.image.width, this.image.height), Math.ceil(TARGET_DPI / dpi));
    return k >= 2 ? k : 0;
  }

  async upscale(): Promise<void> {
    const k = this.upscaleFactor();
    if (k) await this.pushOp({ t: 'upscale', k }, `Upscaling ×${k}…`);
  }

  async removeBackground(): Promise<void> {
    await this.pushOp({ t: 'bg', tol: this.bgTol(), color: this.bgColor() }, 'Removing background…');
  }

  async clearPixelEdits(): Promise<void> {
    if (!this.opsList.length) return;
    await this.setOps([], 'Restoring…');
    this.pushHistory();
  }

  /** Click-to-retouch: converts a page click into image-relative coordinates. */
  private async retouchAt(scene: Point, kind: 'spot' | 'redeye'): Promise<void> {
    const inv = util.invertTransform(this.image.calcTransformMatrix());
    const local = util.transformPoint(scene, inv);
    const nx = (local.x + this.image.width / 2) / this.image.width;
    const ny = (local.y + this.image.height / 2) / this.image.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    const radiusPx = (this.spotMm() * this.pxPerMm()) / Math.max(this.image.scaleX, this.image.scaleY);
    await this.pushOp({ t: kind, x: nx, y: ny, r: radiusPx / this.image.width }, kind === 'spot' ? 'Fixing spot…' : 'Fixing red-eye…');
  }

  // ---- Perspective / document scan correction ----

  private get perspectiveHandles(): Circle[] {
    return this.perspectiveObjects.filter((o) => o instanceof Circle) as Circle[];
  }

  startPerspective(): void {
    if (this.perspectiveActive()) return;
    this.setTool('perspective');
    this.perspectiveActive.set(true);
    const w = this.image.width;
    const h = this.image.height;
    const inset = 0.08;
    const local = [
      [-w / 2 + w * inset, -h / 2 + h * inset],
      [w / 2 - w * inset, -h / 2 + h * inset],
      [w / 2 - w * inset, h / 2 - h * inset],
      [-w / 2 + w * inset, h / 2 - h * inset],
    ];
    const m = this.image.calcTransformMatrix();
    const pts = local.map(([x, y]) => util.transformPoint(new Point(x, y), m));
    const lines = pts.map(
      (_, i) =>
        new Line([pts[i].x, pts[i].y, pts[(i + 1) % 4].x, pts[(i + 1) % 4].y], {
          stroke: 'var(--tx-4f46e5)',
          strokeWidth: 2,
          strokeDashArray: [6, 4],
          selectable: false,
          evented: false,
          excludeFromExport: true,
        }),
    );
    const handles = pts.map(
      (p) =>
        new Circle({
          left: p.x,
          top: p.y,
          originX: 'center',
          originY: 'center',
          radius: 11,
          fill: 'var(--tx-4f46e5)',
          stroke: '#ffffff',
          strokeWidth: 3,
          hasControls: false,
          hasBorders: false,
          excludeFromExport: true,
        }),
    );
    this.perspectiveObjects = [...lines, ...handles];
    for (const o of this.perspectiveObjects) this.canvas.add(o);
    this.canvas.requestRenderAll();
  }

  private updatePerspectiveLines(): void {
    const hs = this.perspectiveHandles;
    const lines = this.perspectiveObjects.filter((o) => o instanceof Line) as Line[];
    lines.forEach((ln, i) => {
      ln.set({ x1: hs[i].left, y1: hs[i].top, x2: hs[(i + 1) % 4].left, y2: hs[(i + 1) % 4].top });
      ln.setCoords();
    });
    this.canvas.requestRenderAll();
  }

  cancelPerspective(): void {
    for (const o of this.perspectiveObjects) this.canvas.remove(o);
    this.perspectiveObjects = [];
    this.perspectiveActive.set(false);
    if (this.tool() === 'perspective') this.setTool('select');
    this.canvas.requestRenderAll();
  }

  async applyPerspective(): Promise<void> {
    if (!this.perspectiveActive()) return;
    const inv = util.invertTransform(this.image.calcTransformMatrix());
    const w = this.image.width;
    const h = this.image.height;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const q = this.perspectiveHandles.flatMap((c) => {
      const p = util.transformPoint(new Point(c.left, c.top), inv);
      return [clamp((p.x + w / 2) / w), clamp((p.y + h / 2) / h)];
    });
    this.cancelPerspective();
    // The corrected page comes out upright as seen on screen, so drop any
    // rotation/flip that was applied on top of the source.
    this.rotationSnap.set(0);
    this.fineAngle.set(0);
    this.flipH.set(false);
    this.flipV.set(false);
    this.applyOrientation();
    await this.pushOp({ t: 'persp', q }, 'Straightening page…');
  }

  // ---- History (undo / redo / reset all) ----

  private registerSrc(src: string): string {
    let id = this.srcIds.get(src);
    if (!id) {
      id = 's' + this.srcIds.size;
      this.srcIds.set(src, id);
      this.srcRegistry.set(id, src);
    }
    return id;
  }

  /** Fabric JSON with big image data URLs swapped for short ids (kept out of every snapshot). */
  private annotationJson(o: FabricObject): Record<string, unknown> {
    const j = o.toObject(['data']) as Record<string, unknown>;
    if (typeof j['src'] === 'string') j['src'] = 'ref:' + this.registerSrc(j['src'] as string);
    return j;
  }

  private resolveJson(j: Record<string, unknown>): Record<string, unknown> {
    const out = { ...j };
    const src = out['src'];
    if (typeof src === 'string' && src.startsWith('ref:')) out['src'] = this.srcRegistry.get(src.slice(4)) ?? src;
    return out;
  }

  /** Snapshot with real image sources, safe to persist beyond this session. */
  private portableSnapshot(): EditorSnapshot {
    const s = this.snapshot();
    return { ...s, annotations: s.annotations.map((a) => this.resolveJson(a)) };
  }

  private snapshot(): EditorSnapshot {
    return {
      paperSize: this.paperSize(),
      showBleed: this.showBleed(),
      fitMode: this.fitMode(),
      marginMm: this.marginMm(),
      borderMm: this.borderMm(),
      borderColor: this.borderColor(),
      customWmm: this.customWmm,
      customHmm: this.customHmm,
      brightness: this.brightness(),
      contrast: this.contrast(),
      saturation: this.saturation(),
      effect: this.effect(),
      rotationSnap: this.rotationSnap(),
      fineAngle: this.fineAngle(),
      flipH: this.flipH(),
      flipV: this.flipV(),
      image: { left: this.image.left, top: this.image.top, scaleX: this.image.scaleX, scaleY: this.image.scaleY },
      crop: {
        left: this.cropRect.left,
        top: this.cropRect.top,
        width: this.cropW,
        height: this.cropH,
      },
      ops: [...this.opsList],
      annotations: this.annotationObjects().map((o) => this.annotationJson(o)),
    };
  }

  private pushHistory(): void {
    if (this.restoring || !this.image || !this.cropRect) return;
    const snap = this.snapshot();
    if (this.historyPos >= 0 && JSON.stringify(this.history[this.historyPos]) === JSON.stringify(snap)) return;
    this.history = this.history.slice(0, this.historyPos + 1);
    this.history.push(snap);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.historyPos = this.history.length - 1;
    this.updateHistoryFlags();
  }

  private updateHistoryFlags(): void {
    this.canUndo.set(this.historyPos > 0);
    this.canRedo.set(this.historyPos < this.history.length - 1);
  }

  async undo(): Promise<void> {
    if (this.historyPos <= 0) return;
    this.historyPos--;
    this.updateHistoryFlags();
    await this.restore(this.history[this.historyPos]);
  }

  async redo(): Promise<void> {
    if (this.historyPos >= this.history.length - 1) return;
    this.historyPos++;
    this.updateHistoryFlags();
    await this.restore(this.history[this.historyPos]);
  }

  async resetAll(): Promise<void> {
    if (!this.initialSnapshot) return;
    await this.restore(this.initialSnapshot);
    this.pushHistory();
  }

  async restore(s: EditorSnapshot): Promise<void> {
    const token = ++this.restoreToken;
    this.restoring = true;
    try {
      if (this.perspectiveActive()) this.cancelPerspective();
      const paperChanged = s.paperSize !== this.paperSize();
      this.paperSize.set(s.paperSize);
      this.showBleed.set(s.showBleed);
      this.fitMode.set(s.fitMode);
      this.marginMm.set(s.marginMm);
      this.borderMm.set(s.borderMm);
      this.borderColor.set(s.borderColor);
      this.customWmm = s.customWmm;
      this.customHmm = s.customHmm;
      this.brightness.set(s.brightness);
      this.contrast.set(s.contrast);
      this.saturation.set(s.saturation);
      this.effect.set(s.effect);
      this.rotationSnap.set(s.rotationSnap);
      this.fineAngle.set(s.fineAngle);
      this.flipH.set(s.flipH);
      this.flipV.set(s.flipV);

      await this.setOps(s.ops ?? [], 'Restoring…');
      if (token !== this.restoreToken) return;

      if (paperChanged) this.drawPaperGuide();
      this.applyOrientation();
      this.applyLiveFilters();
      this.applyLayout();
      if (s.fitMode === 'crop') {
        // Crop mode has free geometry: put the image and box back exactly.
        this.image.set({ left: s.image.left, top: s.image.top, scaleX: s.image.scaleX, scaleY: s.image.scaleY });
        this.image.setCoords();
        this.cropRect.set({ left: s.crop.left, top: s.crop.top, width: s.crop.width, height: s.crop.height, scaleX: 1, scaleY: 1 });
        this.cropRect.setCoords();
        this.refreshOverlays();
      }
      await this.restoreAnnotations(s.annotations ?? [], token);
    } finally {
      if (token === this.restoreToken) this.restoring = false;
    }
  }

  private async restoreAnnotations(json: Record<string, unknown>[], token: number): Promise<void> {
    const current = this.annotationObjects().map((o) => this.annotationJson(o));
    if (JSON.stringify(current) === JSON.stringify(json)) return;
    const objs = json.length ? ((await util.enlivenObjects(json.map((j) => this.resolveJson(j)))) as FabricObject[]) : [];
    if (token !== this.restoreToken) return;
    for (const o of this.annotationObjects()) this.canvas.remove(o);
    for (const o of objs) this.canvas.add(o);
    this.arrangeLayers();
    this.syncSelection();
    this.canvas.requestRenderAll();
  }

  // ---- Touch / trackpad gestures ----

  /** Two-finger pinch zooms and pans the stage (touch screens). */
  private setupGestures(): void {
    const el = this.stageRef.nativeElement;
    el.style.touchAction = 'none';
    const metrics = () => {
      const [a, b] = [...this.pointers.values()];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    };
    el.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType !== 'touch') return;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size === 2) {
          this.isPanning = false;
          this.pinch = metrics();
        }
      },
      true,
    );
    el.addEventListener(
      'pointermove',
      (e) => {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size !== 2 || !this.pinch) return;
        const m = metrics();
        const rect = el.getBoundingClientRect();
        const vpt = this.canvas.viewportTransform;
        vpt[4] += m.cx - this.pinch.cx;
        vpt[5] += m.cy - this.pinch.cy;
        this.zoomTo((this.canvas.getZoom() * m.dist) / this.pinch.dist, new Point(m.cx - rect.left, m.cy - rect.top));
        this.pinch = m;
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = undefined;
    };
    el.addEventListener('pointerup', end, true);
    el.addEventListener('pointercancel', end, true);
  }

  // ---- Presets ----

  applyPreset(p: EditorPreset): void {
    this.brightness.set(p.adjust.brightness);
    this.contrast.set(p.adjust.contrast);
    this.saturation.set(p.adjust.saturation);
    this.effect.set(p.adjust.effect);
    this.marginMm.set(Math.min(p.layout.marginMm, this.marginMax()));
    this.borderMm.set(p.layout.borderMm);
    this.borderColor.set(p.layout.borderColor);
    this.applyLiveFilters();
    this.changeFitMode(p.layout.fitMode);
    this.pushHistory();
  }

  saveCurrentAsPreset(): void {
    const name = this.presetName.trim();
    if (!name) return;
    const preset: EditorPreset = {
      id: 'user-' + Date.now(),
      name,
      adjust: { brightness: this.brightness(), contrast: this.contrast(), saturation: this.saturation(), effect: this.effect() },
      layout: { fitMode: this.fitMode(), marginMm: this.marginMm(), borderMm: this.borderMm(), borderColor: this.borderColor() },
    };
    const user = [...this.presets().filter((p) => !p.builtin), preset];
    savePresets(user);
    this.presets.set([...BUILTIN_PRESETS, ...user]);
    this.presetName = '';
  }

  deletePreset(id: string): void {
    const user = this.presets().filter((p) => !p.builtin && p.id !== id);
    savePresets(user);
    this.presets.set([...BUILTIN_PRESETS, ...user]);
  }

  // ---- Saved versions ----

  refreshVersions(): void {
    this.versions.set(this.historyKey ? loadVersions(this.historyKey) : []);
  }

  async restoreVersion(v: EditorVersion): Promise<void> {
    await this.restore(v.state as EditorSnapshot);
    this.pushHistory();
  }

  private versionLabel(): string {
    const parts: string[] = [FIT_MODES.find((m) => m.key === this.fitMode())?.label ?? 'Crop', this.paperLabel()];
    if (this.annotationObjects().length) parts.push(`${this.annotationObjects().length} annotation(s)`);
    if (this.opsList.length) parts.push(`${this.opsList.length} retouch`);
    return parts.join(' · ');
  }

  // ---- Apply to all documents ----

  emitApplyAll(): void {
    this.applyAll.emit({
      paperSize: this.paperSize(),
      fitMode: this.fitMode(),
      marginMm: this.marginMm(),
      borderMm: this.borderMm(),
      borderColor: this.borderColor(),
      customWmm: this.customWmm,
      customHmm: this.customHmm,
      brightness: this.brightness(),
      contrast: this.contrast(),
      saturation: this.saturation(),
      effect: this.effect(),
      flipH: this.flipH(),
      flipV: this.flipV(),
      format: this.exportFormat(),
      quality: this.exportQuality(),
    });
  }

  // ---- Keyboard: nudge, delete, zoom ----

  private nudge(dx: number, dy: number): void {
    const o = this.canvas.getActiveObject();
    if (o && this.isAnn(o)) {
      o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
      o.setCoords();
      this.canvas.requestRenderAll();
      this.historyChange$.next();
    } else if (this.fitMode() === 'crop' && this.cropRect.evented) {
      this.cropRect.set({ left: this.cropRect.left + dx, top: this.cropRect.top + dy });
      this.cropRect.setCoords();
      this.refreshOverlays();
      this.historyChange$.next();
    }
  }

  // ---- Export ----

  async applyAndSave(): Promise<void> {
    this.exporting.set(true);
    try {
      const size = this.paper;
      const cropWorldWidth = this.cropW;
      const cropWorldHeight = this.cropH;

      let multiplier = (TARGET_DPI * (size.width / MM_PER_INCH)) / cropWorldWidth;
      const outW = cropWorldWidth * multiplier;
      const outH = cropWorldHeight * multiplier;
      const largestSide = Math.max(outW, outH);
      if (largestSide > MAX_EXPORT_PIXELS) {
        multiplier *= MAX_EXPORT_PIXELS / largestSide;
      }

      const finalW = Math.round(cropWorldWidth * multiplier);
      const finalH = Math.round(cropWorldHeight * multiplier);

      const cropLeft = this.cropRect.left - cropWorldWidth / 2;
      const cropTop = this.cropRect.top - cropWorldHeight / 2;

      // White page: margins, fit bars and anything outside the photo must
      // print as paper, not as (JPEG) black.
      const exportCanvas = new StaticCanvas(undefined, { width: finalW, height: finalH, backgroundColor: '#ffffff' });
      exportCanvas.viewportTransform = [multiplier, 0, 0, multiplier, -cropLeft * multiplier, -cropTop * multiplier];

      const clone = await this.image.clone();
      // Real adjustments only — the print-preview CMYK hint never ships and
      // the "Compare" toggle never leaks into the file.
      clone.filters = this.buildFilters();
      clone.applyFilters();
      clone.clipPath = this.fitMode() === 'crop' ? undefined : this.makeContentClip();
      exportCanvas.add(clone);
      const annotationClones = await Promise.all(this.annotationObjects().map((o) => o.clone(['data'])));

      const border = this.borderGeometry();
      if (border) {
        exportCanvas.add(
          new Rect({
            left: border.left,
            top: border.top,
            originX: 'center',
            originY: 'center',
            width: border.width,
            height: border.height,
            fill: 'transparent',
            stroke: border.color,
            strokeWidth: border.strokeWidth,
          }),
        );
      }
      // Annotations sit above the frame, in the same z-order as on screen.
      for (const a of annotationClones) exportCanvas.add(a);
      exportCanvas.renderAll();

      const format = this.exportFormat();
      const quality = this.exportQuality();
      const imageData = exportCanvas.toDataURL({ format, quality: format === 'jpeg' ? quality / 100 : 1, multiplier: 1 });
      const thumb = exportCanvas.toDataURL({ format: 'jpeg', quality: 0.6, multiplier: Math.min(1, 96 / finalW) });
      exportCanvas.dispose();

      if (this.historyKey) {
        addVersion(this.historyKey, {
          id: 'v' + Date.now(),
          savedAt: Date.now(),
          label: this.versionLabel(),
          thumb,
          state: this.portableSnapshot(),
        });
        this.refreshVersions();
      }

      this.save.emit({
        imageData,
        width: finalW,
        height: finalH,
        dpi: TARGET_DPI,
        paperSize: this.paperSize(),
        format,
        quality,
      });
    } finally {
      this.exporting.set(false);
    }
  }
}
