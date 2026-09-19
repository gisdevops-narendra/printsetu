import { Component, NgZone, OnDestroy, OnInit, inject, signal } from '@angular/core';

/**
 * Current date and time with the timezone, so an admin looking at shops in other
 * cities always knows which clock they are reading. Hover for the UTC time.
 */
@Component({
  selector: 'app-header-clock',
  standalone: true,
  template: `
    <span class="clock" [attr.title]="tooltip()">
      <i class="pi pi-clock"></i>
      <span class="clock__date">{{ date() }}</span>
      <strong class="clock__time">{{ time() }}</strong>
      <span class="clock__tz">{{ zone() }}</span>
    </span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .clock {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.75rem;
        color: var(--hdr-muted);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .clock i {
        font-size: 0.75rem;
      }
      .clock__time {
        color: var(--hdr-text);
        font-weight: 700;
      }
      .clock__tz {
        padding: 0.05rem 0.4rem;
        border-radius: 6px;
        background: var(--hdr-field);
        font-weight: 700;
        font-size: 0.6875rem;
      }
    `,
  ],
})
export class HeaderClockComponent implements OnInit, OnDestroy {
  private readonly now = signal(new Date());
  private timer?: ReturnType<typeof setInterval>;
  private readonly zoneRef = inject(NgZone);

  readonly date = () => this.now().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
  readonly time = () => this.now().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  readonly zone = () => {
    const part = new Intl.DateTimeFormat('en-IN', { timeZoneName: 'short' }).formatToParts(this.now()).find((p) => p.type === 'timeZoneName');
    return part?.value ?? '';
  };
  readonly tooltip = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const utc = this.now().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    return `${tz} · ${utc} UTC`;
  };

  ngOnInit(): void {
    // Tick once a minute (the display has no seconds) without waking change detection for the rest of the app.
    this.zoneRef.runOutsideAngular(() => {
      this.timer = setInterval(() => this.zoneRef.run(() => this.now.set(new Date())), 30_000);
    });
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
