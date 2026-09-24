import { Component, HostListener, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { AgentOs, DetectedPrinter, PrinterRow } from '../../core/models/models';
import { copyText, downloadUrl, timeAgo } from '../../shared/utils/browser.util';
import { t as tr } from '../../core/i18n/i18n';
import { TranslateCountPipe } from '../../core/i18n/translate-count.pipe';

type AgentState = 'loading' | 'error' | 'none' | 'online' | 'offline';

const POLL_MS = 5000;
const TICK_MS = 10_000;
/** How long to wait for an agent to answer a "re-scan printers" request before re-reading the list. */
const RESCAN_SETTLE_MS = 3000;

const OS_LABEL: Record<AgentOs, string> = { get windows() { return tr('printerApp.windows'); }, get linux() { return tr('printerApp.linux'); } };

/** Best guess at the OS of the computer this page is open on, to preselect the right download. */
function detectOs(): AgentOs {
  const ua = navigator.userAgent;
  return /Linux|X11/.test(ua) && !/Android|CrOS/.test(ua) ? 'linux' : 'windows';
}

interface Faq {
  q: string;
  steps: string[];
  queueLink?: boolean;
}

/**
 * Connects the shop's computer to PrintSetu. The screen answers one question
 * first — "is my printer working?" — with a status banner, then shows what to
 * do next: a self-completing setup checklist while nothing is connected, the
 * live printer list, and troubleshooting for the usual problems.
 */
@Component({
  selector: 'app-print-agent',
  standalone: true,
  imports: [TranslateCountPipe, TranslatePipe, CommonModule, RouterLink, ProgressSpinnerModule],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ 'printerApp.printer_app' | translate }}</h1>
        <p class="page-subtitle">{{ 'printerApp.the_small_program_that_lets_printsetu' | translate }}</p>
      </div>
      <div class="live">
        <span class="live__dot" [class.is-paused]="state() === 'error'"></span>
        <span class="live__text">{{ state() === 'error' ? ('printerApp.not_updating' | translate) : ('printerApp.live_updated_ago' | translate: { ago: updatedAgo() }) }}</span>
        <button type="button" class="live__refresh" (click)="refresh(true)" [disabled]="refreshing()" [attr.aria-label]="'printerApp.refresh_now' | translate">
          <i class="pi pi-refresh" [class.pi-spin]="refreshing()"></i>
        </button>
      </div>
    </div>

    @if (isMobile()) {
      <div class="mobile-note">
        <i class="pi pi-desktop"></i>
        <div>
          <strong>{{ 'printerApp.set_this_up_on_a_computer' | translate }}</strong>
          <p>{{ 'printerApp.the_printer_app_installs_on_the' | translate }}</p>
          <button type="button" class="link-btn" (click)="copyPageLink()"><i class="pi pi-copy"></i> {{ 'printerApp.copy_link_to_this_page' | translate }}</button>
        </div>
      </div>
    }

    <!-- ================= Status banner ================= -->
    <section class="hero" [ngClass]="'hero--' + state()" aria-live="polite">
      @switch (state()) {
        @case ('loading') {
          <div class="hero__icon"><p-progressSpinner strokeWidth="6" [style]="{ width: '24px', height: '24px' }" /></div>
          <div class="hero__body">
            <h2 class="hero__title">{{ 'printerApp.checking_your_printer' | translate }}</h2>
            <p class="hero__text">{{ 'printerApp.this_only_takes_a_moment' | translate }}</p>
          </div>
        }
        @case ('error') {
          <div class="hero__icon"><i class="pi pi-exclamation-circle"></i></div>
          <div class="hero__body">
            <h2 class="hero__title">{{ 'printerApp.couldnt_check_your_printer' | translate }}</h2>
            <p class="hero__text">{{ 'printerApp.we_couldnt_reach_printsetu_just_now' | translate }}</p>
          </div>
          <button type="button" class="btn btn--solid" (click)="refresh(true)">{{ 'common.try_again' | translate }}</button>
        }
        @case ('none') {
          <div class="hero__icon"><i class="pi pi-desktop"></i></div>
          <div class="hero__body">
            <h2 class="hero__title">{{ 'printerApp.connect_your_printer' | translate }}</h2>
            <p class="hero__text">{{ 'printerApp.install_the_printer_app_on_the' | translate }}</p>
          </div>
          <button type="button" class="btn btn--solid" (click)="download()" [disabled]="downloading()">
            <i class="pi" [ngClass]="downloading() ? 'pi-spin pi-spinner' : 'pi-download'"></i> {{ 'printerApp.download_for' | translate: { osLabel: osLabel() } }}
          </button>
        }
        @case ('online') {
          <div class="hero__icon"><i class="pi pi-check-circle"></i></div>
          <div class="hero__body">
            <h2 class="hero__title">{{ 'printerApp.printer_connected' | translate }}</h2>
            <p class="hero__text">
              {{ (online().length === 1 ? 'printerApp.connected_summary.one' : 'printerApp.connected_summary.other') | translate: { count: online().length, lastSeen: lastSeenLabel() } }}
            </p>
          </div>
        }
        @case ('offline') {
          <div class="hero__icon"><i class="pi pi-exclamation-triangle"></i></div>
          <div class="hero__body">
            <h2 class="hero__title">{{ 'printerApp.printer_offline' | translate }}</h2>
            <p class="hero__text">
              {{ 'printerApp.we_last_heard_from_your_printer' | translate: { lastSeenLabel: lastSeenLabel() } }}
            </p>
          </div>
          <button type="button" class="btn btn--solid" (click)="openFaq(0)">
            <i class="pi pi-wrench"></i> {{ 'printerApp.fix_it' | translate }}
          </button>
        }
      }
    </section>

    <div class="cols" [class.cols--online]="state() === 'online'">
      <!-- ================= Left: setup ================= -->
      <section class="card area-setup">
        <header class="card__head">
          <h2 class="card__title">
            @if (state() === 'online') { {{ 'printerApp.set_up_another_computer' | translate }} } @else { {{ 'printerApp.set_up_in_3_steps' | translate }} }
          </h2>
          @if (state() === 'online') {
            <button type="button" class="link-btn" (click)="setupExpanded.set(!showSetup())" [attr.aria-expanded]="showSetup()">
              {{ showSetup() ? ('printerApp.hide' | translate) : ('printerApp.show' | translate) }}
            </button>
          }
        </header>

        @if (showSetup()) {
          <ol class="steps">
            <li class="step" [class.is-done]="step1Done()">
              <span class="step__badge">@if (step1Done()) { <i class="pi pi-check"></i> } @else { 1 }</span>
              <div class="step__body">
                <h3>{{ 'printerApp.download_the_printer_app' | translate }}</h3>
                <div class="os-switch" role="radiogroup" [attr.aria-label]="'printerApp.computer_type' | translate">
                  @for (o of osOptions; track o) {
                    <button type="button" role="radio" class="os-switch__opt" [class.is-active]="os() === o" [attr.aria-checked]="os() === o" (click)="os.set(o)">
                      <i class="pi" [ngClass]="o === 'windows' ? 'pi-microsoft' : 'pi-server'"></i> {{ osLabels[o] }}
                    </button>
                  }
                </div>
                <p>
                  @if (os() === 'windows') { {{ 'printerApp.a_small_installer_for_windows_10' | translate }} }
                  @else { {{ 'printerApp.for_ubuntu_debian_mint_fedora_and' | translate }} }
                </p>
                <button type="button" class="btn btn--primary" (click)="download()" [disabled]="downloading()">
                  <i class="pi" [ngClass]="downloading() ? 'pi-spin pi-spinner' : 'pi-download'"></i>
                  {{ step1Done() ? ('printerApp.download_again' | translate) : ('printerApp.download_for' | translate: { osLabel: osLabel() }) }}
                </button>
              </div>
            </li>
            @if (os() === 'windows') {
              <li class="step" [class.is-done]="step23Done()">
                <span class="step__badge">@if (step23Done()) { <i class="pi pi-check"></i> } @else { 2 }</span>
                <div class="step__body">
                  <h3 [innerHTML]="'printerApp.run_install_bat' | translate"></h3>
                  <p [innerHTML]="'printerApp.windows_step_run' | translate"></p>
                </div>
              </li>
              <li class="step" [class.is-done]="step23Done()">
                <span class="step__badge">@if (step23Done()) { <i class="pi pi-check"></i> } @else { 3 }</span>
                <div class="step__body">
                  <h3>{{ 'printerApp.click_yes_when_windows_asks' | translate }}</h3>
                  <p>{{ 'printerApp.that_lets_it_install_quietly_in' | translate }}</p>
                </div>
              </li>
            } @else {
              <li class="step" [class.is-done]="step23Done()">
                <span class="step__badge">@if (step23Done()) { <i class="pi pi-check"></i> } @else { 2 }</span>
                <div class="step__body">
                  <h3>{{ 'printerApp.extract_it' | translate }}</h3>
                  <p [innerHTML]="'printerApp.linux_step_extract' | translate"></p>
                </div>
              </li>
              <li class="step" [class.is-done]="step23Done()">
                <span class="step__badge">@if (step23Done()) { <i class="pi pi-check"></i> } @else { 3 }</span>
                <div class="step__body">
                  <h3>{{ 'printerApp.run_the_installer_in_a_terminal' | translate }}</h3>
                  <p>{{ 'printerApp.open_a_terminal_in_that_folder' | translate }}</p>
                  <div class="cmd">
                    <code>{{ linuxInstallCmd }}</code>
                    <button type="button" class="link-btn" (click)="copyInstallCmd()"><i class="pi pi-copy"></i> {{ 'common.copy' | translate }}</button>
                  </div>
                </div>
              </li>
            }
            <li class="step step--last" [class.is-done]="online().length > 0" [class.is-waiting]="online().length === 0 && step1Done()">
              <span class="step__badge">@if (online().length > 0) { <i class="pi pi-check"></i> } @else { <i class="pi pi-wifi"></i> }</span>
              <div class="step__body">
                <h3>{{ online().length > 0 ? ('printerApp.connected' | translate) : ('printerApp.waiting_for_your_printer' | translate) }}</h3>
                <p>{{ online().length > 0 ? ('printerApp.your_computer_showed_up_here_on' | translate) : "You don't need to do anything here. This page updates by itself once the Printer App connects." }}</p>
              </div>
            </li>
          </ol>
          <p class="fineprint"><i class="pi pi-info-circle"></i> {{ 'printerApp.it_runs_quietly_in_the_background' | translate }}</p>
        }
      </section>

      <!-- ================= Printers ================= -->
        <section class="card area-printers">
          <header class="card__head">
            <h2 class="card__title">{{ 'printerApp.your_printers' | translate }}</h2>
            @if (printers().length > 0) {
              <span class="count">{{ 'printerApp.online' | translate: { online: online().length, printers: printers().length } }}</span>
            }
          </header>

          @if (loading()) {
            <div class="skeleton"></div>
            <div class="skeleton"></div>
          } @else if (printers().length === 0) {
            <div class="empty">
              <span class="empty__icon"><i class="pi pi-print"></i></span>
              <strong>{{ 'printerApp.no_printer_connected_yet' | translate }}</strong>
              <p>{{ 'printerApp.once_the_printer_app_is_installed' | translate }}</p>
            </div>
          } @else {
            <ul class="plist">
              @for (p of printers(); track p.id) {
                <li class="printer" [ngClass]="'printer--' + p.status.toLowerCase()">
                  <span class="printer__icon"><i class="pi pi-print"></i></span>
                  <div class="printer__main">
                    <span class="printer__name" [title]="p.printerName">{{ p.printerName }}</span>
                    <span class="printer__meta">
                      @if (p.capabilitiesJson?.hostname) {
                        <span class="printer__driver" [title]="p.capabilitiesJson!.hostname!">{{ 'printerApp.on' | translate: { hostname: p.capabilitiesJson!.hostname } }}</span>
                      } @else if (p.driverName) {
                        <span class="printer__driver" [title]="p.driverName">{{ p.driverName }}</span>
                      }
                    </span>
                  </div>
                  <div class="printer__side">
                    <span class="pill"><span class="pill__dot"></span>{{ statusLabel(p.status) }}</span>
                    <span class="printer__seen">{{ p.lastHeartbeatAt ? ('printerApp.seen_ago' | translate: { ago: ago(p.lastHeartbeatAt) }) : ('printerApp.never_connected' | translate) }}</span>
                  </div>
                  <button type="button" class="printer__remove" (click)="confirmRemove(p)" [attr.aria-label]="'printerApp.remove_printer_aria' | translate: { name: p.printerName }">
                    <i class="pi pi-trash"></i>
                  </button>

                  <div class="target">
                    @if (detected(p); as list) {
                      <label class="target__label" [for]="'target-' + p.id">{{ 'printerApp.print_to' | translate }}</label>
                      <div class="target__row">
                        <select
                          class="target__select"
                          [id]="'target-' + p.id"
                          [disabled]="savingId() === p.id"
                          (change)="selectTarget(p, $any($event.target).value)"
                        >
                          <option value="" [selected]="!p.osPrinterName">{{ defaultOptionLabel(list) }}</option>
                          @for (d of list; track d.name) {
                            <option [value]="d.name" [selected]="p.osPrinterName === d.name">{{ d.isDefault ? ('printerApp.default_printer_option' | translate: { name: d.name }) : d.name }}</option>
                          }
                          @if (p.osPrinterName && !hasPrinter(list, p.osPrinterName)) {
                            <option [value]="p.osPrinterName" selected>{{ 'printerApp.not_found' | translate: { osPrinterName: p.osPrinterName } }}</option>
                          }
                        </select>
                        <button
                          type="button"
                          class="target__rescan"
                          (click)="rescan(p)"
                          [disabled]="rescanningId() === p.id || p.status !== 'ONLINE'"
                          [title]="p.status === 'ONLINE' ? ('printerApp.look_for_printers_again' | translate) : ('printerApp.the_printer_app_must_be_online' | translate)"
                          [attr.aria-label]="'printerApp.look_for_printers_again' | translate"
                        >
                          <i class="pi" [ngClass]="rescanningId() === p.id || savingId() === p.id ? 'pi-spin pi-spinner' : 'pi-refresh'"></i>
                        </button>
                      </div>
                      @if (targetWarning(p, list); as warning) {
                        <p class="target__note target__note--warn"><i class="pi pi-exclamation-triangle"></i> {{ warning }}</p>
                      } @else {
                        <p class="target__note">{{ 'printerApp.found_on_this_computer' | translate: { printers: ('common.count.printers' | translateCount: list.length) } }}</p>
                      }
                    } @else if (p.status === 'ONLINE') {
                      <p class="target__note"><i class="pi pi-spin pi-spinner"></i> {{ 'printerApp.looking_for_printers_on_this_computer' | translate }}</p>
                    } @else {
                      <p class="target__note">{{ 'printerApp.printers_on_this_computer_appear_here' | translate }}</p>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </section>

        <section class="card area-faq">
          <header class="card__head"><h2 class="card__title">{{ 'printerApp.troubleshooting' | translate }}</h2></header>
          <div class="faq">
            @for (f of faqs(); track f.q; let i = $index) {
              <div class="faq__item" [class.is-open]="faqOpen() === i">
                <button type="button" class="faq__q" (click)="openFaq(faqOpen() === i ? null : i)" [attr.aria-expanded]="faqOpen() === i">
                  <span>{{ f.q }}</span>
                  <i class="pi pi-chevron-down"></i>
                </button>
                @if (faqOpen() === i) {
                  <div class="faq__a">
                    <ol>
                      @for (s of f.steps; track s) { <li>{{ s }}</li> }
                    </ol>
                    @if (f.queueLink) {
                      <a routerLink="/shop/queue" class="link-btn"><i class="pi pi-inbox"></i> {{ 'printerApp.open_print_orders' | translate }}</a>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </section>
    </div>
  `,
  styles: [
    `
      :host {
        --ink: var(--tx-0f172a);
        --muted: var(--tx-64748b);
        --line: var(--bd-e6eaf2);
        --ok: var(--tx-16a34a);
        --warn: var(--tx-d97706);
        --bad: var(--tx-dc2626);
      }

      /* ---------- Header: live indicator ---------- */
      .live {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0.25rem 0.25rem 0.875rem;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--bg-ffffff);
        font-size: 0.75rem;
        color: var(--muted);
        white-space: nowrap;
      }
      .live__dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: var(--ok);
        box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.5);
        animation: pulse 2s infinite;
      }
      .live__dot.is-paused {
        background: var(--bg-cbd5e1);
        animation: none;
      }
      @keyframes pulse {
        70% {
          box-shadow: 0 0 0 6px rgba(22, 163, 74, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(22, 163, 74, 0);
        }
      }
      .live__refresh {
        width: 2rem;
        height: 2rem;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--tx-475569);
        cursor: pointer;
      }
      .live__refresh:hover:not(:disabled) {
        background: var(--bg-eef1f7);
      }

      .mobile-note {
        display: flex;
        gap: 0.875rem;
        margin-bottom: 1rem;
        padding: 1rem;
        border-radius: 14px;
        background: var(--bg-eef2ff);
        color: var(--tx-3730a3);
      }
      .mobile-note > i {
        margin-top: 0.15rem;
        font-size: 1.25rem;
      }
      .mobile-note p {
        margin: 0.25rem 0 0.5rem;
        font-size: 0.875rem;
        line-height: 1.45;
      }

      /* ---------- Status banner ---------- */
      .hero {
        display: flex;
        align-items: center;
        gap: 1rem 1.25rem;
        margin-bottom: clamp(1rem, 2vw, 1.5rem);
        padding: clamp(1rem, 2.4vw, 1.5rem);
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--bg-ffffff);
      }
      .hero__icon {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 3.25rem;
        height: 3.25rem;
        border-radius: 16px;
        background: var(--bg-eef2ff);
        color: var(--accent-text-600);
        font-size: 1.5rem;
      }
      .hero__body {
        flex: 1 1 auto;
        min-width: 0;
      }
      .hero__title {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--ink);
      }
      .hero__text {
        margin: 0.25rem 0 0;
        font-size: 0.9375rem;
        line-height: 1.5;
        color: var(--tx-475569);
      }
      .hero--none {
        background: linear-gradient(135deg, var(--bg-eef2ff), var(--bg-f5f3ff));
        border-color: var(--bd-dfe4fb);
      }
      .hero--none .hero__icon {
        background: var(--bg-ffffff);
        box-shadow: 0 2px 8px rgba(79, 70, 229, 0.15);
      }
      .hero--online {
        background: linear-gradient(135deg, var(--bg-ecfdf5), var(--bg-f0fdf4));
        border-color: var(--bd-bbf7d0);
      }
      .hero--online .hero__icon {
        background: var(--bg-dcfce7);
        color: var(--ok);
      }
      .hero--offline {
        background: linear-gradient(135deg, var(--bg-fffbeb), var(--bg-fff7ed));
        border-color: var(--bd-fde68a);
      }
      .hero--offline .hero__icon {
        background: var(--bg-fef3c7);
        color: var(--warn);
      }
      .hero--error {
        background: var(--bg-fef2f2);
        border-color: var(--bd-fecaca);
      }
      .hero--error .hero__icon {
        background: var(--bg-fee2e2);
        color: var(--bad);
      }
      @media (max-width: 640px) {
        .hero {
          flex-wrap: wrap;
          align-items: flex-start;
        }
        .hero__body {
          flex-basis: calc(100% - 4.5rem);
        }
        .hero > .btn {
          width: 100%;
        }
      }

      /* ---------- Layout ---------- */
      /* Three blocks (setup, printers, help) arranged by what matters now:
         while nothing is connected, setup leads; once connected, the live
         printers lead and setup folds underneath, so no column sits empty. */
      .cols {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas: 'setup' 'printers' 'faq';
        gap: clamp(1rem, 2vw, 1.5rem);
        align-items: start;
      }
      .cols--online {
        grid-template-areas: 'printers' 'setup' 'faq';
      }
      .area-setup {
        grid-area: setup;
      }
      .area-printers {
        grid-area: printers;
      }
      .area-faq {
        grid-area: faq;
      }
      @media (min-width: 1000px) {
        .cols {
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
          grid-template-areas: 'setup printers' 'setup faq';
        }
        .cols--online {
          grid-template-areas: 'printers faq' 'setup faq';
        }
      }
      .card {
        padding: clamp(1rem, 2.2vw, 1.5rem);
        background: var(--bg-ffffff);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        min-width: 0;
      }
      .card__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .card__title {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .count {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--muted);
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        min-height: 2.75rem;
        padding: 0 1.25rem;
        border: none;
        border-radius: 12px;
        font: inherit;
        font-size: 0.9375rem;
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.08s ease;
      }
      .btn:active:not(:disabled) {
        transform: scale(0.985);
      }
      .btn:disabled {
        opacity: 0.65;
        cursor: default;
      }
      .btn--primary {
        background: var(--p-primary-600);
        color: #fff;
        box-shadow: 0 6px 16px rgba(79, 70, 229, 0.22);
      }
      .btn--primary:hover:not(:disabled) {
        background: var(--p-primary-700);
      }
      .btn--solid {
        flex: 0 0 auto;
        background: var(--ink);
        color: #fff;
      }
      .btn--solid:hover:not(:disabled) {
        background: #1e293b;
      }
      .link-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--accent-text-600);
        cursor: pointer;
        text-decoration: none;
      }
      .link-btn:hover {
        text-decoration: underline;
      }

      /* ---------- Setup steps ---------- */
      .steps {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .step {
        position: relative;
        display: flex;
        gap: 1rem;
        padding-bottom: 1.5rem;
      }
      .step:not(.step--last)::before {
        content: '';
        position: absolute;
        left: 1.125rem;
        top: 2.5rem;
        bottom: 0.25rem;
        width: 2px;
        background: var(--line);
      }
      .step.is-done:not(.step--last)::before {
        background: #86efac;
      }
      .step--last {
        padding-bottom: 0;
      }
      .step__badge {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 50%;
        background: var(--bg-eef1f7);
        color: var(--tx-475569);
        font-size: 0.875rem;
        font-weight: 700;
      }
      .step.is-done .step__badge {
        background: var(--bg-dcfce7);
        color: var(--ok);
      }
      .step.is-waiting .step__badge {
        background: var(--bg-fef3c7);
        color: var(--warn);
        animation: breathe 1.6s ease-in-out infinite;
      }
      @keyframes breathe {
        50% {
          opacity: 0.55;
        }
      }
      .step__body {
        flex: 1 1 auto;
        min-width: 0;
      }
      .step__body h3 {
        margin: 0.35rem 0 0.25rem;
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--ink);
      }
      .step__body p {
        margin: 0 0 0.75rem;
        font-size: 0.875rem;
        line-height: 1.5;
        color: var(--tx-475569);
      }
      .step--last .step__body p {
        margin-bottom: 0;
      }
      .step code {
        padding: 0.1rem 0.4rem;
        border-radius: 6px;
        background: var(--bg-eef1f7);
        font-size: 0.8125rem;
      }
      .os-switch {
        display: inline-flex;
        gap: 0.25rem;
        margin: 0.25rem 0 0.625rem;
        padding: 0.25rem;
        border-radius: 12px;
        background: var(--bg-eef1f7);
      }
      .os-switch__opt {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-height: 2.25rem;
        padding: 0 0.875rem;
        border: none;
        border-radius: 9px;
        background: transparent;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-475569);
        cursor: pointer;
      }
      .os-switch__opt.is-active {
        background: var(--bg-ffffff);
        color: var(--ink);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
      }
      .cmd {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        border-radius: 10px;
        background: var(--bg-f8fafc);
        border: 1px solid var(--line);
      }
      .cmd code {
        padding: 0;
        background: none;
        font-size: 0.8125rem;
      }
      .fineprint {
        display: flex;
        gap: 0.5rem;
        margin: 1.25rem 0 0;
        padding: 0.875rem 1rem;
        border-radius: 12px;
        background: var(--bg-f8fafc);
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--muted);
      }
      .fineprint i {
        margin-top: 0.15rem;
      }
      @media (max-width: 520px) {
        .step__body .btn {
          width: 100%;
        }
      }

      /* ---------- Printers ---------- */
      .plist {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .printer {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        padding: 0.875rem 1rem;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--bg-fbfcfe);
      }
      .printer__icon {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 12px;
        background: var(--bg-eef1f7);
        color: var(--tx-64748b);
      }
      .printer--online .printer__icon {
        background: var(--bg-dcfce7);
        color: var(--ok);
      }
      .printer--offline .printer__icon {
        background: var(--bg-fee2e2);
        color: var(--bad);
      }
      .printer__main {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        min-width: 0;
      }
      .printer__name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--ink);
      }
      .printer__meta {
        display: flex;
        gap: 0.5rem;
        min-width: 0;
        font-size: 0.75rem;
        color: var(--muted);
      }
      .printer__driver {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .printer__meta > span {
        white-space: nowrap;
      }
      .printer__meta .printer__driver::after {
        content: ' ·';
      }
      .printer__side {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.25rem;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        background: var(--bg-eef1f7);
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--tx-475569);
      }
      .pill__dot {
        width: 0.4rem;
        height: 0.4rem;
        border-radius: 50%;
        background: #94a3b8;
      }
      .printer--online .pill {
        background: var(--bg-dcfce7);
        color: var(--tx-15803d);
      }
      .printer--online .pill__dot {
        background: var(--ok);
      }
      .printer--offline .pill {
        background: var(--bg-fee2e2);
        color: var(--tx-b91c1c);
      }
      .printer--offline .pill__dot {
        background: var(--bad);
      }
      .printer__seen {
        font-size: 0.6875rem;
        color: var(--muted);
        white-space: nowrap;
      }
      .printer__remove {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--tx-94a3b8);
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .printer__remove:hover {
        background: var(--bg-fee2e2);
        color: var(--bad);
      }
      .printer {
        flex-wrap: wrap;
      }
      .target {
        flex-basis: 100%;
        min-width: 0;
        padding: 0.75rem 0 0 3.375rem;
        border-top: 1px dashed var(--line);
      }
      .target__label {
        display: block;
        margin-bottom: 0.375rem;
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--muted);
      }
      .target__row {
        display: flex;
        gap: 0.5rem;
      }
      .target__select {
        flex: 1 1 auto;
        min-width: 0;
        height: 2.5rem;
        padding: 0 0.75rem;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--bg-ffffff);
        font: inherit;
        font-size: 0.875rem;
        color: var(--ink);
      }
      .target__select:focus-visible {
        outline: 2px solid var(--p-primary-600);
        outline-offset: 1px;
      }
      .target__rescan {
        flex: 0 0 auto;
        width: 2.5rem;
        height: 2.5rem;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--bg-ffffff);
        color: var(--tx-475569);
        cursor: pointer;
      }
      .target__rescan:hover:not(:disabled) {
        background: var(--bg-eef1f7);
      }
      .target__rescan:disabled {
        opacity: 0.55;
        cursor: default;
      }
      .target__note {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        margin: 0.375rem 0 0;
        font-size: 0.75rem;
        line-height: 1.45;
        color: var(--muted);
      }
      .target__note--warn {
        color: var(--warn);
        font-weight: 600;
      }
      @media (max-width: 480px) {
        .target {
          padding-left: 0;
        }
        .printer__side {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          flex-basis: 100%;
          padding-left: 3.375rem;
        }
        .printer__remove {
          order: -1;
          margin-left: auto;
        }
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.375rem;
        padding: 1.5rem 1rem;
        text-align: center;
        color: var(--tx-475569);
      }
      .empty__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 3.5rem;
        height: 3.5rem;
        margin-bottom: 0.25rem;
        border-radius: 50%;
        background: var(--bg-f1f5f9);
        color: var(--tx-94a3b8);
        font-size: 1.5rem;
      }
      .empty p {
        margin: 0;
        max-width: 30ch;
        font-size: 0.875rem;
        line-height: 1.5;
      }
      .skeleton {
        height: 4.25rem;
        margin-bottom: 0.75rem;
        border-radius: 14px;
        background: linear-gradient(90deg, var(--bg-f1f5f9) 25%, var(--bg-e8edf5) 37%, var(--bg-f1f5f9) 63%);
        background-size: 400% 100%;
        animation: shimmer 1.4s ease infinite;
      }
      @keyframes shimmer {
        0% {
          background-position: 100% 50%;
        }
        100% {
          background-position: 0 50%;
        }
      }

      /* ---------- Troubleshooting ---------- */
      .faq {
        display: flex;
        flex-direction: column;
        margin: -0.25rem 0;
      }
      .faq__item {
        border-bottom: 1px solid var(--line);
      }
      .faq__item:last-child {
        border-bottom: none;
      }
      .faq__q {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        width: 100%;
        padding: 0.875rem 0;
        border: none;
        background: none;
        font: inherit;
        font-size: 0.9375rem;
        font-weight: 600;
        text-align: left;
        color: var(--ink);
        cursor: pointer;
      }
      .faq__q i {
        flex: 0 0 auto;
        font-size: 0.75rem;
        color: var(--muted);
        transition: transform 0.18s ease;
      }
      .faq__item.is-open .faq__q i {
        transform: rotate(180deg);
      }
      .faq__a {
        padding: 0 0 1rem;
      }
      .faq__a ol {
        margin: 0 0 0.75rem;
        padding-left: 1.25rem;
        font-size: 0.875rem;
        line-height: 1.6;
        color: var(--tx-475569);
      }
      .faq__a li + li {
        margin-top: 0.25rem;
      }
      @media (prefers-reduced-motion: reduce) {
        * {
          animation: none !important;
          transition: none !important;
        }
      }
    `,
  ],
})
export class PrintAgentComponent implements OnInit, OnDestroy {
  loading = signal(true);
  loadFailed = signal(false);
  refreshing = signal(false);
  downloading = signal(false);
  downloaded = signal(false);
  printers = signal<PrinterRow[]>([]);
  lastUpdated = signal<number | null>(null);
  isMobile = signal(false);

  os = signal<AgentOs>(detectOs());
  osLabel = computed(() => OS_LABEL[this.os()]);
  readonly osOptions: AgentOs[] = ['windows', 'linux'];
  readonly osLabels = OS_LABEL;
  readonly linuxInstallCmd = 'sudo sh install.sh';
  savingId = signal<string | null>(null);
  rescanningId = signal<string | null>(null);

  setupExpanded = signal<boolean | null>(null);
  faqOpen = signal<number | null>(null);

  /** Re-evaluated on a timer so "seen 3 min ago" keeps moving without new data. */
  private now = signal(Date.now());
  private pollHandle?: ReturnType<typeof setInterval>;
  private tickHandle?: ReturnType<typeof setInterval>;
  private previousState: AgentState | null = null;

  // Rebuilt when the language changes (tr() reads the active language).
  readonly faqs = computed<Faq[]>(() => [
    {
      get q() { return tr('printerApp.my_printer_shows_offline'); },
      steps: [
        tr('printerApp.check_that_the_computer_with_the'),
        tr('printerApp.check_that_the_printer_itself_is'),
        tr('printerApp.restart_the_computer_the_printer_app'),
        tr('printerApp.still_offline_download_the_printer_app'),
      ],
    },
    {
      get q() { return tr('printerApp.my_printer_is_not_in_the'); },
      steps: [
        tr('printerApp.check_that_the_printer_is_switched'),
        tr('printerApp.check_that_it_can_print_a'),
        tr('printerApp.click_the_refresh_button_next_to'),
        tr('printerApp.on_linux_run_lpstat_e_in'),
      ],
    },
    {
      get q() { return tr('printerApp.windows_blocked_the_installer'); },
      steps: [
        tr('printerApp.right_click_install_bat_and_choose'),
        tr('printerApp.if_windows_shows_a_warning_choose'),
        tr('printerApp.when_windows_asks_for_permission_click'),
      ],
    },
    {
      get q() { return tr('printerApp.an_order_was_sent_but_nothing'); },
      steps: [
        tr('printerApp.open_print_orders_and_look_at'),
        tr('printerApp.check_that_the_right_printer_is'),
        tr('printerApp.check_that_the_printer_has_paper'),
        tr('printerApp.if_the_printer_was_offline_the'),
      ],
      queueLink: true,
    },
  ]);

  online = computed(() => this.printers().filter((p) => p.status === 'ONLINE'));

  state = computed<AgentState>(() => {
    if (this.loading()) return 'loading';
    if (this.loadFailed() && this.printers().length === 0) return 'error';
    if (this.printers().length === 0) return 'none';
    return this.online().length > 0 ? 'online' : 'offline';
  });

  /** Most recent heartbeat across all printers. */
  private lastSeenIso = computed(() => {
    let best: string | null = null;
    for (const p of this.printers()) {
      if (p.lastHeartbeatAt && (!best || new Date(p.lastHeartbeatAt) > new Date(best))) best = p.lastHeartbeatAt;
    }
    return best;
  });
  lastSeenLabel = computed(() => (this.lastSeenIso() ? timeAgo(this.lastSeenIso(), this.now()) : 'never'));

  updatedAgo = computed(() => {
    const t = this.lastUpdated();
    if (t === null) return '—';
    const s = Math.max(0, Math.round((this.now() - t) / 1000));
    return s < 8 ? tr('printerApp.just_now') : s < 60 ? tr('printerApp.s_ago', { value: s }) : tr('printerApp.min_ago', { value: Math.round(s / 60) });
  });

  step1Done = computed(() => this.downloaded() || this.printers().length > 0);
  step23Done = computed(() => this.printers().length > 0);
  /** Setup steps stay open until a printer is connected; after that they fold away. */
  showSetup = computed(() => this.setupExpanded() ?? this.state() !== 'online');

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    private readonly messageService: MessageService,
    private readonly confirmationService: ConfirmationService,
  ) {}

  ngOnInit(): void {
    this.updateViewport();
    this.refresh();
    this.startPolling();
    this.tickHandle = setInterval(() => this.now.set(Date.now()), TICK_MS);
  }

  ngOnDestroy(): void {
    this.stopPolling();
    if (this.tickHandle) clearInterval(this.tickHandle);
  }

  @HostListener('window:resize')
  updateViewport(): void {
    this.isMobile.set(window.innerWidth < 700);
  }

  /** No point polling a tab nobody is looking at; catch up the moment it is visible again. */
  @HostListener('document:visibilitychange')
  onVisibility(): void {
    if (document.hidden) {
      this.stopPolling();
    } else {
      this.refresh();
      this.startPolling();
    }
  }

  private startPolling(): void {
    if (this.pollHandle || document.hidden) return;
    this.pollHandle = setInterval(() => this.refresh(), POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.pollHandle = undefined;
  }

  refresh(manual = false): void {
    if (manual) this.refreshing.set(true);
    this.shopkeeperService.listPrinters().subscribe({
      next: (printers) => {
        this.printers.set(printers);
        this.loadFailed.set(false);
        this.loading.set(false);
        this.refreshing.set(false);
        this.lastUpdated.set(Date.now());
        this.now.set(Date.now());
        this.announceChange();
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
        this.refreshing.set(false);
      },
    });
  }

  /** Tells the shopkeeper when the printer connects or drops while they are watching this screen. */
  private announceChange(): void {
    const current = this.state();
    const before = this.previousState;
    this.previousState = current;
    if (before === null || before === current) return;
    if (current === 'online' && (before === 'offline' || before === 'none')) {
      this.messageService.add({ severity: 'success', get summary() { return tr('printerApp.printer_connected'); }, get detail() { return tr('printerApp.new_orders_will_print_automatically'); } });
    } else if (current === 'offline' && before === 'online') {
      this.messageService.add({ severity: 'warn', get summary() { return tr('printerApp.printer_went_offline'); }, get detail() { return tr('printerApp.orders_will_wait_until_it_reconnects'); } });
    }
  }

  download(): void {
    const os = this.os();
    this.downloading.set(true);
    this.shopkeeperService.downloadAgentPackage(os).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        downloadUrl(url, os === 'linux' ? 'PrintSetu-Print-Agent-linux.tar.gz' : 'PrintSetu-Print-Agent.zip');
        URL.revokeObjectURL(url);
        this.downloading.set(false);
        this.downloaded.set(true);
        this.messageService.add({
          severity: 'success',
          get summary() { return tr('printerApp.download_started'); },
          detail:
            os === 'linux'
              ? tr('printerApp.extract_the_downloaded_file_and_run', { linuxInstallCmd: this.linuxInstallCmd })
              : tr('printerApp.open_the_downloaded_file_and_run'),
        });
        this.refresh();
      },
      error: () => this.downloading.set(false),
    });
  }

  async copyInstallCmd(): Promise<void> {
    const ok = await copyText(this.linuxInstallCmd);
    this.messageService.add(ok ? { severity: 'success', get summary() { return tr('printerApp.command_copied'); } } : { severity: 'warn', get summary() { return tr('printerApp.couldnt_copy'); } });
  }

  /** Printers the agent reported on its computer, or null if it hasn't reported yet. */
  detected(p: PrinterRow): DetectedPrinter[] | null {
    return p.capabilitiesJson?.printers ?? null;
  }

  hasPrinter(list: DetectedPrinter[], name: string): boolean {
    return list.some((d) => d.name === name);
  }

  defaultOptionLabel(list: DetectedPrinter[]): string {
    const osDefault = list.find((d) => d.isDefault);
    return osDefault ? tr('printerApp.computers_default_printer', { name: osDefault.name }) : tr('printerApp.computers_default_printer_2');
  }

  /** Mirrors the agent's own printer resolution (job-processor.ts) so the shopkeeper sees a failure coming. */
  targetWarning(p: PrinterRow, list: DetectedPrinter[]): string | null {
    if (list.length === 0) return tr('printerApp.no_printers_found_on_this_computer');
    if (p.osPrinterName) {
      return this.hasPrinter(list, p.osPrinterName)
        ? null
        : tr('printerApp.is_no_longer_on_this_computer', { osPrinterName: p.osPrinterName });
    }
    if (list.length > 1 && !list.some((d) => d.isDefault)) {
      return tr('printerApp.this_computer_has_no_default_printer');
    }
    return null;
  }

  selectTarget(p: PrinterRow, value: string): void {
    const osPrinterName = value || null;
    if (osPrinterName === (p.osPrinterName ?? null)) return;
    this.savingId.set(p.id);
    this.shopkeeperService.selectOsPrinter(p.id, osPrinterName).subscribe({
      next: (updated) => {
        this.printers.update((rows) => rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
        this.savingId.set(null);
        this.messageService.add({
          severity: 'success',
          get summary() { return tr('printerApp.printer_saved'); },
          detail: osPrinterName ? tr('printerApp.orders_will_print_on', { osPrinterName }) : tr('printerApp.orders_will_print_on_the_computers'),
        });
      },
      error: () => {
        this.savingId.set(null);
        // Re-read so the dropdown snaps back to what is actually saved.
        this.refresh();
      },
    });
  }

  rescan(p: PrinterRow): void {
    this.rescanningId.set(p.id);
    this.shopkeeperService.refreshAgentPrinters(p.id).subscribe({
      next: ({ requested }) => {
        if (!requested) {
          this.rescanningId.set(null);
          this.messageService.add({ severity: 'warn', get summary() { return tr('printerApp.printer_app_is_offline'); }, get detail() { return tr('printerApp.it_will_report_its_printers_when'); } });
          return;
        }
        setTimeout(() => {
          this.rescanningId.set(null);
          this.refresh();
        }, RESCAN_SETTLE_MS);
      },
      error: () => this.rescanningId.set(null),
    });
  }

  async copyPageLink(): Promise<void> {
    const ok = await copyText(window.location.href);
    this.messageService.add(
      ok ? { severity: 'success', get summary() { return tr('common.link_copied'); } } : { severity: 'warn', get summary() { return tr('printerApp.couldnt_copy_the_link'); } },
    );
  }

  openFaq(index: number | null): void {
    this.faqOpen.set(index);
    if (index !== null) {
      setTimeout(() => document.querySelector('.faq__item.is-open')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    }
  }

  ago(iso: string | undefined): string {
    return timeAgo(iso, this.now());
  }

  statusLabel(status: PrinterRow['status']): string {
    return status === 'ONLINE' ? tr('common.online') : status === 'OFFLINE' ? tr('common.offline') : tr('printerApp.not_connected_yet');
  }

  confirmRemove(printer: PrinterRow): void {
    this.confirmationService.confirm({
      get header() { return tr('printerApp.remove_printer'); },
      get message() { return tr('printerApp.remove_its_printer_app_stops_receiving', { printerName: printer.printerName }); },
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { severity: 'danger', get label() { return tr('common.remove'); } },
      accept: () => {
        this.shopkeeperService.removePrinter(printer.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', get summary() { return tr('printerApp.printer_removed'); } });
            this.refresh();
          },
        });
      },
    });
  }
}
