import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { ShellStateService } from '../../../core/services/shell-state.service';
import type { ShellNavItem } from '../app-shell/app-shell.component';

interface Crumb {
  label: string;
  link?: string;
}

/** Pages that live outside the sidebar but belong under one of its entries. */
const PATH_ALIASES: { prefix: string; label: string; link: string }[] = [{ prefix: '/shop/print-jobs', label: 'Print Queue', link: '/shop/queue' }];
/** Last URL segment → breadcrumb label for detail pages. */
const SEGMENT_LABELS: Record<string, string> = { qr: 'QR code', edit: 'Edit document' };

/**
 * The sticky page header shared by the admin and shop portals: a primary row
 * (hamburger, identity, breadcrumb, search, actions) and a status strip under it.
 * Portals fill the slots:
 *
 *   [hdrBrand]   identity: platform logo or shop logo + name
 *   [hdrSearch]  centre of the primary row (optional)
 *   [hdrActions] right side of the primary row
 *   [hdrStrip]   the status strip: stats, badges, queue, clock
 *
 * On phones the sidebar becomes a drawer (hamburger here). With
 * `collapsibleStrip`, the search and strip fold behind a chevron button; without
 * it the strip stays visible and scrolls sideways, for things that must never hide.
 */
@Component({
  selector: 'app-header-frame',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <header class="hdr" [class.hdr--collapsible]="collapsibleStrip" [class.hdr--open]="moreOpen()" [class.hdr--no-phone-crumbs]="!phoneBreadcrumb">
      <div class="hdr__lead">
        <button
          type="button"
          class="icon-btn hdr__menu"
          (click)="shell.toggle()"
          aria-label="Toggle navigation"
          aria-controls="app-sidebar"
          [attr.aria-expanded]="shell.drawerOpen()"
        >
          <i class="pi" [ngClass]="shell.drawerOpen() ? 'pi-times' : 'pi-bars'"></i>
        </button>
        <div class="hdr__brand"><ng-content select="[hdrBrand]" /></div>
        <nav class="crumbs" aria-label="Breadcrumb">
          @for (c of crumbs(); track $index; let last = $last; let first = $first) {
            <span class="crumbs__step" [class.crumbs__step--root]="first" [class.crumbs__step--last]="last">
              @if (!first) {
                <i class="pi pi-angle-right crumbs__sep" aria-hidden="true"></i>
              }
              @if (c.link && !last) {
                <a [routerLink]="c.link">{{ c.label }}</a>
              } @else {
                <span [attr.aria-current]="last ? 'page' : null">{{ c.label }}</span>
              }
            </span>
          }
        </nav>
      </div>

      <div class="hdr__search"><ng-content select="[hdrSearch]" /></div>

      <div class="hdr__actions">
        <ng-content select="[hdrActions]" />
        @if (collapsibleStrip) {
          <button
            type="button"
            class="icon-btn hdr__more"
            (click)="moreOpen.set(!moreOpen())"
            [attr.aria-expanded]="moreOpen()"
            aria-controls="hdr-strip"
            [attr.aria-label]="moreOpen() ? 'Hide search and stats' : 'Show search and stats'"
          >
            <i class="pi" [ngClass]="moreOpen() ? 'pi-chevron-up' : 'pi-chevron-down'"></i>
          </button>
        }
      </div>

      <div class="hdr__strip" id="hdr-strip"><ng-content select="[hdrStrip]" /></div>
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: 0 0 auto;
        /* Sticky as a belt-and-braces: the shell already scrolls only its content area. */
        position: sticky;
        top: 0;
        z-index: 1000;
      }
      .hdr {
        display: grid;
        grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
        grid-template-areas:
          'lead search actions'
          'strip strip strip';
        align-items: center;
        column-gap: clamp(0.75rem, 2vw, 1.5rem);
        padding: 0 clamp(1rem, 2vw, 2rem);
        background: var(--hdr-bg);
        border-bottom: 1px solid var(--hdr-border);
        box-shadow: var(--hdr-shadow);
      }
      .hdr__lead {
        grid-area: lead;
        display: flex;
        align-items: center;
        gap: 0.875rem;
        min-width: 0;
        min-height: 3.75rem;
      }
      .hdr__brand {
        display: flex;
        align-items: center;
        min-width: 0;
      }
      /* A portal that supplies no brand (admin: the sidebar carries the logo) leaves no gap or divider. */
      .hdr__brand:empty {
        display: none;
      }
      .hdr__brand:empty + .crumbs {
        padding-left: 0;
        border-left: 0;
      }
      .hdr__search {
        grid-area: search;
        display: flex;
        justify-content: center;
        min-width: 0;
      }
      .hdr__actions {
        grid-area: actions;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .hdr__strip {
        grid-area: strip;
        display: flex;
        align-items: center;
        gap: 0.625rem 0.875rem;
        min-height: 2.5rem;
        margin: 0 calc(-1 * clamp(1rem, 2vw, 2rem));
        padding: 0.4rem clamp(1rem, 2vw, 2rem);
        border-top: 1px solid var(--hdr-border);
        background: var(--hdr-strip-bg);
      }
      .hdr__strip:empty {
        display: none;
      }

      /* ---- breadcrumb ---- */
      .crumbs {
        display: flex;
        align-items: center;
        min-width: 0;
        padding-left: 0.875rem;
        border-left: 1px solid var(--hdr-border);
        font-size: 0.8125rem;
        color: var(--hdr-muted);
      }
      .crumbs__step {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        white-space: nowrap;
      }
      .crumbs__step--last {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--hdr-text);
        font-weight: 700;
      }
      .crumbs__step a {
        color: inherit;
        text-decoration: none;
      }
      .crumbs__step a:hover {
        color: var(--accent-text-600);
      }
      .crumbs__sep {
        margin: 0 0.25rem;
        font-size: 0.75rem;
        opacity: 0.7;
      }
      .hdr__menu,
      .hdr__more {
        display: none;
      }

      /* ---- tablet: icon rail, less room ---- */
      @media (max-width: 1199px) {
        .crumbs__step--root {
          display: none;
        }
        .crumbs__step--root + .crumbs__step .crumbs__sep {
          display: none;
        }
      }

      /* ---- phones ---- */
      @media (max-width: 767px) {
        .hdr {
          grid-template-columns: minmax(0, 1fr) auto;
          grid-template-areas:
            'lead actions'
            'search search'
            'strip strip';
          column-gap: 0.5rem;
        }
        .hdr__lead {
          min-height: 3.5rem;
          gap: 0.625rem;
        }
        .hdr__menu,
        .hdr__more {
          display: inline-flex;
        }
        .crumbs {
          padding-left: 0.625rem;
        }
        .hdr__search {
          justify-content: stretch;
          padding-bottom: 0.625rem;
        }
        .hdr__search:empty {
          display: none;
        }
        .hdr__strip {
          overflow-x: auto;
          flex-wrap: nowrap;
        }
        /* Search + strip fold away behind the chevron. */
        .hdr--collapsible:not(.hdr--open) .hdr__search,
        .hdr--collapsible:not(.hdr--open) .hdr__strip {
          display: none;
        }
        .hdr--collapsible .hdr__strip {
          flex-wrap: wrap;
          overflow: visible;
        }
      }
      @media (max-width: 479px) {
        /* The shop portal has to fit a shop name, the Online switch, bell and account here. */
        .hdr--no-phone-crumbs .crumbs {
          display: none;
        }
        .crumbs__sep {
          display: none;
        }
        .crumbs__step--root,
        .crumbs__step:not(.crumbs__step--last) {
          display: none;
        }
        .crumbs {
          border-left: 0;
          padding-left: 0;
        }
      }
      /* Landscape phones and other very short screens: keep the page visible. */
      @media (max-height: 520px) {
        .hdr__strip {
          display: none;
        }
        .hdr__lead {
          min-height: 2.75rem;
        }
      }
    `,
  ],
})
export class HeaderFrameComponent {
  @Input() rootLabel = '';
  @Input() rootLink = '/';
  @Input() collapsibleStrip = false;
  /** Show the (last) breadcrumb step on phones. Turn off when the identity needs the room. */
  @Input() phoneBreadcrumb = true;
  @Input() set navItems(value: ShellNavItem[]) {
    this.nav.set(value);
  }

  readonly shell = inject(ShellStateService);
  readonly moreOpen = signal(false);

  private readonly nav = signal<ShellNavItem[]>([]);
  private readonly url = signal('');

  readonly crumbs = computed<Crumb[]>(() => {
    const path = this.url().split(/[?#]/)[0];
    const out: Crumb[] = [{ label: this.rootLabel, link: this.rootLink }];
    const items = [...this.nav()].sort((a, b) => b.route.length - a.route.length);
    const hit = items.find((i) => path === i.route || path.startsWith(i.route + '/'));
    if (hit) {
      out.push({ label: hit.label, link: hit.route });
      this.pushDetail(out, path.slice(hit.route.length));
    } else {
      const alias = PATH_ALIASES.find((a) => path === a.prefix || path.startsWith(a.prefix + '/'));
      if (alias) {
        out.push({ label: alias.label, link: alias.link });
        this.pushDetail(out, path.slice(alias.prefix.length));
      }
    }
    return out;
  });

  constructor() {
    const router = inject(Router);
    this.url.set(router.url);
    router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.url.set(e.urlAfterRedirects);
      this.moreOpen.set(false);
    });
  }

  private pushDetail(out: Crumb[], rest: string): void {
    const last = rest.split('/').filter(Boolean).pop();
    const label = last ? SEGMENT_LABELS[last] : undefined;
    if (label) out.push({ label });
  }
}
