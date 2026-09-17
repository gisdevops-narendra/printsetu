import { Directive, ElementRef, HostBinding } from '@angular/core';

/**
 * Marks the OUTER element of a truncatable cell (via the .cell-ellipsis
 * global style) and exposes whether its content is CURRENTLY clipped, so
 * the inner text span can opt into the hover-marquee reveal only when the
 * text genuinely doesn't fit — text that already fits never animates:
 *
 *   <span appEllipsis #r="appEllipsis">
 *     <span class="cell-ellipsis__text" [class.is-truncated]="r.isTruncated">{{ value }}</span>
 *   </span>
 */
@Directive({
  selector: '[appEllipsis]',
  standalone: true,
  exportAs: 'appEllipsis',
})
export class EllipsisDirective {
  @HostBinding('class.cell-ellipsis') readonly cellEllipsisClass = true;

  constructor(private readonly el: ElementRef<HTMLElement>) {}

  get isTruncated(): boolean {
    const native = this.el.nativeElement;
    return native.scrollWidth > native.clientWidth;
  }
}
