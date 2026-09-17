import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AdminService } from '../../core/services/admin.service';
import { ReportSummary } from '../../core/models/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, CardModule, ProgressSpinnerModule],
  template: `
    <h1 class="page-title">Dashboard</h1>
    <p class="page-subtitle">Platform-wide activity across all shops.</p>

    @if (loading()) {
      <div class="flex justify-content-center p-6"><p-progressSpinner strokeWidth="4" /></div>
    } @else if (summary(); as s) {
      <div class="grid">
        <div class="col-12 sm:col-6 lg:col-3">
          <div class="surface-card-flat surface-card-hover p-4 stat-tile">
            <div class="stat-tile__icon"><i class="pi pi-building"></i></div>
            <div>
              <div class="text-color-secondary text-sm mb-1">Shops</div>
              <div class="text-3xl font-bold line-height-2">{{ s.activeShops }} / {{ s.totalShops }}</div>
              <div class="text-xs text-color-secondary">active / total</div>
            </div>
          </div>
        </div>
        <div class="col-12 sm:col-6 lg:col-3">
          <div class="surface-card-flat surface-card-hover p-4 stat-tile">
            <div class="stat-tile__icon"><i class="pi pi-file"></i></div>
            <div>
              <div class="text-color-secondary text-sm mb-1">Print Jobs</div>
              <div class="text-3xl font-bold line-height-2">{{ s.totalJobs }}</div>
              <div class="text-xs text-color-secondary">{{ s.pendingJobs }} pending</div>
            </div>
          </div>
        </div>
        <div class="col-12 sm:col-6 lg:col-3">
          <div class="surface-card-flat surface-card-hover p-4 stat-tile">
            <div class="stat-tile__icon success"><i class="pi pi-check-circle"></i></div>
            <div>
              <div class="text-color-secondary text-sm mb-1">Printed</div>
              <div class="text-3xl font-bold line-height-2" style="color:#16a34a">{{ s.printedJobs }}</div>
              <div class="text-xs text-color-secondary">{{ s.failedJobs }} failed / needs review</div>
            </div>
          </div>
        </div>
        <div class="col-12 sm:col-6 lg:col-3">
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
    }
  `,
})
export class DashboardComponent implements OnInit {
  loading = signal(true);
  summary = signal<ReportSummary | null>(null);

  constructor(private readonly adminService: AdminService) {}

  ngOnInit(): void {
    this.adminService.summary().subscribe((s) => {
      this.summary.set(s);
      this.loading.set(false);
    });
  }
}
