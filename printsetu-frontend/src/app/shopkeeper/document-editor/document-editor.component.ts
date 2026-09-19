import { Component, ElementRef, Injector, OnInit, ViewChild, afterNextRender, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { SliderModule } from 'primeng/slider';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { ColorMode, EditState, PaperSize, PrintJobItemRow, PrintJobRow, SideMode } from '../../core/models/models';
import { ImageCanvasEditorComponent, CanvasEditorSaveResult } from './image-canvas-editor/image-canvas-editor.component';
import { BatchParams, renderImageBatch } from './image-canvas-editor/image-batch-render';
import { clearLatestState, loadLatestState } from './image-canvas-editor/editor-storage';

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
    ImageCanvasEditorComponent,
  ],
  template: `
    <div class="editor-page">
      @if (loading()) {
        <div class="state-box"><p-progressSpinner strokeWidth="4" /></div>
      } @else if (!job()) {
        <div class="state-box">
          <i class="pi pi-inbox state-box__icon"></i>
          <p class="m-0">Print job not found.</p>
          <p-button label="Back to queue" icon="pi pi-arrow-left" severity="secondary" [outlined]="true" size="small" (onClick)="backToQueue()" />
        </div>
      } @else {
        <header class="editor-header">
          <button type="button" class="back-btn" (click)="backToQueue()" pTooltip="Back to queue" tooltipPosition="bottom">
            <i class="pi pi-arrow-left"></i>
          </button>
          <div class="editor-header__title">
            <div class="title-row">
              <h1 class="editor-title">Token #{{ job()!.tokenNumber }}</h1>
              <span class="pill">{{ job()!.items.length }} {{ job()!.items.length === 1 ? 'document' : 'documents' }}</span>
            </div>
            <p class="editor-subtitle" [title]="selectedItem()?.document?.originalName">
              {{ selectedItem()?.document?.originalName }}
            </p>
          </div>
          <div class="header-actions">
            @if (hasEdits()) {
              <p-button label="Revert to original" icon="pi pi-undo" severity="secondary" [outlined]="true" size="small" (onClick)="resetEdits()" [disabled]="savingEdit()" />
            }
            <div class="pager">
              <button type="button" class="pager__btn" [disabled]="selectedIndex() === 0" (click)="prev()" aria-label="Previous document">
                <i class="pi pi-chevron-left"></i>
              </button>
              <span class="pager__label">{{ selectedIndex() + 1 }} / {{ job()!.items.length }}</span>
              <button type="button" class="pager__btn" [disabled]="selectedIndex() >= job()!.items.length - 1" (click)="next()" aria-label="Next document">
                <i class="pi pi-chevron-right"></i>
              </button>
            </div>
          </div>
        </header>

        <div class="editor-body">
          <!-- Left rail: document list + reorder + delete -->
          <aside class="docs" [class.docs--single]="job()!.items.length === 1">
            <h3 class="section-heading">Documents</h3>
            <ul class="doc-list">
              @for (item of job()!.items; track item.id; let i = $index) {
                <li class="doc-card" [class.is-active]="i === selectedIndex()" (click)="selectIndex(i)">
                  <span class="doc-card__icon" [class.is-pdf]="item.document?.mimeType === 'application/pdf'">
                    <i class="pi" [ngClass]="item.document?.mimeType === 'application/pdf' ? 'pi-file-pdf' : 'pi-image'"></i>
                  </span>
                  <div class="doc-card__text">
                    <span class="doc-card__name" [title]="item.document?.originalName">{{ item.document?.originalName }}</span>
                    <span class="doc-card__meta">
                      {{ item.paperSize }} &middot; {{ item.colorMode === 'COLOR' ? 'Color' : 'B/W' }} &middot; &times;{{ item.copies }} &middot; {{ job()!.currency }} {{ item.amount }}
                      @if (item.renderedS3Key) {
                        <span class="edited-tag"><i class="pi pi-pencil"></i> Edited</span>
                      }
                    </span>
                  </div>
                  <div class="doc-card__actions" (click)="$event.stopPropagation()">
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

          <!-- Center: workspace -->
          <main class="workspace">
            @if (previewLoading()) {
              <div class="stage stage--center"><p-progressSpinner strokeWidth="4" /></div>
            } @else if (!previewUrl()) {
              <div class="stage stage--center state-box">
                <i class="pi pi-eye-slash state-box__icon"></i>
                <p class="m-0">Preview unavailable for this document.</p>
              </div>
            } @else if (!isPdf()) {
              <!-- Images: full free-form canvas editor (pan/zoom, paper guide,
                   aspect-locked crop, brightness/contrast/saturation, rotate/
                   straighten, DPI warning, print preview). Exports one final
                   rendered file directly — see onCanvasEditorSave(). -->
              <app-image-canvas-editor
                class="workspace__fill"
                [imageUrl]="previewUrl()!"
                [saving]="savingEdit()"
                [historyKey]="selectedItem()!.id"
                [initialState]="editorState()"
                [baseIsOriginal]="editorBaseIsOriginal()"
                [otherImageCount]="otherImageCount()"
                [batchBusy]="batchBusy()"
                (applyAll)="onApplyAll($event)"
                (save)="onCanvasEditorSave($event)"
                (cancelled)="loadPreview()"
              />
            } @else {
              <div class="pdf-editor">
                <div class="pdf-editor__main">
                  <div class="toolbar">
                    <div class="segmented">
                      <button type="button" [class.is-on]="!finalPreview()" (click)="setFinalPreview(false)">
                        <i class="pi pi-pencil"></i> Edit
                      </button>
                      <button type="button" [class.is-on]="finalPreview()" (click)="setFinalPreview(true)">
                        <i class="pi pi-eye"></i> Final preview
                      </button>
                    </div>
                    <span class="flex-spacer"></span>
                    @if (!finalPreview()) {
                      <div class="zoom-controls">
                        <button type="button" class="icon-btn icon-btn--lg" (click)="zoomOut()" title="Zoom out"><i class="pi pi-search-minus"></i></button>
                        <button type="button" class="zoom-controls__value" (click)="resetZoom()" title="Reset zoom">{{ (zoom() * 100).toFixed(0) }}%</button>
                        <button type="button" class="icon-btn icon-btn--lg" (click)="zoomIn()" title="Zoom in"><i class="pi pi-search-plus"></i></button>
                      </div>
                    }
                  </div>

                  @if (finalPreview()) {
                    <div class="stage stage--center">
                      <div class="paper-frame" [style.--ar]="paperAspectRatio()">
                        <canvas #finalCanvas class="paper-frame__img"></canvas>
                      </div>
                    </div>
                  } @else {
                    <div
                      #previewContainer
                      class="stage stage--center"
                      [class.is-cropping]="cropMode()"
                      (mousedown)="onCropStart($event)"
                      (mousemove)="onCropMove($event)"
                      (mouseup)="onCropEnd()"
                      (mouseleave)="onCropEnd()"
                    >
                      <div #previewZoomed class="preview__zoomed" [style.transform]="'scale(' + zoom() + ')'">
                        <canvas #pdfCanvas></canvas>
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
                    </div>
                  }
                </div>

                <aside class="inspector">
                  <section class="panel">
                    <h4 class="panel__title"><i class="pi pi-sliders-h"></i> Edit</h4>
                    <div class="btn-grid">
                      <p-button icon="pi pi-refresh" label="Rotate 90°" severity="secondary" [outlined]="true" size="small" styleClass="w-full" (onClick)="rotate(90)" [disabled]="savingEdit()" />
                      <p-button
                        [label]="cropMode() ? 'Cancel crop' : 'Crop'"
                        icon="pi pi-crop"
                        [severity]="cropMode() ? 'danger' : 'secondary'"
                        [outlined]="true"
                        size="small"
                        styleClass="w-full"
                        (onClick)="toggleCropMode()"
                        [disabled]="savingEdit() || finalPreview()"
                      />
                    </div>
                    @if (cropMode()) {
                      <p class="hint"><i class="pi pi-info-circle"></i> Drag on the page to draw the area to keep.</p>
                    }
                    @if (cropMode() && cropDraft()) {
                      <p-button label="Apply crop" icon="pi pi-check" size="small" styleClass="w-full" (onClick)="applyCrop()" [loading]="savingEdit()" />
                    }
                    @if (selectedItem()?.editState?.crop) {
                      <p-button label="Clear crop" icon="pi pi-times" [text]="true" size="small" severity="secondary" styleClass="w-full" (onClick)="clearCrop()" [disabled]="savingEdit()" />
                    }
                  </section>
                </aside>
              </div>
            }
          </main>
        </div>

        <footer class="print-bar" [class.settings-open]="settingsOpen()">
          <button type="button" class="settings-toggle" (click)="settingsOpen.set(!settingsOpen())" [attr.aria-expanded]="settingsOpen()">
            <i class="pi pi-sliders-h"></i> <span class="settings-toggle__text">Print options</span>
            <i class="pi" [ngClass]="settingsOpen() ? 'pi-chevron-down' : 'pi-chevron-up'"></i>
          </button>
          <div class="print-bar__settings">
            @if (selectedItem()) {
              <div class="field">
                <label>Paper size</label>
                <p-select [options]="paperSizes" [(ngModel)]="settingsDraft.paperSize" (onChange)="commitSettings()" size="small" appendTo="body" styleClass="field__control" />
              </div>
              <div class="field">
                <label>Color</label>
                <p-select [options]="colorModeOptions" optionLabel="label" optionValue="value" [(ngModel)]="settingsDraft.colorMode" (onChange)="commitSettings()" size="small" appendTo="body" styleClass="field__control" />
              </div>
              <div class="field">
                <label>Sides</label>
                <p-select [options]="sideModeOptions" optionLabel="label" optionValue="value" [(ngModel)]="settingsDraft.sideMode" (onChange)="commitSettings()" size="small" appendTo="body" styleClass="field__control" />
              </div>
              <div class="field field--copies">
                <label>Copies</label>
                <p-inputNumber [(ngModel)]="settingsDraft.copies" [min]="1" [max]="999" [showButtons]="true" buttonLayout="horizontal" incrementButtonIcon="pi pi-plus" decrementButtonIcon="pi pi-minus" size="small" (onInput)="commitSettings()" />
              </div>
            }
          </div>
          <div class="print-bar__total">
            <div class="total">
              <span>Job total</span>
              <strong>{{ job()!.currency }} {{ job()!.amount }}</strong>
            </div>
            <p-button label="Confirm &amp; Print" icon="pi pi-print" [loading]="printing()" (onClick)="confirmAndPrint()" />
          </div>
        </footer>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        --ink: var(--tx-0f172a);
        --muted: var(--tx-64748b);
        --line: var(--bd-e2e8f0);
        --surface: var(--bg-ffffff);
        --soft: var(--bg-f8fafc);
      }
      .editor-page {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        height: 100%;
        min-height: 0;
      }
      .state-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 3rem 1rem;
        color: var(--muted);
      }
      .state-box__icon {
        font-size: 2rem;
        color: var(--tx-94a3b8);
      }

      /* ---------- Header ---------- */
      .editor-header {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        flex: 0 0 auto;
      }
      .back-btn {
        width: 2.5rem;
        height: 2.5rem;
        flex: 0 0 auto;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: var(--surface);
        color: var(--tx-475569);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      }
      .back-btn:hover {
        border-color: var(--p-primary-300);
        color: var(--accent-text-600);
        background: var(--p-primary-50);
      }
      .editor-header__title {
        flex: 1 1 auto;
        min-width: 0;
      }
      .title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.25rem 0.625rem;
      }
      .editor-title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--ink);
        white-space: nowrap;
      }
      .pill {
        font-size: 0.6875rem;
        font-weight: 600;
        padding: 0.125rem 0.5rem;
        border-radius: 999px;
        background: var(--p-primary-50);
        color: var(--accent-text-700);
      }
      .editor-subtitle {
        margin: 0.125rem 0 0 0;
        font-size: 0.8125rem;
        color: var(--muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex: 0 0 auto;
      }
      .pager {
        display: inline-flex;
        align-items: center;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 0.125rem;
      }
      .pager__btn {
        width: 2rem;
        height: 2rem;
        border: none;
        background: none;
        border-radius: 8px;
        color: var(--tx-475569);
        cursor: pointer;
      }
      .pager__btn:hover:not(:disabled) {
        background: var(--soft);
        color: var(--accent-text-600);
      }
      .pager__btn:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .pager__label {
        min-width: 3.25rem;
        text-align: center;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-334155);
        font-variant-numeric: tabular-nums;
      }

      /* ---------- Body ---------- */
      .editor-body {
        flex: 1 1 auto;
        display: grid;
        grid-template-columns: 220px minmax(0, 1fr);
        gap: 1rem;
        min-height: 0;
      }
      .settings-toggle {
        display: none;
      }

      /* ---------- Tablet & phone: one screen, no page scrolling ----------
         The editor fits the viewport: the preview takes all the height that
         is left and the controls live in a panel/sheet next to or below it
         (see the image editor), so changes are always visible as you make
         them. The document list becomes a strip, and the print options fold
         into a popover so the bottom bar stays a single slim row. */
      @media (max-width: 1180px) {
        .editor-page {
          gap: 0.5rem;
        }
        .editor-title {
          font-size: 1.05rem;
        }
        .editor-body {
          grid-template-columns: 1fr;
          grid-template-rows: auto minmax(0, 1fr);
          gap: 0.5rem;
        }
        .docs {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.375rem;
          border-radius: 12px;
          overflow-x: auto;
          overflow-y: hidden;
        }
        .docs .section-heading {
          display: none;
        }
        .docs--single {
          display: none;
        }
        .doc-list {
          flex-direction: row;
          flex: 1 1 auto;
        }
        .doc-card {
          flex: 0 0 auto;
          min-width: 12.5rem;
        }
        /* No hover on touch: the active card shows its move/remove buttons. */
        .doc-card.is-active .doc-card__actions {
          display: inline-flex;
          position: static;
          transform: none;
          box-shadow: none;
          border: none;
          background: transparent;
        }
        /* Always the flexible row, even when the document strip is hidden. */
        .editor-page .workspace {
          grid-row: 2;
          min-height: 0;
        }
        .workspace__fill {
          min-height: 0;
        }
        .workspace__fill {
          flex: 1 1 auto;
          height: 100%;
        }
        .editor-page .pdf-editor {
          grid-template-columns: 1fr;
          grid-template-rows: minmax(0, 1fr) auto;
          gap: 0.5rem;
        }
        .pdf-editor .stage {
          min-height: 8rem;
        }
        .editor-page .inspector {
          overflow: visible;
        }

        .editor-page .print-bar {
          position: relative;
          flex-wrap: nowrap;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          border-radius: 12px;
        }
        .editor-page .settings-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          height: 2.5rem;
          padding: 0 0.75rem;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: var(--surface);
          color: var(--tx-334155);
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .settings-toggle .pi-chevron-up,
        .settings-toggle .pi-chevron-down {
          font-size: 0.65rem;
          color: var(--muted);
        }
        .editor-page .print-bar__settings {
          display: none;
          position: absolute;
          z-index: 30;
          left: 0;
          right: 0;
          bottom: calc(100% + 0.5rem);
          padding: 0.75rem;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 14px;
          box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.16);
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .editor-page .print-bar.settings-open .print-bar__settings {
          display: grid;
        }
        .editor-page .print-bar__settings .field :is(p-select, p-inputnumber) {
          width: 100%;
        }
        .editor-page .print-bar__total {
          margin-left: auto;
          gap: 0.75rem;
        }
        .editor-page .total {
          flex-direction: row;
          align-items: baseline;
          gap: 0.375rem;
        }
        .editor-page .total strong {
          font-size: 1rem;
          white-space: nowrap;
        }
        .editor-page .print-bar__total {
          flex-wrap: nowrap;
        }
        .editor-page .print-bar__total ::ng-deep .p-button {
          white-space: nowrap;
        }
      }
      @media (max-width: 480px) {
        .editor-subtitle,
        .pill,
        .header-actions ::ng-deep .p-button-label,
        .editor-page .total span {
          display: none;
        }
        .editor-page .settings-toggle {
          padding: 0 0.625rem;
        }
        .settings-toggle__text {
          display: none;
        }
      }

      /* Short screens (a phone held sideways): every pixel of height goes to the
         preview, so the header and print bar shrink to slim rows. */
      @media (max-height: 520px) {
        .editor-subtitle,
        .pill {
          display: none;
        }
        .editor-title {
          font-size: 0.95rem;
        }
        .back-btn {
          width: 2rem;
          height: 2rem;
        }
        .pager {
          transform: scale(0.9);
          transform-origin: right center;
        }
        .editor-page .print-bar {
          padding: 0.25rem 0.5rem;
        }
        .editor-page .settings-toggle {
          height: 2rem;
        }
      }

      .section-heading {
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
        margin: 0 0 0.625rem 0.25rem;
      }

      /* ---------- Documents rail ---------- */
      .docs {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 0.875rem 0.625rem;
        overflow-y: auto;
        min-height: 0;
      }
      .doc-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }
      .doc-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.5rem 0.5rem;
        border-radius: 10px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease;
      }
      .doc-card:hover {
        background: var(--soft);
      }
      .doc-card.is-active {
        border-color: var(--p-primary-200);
        background: var(--p-primary-50);
      }
      .doc-card__icon {
        flex: 0 0 auto;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-e0e7ff);
        color: var(--tx-4f46e5);
        font-size: 1rem;
      }
      .doc-card__icon.is-pdf {
        background: var(--bg-fee2e2);
        color: var(--tx-dc2626);
      }
      .doc-card__text {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .doc-card__name {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .doc-card__meta {
        font-size: 0.6875rem;
        color: var(--muted);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.25rem;
      }
      .edited-tag {
        color: var(--accent-text-600);
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
      }
      .edited-tag i {
        font-size: 0.6rem;
      }
      .doc-card__actions {
        position: absolute;
        right: 0.375rem;
        top: 50%;
        transform: translateY(-50%);
        display: none;
        gap: 0.125rem;
        padding: 0.125rem;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
      }
      .doc-card:hover .doc-card__actions,
      .doc-card.is-active:focus-within .doc-card__actions {
        display: inline-flex;
      }
      .icon-btn {
        border: none;
        background: none;
        color: var(--tx-64748b);
        cursor: pointer;
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 6px;
        font-size: 0.7rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .icon-btn--lg {
        width: 2rem;
        height: 2rem;
        font-size: 0.8125rem;
      }
      .icon-btn:hover:not(:disabled) {
        background: var(--bg-eef2ff);
        color: var(--accent-text-600);
      }
      .icon-btn:disabled {
        opacity: 0.3;
        cursor: default;
      }
      .icon-btn--danger:hover:not(:disabled) {
        background: var(--bg-fee2e2);
        color: var(--tx-dc2626);
      }

      /* ---------- Workspace ---------- */
      .workspace {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }
      .workspace__fill {
        flex: 1 1 auto;
        min-height: 0;
        display: block;
      }
      .pdf-editor {
        flex: 1 1 auto;
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 232px;
        gap: 1rem;
      }
      @media (max-width: 1180px) {
        .pdf-editor {
          grid-template-columns: 1fr;
        }
      }
      .pdf-editor__main {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
        min-width: 0;
        min-height: 0;
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex: 0 0 auto;
      }
      .flex-spacer {
        flex: 1 1 auto;
      }
      .segmented {
        display: inline-flex;
        background: var(--bg-eef1f6);
        border-radius: 10px;
        padding: 0.1875rem;
      }
      .segmented button {
        border: none;
        background: none;
        padding: 0.375rem 0.875rem;
        border-radius: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--muted);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .segmented button.is-on {
        background: var(--surface);
        color: var(--ink);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
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
        color: var(--tx-334155);
        cursor: pointer;
        font-variant-numeric: tabular-nums;
      }

      .stage {
        flex: 1 1 auto;
        position: relative;
        min-height: 320px;
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: 14px;
        background-color: var(--bg-eef1f6);
        background-image: radial-gradient(var(--dot-grid) 1px, transparent 1px);
        background-size: 18px 18px;
        container-type: size;
        user-select: none;
      }
      .stage--center {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .stage.is-cropping {
        cursor: crosshair;
      }
      .preview__zoomed {
        position: relative;
        transform-origin: center center;
        box-shadow: 0 6px 24px rgba(15, 23, 42, 0.18);
        background: var(--bg-ffffff);
        line-height: 0;
      }
      .preview__zoomed canvas {
        display: block;
        max-width: calc(100cqw - 2rem);
        max-height: calc(100cqh - 2rem);
      }
      .crop-rect {
        position: absolute;
        border: 2px dashed var(--p-primary-500);
        background: rgba(99, 102, 241, 0.18);
        pointer-events: none;
      }
      .paper-frame {
        aspect-ratio: var(--ar, 0.707);
        width: min(calc(100cqw - 2rem), calc((100cqh - 2rem) * var(--ar, 0.707)));
        background: var(--bg-ffffff);
        box-shadow: 0 6px 24px rgba(15, 23, 42, 0.18);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .paper-frame__img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      /* ---------- Inspector (PDF tools) ---------- */
      .inspector {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-height: 0;
        overflow-y: auto;
      }
      .panel {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 0.875rem;
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
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
      .btn-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.5rem;
      }
      .hint {
        margin: 0;
        font-size: 0.75rem;
        color: var(--muted);
        line-height: 1.4;
        display: flex;
        gap: 0.375rem;
      }

      /* ---------- Bottom print bar ---------- */
      .print-bar {
        flex: 0 0 auto;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.75rem 1.5rem;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 0.75rem 1rem;
        box-shadow: 0 -2px 12px rgba(15, 23, 42, 0.04);
      }
      .print-bar__settings {
        display: flex;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: 0.75rem 1rem;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .field label {
        font-size: 0.6875rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
      }
      .field :is(p-select, p-inputnumber) {
        width: 9.5rem;
      }
      .field--copies :is(p-inputnumber) {
        width: 9rem;
      }
      .field--copies ::ng-deep .p-inputnumber-input {
        width: 100%;
        text-align: center;
      }
      .total {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        font-size: 0.6875rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
        font-weight: 600;
      }
      .total strong {
        font-size: 0.9375rem;
        letter-spacing: 0;
        text-transform: none;
        color: var(--ink);
      }
      .print-bar__total {
        display: flex;
        align-items: center;
        gap: 1.25rem;
        margin-left: auto;
      }
      .total strong {
        font-size: 1.25rem;
      }
    `,
  ],
})
export class DocumentEditorComponent implements OnInit {
  @ViewChild('previewContainer') previewContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('previewZoomed') previewZoomed?: ElementRef<HTMLDivElement>;
  @ViewChild('pdfCanvas') pdfCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('finalCanvas') finalCanvas?: ElementRef<HTMLCanvasElement>;

  // Cached first page of the current PDF so toggling Edit <-> Final preview
  // can repaint without re-fetching/re-parsing the document.
  private pdfPage: import('pdfjs-dist').PDFPageProxy | null = null;

  job = signal<PrintJobRow | null>(null);
  loading = signal(true);
  jobId!: string;

  selectedIndex = signal(0);
  selectedItem = computed<PrintJobItemRow | null>(() => this.job()?.items[this.selectedIndex()] ?? null);
  isPdf = computed(() => this.selectedItem()?.document?.mimeType === 'application/pdf');

  previewUrl = signal<string | null>(null);
  /** Saved editor state to reopen an already-edited image with (loaded from the original upload). */
  editorState = signal<unknown | null>(null);
  editorBaseIsOriginal = signal(true);
  batchBusy = signal(false);
  /** Compact screens: the print options open as a popover above the bar. */
  settingsOpen = signal(false);
  otherImageCount = computed(() => {
    const cur = this.selectedItem();
    return (this.job()?.items ?? []).filter((i) => i.id !== cur?.id && i.document?.mimeType !== 'application/pdf').length;
  });
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
  colorModeOptions: { label: string; value: ColorMode }[] = [
    { label: 'Black & white', value: 'BW' },
    { label: 'Color', value: 'COLOR' },
  ];
  sideModeOptions: { label: string; value: SideMode }[] = [
    { label: 'Single-sided', value: 'SIMPLEX' },
    { label: 'Double-sided', value: 'DUPLEX' },
  ];
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

  loadPreview(): void {
    const item = this.selectedItem();
    if (!item) return;
    this.previewLoading.set(true);
    this.previewUrl.set(null);
    this.pdfPage = null;
    // An already-edited image reopens from the untouched upload plus its saved
    // editor state, so edits stay adjustable instead of compounding on the
    // flattened render. Without saved state (edited in another browser) the
    // render itself is the starting point.
    const saved = !this.isPdf() && item.renderedS3Key ? loadLatestState(item.id) : null;
    this.editorState.set(saved);
    this.editorBaseIsOriginal.set(!item.renderedS3Key || !!saved);
    this.shopkeeperService.itemPreviewUrl(this.jobId, item.id, !!saved).subscribe({
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
    this.pdfPage = await pdf.getPage(1);
    await this.paintPdf();
  }

  /** Paints the cached PDF page into whichever preview canvas is on screen. */
  private async paintPdf(): Promise<void> {
    const canvas = (this.finalPreview() ? this.finalCanvas : this.pdfCanvas)?.nativeElement;
    if (!canvas || !this.pdfPage) return;
    const viewport = this.pdfPage.getViewport({ scale: 1.5 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const canvasContext = canvas.getContext('2d')!;
    await this.pdfPage.render({ canvasContext, viewport }).promise;
  }

  setFinalPreview(on: boolean): void {
    if (this.finalPreview() === on) return;
    this.finalPreview.set(on);
    this.cropMode.set(false);
    this.cropDraft.set(null);
    // The target <canvas> is created by the @if branch that just flipped.
    afterNextRender(() => this.paintPdf(), { injector: this.injector });
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
    const current = this.editDraft.rotation ?? 0;
    const next = (((current + delta) % 360) + 360) % 360;
    this.editDraft = { ...this.editDraft, rotation: next as EditState['rotation'] };
    this.commitEdit();
  }

  toggleCropMode(): void {
    this.cropMode.set(!this.cropMode());
    this.cropDraft.set(null);
  }

  // Crop fractions must be measured against the rendered image/canvas
  // itself (#previewZoomed), not the outer #previewContainer frame — the
  // frame centers and can be larger than the image (letterboxing), so
  // fractions taken from it don't line up with what the backend crops
  // out of the actual image pixels.
  onCropStart(event: MouseEvent): void {
    if (!this.cropMode() || this.finalPreview() || !this.previewZoomed) return;
    const rect = this.previewZoomed.nativeElement.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    this.cropStart = { x, y };
    this.cropDraft.set({ x: this.cropStart.x, y: this.cropStart.y, width: 0, height: 0 });
  }

  onCropMove(event: MouseEvent): void {
    if (!this.cropStart || !this.previewZoomed) return;
    const rect = this.previewZoomed.nativeElement.getBoundingClientRect();
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

  // ---- Image canvas editor (images only — see app-image-canvas-editor) ----

  onCanvasEditorSave(result: CanvasEditorSaveResult): void {
    const item = this.selectedItem();
    if (!item) return;
    const blob = this.dataUrlToBlob(result.imageData);
    this.savingEdit.set(true);
    this.shopkeeperService.uploadRenderedImage(this.jobId, item.id, blob, result.paperSize, result.dpi, result.format, result.quality).subscribe({
      next: (res) => {
        this.savingEdit.set(false);
        this.patchSelectedItem({ editState: res.editState, renderedS3Key: res.renderedS3Key });
        this.loadPreview();
        this.messageService.add({ severity: 'success', summary: 'Edit saved' });
      },
      error: (err) => {
        this.savingEdit.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not save edit',
          detail: err?.error?.message,
        });
      },
    });
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',');
    const mime = /data:(.*?);base64/.exec(header)?.[1] ?? 'image/jpeg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  resetEdits(): void {
    const item = this.selectedItem();
    if (!item) return;
    this.shopkeeperService.resetItemEdit(this.jobId, item.id).subscribe({
      next: () => {
        clearLatestState(item.id);
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

  /** Applies the current document's placement/color settings to every other image in the job. */
  async onApplyAll(params: BatchParams): Promise<void> {
    const job = this.job();
    const current = this.selectedItem();
    if (!job || !current || this.batchBusy()) return;
    const targets = job.items.filter((i) => i.id !== current.id && i.document?.mimeType !== 'application/pdf');
    if (!targets.length) return;
    this.batchBusy.set(true);
    let done = 0;
    let failed = 0;
    for (const item of targets) {
      try {
        const { url } = await firstValueFrom(this.shopkeeperService.itemPreviewUrl(this.jobId, item.id, true));
        const rendered = await renderImageBatch(url, params);
        const res = await firstValueFrom(
          this.shopkeeperService.uploadRenderedImage(
            this.jobId,
            item.id,
            this.dataUrlToBlob(rendered.dataUrl),
            rendered.paperSize,
            rendered.dpi,
            rendered.format,
            rendered.quality,
          ),
        );
        // Their earlier saved editor state no longer matches this render.
        clearLatestState(item.id);
        this.patchItem(item.id, { editState: res.editState, renderedS3Key: res.renderedS3Key });
        done++;
      } catch {
        failed++;
      }
    }
    this.batchBusy.set(false);
    this.messageService.add({
      severity: failed ? 'warn' : 'success',
      summary: failed ? `Updated ${done}, failed ${failed}` : `Updated ${done} document${done === 1 ? '' : 's'}`,
    });
  }

  private patchItem(itemId: string, patch: Partial<PrintJobItemRow>): void {
    const job = this.job();
    if (!job) return;
    this.job.set({ ...job, items: job.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
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
