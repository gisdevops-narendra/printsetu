import { AfterViewChecked, Directive, ElementRef, inject } from '@angular/core';

/**
 * On a horizontally scrolling tab strip (phones), keeps the selected tab in view:
 * without this, opening e.g. `?tab=payments` leaves the strip scrolled to the start,
 * so the tab you are on is off-screen. Put it on the element that scrolls.
 */
@Directive({ selector: '[appScrollActiveTab]', standalone: true })
export class ScrollActiveTabDirective implements AfterViewChecked {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private lastActive: Element | null = null;

  ngAfterViewChecked(): void {
    const list = this.host.nativeElement;
    const active = list.querySelector('.is-on, [aria-selected="true"]');
    if (!active || active === this.lastActive) return;
    this.lastActive = active;
    if (list.scrollWidth <= list.clientWidth) return; // everything already fits
    // Rects, not offsetLeft: the strip is not necessarily the tab's offsetParent.
    const a = active.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    const target = list.scrollLeft + (a.left - l.left) - (list.clientWidth - a.width) / 2;
    list.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }
}
