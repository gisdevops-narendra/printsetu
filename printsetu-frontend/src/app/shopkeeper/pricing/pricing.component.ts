import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { PricingRate } from '../../core/models/models';

@Component({
  selector: 'app-shop-pricing',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    SelectModule,
    InputNumberModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    TooltipModule,
  ],
  template: `
    <h1 class="page-title">Pricing</h1>
    <p class="page-subtitle">
      Set your own shop's print rates. Rates are versioned — changing a rate never alters the
      price already locked into past orders.
    </p>

    <div class="surface-card-flat p-4 mb-4">
      <h3 class="mt-0 mb-3 text-base">{{ editingId() ? 'Update rate' : 'Set a new rate' }}</h3>
      <div class="flex flex-wrap gap-3 align-items-end">
        <div class="flex flex-column gap-2">
          <label class="text-sm">Paper size</label>
          <p-select [options]="paperSizes" [(ngModel)]="form.paperSize" [disabled]="!!editingId()" />
        </div>
        <div class="flex flex-column gap-2">
          <label class="text-sm">Color mode</label>
          <p-select [options]="colorModes" [(ngModel)]="form.colorMode" [disabled]="!!editingId()" />
        </div>
        <div class="flex flex-column gap-2">
          <label class="text-sm">Side mode</label>
          <p-select [options]="sideModes" [(ngModel)]="form.sideMode" [disabled]="!!editingId()" />
        </div>
        <div class="flex flex-column gap-2">
          <label class="text-sm">Price per page (₹)</label>
          <p-inputNumber [(ngModel)]="form.pricePerPage" mode="decimal" [minFractionDigits]="2" />
        </div>
        <p-button [label]="editingId() ? 'Update rate' : 'Save rate'" (onClick)="save()" [loading]="saving()" />
        @if (editingId()) {
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="cancelEdit()" />
        }
      </div>
    </div>

    <div class="flex justify-content-end mb-3">
      <p-iconfield>
        <p-inputicon styleClass="pi pi-search" />
        <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
      </p-iconfield>
    </div>

    <p-table
      #dt
      [value]="rates()"
      [loading]="loading()"
      [globalFilterFields]="['paperSize', 'colorMode', 'sideMode']"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 18%" pSortableColumn="paperSize">Paper <p-sortIcon field="paperSize" /></th>
          <th style="width: 18%" pSortableColumn="colorMode">Color <p-sortIcon field="colorMode" /></th>
          <th style="width: 18%" pSortableColumn="sideMode">Side <p-sortIcon field="sideMode" /></th>
          <th style="width: 18%" pSortableColumn="pricePerPage">Price / page <p-sortIcon field="pricePerPage" /></th>
          <th style="width: 18%" pSortableColumn="effectiveFrom">Effective from <p-sortIcon field="effectiveFrom" /></th>
          <th style="width: 10%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-rate>
        <tr>
          <td>{{ rate.paperSize }}</td>
          <td>{{ rate.colorMode }}</td>
          <td>{{ rate.sideMode }}</td>
          <td>₹{{ rate.pricePerPage }}</td>
          <td>{{ rate.effectiveFrom | date: 'medium' }}</td>
          <td class="flex gap-2 justify-content-end">
            <p-button
              icon="pi pi-pencil"
              size="small"
              [text]="true"
              (onClick)="edit(rate)"
              pTooltip="Edit"
            />
            <p-button
              icon="pi pi-trash"
              size="small"
              severity="danger"
              [text]="true"
              (onClick)="confirmDelete(rate)"
              pTooltip="Remove"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="6">
            <div class="table-empty"><i class="pi pi-tag"></i><span>No pricing configured yet.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class ShopPricingComponent implements OnInit {
  rates = signal<PricingRate[]>([]);
  loading = signal(true);
  saving = signal(false);
  editingId = signal<string | null>(null);

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
    private readonly shopkeeperService: ShopkeeperService,
    private readonly messageService: MessageService,
    private readonly confirmationService: ConfirmationService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.shopkeeperService.listPricing().subscribe((rates) => {
      this.rates.set(rates);
      this.loading.set(false);
    });
  }

  edit(rate: PricingRate): void {
    this.editingId.set(rate.id);
    this.form = {
      paperSize: rate.paperSize,
      colorMode: rate.colorMode,
      sideMode: rate.sideMode,
      pricePerPage: Number(rate.pricePerPage),
    };
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form = { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', pricePerPage: null };
  }

  save(): void {
    if (!this.form.pricePerPage) return;
    this.saving.set(true);
    this.shopkeeperService
      .setPricing({
        paperSize: this.form.paperSize,
        colorMode: this.form.colorMode,
        sideMode: this.form.sideMode,
        pricePerPage: this.form.pricePerPage,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.messageService.add({ severity: 'success', summary: 'Rate saved' });
          this.cancelEdit();
          this.load();
        },
        error: () => this.saving.set(false),
      });
  }

  confirmDelete(rate: PricingRate): void {
    this.confirmationService.confirm({
      message: `Remove the ${rate.paperSize} / ${rate.colorMode} / ${rate.sideMode} rate? Customers will no longer be able to select this combination until a new rate is set.`,
      header: 'Confirm',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.shopkeeperService.deletePricing(rate.id).subscribe(() => {
          this.messageService.add({ severity: 'success', summary: 'Rate removed' });
          if (this.editingId() === rate.id) this.cancelEdit();
          this.load();
        });
      },
    });
  }
}
