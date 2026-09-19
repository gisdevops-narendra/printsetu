import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AdminService } from '../../core/services/admin.service';
import { PrintJobRow, ReportSummary } from '../../core/models/models';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, CardModule, ProgressSpinnerModule, StatusTagComponent],
  template: `
    <h1 class="page-title">Dashboard</h1>
    <p class="page-subtitle">Platform-wide activity across all shops.</p>

    @if (loading()) {
      <div class="flex justify-content-center p-6"><p-progressSpinner strokeWidth="4" /></div>
    } @else if (summary(); as s) {
      <div class="grid-auto">
        <div>
          <div class="surface-card-flat surface-card-hover p-4 stat-tile">
            <div class="stat-tile__icon"><i class="pi pi-building"></i></div>
            <div>
              <div class="text-color-secondary text-sm mb-1">Shops</div>
              <div class="text-3xl font-bold line-height-2">{{ s.activeShops }} / {{ s.totalShops }}</div>
              <div class="text-xs text-color-secondary">active / total</div>
            </div>
          </div>
        </div>
        <div>
          <div class="surface-card-flat surface-card-hover p-4 stat-tile">
            <div class="stat-tile__icon"><i class="pi pi-file"></i></div>
            <div>
              <div class="text-color-secondary text-sm mb-1">Print Jobs</div>
              <div class="text-3xl font-bold line-height-2">{{ s.totalJobs }}</div>
              <div class="text-xs text-color-secondary">{{ s.pendingJobs }} pending</div>
            </div>
          </div>
        </div>
        <div>
          <div class="surface-card-flat surface-card-hover p-4 stat-tile">
            <div class="stat-tile__icon success"><i class="pi pi-check-circle"></i></div>
            <div>
              <div class="text-color-secondary text-sm mb-1">Printed</div>
              <div class="text-3xl font-bold line-height-2" style="color:var(--tx-16a34a)">{{ s.printedJobs }}</div>
              <div class="text-xs text-color-secondary">{{ s.failedJobs }} failed / needs review</div>
            </div>
          </div>
        </div>
        <div>
          <div class="surface-card-flat surface-card-hover p-4 stat-tile">
            <div class="stat-tile__icon warn"><i class="pi pi-indian-rupee"></i></div>
            <div>
              <div class="text-color-secondary text-sm mb-1">Revenue (recorded)</div>
              <div class="text-3xl font-bold line-height-2">₹{{ s.totalRevenue }}</div>
              <div class="text-xs text-color-secondary">{{ s.totalDocuments }} documents uploaded</div>
            </div>
          </div>
        </div>
      </div>

      <section class="surface-card-flat recent">
        <header class="recent__head">
          <h2 class="recent__title">Recent print jobs</h2>
          <a routerLink="/admin/print-history" class="recent__link">View all <i class="pi pi-arrow-right"></i></a>
        </header>
        @if (recent().length === 0) {
          <div class="recent__empty"><i class="pi pi-inbox"></i><span>No print jobs yet.</span></div>
        } @else {
          <ul class="recent__list">
            @for (job of recent(); track job.id) {
              <li class="recent__row">
                <span class="recent__token">#{{ job.tokenNumber }}</span>
                <span class="recent__main">
                  <span class="recent__shop">{{ job.shop?.name ?? 'Shop' }}</span>
                  <span class="recent__meta">
                    {{ job.items.length }} {{ job.items.length === 1 ? 'document' : 'documents' }} &middot;
                    {{ job.createdAt | date: 'MMM d, h:mm a' }}
                  </span>
                </span>
                <span class="recent__amount">{{ job.currency }} {{ job.amount }}</span>
                <app-status-tag [status]="job.status" />
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
  styles: [
    `
      .recent {
        margin-top: clamp(0.75rem, 1.5vw, 1.25rem);
        padding: 0;
        overflow: hidden;
      }
      .recent__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem clamp(1rem, 1.6vw, 1.5rem);
        border-bottom: 1px solid var(--bd-e2e8f0);
      }
      .recent__title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        color: var(--tx-0f172a);
      }
      .recent__link {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--accent-text-600);
        text-decoration: none;
        white-space: nowrap;
      }
      .recent__link i {
        font-size: 0.7rem;
      }
      .recent__list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .recent__row {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem clamp(1rem, 1.6vw, 1.5rem);
        border-bottom: 1px solid var(--bd-f1f5f9);
      }
      .recent__row:last-child {
        border-bottom: none;
      }
      .recent__token {
        flex: 0 0 3.5rem;
        font-weight: 700;
        color: var(--tx-0f172a);
      }
      .recent__main {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .recent__shop {
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--tx-1e293b);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .recent__meta {
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .recent__amount {
        flex: 0 0 auto;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--tx-334155);
      }
      .recent__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 2.5rem 1rem;
        color: var(--tx-64748b);
        font-size: 0.875rem;
      }
      .recent__empty i {
        font-size: 1.5rem;
        color: #cbd5e1;
      }
      @media (max-width: 520px) {
        .recent__row {
          flex-wrap: wrap;
          row-gap: 0.25rem;
        }
        .recent__main {
          flex-basis: calc(100% - 4.5rem);
        }
        .recent__amount {
          margin-left: 4.5rem;
        }
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  loading = signal(true);
  summary = signal<ReportSummary | null>(null);
  recent = signal<PrintJobRow[]>([]);

  constructor(private readonly adminService: AdminService) {}

  ngOnInit(): void {
    this.adminService.summary().subscribe((s) => {
      this.summary.set(s);
      this.loading.set(false);
    });
    this.adminService.printHistory(undefined, 1, 8).subscribe({
      next: (res) => this.recent.set(res.items),
      error: () => this.recent.set([]),
    });
  }
}
