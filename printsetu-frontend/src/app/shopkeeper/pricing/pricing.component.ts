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
import { PricingRate, PricingTier } from '../../core/models/models';
import { COLOR_LABELS, PAPER_LABELS, SIDE_LABELS, printOptionsLabel } from '../../shared/utils/print-options.util';

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
      Set your own shop's print prices. Changing a price only affects new orders.
    </p>

    <div class="surface-card-flat p-4 mb-4">
      <h3 class="mt-0 mb-3 text-base">{{ editingId() ? 'Update rate' : 'Set a new rate' }}</h3>
      <div class="rate-form">
        <div class="rate-form__field">
          <label class="text-sm">Paper size</label>
          <p-select [options]="paperOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.paperSize" [disabled]="!!editingId()" styleClass="w-full" appendTo="body" />
        </div>
        <div class="rate-form__field">
          <label class="text-sm">Color</label>
          <p-select [options]="colorOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.colorMode" [disabled]="!!editingId()" styleClass="w-full" appendTo="body" />
        </div>
        <div class="rate-form__field">
          <label class="text-sm">Sides</label>
          <p-select [options]="sideOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.sideMode" [disabled]="!!editingId()" styleClass="w-full" appendTo="body" />
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
          <th style="width: 16%" pSortableColumn="sideMode">Sides <p-sortIcon field="sideMode" /></th>
          <th style="width: 16%" pSortableColumn="pricePerPage">Price / page <p-sortIcon field="pricePerPage" /></th>
          <th style="width: 22%" pSortableColumn="effectiveFrom">Price since <p-sortIcon field="effectiveFrom" /></th>
          <th style="width: 14%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-rate>
        <tr>
          <td data-label="Paper">{{ paperLabels[rate.paperSize] }}</td>
          <td data-label="Color">{{ colorLabels[rate.colorMode] }}</td>
          <td data-label="Sides">{{ sideLabels[rate.sideMode] }}</td>
          <td data-label="Price / page">₹{{ rate.pricePerPage }}</td>
          <td data-label="Price since">{{ rate.effectiveFrom | date: 'medium' }}</td>
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
            <div class="table-empty"><i class="pi pi-tag"></i><span>No prices set yet.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>

    <div class="tier-intro">
      <h3 class="m-0 text-base">
        Lower price for bigger orders <span class="text-sm text-color-secondary font-normal">(optional)</span>
      </h3>
      <p class="m-0 mt-2 text-sm text-color-secondary">
        Charge less per page for bigger orders, e.g. A4 B&amp;W: 1–5 pages at ₹2, 6 pages and above at ₹1.
        The order's total pages (pages × copies of every document with the same paper, color and sides)
        picks one range, and every page is charged at that range's price. A page count no range covers
        uses the normal price above.
      </p>
    </div>

    <div class="surface-card-flat p-4 mb-4">
      <h3 class="mt-0 mb-3 text-base">{{ editingTierId() ? 'Update page range' : 'Add a page range' }}</h3>
      <div class="rate-form">
        <div class="rate-form__field">
          <label class="text-sm">Paper size</label>
          <p-select [options]="paperOptions" optionLabel="label" optionValue="value" [(ngModel)]="tierForm.paperSize" [disabled]="!!editingTierId()" styleClass="w-full" appendTo="body" />
        </div>
        <div class="rate-form__field">
          <label class="text-sm">Color</label>
          <p-select [options]="colorOptions" optionLabel="label" optionValue="value" [(ngModel)]="tierForm.colorMode" [disabled]="!!editingTierId()" styleClass="w-full" appendTo="body" />
        </div>
        <div class="rate-form__field">
          <label class="text-sm">Sides</label>
          <p-select [options]="sideOptions" optionLabel="label" optionValue="value" [(ngModel)]="tierForm.sideMode" [disabled]="!!editingTierId()" styleClass="w-full" appendTo="body" />
        </div>
        <div class="rate-form__field">
          <label class="text-sm">From pages</label>
          <p-inputNumber [(ngModel)]="tierForm.minPages" [min]="1" [useGrouping]="false" styleClass="w-full" inputStyleClass="w-full" />
        </div>
        <div class="rate-form__field">
          <label class="text-sm">To pages</label>
          <p-inputNumber [(ngModel)]="tierForm.maxPages" [min]="1" [useGrouping]="false" placeholder="No limit" styleClass="w-full" inputStyleClass="w-full" />
        </div>
        <div class="rate-form__field">
          <label class="text-sm">Price per page (₹)</label>
          <p-inputNumber [(ngModel)]="tierForm.pricePerPage" mode="decimal" [minFractionDigits]="2" styleClass="w-full" inputStyleClass="w-full" />
        </div>
        <div class="rate-form__actions">
          <p-button
            [label]="editingTierId() ? 'Update range' : 'Add range'"
            (onClick)="saveTier()"
            [loading]="savingTier()"
            [disabled]="!tierComboHasRate()"
          />
          @if (editingTierId()) {
            <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="cancelTierEdit()" />
          }
        </div>
      </div>
      @if (!tierComboHasRate()) {
        <p class="m-0 mt-3 text-sm text-color-secondary">
          <i class="pi pi-info-circle mr-1"></i>Set a normal price for {{ optionsLabel($any(tierForm)) }} first. It's used
          for any page count your ranges don't cover.
        </p>
      }
    </div>

    <p-table
      [tableStyle]="{ 'min-width': '40rem' }"
      [value]="tiers()"
      [loading]="loadingTiers()"
      styleClass="surface-card-flat"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 30%">Paper / color / sides</th>
          <th style="width: 20%">Pages in order</th>
          <th style="width: 18%">Price / page</th>
          <th style="width: 18%">Normal price</th>
          <th style="width: 14%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-tier>
        <tr>
          <td data-label="Paper / color / sides">{{ optionsLabel(tier) }}</td>
          <td data-label="Pages in order">{{ rangeLabel(tier) }}</td>
          <td data-label="Price / page">₹{{ tier.pricePerPage }}</td>
          <td data-label="Normal price" class="text-color-secondary">
            {{ fixedRateFor(tier) !== null ? '₹' + fixedRateFor(tier) : '—' }}
          </td>
          <td class="flex gap-2 justify-content-end">
            <p-button icon="pi pi-pencil" size="small" [text]="true" (onClick)="editTier(tier)" pTooltip="Edit" />
            <p-button
              icon="pi pi-trash"
              size="small"
              severity="danger"
              [text]="true"
              (onClick)="confirmDeleteTier(tier)"
              pTooltip="Remove"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="5">
            <div class="table-empty">
              <i class="pi pi-chart-bar"></i><span>No page ranges — every order is charged the normal price.</span>
            </div>
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
      .tier-intro {
        margin: 2.5rem 0 1rem;
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

  tiers = signal<PricingTier[]>([]);
  loadingTiers = signal(true);
  savingTier = signal(false);
  editingTierId = signal<string | null>(null);

  readonly paperLabels: Record<string, string> = PAPER_LABELS;
  readonly colorLabels: Record<string, string> = COLOR_LABELS;
  readonly sideLabels: Record<string, string> = SIDE_LABELS;
  readonly paperOptions = Object.entries(PAPER_LABELS).map(([value, label]) => ({ value, label }));
  readonly colorOptions = Object.entries(COLOR_LABELS).map(([value, label]) => ({ value, label }));
  readonly sideOptions = Object.entries(SIDE_LABELS).map(([value, label]) => ({ value, label }));
  readonly optionsLabel = printOptionsLabel;

  form: { paperSize: string; colorMode: string; sideMode: string; pricePerPage: number | null } = {
    paperSize: 'A4',
    colorMode: 'BW',
    sideMode: 'SIMPLEX',
    pricePerPage: null,
  };

  tierForm: {
    paperSize: string;
    colorMode: string;
    sideMode: string;
    minPages: number | null;
    maxPages: number | null;
    pricePerPage: number | null;
  } = this.emptyTierForm();

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    private readonly messageService: MessageService,
    private readonly confirmationService: ConfirmationService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadTiers();
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
      message: `Remove the ${printOptionsLabel(rate)} price? Customers can't choose this option until you set a new price, and its page ranges are removed too.`,
      header: 'Confirm',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.shopkeeperService.deletePricing(rate.id).subscribe(() => {
          this.messageService.add({ severity: 'success', summary: 'Rate removed' });
          if (this.editingId() === rate.id) this.cancelEdit();
          this.load();
          this.loadTiers();
        });
      },
    });
  }

  // ---- Quantity-based rates ----

  loadTiers(): void {
    this.loadingTiers.set(true);
    this.shopkeeperService.listPricingTiers().subscribe({
      next: (tiers) => {
        this.tiers.set(tiers);
        this.loadingTiers.set(false);
      },
      error: () => this.loadingTiers.set(false),
    });
  }

  rangeLabel(tier: PricingTier): string {
    if (tier.maxPages === null) return `${tier.minPages} and above`;
    if (tier.maxPages === tier.minPages) return `${tier.minPages}`;
    return `${tier.minPages}–${tier.maxPages}`;
  }

  fixedRateFor(combo: { paperSize: string; colorMode: string; sideMode: string }): string | null {
    const rate = this.rates().find(
      (r) => r.paperSize === combo.paperSize && r.colorMode === combo.colorMode && r.sideMode === combo.sideMode,
    );
    return rate ? rate.pricePerPage : null;
  }

  tierComboHasRate(): boolean {
    return this.loading() || this.fixedRateFor(this.tierForm) !== null;
  }

  editTier(tier: PricingTier): void {
    this.editingTierId.set(tier.id);
    this.tierForm = {
      paperSize: tier.paperSize,
      colorMode: tier.colorMode,
      sideMode: tier.sideMode,
      minPages: tier.minPages,
      maxPages: tier.maxPages,
      pricePerPage: Number(tier.pricePerPage),
    };
  }

  cancelTierEdit(): void {
    this.editingTierId.set(null);
    this.tierForm = this.emptyTierForm();
  }

  saveTier(): void {
    const { minPages, maxPages, pricePerPage } = this.tierForm;
    if (!minPages || !pricePerPage) {
      this.messageService.add({ severity: 'warn', summary: 'Enter "From pages" and a price per page' });
      return;
    }
    if (maxPages !== null && maxPages < minPages) {
      this.messageService.add({ severity: 'warn', summary: '"To pages" must be at least "From pages"' });
      return;
    }
    const range = { minPages, maxPages, pricePerPage };
    const editingId = this.editingTierId();
    const request = editingId
      ? this.shopkeeperService.updatePricingTier(editingId, range)
      : this.shopkeeperService.addPricingTier({
          paperSize: this.tierForm.paperSize,
          colorMode: this.tierForm.colorMode,
          sideMode: this.tierForm.sideMode,
          ...range,
        });
    this.savingTier.set(true);
    request.subscribe({
      next: () => {
        this.savingTier.set(false);
        this.messageService.add({ severity: 'success', summary: editingId ? 'Page range updated' : 'Page range added' });
        this.cancelTierEdit();
        this.loadTiers();
      },
      error: () => this.savingTier.set(false),
    });
  }

  confirmDeleteTier(tier: PricingTier): void {
    this.confirmationService.confirm({
      message: `Remove the ${this.rangeLabel(tier)} pages range for ${printOptionsLabel(tier)}? Orders in that range will be charged the normal price.`,
      header: 'Confirm',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.shopkeeperService.deletePricingTier(tier.id).subscribe(() => {
          this.messageService.add({ severity: 'success', summary: 'Page range removed' });
          if (this.editingTierId() === tier.id) this.cancelTierEdit();
          this.loadTiers();
        });
      },
    });
  }

  private emptyTierForm() {
    return { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', minPages: null, maxPages: null, pricePerPage: null };
  }
}
