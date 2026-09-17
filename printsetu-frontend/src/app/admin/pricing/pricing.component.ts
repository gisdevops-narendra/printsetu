import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AdminService } from '../../core/services/admin.service';
import { PricingRate } from '../../core/models/models';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, InputNumberModule, TagModule],
  template: `
    <a routerLink="/admin/shops" class="text-sm" style="color: var(--p-primary-600)">&larr; Back to shops</a>
    <h1 class="page-title mt-2">Pricing</h1>
    <p class="page-subtitle">
      Rates are versioned — changing a rate never alters the price already locked into past orders.
    </p>

    <div class="surface-card-flat p-4 mb-4">
      <h3 class="mt-0 mb-3 text-base">Set / update a rate</h3>
      <div class="flex flex-wrap gap-3 align-items-end">
        <div class="flex flex-column gap-2">
          <label class="text-sm">Paper size</label>
          <p-select [options]="paperSizes" [(ngModel)]="form.paperSize" />
        </div>
        <div class="flex flex-column gap-2">
          <label class="text-sm">Color mode</label>
          <p-select [options]="colorModes" [(ngModel)]="form.colorMode" />
        </div>
        <div class="flex flex-column gap-2">
          <label class="text-sm">Side mode</label>
          <p-select [options]="sideModes" [(ngModel)]="form.sideMode" />
        </div>
        <div class="flex flex-column gap-2">
          <label class="text-sm">Price per page (₹)</label>
          <p-inputNumber [(ngModel)]="form.pricePerPage" mode="decimal" [minFractionDigits]="2" />
        </div>
        <p-button label="Save rate" (onClick)="save()" [loading]="saving()" />
      </div>
    </div>

    <p-table [value]="rates()" [loading]="loading()" styleClass="surface-card-flat">
      <ng-template pTemplate="header">
        <tr>
          <th>Paper</th>
          <th>Color</th>
          <th>Side</th>
          <th>Price / page</th>
          <th>Effective from</th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-rate>
        <tr>
          <td>{{ rate.paperSize }}</td>
          <td>{{ rate.colorMode }}</td>
          <td>{{ rate.sideMode }}</td>
          <td>₹{{ rate.pricePerPage }}</td>
          <td>{{ rate.effectiveFrom | date: 'medium' }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr><td colspan="5" class="text-center text-color-secondary p-4">No pricing configured yet.</td></tr>
      </ng-template>
    </p-table>
  `,
})
export class PricingComponent implements OnInit {
  shopId!: string;
  rates = signal<PricingRate[]>([]);
  loading = signal(true);
  saving = signal(false);

  paperSizes = ['A4', 'A3', 'LETTER', 'LEGAL'];
  colorModes = ['BW', 'COLOR'];
  sideModes = ['SIMPLEX', 'DUPLEX'];

  form: { paperSize: string; colorMode: string; sideMode: string; pricePerPage: number | null } = {
    paperSize: 'A4',
    colorMode: 'BW',
    sideMode: 'SIMPLEX',
    pricePerPage: null,
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly adminService: AdminService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.shopId = this.route.snapshot.paramMap.get('shopId')!;
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.adminService.listPricing(this.shopId).subscribe((rates) => {
      this.rates.set(rates);
      this.loading.set(false);
    });
  }

  save(): void {
    if (!this.form.pricePerPage) return;
    this.saving.set(true);
    this.adminService
      .setPricing(this.shopId, {
        paperSize: this.form.paperSize,
        colorMode: this.form.colorMode,
        sideMode: this.form.sideMode,
        pricePerPage: this.form.pricePerPage,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.messageService.add({ severity: 'success', summary: 'Rate saved' });
          this.load();
        },
        error: () => this.saving.set(false),
      });
  }
}
