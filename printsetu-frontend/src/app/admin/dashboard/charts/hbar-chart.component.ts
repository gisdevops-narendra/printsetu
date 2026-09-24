import { Component, computed, input, output } from '@angular/core';
import { TooltipModule } from 'primeng/tooltip';

export interface HBarSeries {
  name: string;
  /** CSS colour (a --viz-* custom property). */
  color: string;
}

export interface HBarRow {
  /** Emitted by (rowSelect) when the row's label is clicked. */
  id?: string;
  label: string;
  sublabel?: string;
  /** One value per series, stacked left to right. */
  values: number[];
}

/**
 * Ranked horizontal bars, one row per shop. With several series the bar is
 * stacked (2px surface gap between segments) and a legend is shown. The
 * total sits at the bar tip; each segment's own value is on hover/focus.
 */
@Component({
  selector: 'app-hbar-chart',
  standalone: true,
  imports: [TooltipModule],
  template: `
    @if (series().length > 1) {
      <ul class="legend">
        @for (s of series(); track s.name) {
          <li><span class="swatch" [style.background]="s.color"></span>{{ s.name }}</li>
        }
      </ul>
    }
    @if (rows().length === 0) {
      <div class="empty">{{ emptyText() }}</div>
    } @else {
      <ol class="rows">
        @for (row of rows(); track row.label + $index) {
          <li class="row">
            @if (row.id && selectable()) {
              <button type="button" class="label label--link" (click)="rowSelect.emit(row.id)">
                <span class="name">{{ row.label }}</span>
                @if (row.sublabel) {
                  <span class="sub">{{ row.sublabel }}</span>
                }
              </button>
            } @else {
              <span class="label">
                <span class="name">{{ row.label }}</span>
                @if (row.sublabel) {
                  <span class="sub">{{ row.sublabel }}</span>
                }
              </span>
            }
            <span class="track">
              <span class="bar" [style.width.%]="pct(total(row))">
                @for (v of row.values; track $index; let si = $index) {
                  @if (v > 0) {
                    <span
                      class="seg"
                      tabindex="0"
                      [style.flex-grow]="v"
                      [style.background]="series()[si].color"
                      [pTooltip]="series()[si].name + ': ' + fmt(v)"
                      tooltipPosition="top"
                      [attr.aria-label]="row.label + ', ' + series()[si].name + ': ' + fmt(v)"
                    ></span>
                  }
                }
              </span>
              <span class="value" [style.left]="'calc(' + pct(total(row)) + '% + 0.5rem)'">{{
                fmt(total(row))
              }}</span>
            </span>
          </li>
        }
      </ol>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        --viz-surface: #ffffff;
        --viz-track: #f1f5f9;
        --viz-ink: #0f172a;
        --viz-muted: #64748b;
        --viz-link: var(--accent-text-600);
      }
      :host-context(html.app-dark) {
        --viz-surface: #111a2e;
        --viz-track: #18233b;
        --viz-ink: #f1f5f9;
        --viz-muted: #94a3b8;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem 1rem;
        list-style: none;
        margin: 0 0 0.75rem;
        padding: 0;
        font-size: 0.75rem;
        color: var(--viz-muted);
      }
      .legend li {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .swatch {
        width: 10px;
        height: 10px;
        border-radius: 2px;
      }
      .rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
      }
      .row {
        display: grid;
        grid-template-columns: minmax(6rem, 34%) 1fr;
        align-items: center;
        gap: 0.75rem;
      }
      .label {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .label--link {
        border: 0;
        background: none;
        padding: 0;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .label--link:hover .name,
      .label--link:focus-visible .name {
        color: var(--viz-link);
        text-decoration: underline;
      }
      .name {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--viz-ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sub {
        font-size: 0.6875rem;
        color: var(--viz-muted);
      }
      /* The right margin keeps room for the value at the longest bar's tip. */
      .track {
        position: relative;
        display: flex;
        align-items: center;
        min-width: 0;
        height: 18px;
        margin-right: 5rem;
      }
      .bar {
        display: flex;
        gap: 2px;
        height: 16px;
        min-width: 4px;
      }
      .seg {
        height: 100%;
        min-width: 3px;
        outline: none;
        transition: opacity 0.12s ease;
      }
      .seg:last-child {
        border-radius: 0 4px 4px 0;
      }
      .seg:hover,
      .seg:focus-visible {
        opacity: 0.8;
      }
      .value {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        white-space: nowrap;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--viz-ink);
        font-variant-numeric: tabular-nums;
      }
      .empty {
        padding: 1.5rem 0;
        text-align: center;
        font-size: 0.8125rem;
        color: var(--viz-muted);
      }
    `,
  ],
})
export class HBarChartComponent {
  rows = input.required<HBarRow[]>();
  series = input.required<HBarSeries[]>();
  format = input<'count' | 'inr' | 'pages'>('count');
  emptyText = input('Nothing in this period.');
  /** Row labels become buttons that emit the row's id. */
  selectable = input(false);
  rowSelect = output<string>();

  private max = computed(() => Math.max(0, ...this.rows().map((r) => this.total(r))));

  total(row: HBarRow): number {
    return row.values.reduce((a, b) => a + b, 0);
  }

  pct(value: number): number {
    return this.max() > 0 ? (value / this.max()) * 100 : 0;
  }

  fmt(value: number): string {
    if (this.format() === 'inr') {
      return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return value.toLocaleString('en-IN');
  }
}
