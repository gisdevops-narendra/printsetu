import { AfterViewInit, Directive, ElementRef, HostBinding, OnDestroy, signal } from '@angular/core';

/**
 * Marks the OUTER element of a truncatable cell (via the .cell-ellipsis
 * global style) and exposes whether its content is CURRENTLY clipped, so
 * the inner text span can opt into the hover-marquee reveal only when the
 * text genuinely doesn't fit — text that already fits never animates:
 *
 *   <span appEllipsis #r="appEllipsis">
 *     <span class="cell-ellipsis__text" [class.is-truncated]="r.isTruncated">{{ value }}</span>
 *   </span>
 *
 * The answer is measured after layout (on resize and when the text changes)
 * and held in a signal, so reading it in a template never depends on layout
 * that has not happened yet in the current change-detection pass.
 */
@Directive({
  selector: '[appEllipsis]',
  standalone: true,
  exportAs: 'appEllipsis',
})
export class EllipsisDirective implements AfterViewInit, OnDestroy {
  @HostBinding('class.cell-ellipsis') readonly cellEllipsisClass = true;

  private readonly truncated = signal(false);
  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;

  constructor(private readonly el: ElementRef<HTMLElement>) {}

  get isTruncated(): boolean {
    return this.truncated();
  }

  ngAfterViewInit(): void {
    const native = this.el.nativeElement;
    const measure = () => this.truncated.set(native.scrollWidth > native.clientWidth);
    requestAnimationFrame(measure);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(measure);
      this.resizeObserver.observe(native);
    }
    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(measure);
      this.mutationObserver.observe(native, { childList: true, characterData: true, subtree: true });
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
  }
}
