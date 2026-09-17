import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';

export interface PriceSummaryLine {
  label: string;
  value: string;
}

@Component({
  selector: 'app-price-summary-card',
  standalone: true,
  imports: [CommonModule, CardModule, DividerModule],
  template: `
    <p-card styleClass="price-summary-card">
      <div class="flex flex-column gap-2">
        @for (line of lines; track line.label) {
          <div class="flex justify-content-between text-sm text-color-secondary">
            <span>{{ line.label }}</span>
            <span class="text-color">{{ line.value }}</span>
          </div>
        }
      </div>
      <p-divider />
      <div class="flex justify-content-between align-items-center">
        <span class="font-medium text-lg">Total</span>
        <span class="font-bold text-2xl" style="color: var(--p-primary-color)">{{ currency }} {{ amount }}</span>
      </div>
    </p-card>
  `,
})
export class PriceSummaryCardComponent {
  @Input() lines: PriceSummaryLine[] = [];
  @Input() amount = '0.00';
  @Input() currency = 'INR';
}
