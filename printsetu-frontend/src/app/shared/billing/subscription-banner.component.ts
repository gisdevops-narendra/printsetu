import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SubscriptionStatusService } from '../../core/services/subscription-status.service';
import { money } from './billing.util';

/** Warning strip at the top of the shop portal while the subscription needs attention. */
@Component({
  selector: 'app-subscription-banner',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (status.access()?.banner; as b) {
      <div class="banner" [ngClass]="'banner--' + b.severity" role="alert">
        <i class="pi" [ngClass]="b.severity === 'info' ? 'pi-info-circle' : b.severity === 'warn' ? 'pi-exclamation-triangle' : 'pi-exclamation-circle'"></i>
        <div class="banner__text">
          <strong>{{ b.message }}</strong>
          @if (status.overview()?.amountDue; as due) {
            <span>Amount due {{ money(due.amount, due.currency) }} (invoice {{ due.number }}). Pay your administrator to keep your shop running.</span>
          }
        </div>
        <a routerLink="/shop/billing" class="banner__link">View billing <i class="pi pi-arrow-right"></i></a>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        /* A global rule stretches every child of the page area to full height; the banner is just a strip. */
        height: auto !important;
        flex: none;
      }
      .banner {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        margin-bottom: 1.25rem;
        padding: 0.875rem 1rem;
        border: 1px solid;
        border-radius: 14px;
        font-size: 0.9rem;
        line-height: 1.5;
      }
      .banner > i {
        margin-top: 0.2rem;
        font-size: 1.05rem;
      }
      .banner__text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .banner__text span {
        font-size: 0.8125rem;
        opacity: 0.85;
      }
      .banner__link {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.8125rem;
        font-weight: 700;
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .banner--info {
        background: var(--bg-eff6ff);
        border-color: var(--bd-bfdbfe);
        color: var(--tx-1e40af);
      }
      .banner--warn {
        background: var(--bg-fffbeb);
        border-color: var(--bd-fde68a);
        color: var(--tx-92400e);
      }
      .banner--error {
        background: var(--bg-fef2f2);
        border-color: var(--bd-fecaca);
        color: var(--tx-991b1b);
      }
      @media (max-width: 560px) {
        .banner {
          flex-wrap: wrap;
        }
        .banner__link {
          margin-left: 1.85rem;
        }
      }
    `,
  ],
})
export class SubscriptionBannerComponent {
  readonly status = inject(SubscriptionStatusService);
  readonly money = money;
}
