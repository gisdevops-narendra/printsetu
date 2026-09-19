import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface BarDatum {
  /** Shown in the tooltip, e.g. "Mon, 14 Sep". */
  title: string;
  /** Short x-axis label, e.g. "14". */
  axis: string;
  value: number;
}

interface Bar extends BarDatum {
  pct: number;
}

/**
 * Dependency-free bar chart. Plain HTML/CSS, so it is responsive at any width,
 * keyboard-focusable (each bar shows its value on focus/hover) and readable by
 * screen readers through the summary label.
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart" role="img" [attr.aria-label]="ariaLabel">
      <div class="plot">
        @for (t of ticks; track t.value) {
          <div class="tick" [style.bottom.%]="t.pct"><span>{{ t.label }}</span></div>
        }
        <div class="bars">
          @for (b of bars; track $index; let i = $index) {
            <div
              class="bar"
              tabindex="0"
              [class.is-last]="i === bars.length - 1"
              [class.is-zero]="b.value === 0"
              [class.tip-left]="i < 3"
              [class.tip-right]="i > bars.length - 4"
            >
              <span class="bar__fill" [style.height.%]="b.pct"></span>
              <span class="tip"><b>{{ format(b.value) }}</b><small>{{ b.title }}</small></span>
            </div>
          }
        </div>
      </div>
      <div class="axis">
        @for (b of bars; track $index; let i = $index) {
          <span [class.is-shown]="shown(i)">{{ b.axis }}</span>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .chart {
        --plot-h: 11rem;
      }
      .plot {
        position: relative;
        height: var(--plot-h);
        margin-left: 2.5rem;
      }
      .tick {
        position: absolute;
        left: 0;
        right: 0;
        height: 0;
        border-top: 1px dashed var(--bd-e6eaf2);
      }
      .tick span {
        position: absolute;
        left: -2.5rem;
        top: -0.5rem;
        width: 2.25rem;
        text-align: right;
        font-size: 0.6875rem;
        color: var(--tx-94a3b8);
        font-variant-numeric: tabular-nums;
      }
      .tick:first-child {
        border-top-style: solid;
      }
      .bars {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: flex-end;
        gap: clamp(2px, 0.6%, 6px);
      }
      .bar {
        position: relative;
        flex: 1 1 0;
        height: 100%;
        display: flex;
        align-items: flex-end;
        outline: none;
      }
      .bar__fill {
        display: block;
        width: 100%;
        min-height: 2px;
        border-radius: 5px 5px 2px 2px;
        background: linear-gradient(180deg, var(--p-primary-400), var(--p-primary-600));
        opacity: 0.78;
        transition: opacity 0.12s ease, transform 0.12s ease;
        transform-origin: bottom;
      }
      .bar.is-zero .bar__fill {
        background: var(--bg-e6eaf2);
        opacity: 1;
      }
      .bar.is-last .bar__fill {
        opacity: 1;
      }
      .bar:hover .bar__fill,
      .bar:focus-visible .bar__fill {
        opacity: 1;
        transform: scaleY(1.02);
      }
      .bar:focus-visible {
        outline: 2px solid var(--p-primary-400);
        outline-offset: 2px;
        border-radius: 4px;
      }
      .tip {
        position: absolute;
        bottom: calc(100% + 6px);
        left: 50%;
        z-index: 5;
        display: none;
        flex-direction: column;
        gap: 1px;
        transform: translateX(-50%);
        padding: 0.375rem 0.625rem;
        border-radius: 8px;
        background: #0f172a;
        color: #fff;
        white-space: nowrap;
        pointer-events: none;
      }
      .tip b {
        font-size: 0.8125rem;
      }
      .tip small {
        font-size: 0.6875rem;
        color: #cbd5e1;
      }
      .bar.tip-left .tip {
        left: 0;
        transform: none;
      }
      .bar.tip-right .tip {
        left: auto;
        right: 0;
        transform: none;
      }
      .bar:hover .tip,
      .bar:focus-visible .tip {
        display: flex;
      }
      .axis {
        display: flex;
        gap: clamp(2px, 0.6%, 6px);
        margin: 0.5rem 0 0 2.5rem;
      }
      .axis span {
        flex: 1 1 0;
        min-width: 0;
        text-align: center;
        font-size: 0.6875rem;
        color: transparent;
        white-space: nowrap;
      }
      .axis span.is-shown {
        color: var(--tx-94a3b8);
      }
      @media (max-width: 520px) {
        .chart {
          --plot-h: 9rem;
        }
      }
    `,
  ],
})
export class BarChartComponent {
  bars: Bar[] = [];
  ticks: { value: number; pct: number; label: string }[] = [];
  private step = 1;

  @Input() ariaLabel = 'Bar chart';
  /** Formats a value for the tooltip and axis (e.g. as rupees). */
  @Input() format: (n: number) => string = (n) => String(n);

  @Input() set data(value: BarDatum[]) {
    const max = Math.max(0, ...value.map((d) => d.value));
    const top = this.niceMax(max);
    this.ticks = [0, 1, 2, 3, 4].map((i) => ({ value: (top * i) / 4, pct: i * 25, label: this.short((top * i) / 4) }));
    this.bars = value.map((d) => ({ ...d, pct: top ? (d.value / top) * 100 : 0 }));
    this.step = Math.max(1, Math.ceil(value.length / 8));
  }

  shown(i: number): boolean {
    // Every Nth label, always including the last (today).
    return i % this.step === (this.bars.length - 1) % this.step;
  }

  /** Smallest "round" ceiling (1, 2, 4, 5, 8, 10 x 10^k) that fits the data, so the axis reads cleanly. */
  private niceMax(max: number): number {
    if (max <= 0) return 4;
    const exp = Math.pow(10, Math.floor(Math.log10(max)));
    const frac = max / exp;
    const nice = [1, 2, 4, 5, 8, 10].find((n) => frac <= n) ?? 10;
    return nice * exp;
  }

  private short(n: number): string {
    if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`;
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  }
}
