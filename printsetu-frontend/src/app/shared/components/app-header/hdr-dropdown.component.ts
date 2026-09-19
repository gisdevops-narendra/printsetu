import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * A button that opens a floating panel under itself. Closes on outside click,
 * Escape, or a click on any link/button marked `data-close` inside the panel.
 * On phones the panel becomes a full-width sheet pinned under the header.
 *
 * Usage: <app-hdr-dropdown label="Notifications"><span trigger>…</span> panel content…</app-hdr-dropdown>
 */
@Component({
  selector: 'app-hdr-dropdown',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dd">
      <button
        type="button"
        class="dd__trigger"
        [ngClass]="triggerClass"
        [attr.aria-label]="label"
        aria-haspopup="true"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        <ng-content select="[trigger]" />
      </button>
      @if (open()) {
        <div class="dd__panel" [class.dd__panel--start]="align === 'start'" [style.--dd-w]="width" (click)="onPanelClick($event)">
          <ng-content />
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .dd {
        position: relative;
        display: inline-flex;
      }
      .dd__trigger {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        /* Look (border, padding, background) comes from the caller's triggerClass, e.g. .icon-btn in styles.scss. */
        font: inherit;
        cursor: pointer;
      }
      .dd__panel {
        position: absolute;
        z-index: 1200;
        top: calc(100% + 0.5rem);
        right: 0;
        width: var(--dd-w, 20rem);
        max-width: calc(100vw - 1.5rem);
        max-height: min(30rem, calc(100dvh - 6rem));
        overflow-y: auto;
        background: var(--hdr-surface);
        color: var(--hdr-text);
        border: 1px solid var(--hdr-border);
        border-radius: 16px;
        box-shadow: var(--hdr-panel-shadow);
        animation: dd-in 0.14s ease-out;
      }
      .dd__panel--start {
        right: auto;
        left: 0;
      }
      @keyframes dd-in {
        from {
          opacity: 0;
          transform: translateY(-4px) scale(0.985);
        }
      }
      @media (max-width: 767px) {
        .dd {
          position: static;
        }
        .dd__panel {
          position: fixed;
          top: 3.6rem;
          left: 0.75rem;
          right: 0.75rem;
          width: auto;
          max-width: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .dd__panel {
          animation: none;
        }
      }
    `,
  ],
})
export class HdrDropdownComponent {
  @Input() label = '';
  @Input() triggerClass = '';
  @Input() align: 'start' | 'end' = 'end';
  @Input() width = '20rem';
  @Output() openChange = new EventEmitter<boolean>();

  readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  toggle(): void {
    this.set(!this.open());
  }

  close(): void {
    this.set(false);
  }

  private set(value: boolean): void {
    if (this.open() === value) return;
    this.open.set(value);
    this.openChange.emit(value);
  }

  onPanelClick(event: Event): void {
    if ((event.target as HTMLElement).closest('a[href], [data-close]')) this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
