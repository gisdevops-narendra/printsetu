import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  signal,
  viewChild,
} from '@angular/core';

export interface TrendPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 26, left: 48 };
const MAX_BAR = 24;

/** Clean ticks from 0 to just above `max`: a 1/2/2.5/5 x 10^n step, 3-5 intervals. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1, 2, 3, 4];
  const rough = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough)!;
  const count = Math.max(3, Math.ceil(max / step));
  return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/**
 * One series over days: columns (counts) or a line with a light area wash
 * (money). Hover/focus shows the exact value; a column's own band is its
 * hit target, the line uses a crosshair that snaps to the nearest day.
 */
@Component({
  selector: 'app-trend-chart',
  standalone: true,
  template: `
    <div class="trend" #host>
      @if (width() > 0) {
        <svg
          [attr.width]="width()"
          [attr.height]="height"
          [attr.aria-label]="ariaLabel()"
          role="img"
          (pointermove)="kind() === 'line' && onLineMove($event)"
          (pointerleave)="hover.set(null)"
        >
          @for (t of ticks(); track $index) {
            <line
              class="grid"
              [attr.x1]="pad.left"
              [attr.x2]="width() - pad.right"
              [attr.y1]="y(t)"
              [attr.y2]="y(t)"
            />
            <text
              class="tick"
              [attr.x]="pad.left - 8"
              [attr.y]="y(t)"
              text-anchor="end"
              dominant-baseline="middle"
            >
              {{ tickLabel(t) }}
            </text>
          }
          @for (p of points(); track p.date; let i = $index) {
            @if (showXLabel(i)) {
              <text class="tick" [attr.x]="x(i)" [attr.y]="height - 6" text-anchor="middle">
                {{ short(p.date) }}
              </text>
            }
          }

          @if (kind() === 'column') {
            @for (p of points(); track p.date; let i = $index) {
              <g
                class="col"
                [class.col--hover]="hover() === i"
                tabindex="0"
                [attr.aria-label]="short(p.date) + ': ' + valueLabel(p.value)"
                (pointerenter)="hover.set(i)"
                (focus)="hover.set(i)"
                (blur)="hover.set(null)"
              >
                <rect
                  class="hit"
                  [attr.x]="x(i) - band() / 2"
                  [attr.y]="pad.top"
                  [attr.width]="band()"
                  [attr.height]="plotH()"
                />
                @if (p.value > 0) {
                  <path class="bar" [attr.d]="columnPath(i, p.value)" />
                }
              </g>
            }
          } @else {
            <path class="area" [attr.d]="areaPath()" />
            <path class="line" [attr.d]="linePath()" />
            @if (points().length === 1) {
              <circle class="dot" [attr.cx]="x(0)" [attr.cy]="y(points()[0].value)" r="4" />
            }
            @if (hover() !== null) {
              <line
                class="crosshair"
                [attr.x1]="x(hover()!)"
                [attr.x2]="x(hover()!)"
                [attr.y1]="pad.top"
                [attr.y2]="pad.top + plotH()"
              />
              <circle
                class="dot"
                [attr.cx]="x(hover()!)"
                [attr.cy]="y(points()[hover()!].value)"
                r="4"
              />
            }
          }
          <line
            class="baseline"
            [attr.x1]="pad.left"
            [attr.x2]="width() - pad.right"
            [attr.y1]="y(0)"
            [attr.y2]="y(0)"
          />
        </svg>

        @if (hover() !== null) {
          <div class="tip" [style.left.px]="tipLeft()" [style.top.px]="pad.top">
            <strong>{{ valueLabel(points()[hover()!].value) }}</strong>
            <span>{{ short(points()[hover()!].date) }}</span>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        --viz-series: #2a78d6;
        --viz-surface: #ffffff;
        --viz-grid: #eef1f6;
        --viz-axis: #cbd5e1;
        --viz-muted: #64748b;
        --viz-ink: #0f172a;
      }
      :host-context(html.app-dark) {
        --viz-series: #3987e5;
        --viz-surface: #111a2e;
        --viz-grid: #1c2740;
        --viz-axis: #2b3a5a;
        --viz-muted: #94a3b8;
        --viz-ink: #f1f5f9;
      }
      .trend {
        position: relative;
        width: 100%;
        height: 200px;
      }
      svg {
        display: block;
        overflow: visible;
      }
      .grid {
        stroke: var(--viz-grid);
        stroke-width: 1;
      }
      .baseline {
        stroke: var(--viz-axis);
        stroke-width: 1;
      }
      .tick {
        fill: var(--viz-muted);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
      }
      .hit {
        fill: transparent;
      }
      .bar {
        fill: var(--viz-series);
        transition: opacity 0.12s ease;
      }
      .col {
        outline: none;
        cursor: default;
      }
      .col--hover .hit {
        fill: var(--viz-grid);
        opacity: 0.6;
      }
      .col--hover .bar {
        opacity: 0.85;
      }
      .line {
        fill: none;
        stroke: var(--viz-series);
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .area {
        fill: var(--viz-series);
        opacity: 0.1;
      }
      .crosshair {
        stroke: var(--viz-axis);
        stroke-width: 1;
      }
      .dot {
        fill: var(--viz-series);
        stroke: var(--viz-surface);
        stroke-width: 2;
      }
      .tip {
        position: absolute;
        transform: translate(-50%, -100%);
        pointer-events: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.1rem;
        padding: 0.35rem 0.6rem;
        border-radius: 8px;
        background: var(--viz-surface);
        border: 1px solid var(--viz-axis);
        box-shadow: 0 6px 16px -8px rgba(15, 23, 42, 0.35);
        white-space: nowrap;
        font-size: 0.75rem;
        color: var(--viz-muted);
        z-index: 2;
      }
      .tip strong {
        font-size: 0.875rem;
        color: var(--viz-ink);
      }
    `,
  ],
})
export class TrendChartComponent implements AfterViewInit, OnDestroy {
  points = input.required<TrendPoint[]>();
  kind = input<'column' | 'line'>('column');
  format = input<'count' | 'inr'>('count');
  ariaLabel = input('');

  readonly height = HEIGHT;
  readonly pad = PAD;
  width = signal(0);
  hover = signal<number | null>(null);

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private observer?: ResizeObserver;

  ticks = computed(() => niceTicks(Math.max(0, ...this.points().map((p) => p.value))));
  plotW = computed(() => Math.max(0, this.width() - PAD.left - PAD.right));
  plotH = computed(() => HEIGHT - PAD.top - PAD.bottom);
  band = computed(() => this.plotW() / Math.max(1, this.points().length));

  ngAfterViewInit(): void {
    const el = this.host().nativeElement;
    this.observer = new ResizeObserver(() => this.width.set(el.clientWidth));
    this.observer.observe(el);
    this.width.set(el.clientWidth);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  x(i: number): number {
    return PAD.left + this.band() * (i + 0.5);
  }

  y(value: number): number {
    const top = this.ticks()[this.ticks().length - 1] || 1;
    return PAD.top + this.plotH() * (1 - value / top);
  }

  /** Column with a 4px rounded top, square at the baseline. */
  columnPath(i: number, value: number): string {
    const w = Math.max(2, Math.min(MAX_BAR, this.band() * 0.6));
    const x0 = this.x(i) - w / 2;
    const yTop = this.y(value);
    const yBase = this.y(0);
    const r = Math.min(4, w / 2, (yBase - yTop) / 2);
    return (
      `M${x0},${yBase} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} ` +
      `H${x0 + w - r} Q${x0 + w},${yTop} ${x0 + w},${yTop + r} V${yBase} Z`
    );
  }

  linePath(): string {
    return this.points()
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${this.x(i)},${this.y(p.value)}`)
      .join(' ');
  }

  areaPath(): string {
    const pts = this.points();
    if (pts.length < 2) return '';
    return `${this.linePath()} L${this.x(pts.length - 1)},${this.y(0)} L${this.x(0)},${this.y(0)} Z`;
  }

  onLineMove(event: PointerEvent): void {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const i = Math.floor((event.clientX - rect.left - PAD.left) / this.band());
    this.hover.set(i >= 0 && i < this.points().length ? i : null);
  }

  /** Every Nth day label so they never collide (~56px each). */
  showXLabel(i: number): boolean {
    return i % Math.max(1, Math.ceil(56 / this.band())) === 0;
  }

  tipLeft(): number {
    const i = this.hover() ?? 0;
    return Math.min(Math.max(this.x(i), 60), this.width() - 60);
  }

  short(date: string): string {
    return shortDate(date);
  }

  tickLabel(value: number): string {
    if (this.format() === 'inr') {
      return value >= 1000
        ? `₹${(value / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}k`
        : `₹${value}`;
    }
    return value.toLocaleString('en-IN');
  }

  valueLabel(value: number): string {
    if (this.format() === 'inr') {
      return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${value.toLocaleString('en-IN')} ${value === 1 ? 'order' : 'orders'}`;
  }
}
