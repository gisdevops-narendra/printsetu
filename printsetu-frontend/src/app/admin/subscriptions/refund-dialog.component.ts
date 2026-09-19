import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { BillingService } from '../../core/services/billing.service';
import { InvoiceRecord } from '../../core/models/billing.models';
import { money } from '../../shared/billing/billing.util';

/** Full or partial refund against a paid invoice; the reason is kept in the shop's history and the audit log. */
@Component({
  selector: 'app-refund-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule],
  template: `
    <p-dialog
      header="Issue a refund"
      [visible]="visible"
      (visibleChange)="visibleChange.emit($event)"
      (onShow)="reset()"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="true"
      [style]="{ width: 'min(30rem, calc(100vw - 1.5rem))' }"
    >
      @if (invoice) {
        <div class="sum">
          <div><span>Invoice</span><strong>{{ invoice.number }}</strong></div>
          <div><span>Paid</span><strong>{{ money(invoice.amount, invoice.currency) }}</strong></div>
          <div><span>Refundable</span><strong>{{ money(refundable(), invoice.currency) }}</strong></div>
        </div>
        <div class="field" [class.has-error]="touched() && !!amountError()">
          <label for="rf-amt">Refund amount (₹)</label>
          <div class="amt">
            <input id="rf-amt" type="number" inputmode="decimal" min="0.01" step="0.01" [(ngModel)]="amount" />
            <button type="button" class="link" (click)="amount = refundable()">Full amount</button>
          </div>
          @if (touched() && amountError()) { <span class="err">{{ amountError() }}</span> }
        </div>
        <div class="field" [class.has-error]="touched() && reason.trim().length < 3">
          <label for="rf-reason">Reason <small>(kept in the audit log)</small></label>
          <textarea id="rf-reason" rows="3" maxlength="300" [(ngModel)]="reason" placeholder="e.g. Charged twice, downgraded within the first week"></textarea>
          @if (touched() && reason.trim().length < 3) { <span class="err">Please give a short reason.</span> }
        </div>
        <p class="fine">This records the refund against the invoice. Returning the money to the shop happens outside PrintSetu (cash, bank transfer or your payment provider).</p>
      }
      <ng-template #footer>
        <button type="button" class="pf-btn" (click)="visibleChange.emit(false)" [disabled]="saving()">Cancel</button>
        <button type="button" class="pf-btn pf-btn--primary" (click)="submit()" [disabled]="saving()">
          @if (saving()) { <i class="pi pi-spin pi-spinner"></i> Refunding… } @else { <i class="pi pi-undo"></i> Issue refund }
        </button>
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .sum {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.5rem;
        margin-bottom: 1.25rem;
        padding: 0.875rem;
        border-radius: 14px;
        background: var(--bg-f8fafc);
      }
      .sum div {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        min-width: 0;
      }
      .sum span {
        font-size: 0.75rem;
        color: var(--tx-94a3b8);
      }
      .sum strong {
        font-size: 0.9375rem;
        color: var(--tx-0f172a);
        overflow-wrap: anywhere;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        margin-bottom: 1rem;
      }
      .field label {
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--tx-334155);
      }
      label small {
        font-weight: 500;
        color: var(--tx-94a3b8);
      }
      .field input,
      .field textarea {
        width: 100%;
        padding: 0.65rem 0.8rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 12px;
        background: var(--bg-f8fafc);
        font: inherit;
        font-size: 1rem;
        outline: none;
        resize: vertical;
      }
      .field input:focus,
      .field textarea:focus {
        border-color: var(--p-primary-500);
        background: var(--bg-ffffff);
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.14);
      }
      .has-error input,
      .has-error textarea {
        border-color: var(--bd-f0a3a3);
        background: var(--bg-fffafa);
      }
      .amt {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .link {
        flex: none;
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--accent-text-600);
        cursor: pointer;
      }
      .err {
        font-size: 0.75rem;
        color: var(--tx-b42318);
      }
      .fine {
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--tx-64748b);
      }
      @media (max-width: 420px) {
        .sum {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class RefundDialogComponent {
  @Input() invoice: InvoiceRecord | null = null;
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  readonly money = money;
  amount: number | null = null;
  reason = '';
  touched = signal(false);
  saving = signal(false);

  constructor(
    private readonly billing: BillingService,
    private readonly messages: MessageService,
  ) {}

  refundable(): number {
    if (!this.invoice) return 0;
    return Math.round((Number(this.invoice.amount) - Number(this.invoice.refundedAmount)) * 100) / 100;
  }

  amountError(): string {
    const a = Number(this.amount);
    if (!this.amount || a <= 0) return 'Enter an amount above zero.';
    if (a > this.refundable() + 0.001) return `You can refund at most ${money(this.refundable(), this.invoice?.currency)}.`;
    return '';
  }

  reset(): void {
    this.amount = this.refundable();
    this.reason = '';
    this.touched.set(false);
  }

  submit(): void {
    this.touched.set(true);
    if (!this.invoice || this.amountError() || this.reason.trim().length < 3) return;
    this.saving.set(true);
    this.billing.refund(this.invoice.id, { amount: Number(this.amount), reason: this.reason.trim() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.visibleChange.emit(false);
        this.messages.add({ severity: 'success', summary: 'Refund recorded' });
        this.done.emit();
      },
      error: () => this.saving.set(false),
    });
  }
}
