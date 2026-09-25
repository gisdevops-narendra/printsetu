import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { copyText, downloadUrl } from '../../utils/browser.util';
import { t } from '../../../core/i18n/i18n';

export interface QrData {
  dataUrl: string;
  url: string;
  code: string;
}

/**
 * The shop's QR code, presented as what it is used for: a printable counter
 * sign. Shows a live preview of the sign and offers everything a shopkeeper
 * does with it — print it, download it, share the link, or show the code
 * full-screen to a customer standing at the counter.
 *
 * The sign scales with container-query units, so the same markup is the
 * on-screen preview and (via the global print stylesheet) the A4 printout.
 */
@Component({
  selector: 'app-qr-panel',
  standalone: true,
  imports: [TranslatePipe, CommonModule],
  template: `
    <div class="qrp">
      <!-- ============ Sign preview ============ -->
      <div class="qrp__preview">
        <div class="stage">
          <div class="poster print-poster" role="img" [attr.aria-label]="shopName ? ('qrPanel.counter_sign_for' | translate: { shop: shopName }) : ('qrPanel.counter_sign_with_qr_code' | translate)">
            <div class="poster__band">PrintSetu</div>
            <h2 class="poster__title">{{ 'qrPanel.scan_to_print' | translate }}</h2>
            @if (shopName) {
              <p class="poster__shop">{{ shopName }}</p>
            }
            <div class="poster__qr"><img [src]="qr.dataUrl" alt="" /></div>
            <p class="poster__hint">{{ 'qrPanel.point_your_phone_camera_at_the' | translate }}</p>
            <ol class="poster__steps">
              <li><b>1</b><span>{{ 'qrPanel.scan' | translate }}</span></li>
              <li><b>2</b><span>{{ 'qrPanel.upload_your_files' | translate }}</span></li>
              <li><b>3</b><span>{{ 'qrPanel.collect_at_the_counter' | translate }}</span></li>
            </ol>
            <p class="poster__url">{{ shortUrl }}</p>
          </div>
        </div>
        <p class="qrp__caption"><i class="pi pi-info-circle"></i> {{ 'qrPanel.sign_preview_prints_on_a4' | translate }}</p>
      </div>

      <!-- ============ Actions ============ -->
      <div class="qrp__side">
        <section class="card">
          <h2 class="card__title">{{ 'qrPanel.print_share' | translate }}</h2>
          <button type="button" class="btn btn--primary" (click)="printSign()">
            <i class="pi pi-print"></i> {{ 'qrPanel.print_sign' | translate }}
          </button>
          <div class="grid2">
            <button type="button" class="btn btn--outline" (click)="downloadSign()" [disabled]="busy()">
              <i class="pi" [ngClass]="busy() ? 'pi-spin pi-spinner' : 'pi-download'"></i> {{ 'qrPanel.download_sign' | translate }}
            </button>
            <button type="button" class="btn btn--outline" (click)="downloadQr()">
              <i class="pi pi-qrcode"></i> {{ 'qrPanel.qr_image_only' | translate }}
            </button>
          </div>
          <div class="grid2">
            <button type="button" class="tile" (click)="copyLink()"><i class="pi pi-copy"></i><span>{{ 'common.copy_link' | translate }}</span></button>
            <button type="button" class="tile" (click)="share()"><i class="pi pi-share-alt"></i><span>{{ 'common.share' | translate }}</span></button>
          </div>
        </section>

        <section class="card">
          <h2 class="card__title">{{ 'qrPanel.your_link' | translate }}</h2>
          <div class="linkbox">
            <span class="linkbox__url" [title]="qr.url">{{ qr.url }}</span>
            <button type="button" class="iconbtn" (click)="copyLink()" [attr.aria-label]="'common.copy_link' | translate"><i class="pi pi-copy"></i></button>
            <a class="iconbtn" [href]="qr.url" target="_blank" rel="noopener" [attr.aria-label]="'qrPanel.open_the_customer_page_in_a' | translate"><i class="pi pi-external-link"></i></a>
          </div>
          <div class="meta"><span>{{ 'qrPanel.code' | translate }}</span><code>{{ qr.code }}</code></div>
        </section>

        <section class="card card--soft">
          <h2 class="card__title">{{ 'qrPanel.where_to_put_it' | translate }}</h2>
          <ul class="tips">
            <li><i class="pi pi-check-circle"></i> {{ 'qrPanel.at_the_counter_at_eye_level' | translate }}</li>
            <li><i class="pi pi-check-circle"></i> {{ 'qrPanel.keep_the_code_flat_and_clean' | translate }}</li>
            <li><i class="pi pi-check-circle"></i> {{ 'qrPanel.scan_it_yourself_once_after_printing' | translate }}</li>
          </ul>
        </section>

        @if (canRegenerate) {
          <section class="card card--danger">
            <div>
              <h2 class="card__title">{{ 'qrPanel.need_a_new_code' | translate }}</h2>
              <p class="note">{{ 'qrPanel.the_old_printed_sign_stops_working' | translate }}</p>
            </div>
            <button type="button" class="btn btn--danger" (click)="regenerate.emit()"><i class="pi pi-refresh"></i> {{ 'qrPanel.make_a_new_code' | translate }}</button>
          </section>
        } @else {
          <p class="note note--center">{{ 'qrPanel.sign_damaged_or_misused_ask_your' | translate }}</p>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        --ink: var(--tx-0f172a);
        --muted: var(--tx-64748b);
        --line: var(--bd-e6eaf2);
        --brand: var(--p-primary-600);
      }
      .qrp {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: clamp(1rem, 2.5vw, 2rem);
        align-items: start;
      }
      @media (min-width: 900px) {
        .qrp {
          grid-template-columns: minmax(300px, 420px) minmax(0, 1fr);
        }
        .qrp__preview {
          position: sticky;
          top: 0;
        }
      }

      /* ---------- Sign ---------- */
      .stage {
        padding: clamp(1rem, 3vw, 1.75rem);
        border-radius: 20px;
        background: linear-gradient(180deg, var(--bg-eef2ff) 0%, var(--bg-f1f5f9) 100%);
        border: 1px solid var(--line);
      }
      .poster {
        container-type: inline-size;
        width: 100%;
        max-width: 380px;
        margin: 0 auto;
        aspect-ratio: 210 / 297;
        display: flex;
        flex-direction: column;
        align-items: center;
        overflow: hidden;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16), 0 2px 6px rgba(15, 23, 42, 0.06);
        /* The sign is printed, so its colours stay the same in light and dark mode. */
        --ink: #0f172a;
        --muted: #64748b;
        --line: #e6eaf2;
        color: var(--ink);
        text-align: center;
      }
      .poster__band {
        width: 100%;
        padding: 5.5cqw 0;
        background: linear-gradient(135deg, var(--p-primary-700), var(--p-primary-500));
        color: #fff;
        font-size: 5cqw;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .poster__title {
        margin: 7cqw 0 0;
        font-size: 11cqw;
        line-height: 1;
        font-weight: 800;
        letter-spacing: -0.035em;
      }
      .poster__shop {
        max-width: 86%;
        margin: 2cqw 0 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 4.6cqw;
        font-weight: 600;
        color: #475569;
      }
      .poster__qr {
        margin-top: 5cqw;
        width: 56cqw;
        padding: 3cqw;
        border: 0.6cqw solid var(--line);
        border-radius: 4cqw;
        background: #fff;
      }
      .poster__qr img {
        display: block;
        width: 100%;
        height: auto;
        image-rendering: pixelated;
      }
      .poster__hint {
        margin: 4cqw 0 0;
        font-size: 3.3cqw;
        color: var(--muted);
      }
      .poster__steps {
        display: flex;
        gap: 2.5cqw;
        width: 88%;
        margin: auto 0 0;
        padding: 0;
        list-style: none;
      }
      .poster__steps li {
        flex: 1 1 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.4cqw;
        font-size: 2.9cqw;
        line-height: 1.25;
        color: #334155;
      }
      .poster__steps b {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 7cqw;
        height: 7cqw;
        border-radius: 50%;
        /* Fixed colours: the sign is printed, so it looks the same in light and dark mode. */
        background: #eef2ff;
        color: #4338ca;
        font-size: 3.4cqw;
      }
      .poster__url {
        margin: 3.5cqw 0 4.5cqw;
        max-width: 90%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 2.6cqw;
        color: #64748b;
      }
      .qrp__caption {
        margin: 0.75rem 0 0;
        text-align: center;
        font-size: 0.75rem;
        color: var(--muted);
      }

      /* ---------- Right column ---------- */
      .qrp__side {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 0;
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 0.875rem;
        padding: clamp(1rem, 2vw, 1.5rem);
        background: var(--bg-ffffff);
        border: 1px solid var(--line);
        border-radius: 16px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .card--soft {
        background: var(--bg-f8fafc);
        box-shadow: none;
      }
      .card--danger {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        border-color: var(--bd-fecaca);
        background: var(--bg-fffafa);
      }
      .card__title {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        min-height: 3rem;
        padding: 0 1.25rem;
        border: 1.5px solid transparent;
        border-radius: 12px;
        font: inherit;
        font-size: 0.9375rem;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        transition: background 0.15s ease, border-color 0.15s ease, transform 0.08s ease;
      }
      .btn:active:not(:disabled) {
        transform: scale(0.985);
      }
      .btn:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .btn--primary {
        min-height: 3.25rem;
        background: var(--brand);
        color: #fff;
        box-shadow: 0 6px 16px rgba(79, 70, 229, 0.25);
      }
      .btn--primary:hover {
        background: var(--p-primary-700);
      }
      .btn--outline {
        background: var(--bg-ffffff);
        border-color: var(--bd-d6dcec);
        color: var(--tx-334155);
      }
      .btn--outline:hover:not(:disabled) {
        border-color: var(--p-primary-300);
        color: var(--accent-text-700);
      }
      .btn--danger {
        flex: 0 0 auto;
        background: var(--bg-ffffff);
        border-color: var(--bd-fca5a5);
        color: var(--tx-b91c1c);
      }
      .btn--danger:hover {
        background: var(--bg-fef2f2);
      }
      .grid2 {
        display: grid;
        gap: 0.625rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.375rem;
        padding: 0.875rem 0.25rem;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--bg-f8fafc);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-334155);
        cursor: pointer;
      }
      .tile i {
        font-size: 1.125rem;
        color: var(--brand);
      }
      .tile:hover {
        background: var(--p-primary-50);
        border-color: var(--p-primary-200);
      }
      .linkbox {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.25rem 0.25rem 0.875rem;
        background: var(--bg-f8fafc);
        border: 1px solid var(--line);
        border-radius: 12px;
      }
      .linkbox__url {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.8125rem;
        color: var(--tx-475569);
      }
      .iconbtn {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: var(--tx-64748b);
        cursor: pointer;
        text-decoration: none;
      }
      .iconbtn:hover {
        background: var(--bg-e8edf7);
        color: var(--ink);
      }
      .meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        font-size: 0.8125rem;
        color: var(--muted);
      }
      .meta code {
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        background: var(--bg-eef1f7);
        font-weight: 700;
        letter-spacing: 0.04em;
        color: var(--tx-475569);
      }
      .tips {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 0.875rem;
        line-height: 1.45;
        color: var(--tx-475569);
      }
      .tips i {
        margin-right: 0.5rem;
        color: var(--tx-16a34a);
      }
      .note {
        margin: 0.25rem 0 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--muted);
      }
      .note--center {
        text-align: center;
      }
      @media (max-width: 520px) {
        .btn {
          padding: 0 0.75rem;
          font-size: 0.875rem;
          white-space: nowrap;
        }
        .card--danger {
          flex-direction: column;
          align-items: stretch;
        }
      }
    `,
  ],
})
export class QrPanelComponent {
  @Input({ required: true }) qr!: QrData;
  @Input() shopName: string | null = null;
  /** Admin view only: shows the regenerate control. */
  @Input() canRegenerate = false;
  @Output() regenerate = new EventEmitter<void>();

  busy = signal(false);

  constructor(private readonly messageService: MessageService) {}

  get shortUrl(): string {
    return this.qr.url.replace(/^https?:\/\//, '');
  }

  printSign(): void {
    // The global print stylesheet (styles.scss) shows only `.print-poster`.
    window.print();
  }

  downloadQr(): void {
    downloadUrl(this.qr.dataUrl, 'printsetu-shop-qr.png');
  }

  async copyLink(): Promise<void> {
    const ok = await copyText(this.qr.url);
    this.messageService.add(
      ok
        ? { severity: 'success', get summary() { return t('common.link_copied'); } }
        : { severity: 'warn', get summary() { return t('qrPanel.couldnt_copy_automatically'); }, get detail() { return t('qrPanel.long_press_the_link_to_copy'); } },
    );
  }

  async share(): Promise<void> {
    const text = this.shopName
      ? t('qrPanel.send_documents_at_shop', { shop: this.shopName })
      : t('qrPanel.send_your_documents_for_printing');
    if (navigator.share) {
      try {
        await navigator.share({ title: this.shopName ? t('qrPanel.print_at', { shopName: this.shopName }) : t('qrPanel.print_with_printsetu'), text, url: this.qr.url });
      } catch {
        // dismissed by the user
      }
      return;
    }
    // No Web Share here (desktop / plain-http origin): WhatsApp works everywhere.
    window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + this.qr.url)}`, '_blank', 'noopener');
  }

  /** Renders the same sign onto an A4 canvas (150 dpi) and downloads it as a PNG. */
  async downloadSign(): Promise<void> {
    this.busy.set(true);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const img = await this.loadImage(this.qr.dataUrl);
      const W = 1240;
      const H = 1754;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      const font = (w: number, px: number) => `${w} ${px}px Inter, "Noto Sans Devanagari", "Noto Sans Gujarati", system-ui, -apple-system, "Segoe UI", sans-serif`;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // brand band
      const band = ctx.createLinearGradient(0, 0, W, 240);
      band.addColorStop(0, '#4338ca');
      band.addColorStop(1, '#6366f1');
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, W, 190);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font(700, 62);
      ctx.fillText('PrintSetu', W / 2, 96);

      // title + shop
      ctx.fillStyle = '#0f172a';
      ctx.font = font(800, 136);
      ctx.fillText(t('qrPanel.scan_to_print'), W / 2, 340);
      if (this.shopName) {
        ctx.fillStyle = '#475569';
        ctx.font = font(600, 54);
        ctx.fillText(this.fit(ctx, this.shopName, W * 0.82), W / 2, 442);
      }

      // QR in a rounded frame
      const frame = 700;
      const fx = (W - frame) / 2;
      const fy = 520;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#e6eaf2';
      ctx.lineWidth = 8;
      this.roundRect(ctx, fx, fy, frame, frame, 48);
      ctx.fill();
      ctx.stroke();
      ctx.imageSmoothingEnabled = false; // keep the QR modules crisp
      ctx.drawImage(img, fx + 40, fy + 40, frame - 80, frame - 80);
      ctx.imageSmoothingEnabled = true;

      ctx.fillStyle = '#64748b';
      ctx.font = font(500, 40);
      ctx.fillText(t('qrPanel.point_your_phone_camera_at_the'), W / 2, fy + frame + 76);

      // three steps
      const steps = [t('qrPanel.scan'), t('qrPanel.upload_your_files'), t('qrPanel.collect_at_the_counter')];
      const colW = 330;
      const gap = 40;
      const startX = (W - (colW * 3 + gap * 2)) / 2;
      steps.forEach((label, i) => {
        const cx = startX + i * (colW + gap) + colW / 2;
        ctx.fillStyle = '#eef2ff';
        ctx.beginPath();
        ctx.arc(cx, 1436, 44, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4338ca';
        ctx.font = font(700, 44);
        ctx.fillText(String(i + 1), cx, 1438);
        ctx.fillStyle = '#334155';
        ctx.font = font(600, 38);
        this.wrap(ctx, label, colW, 2).forEach((line, n) => ctx.fillText(line, cx, 1520 + n * 46));
      });

      ctx.fillStyle = '#94a3b8';
      ctx.font = font(500, 32);
      ctx.fillText(this.fit(ctx, this.shortUrl, W * 0.88), W / 2, 1670);

      const name = (this.shopName ?? 'shop').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
      downloadUrl(canvas.toDataURL('image/png'), `printsetu-qr-sign-${name}.png`);
    } catch {
      this.messageService.add({ severity: 'error', get summary() { return t('qrPanel.couldnt_create_the_sign'); }, get detail() { return t('qrPanel.try_qr_image_only_instead'); } });
    } finally {
      this.busy.set(false);
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image'));
      img.src = src;
    });
  }

  /** Breaks `text` into at most `maxLines` lines that fit `maxWidth` (last line is ellipsised if needed). */
  private wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
    if (lines.length > maxLines) {
      const rest = lines.slice(maxLines - 1).join(' ');
      return [...lines.slice(0, maxLines - 1), this.fit(ctx, rest, maxWidth)];
    }
    return lines;
  }

  /** Shortens `text` with an ellipsis until it fits `maxWidth` at the context's current font. */
  private fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    return t + '…';
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
