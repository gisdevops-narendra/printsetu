import { Injectable, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { NotificationPrefs, PrintJobRow, PrintJobStatus } from '../models/models';
import { ShopkeeperService } from './shopkeeper.service';

const POLL_MS = 15_000;
/** While a job is on its way to the printer, poll quickly so Pending -> Printing -> Printed shows live. */
const ACTIVE_POLL_MS = 3_000;
const ACTIVE: PrintJobStatus[] = ['QUEUED', 'PRINTING'];
const PROBLEM: PrintJobStatus[] = ['AGENT_OFFLINE', 'PRINT_UNKNOWN'];

const DEFAULT_PREFS: NotificationPrefs = { newOrderSound: true, desktopAlerts: false, failureAlerts: true };

/**
 * Watches the shop's queue while the portal is open and tells the shopkeeper
 * about new orders and print problems, honouring their notification settings:
 * a short chime, a desktop notification (only when the tab is in the
 * background) and an in-app message.
 *
 * It only reacts to *changes* after the first look at the queue, so opening the
 * portal never announces orders that were already waiting.
 */
@Injectable({ providedIn: 'root' })
export class OrderAlertsService {
  /** The latest queue snapshot, shared with the shop header's queue indicator so it needn't poll again. */
  readonly jobs = signal<PrintJobRow[]>([]);
  /** True once the first queue snapshot has arrived. */
  readonly loaded = signal(false);
  private prefs: NotificationPrefs = { ...DEFAULT_PREFS };
  private known = new Map<string, PrintJobStatus>();
  private primed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private audio?: AudioContext;
  private readonly onVisibility = () => (document.hidden ? this.pause() : this.resume());

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    private readonly messageService: MessageService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.shopkeeperService.profile().subscribe({
      next: (res) => (this.prefs = { ...DEFAULT_PREFS, ...res.settings.notificationPrefs }),
      error: () => undefined,
    });
    this.running = true;
    this.poll();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    this.pause();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.primed = false;
    this.known.clear();
    this.jobs.set([]);
    this.loaded.set(false);
  }

  /** Keep alerts in sync when the shopkeeper changes their preferences. */
  setPrefs(prefs: NotificationPrefs): void {
    this.prefs = { ...prefs };
  }

  /** Browsers only allow the permission prompt from a user action, so the settings toggle calls this. */
  async requestDesktopPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    return Notification.requestPermission();
  }

  /** Plays the chime once so the shopkeeper can hear what a new order sounds like. */
  preview(): void {
    this.chime();
  }

  private pause(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private resume(): void {
    if (this.running) return;
    this.running = true;
    this.poll();
  }

  /** Polls, then schedules the next poll: every few seconds while something is printing, otherwise every 15s. */
  private poll(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.shopkeeperService.queue().subscribe({
      next: (jobs) => {
        this.detect(jobs);
        this.loaded.set(true);
        this.scheduleNext();
      },
      error: () => this.scheduleNext(), // a missed poll is harmless; try again next time
    });
  }

  private scheduleNext(): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    const busy = this.jobs().some((j) => ACTIVE.includes(j.status));
    this.timer = setTimeout(() => this.poll(), busy ? ACTIVE_POLL_MS : POLL_MS);
  }

  /** Pull the queue right now (e.g. after the shopkeeper acts) instead of waiting for the next tick. */
  refresh(): void {
    this.poll();
  }

  private detect(jobs: PrintJobRow[]): void {
    this.jobs.set(jobs);
    const fresh: PrintJobRow[] = [];
    const problems: PrintJobRow[] = [];
    for (const job of jobs) {
      const before = this.known.get(job.id);
      if (this.primed) {
        if (before === undefined && job.status === 'PRINT_ELIGIBLE') fresh.push(job);
        if (before !== undefined && before !== job.status && PROBLEM.includes(job.status)) problems.push(job);
      }
      this.known.set(job.id, job.status);
    }
    // Forget jobs that have left the queue (printed, cancelled, ...).
    const ids = new Set(jobs.map((j) => j.id));
    for (const id of [...this.known.keys()]) if (!ids.has(id)) this.known.delete(id);
    this.primed = true;

    if (fresh.length) this.announceNew(fresh);
    if (problems.length && this.prefs.failureAlerts) this.announceProblems(problems);
  }

  private announceNew(jobs: PrintJobRow[]): void {
    const first = jobs[0];
    const docs = jobs.reduce((n, j) => n + j.items.length, 0);
    const title = jobs.length === 1 ? `New print request #${first.tokenNumber}` : `${jobs.length} new print requests`;
    const detail = jobs.length === 1 ? `${docs} ${docs === 1 ? 'document' : 'documents'} · ₹${first.amount}` : `Tokens ${jobs.map((j) => '#' + j.tokenNumber).join(', ')}`;
    this.messageService.add({ severity: 'info', summary: title, detail, life: 9000 });
    if (this.prefs.newOrderSound) this.chime();
    this.desktop(title, detail);
  }

  private announceProblems(jobs: PrintJobRow[]): void {
    const offline = jobs.some((j) => j.status === 'AGENT_OFFLINE');
    const title = offline ? 'Printer offline' : 'A print job needs your review';
    const detail = `Token ${jobs.map((j) => '#' + j.tokenNumber).join(', ')}`;
    this.messageService.add({ severity: 'warn', summary: title, detail, life: 10000 });
    this.desktop(title, detail);
  }

  /** Desktop notifications only make sense when the tab isn't already in front of the user. */
  private desktop(title: string, body: string): void {
    if (!this.prefs.desktopAlerts || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted' || !document.hidden) return;
    try {
      new Notification(title, { body, tag: 'printsetu-order' });
    } catch {
      // some browsers only allow notifications from a service worker; ignore
    }
  }

  /** A soft two-note chime generated with Web Audio, so no audio file is needed. */
  private chime(): void {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.audio ??= new Ctx();
      const ctx = this.audio;
      void ctx.resume();
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + i * 0.16;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.34);
      });
    } catch {
      // autoplay policy or no audio device: silently skip
    }
  }
}
