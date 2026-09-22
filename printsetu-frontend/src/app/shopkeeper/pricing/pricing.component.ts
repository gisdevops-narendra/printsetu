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
      <div class="rate-form">
        <div class="rate-form__field">
          <label class="text-sm">Paper size</label>
          <p-select [options]="paperSizes" [(ngModel)]="form.paperSize" [disabled]="!!editingId()" styleClass="w-full" appendTo="body" />
        </div>
        <div class="rate-form__field">
          <label class="text-sm">Color mode</label>
          <p-select [options]="colorModes" [(ngModel)]="form.colorMode" [disabled]="!!editingId()" styleClass="w-full" appendTo="body" />
        </div>
        <div class="rate-form__field">
          <label class="text-sm">Side mode</label>
          <p-select [options]="sideModes" [(ngModel)]="form.sideMode" [disabled]="!!editingId()" styleClass="w-full" appendTo="body" />
        </div>
        <div class="rate-form__field">
          <label class="text-sm">Price per page (₹)</label>
          <p-inputNumber [(ngModel)]="form.pricePerPage" mode="decimal" [minFractionDigits]="2" styleClass="w-full" inputStyleClass="w-full" />
        </div>
        <div class="rate-form__actions">
          <p-button [label]="editingId() ? 'Update rate' : 'Save rate'" (onClick)="save()" [loading]="saving()" />
          @if (editingId()) {
            <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="cancelEdit()" />
          }
        </div>
      </div>
    </div>

    <div class="page-header">
      <h3 class="m-0 text-base">Current rates</h3>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
      </div>
    </div>

    <p-table
      #dt
      [tableStyle]="{ 'min-width': '40rem' }"
      [value]="rates()"
      [loading]="loading()"
      [globalFilterFields]="['paperSize', 'colorMode', 'sideMode']"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 16%" pSortableColumn="paperSize">Paper <p-sortIcon field="paperSize" /></th>
          <th style="width: 16%" pSortableColumn="colorMode">Color <p-sortIcon field="colorMode" /></th>
          <th style="width: 16%" pSortableColumn="sideMode">Side <p-sortIcon field="sideMode" /></th>
          <th style="width: 16%" pSortableColumn="pricePerPage">Price / page <p-sortIcon field="pricePerPage" /></th>
          <th style="width: 22%" pSortableColumn="effectiveFrom">Effective from <p-sortIcon field="effectiveFrom" /></th>
          <th style="width: 14%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-rate>
        <tr>
          <td data-label="Paper">{{ rate.paperSize }}</td>
          <td data-label="Color">{{ rate.colorMode }}</td>
          <td data-label="Side">{{ rate.sideMode }}</td>
          <td data-label="Price / page">₹{{ rate.pricePerPage }}</td>
          <td data-label="Effective from">{{ rate.effectiveFrom | date: 'medium' }}</td>
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
  styles: [
    `
      /* One row of four fields + button on wide screens; 2-up on phones; the
         fields always fill their column instead of hugging their content. */
      .rate-form {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
        gap: 1rem;
        align-items: end;
      }
      .rate-form__field {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
      }
      .rate-form__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      @media (max-width: 640px) {
        .rate-form {
          grid-template-columns: 1fr 1fr;
        }
        /* The action buttons get their own full-width line. */
        .rate-form__actions {
          grid-column: 1 / -1;
        }
        .rate-form__actions ::ng-deep .p-button {
          width: 100%;
        }
        .rate-form__actions > * {
          flex: 1 1 100%;
        }
      }
    `,
  ],
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
    // The form is at the top of the page; on a phone the tapped rate can be
    // screens below it, so bring the form into view.
    document.querySelector('.app-shell-content')?.scrollTo({ top: 0, behavior: 'smooth' });
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
