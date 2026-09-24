import { Component, OnInit, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollActiveTabDirective } from '../../shared/directives/scroll-active-tab.directive';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { ShopProfileResponse } from '../../core/models/models';
import { ProfileOverviewComponent } from './profile-overview.component';
import { ProfileDetailsComponent } from './profile-details.component';
import { ProfileServicesComponent } from './profile-services.component';
import { ProfileHistoryComponent } from './profile-history.component';
import { ProfileSettingsComponent } from './profile-settings.component';
import { EditProfileDialogComponent } from './edit-profile-dialog.component';
import { initials, openStatus } from './profile.util';
import { t } from '../../core/i18n/i18n';

type Tab = 'overview' | 'details' | 'services' | 'history' | 'settings';
type ImageKind = 'logo' | 'banner';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', get label() { return t('profile.overview'); }, icon: 'pi-chart-bar' },
  { key: 'details', get label() { return t('common.details'); }, icon: 'pi-id-card' },
  { key: 'services', get label() { return t('profile.services_pricing'); }, icon: 'pi-tag' },
  { key: 'history', get label() { return t('common.orders'); }, icon: 'pi-history' },
  { key: 'settings', get label() { return t('profile.settings'); }, icon: 'pi-cog' },
];

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * The shop owner's home base: who the shop is (cover, logo, hours, about),
 * how it is doing (stats and orders), what it offers (services and prices)
 * and how it runs (settings). Sections load lazily per tab.
 */
@Component({
  selector: 'app-shop-profile',
  standalone: true,
  imports: [TranslatePipe, ScrollActiveTabDirective, 
    CommonModule,
    RouterLink,
    ProfileOverviewComponent,
    ProfileDetailsComponent,
    ProfileServicesComponent,
    ProfileHistoryComponent,
    ProfileSettingsComponent,
    EditProfileDialogComponent,
  ],
  template: `
    <div class="profile">
      @if (loading()) {
        <div class="pf-skeleton" style="height: 19rem"></div>
        <div class="pf-skeleton" style="height: 3rem; margin-top: 1.25rem"></div>
      } @else if (error()) {
        <div class="pf-card pf-empty">
          <span class="pf-empty__icon"><i class="pi pi-exclamation-circle"></i></span>
          <strong>{{ 'profile.couldnt_load_your_profile' | translate }}</strong>
          <p>{{ 'profile.check_your_connection_and_try_again' | translate }}</p>
          <button type="button" class="pf-btn pf-btn--primary" (click)="load()"><i class="pi pi-refresh"></i> {{ 'common.try_again' | translate }}</button>
        </div>
      } @else if (data(); as d) {
        <!-- ================= Hero ================= -->
        <section class="hero">
          <div class="cover" [class.has-image]="!!d.shop.bannerUrl">
            @if (d.shop.bannerUrl) { <img [src]="d.shop.bannerUrl" alt="" class="cover__img" /> }
            <div class="cover__tools">
              <button type="button" class="tool" (click)="bannerInput.click()" [disabled]="uploading() !== null">
                <i class="pi pi-camera"></i><span>{{ d.shop.bannerUrl ? ('profile.change_cover' | translate) : ('profile.add_cover' | translate) }}</span>
              </button>
              @if (d.shop.bannerUrl) {
                <button type="button" class="tool tool--icon" (click)="remove('banner')" [disabled]="uploading() !== null" [attr.aria-label]="'profile.remove_cover_photo' | translate"><i class="pi pi-trash"></i></button>
              }
            </div>
            @if (uploading() === 'banner') { <div class="busy"><span class="spinner"></span> {{ 'common.uploading' | translate }}</div> }
          </div>

          <div class="hero__body">
            <div class="avatar" [class.has-image]="!!d.shop.logoUrl">
              @if (d.shop.logoUrl) { <img [src]="d.shop.logoUrl" alt="{{ d.shop.name }} logo" /> } @else { <span>{{ initials(d.shop.name) }}</span> }
              <button type="button" class="avatar__edit" (click)="logoInput.click()" [disabled]="uploading() !== null" [attr.aria-label]="'profile.change_logo' | translate"><i class="pi pi-camera"></i></button>
              @if (uploading() === 'logo') { <div class="busy busy--round"><span class="spinner"></span></div> }
            </div>

            <div class="hero__info">
              <h1 class="name">{{ d.shop.name }}</h1>
              <div class="meta">
                <span class="chip chip--code"><i class="pi pi-hashtag"></i>{{ d.shop.shopCode }}</span>
                <span class="chip"><i class="pi pi-map-marker"></i>{{ d.shop.city }}</span>
                <span class="chip" [ngClass]="d.shop.status === 'ACTIVE' ? 'chip--ok' : 'chip--bad'">
                  <span class="dot"></span>{{ d.shop.status === 'ACTIVE' ? ('common.active' | translate) : ('profile.inactive' | translate) }}
                </span>
                @if (open(); as o) {
                  <span class="chip" [ngClass]="o.state === 'open' ? 'chip--ok' : o.state === 'closed' ? 'chip--muted' : 'chip--plain'"><i class="pi pi-clock"></i>{{ o.label }}</span>
                }
              </div>
              @if (d.shop.description) {
                <p class="desc">{{ d.shop.description }}</p>
              } @else {
                <button type="button" class="desc desc--add" (click)="editing.set(true)"><i class="pi pi-plus"></i> {{ 'profile.add_a_short_description_of_your' | translate }}</button>
              }
            </div>

            <div class="hero__actions">
              <button type="button" class="pf-btn pf-btn--primary" (click)="editing.set(true)"><i class="pi pi-pencil"></i> {{ 'profile.edit_profile' | translate }}</button>
              <a routerLink="/shop/qr" class="pf-btn"><i class="pi pi-qrcode"></i> {{ 'profile.qr_code' | translate }}</a>
            </div>
          </div>
        </section>

        <input #logoInput type="file" accept="image/png,image/jpeg,image/webp" hidden (change)="onImage('logo', $event)" />
        <input #bannerInput type="file" accept="image/png,image/jpeg,image/webp" hidden (change)="onImage('banner', $event)" />

        <!-- ================= Tabs ================= -->
        <nav class="tabs" appScrollActiveTab role="tablist" [attr.aria-label]="'profile.shop_profile_sections' | translate">
          @for (t of tabs; track t.key) {
            <button type="button" role="tab" class="tab" [class.is-on]="tab() === t.key" [attr.aria-selected]="tab() === t.key" (click)="select(t.key)">
              <i class="pi" [ngClass]="t.icon"></i><span>{{ t.label }}</span>
            </button>
          }
        </nav>

        <div class="panel">
          @switch (tab()) {
            @case ('overview') { <app-profile-overview /> }
            @case ('details') { <app-profile-details [shop]="d.shop" (edit)="editing.set(true)" /> }
            @case ('services') { <app-profile-services /> }
            @case ('history') { <app-profile-history /> }
            @case ('settings') { <app-profile-settings [settings]="d.settings" [openingHours]="d.shop.openingHours" (editHours)="editing.set(true)" (updated)="data.set($event)" /> }
          }
        </div>

        <app-edit-profile-dialog [shop]="d.shop" [(visible)]="editing" (saved)="data.set($event)" />
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .profile {
        display: flex;
        flex-direction: column;
        gap: clamp(1rem, 2vw, 1.5rem);
        padding-bottom: 1.5rem;
      }

      /* ---------- Hero ---------- */
      .hero {
        overflow: hidden;
        background: var(--bg-ffffff);
        border: 1px solid var(--bd-e6eaf2);
        border-radius: 22px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .cover {
        position: relative;
        height: clamp(8rem, 17vw, 13rem);
        background: linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #6366f1 100%);
        overflow: hidden;
      }
      .cover:not(.has-image)::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(420px 220px at 12% 0%, rgba(165, 180, 252, 0.45), transparent 70%),
          radial-gradient(360px 200px at 100% 100%, rgba(56, 189, 248, 0.28), transparent 70%);
      }
      .cover__img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .cover__tools {
        position: absolute;
        top: 0.875rem;
        right: 0.875rem;
        display: flex;
        gap: 0.5rem;
      }
      .tool {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        height: 2.25rem;
        padding: 0 0.875rem;
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #fff;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .tool:hover:not(:disabled) {
        background: rgba(15, 23, 42, 0.65);
      }
      .tool:disabled {
        opacity: 0.6;
        cursor: progress;
      }
      .tool--icon {
        width: 2.25rem;
        padding: 0;
        justify-content: center;
      }
      @media (max-width: 480px) {
        .tool span {
          display: none;
        }
        .tool {
          width: 2.25rem;
          padding: 0;
          justify-content: center;
        }
      }
      .busy {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.625rem;
        background: rgba(15, 23, 42, 0.45);
        font-size: 0.875rem;
        font-weight: 600;
        color: #fff;
      }
      .busy--round {
        border-radius: 50%;
      }
      .spinner {
        width: 1.125rem;
        height: 1.125rem;
        border: 2.5px solid rgba(255, 255, 255, 0.4);
        border-top-color: var(--bd-ffffff);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .hero__body {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 0 clamp(1rem, 2vw, 1.5rem);
        align-items: start;
        padding: 0 clamp(1rem, 2.4vw, 1.75rem) clamp(1rem, 2.2vw, 1.5rem);
      }
      .avatar {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: clamp(5rem, 9vw, 6.5rem);
        height: clamp(5rem, 9vw, 6.5rem);
        margin-top: calc(clamp(5rem, 9vw, 6.5rem) / -2);
        border: 4px solid var(--bd-ffffff);
        border-radius: 24px;
        background: linear-gradient(135deg, var(--p-primary-500), var(--p-primary-700));
        box-shadow: 0 10px 24px rgba(30, 27, 75, 0.22);
        font-size: clamp(1.5rem, 3vw, 2rem);
        font-weight: 800;
        letter-spacing: -0.02em;
        color: #fff;
        overflow: hidden;
      }
      .avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: var(--bg-ffffff);
      }
      .avatar__edit {
        position: absolute;
        right: 0.25rem;
        bottom: 0.25rem;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.875rem;
        height: 1.875rem;
        border: 2px solid var(--bd-ffffff);
        border-radius: 50%;
        background: #0f172a;
        font-size: 0.75rem;
        color: #fff;
        cursor: pointer;
      }
      .avatar__edit:disabled {
        opacity: 0.6;
      }
      .hero__info {
        min-width: 0;
        padding-top: 0.875rem;
      }
      .name {
        margin: 0;
        font-size: clamp(1.375rem, 2.6vw, 1.875rem);
        line-height: 1.2;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: var(--tx-0f172a);
        overflow-wrap: anywhere;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.625rem;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.25rem 0.75rem;
        border-radius: 999px;
        background: var(--bg-f1f5f9);
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-475569);
      }
      .chip i {
        font-size: 0.75rem;
      }
      .chip--code {
        background: var(--p-primary-50);
        color: var(--accent-text-700);
      }
      .chip--ok {
        background: var(--bg-dcfce7);
        color: var(--tx-15803d);
      }
      .chip--bad {
        background: var(--bg-fee2e2);
        color: var(--tx-b91c1c);
      }
      .chip--muted {
        background: var(--bg-fef3c7);
        color: var(--tx-92400e);
      }
      .chip--plain {
        background: var(--bg-f1f5f9);
        color: var(--tx-64748b);
      }
      .dot {
        width: 0.4rem;
        height: 0.4rem;
        border-radius: 50%;
        background: currentColor;
      }
      .desc {
        margin: 0.875rem 0 0;
        max-width: 68ch;
        font-size: 0.9375rem;
        line-height: 1.6;
        color: var(--tx-475569);
      }
      .desc--add {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.875rem;
        border: 1.5px dashed var(--bd-cbd3e6);
        border-radius: 999px;
        background: none;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--tx-64748b);
        cursor: pointer;
      }
      .desc--add:hover {
        border-color: var(--p-primary-300);
        color: var(--accent-text-700);
      }
      .hero__actions {
        display: flex;
        gap: 0.5rem;
        padding-top: 0.875rem;
      }
      @media (max-width: 860px) {
        .hero__body {
          grid-template-columns: auto minmax(0, 1fr);
        }
        .hero__actions {
          grid-column: 1 / -1;
          padding-top: 1rem;
        }
        .hero__actions > * {
          flex: 1 1 0;
        }
      }
      @media (max-width: 520px) {
        .hero__body {
          grid-template-columns: minmax(0, 1fr);
        }
        .avatar {
          margin-bottom: 0.25rem;
        }
      }

      /* ---------- Tabs ---------- */
      .tabs {
        display: flex;
        gap: 0.375rem;
        overflow-x: auto;
        padding: 0.375rem;
        background: var(--bg-eef1f7);
        border-radius: 16px;
        scrollbar-width: none;
      }
      .tab {
        flex: 1 1 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        min-height: 2.75rem;
        padding: 0 1rem;
        border: none;
        border-radius: 12px;
        background: transparent;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--tx-64748b);
        white-space: nowrap;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
      }
      .tab i {
        font-size: 0.9375rem;
      }
      .tab:hover:not(.is-on) {
        color: var(--tx-0f172a);
      }
      .tab.is-on {
        background: var(--bg-ffffff);
        color: var(--accent-text-700);
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
      }
      .panel {
        min-width: 0;
        animation: fade 0.2s ease both;
      }
      @keyframes fade {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .panel,
        .spinner {
          animation: none;
        }
      }
    `,
  ],
})
export class ProfileComponent implements OnInit {
  readonly tabs = TABS;

  loading = signal(true);
  error = signal(false);
  data = signal<ShopProfileResponse | null>(null);
  tab = signal<Tab>('overview');
  editing = signal(false);
  uploading = signal<ImageKind | null>(null);

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    private readonly messageService: MessageService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const wanted = this.route.snapshot.queryParamMap.get('tab') as Tab | null;
    if (wanted && TABS.some((t) => t.key === wanted)) this.tab.set(wanted);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.shopkeeperService.profile().subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Keeps the tab in the URL so a refresh or a shared link lands on the same section. */
  select(tab: Tab): void {
    this.tab.set(tab);
    this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  open() {
    const shop = this.data()?.shop;
    return shop ? openStatus(shop.openingHours) : null;
  }

  initials(name: string): string {
    return initials(name);
  }

  onImage(kind: ImageKind, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allows choosing the same file again
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      this.messageService.add({ severity: 'warn', get summary() { return t('profile.use_a_jpg_png_or_webp'); } });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.messageService.add({ severity: 'warn', get summary() { return t('profile.that_image_is_too_large'); }, get detail() { return t('profile.please_choose_one_under_6_mb'); } });
      return;
    }
    this.uploading.set(kind);
    this.shopkeeperService.uploadProfileImage(kind, file).subscribe({
      next: (res) => {
        this.data.set(res);
        this.uploading.set(null);
        this.messageService.add({ severity: 'success', summary: kind === 'logo' ? t('profile.logo_updated') : t('profile.cover_photo_updated') });
      },
      error: () => this.uploading.set(null),
    });
  }

  remove(kind: ImageKind): void {
    this.uploading.set(kind);
    this.shopkeeperService.removeProfileImage(kind).subscribe({
      next: (res) => {
        this.data.set(res);
        this.uploading.set(null);
      },
      error: () => this.uploading.set(null),
    });
  }
}
