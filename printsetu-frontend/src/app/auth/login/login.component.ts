import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService, PasswordChangeRequiredError } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';

interface DemoAccount {
  label: string;
  icon: string;
  username: string;
  password: string;
}

/**
 * Sign-in screen for shopkeepers and admins.
 *
 * Desktop: split layout, brand story on the left and the form on the right.
 * Phones/tablets: a compact branded header with the form sheet sliding over it.
 * Errors are shown inline next to the form (never as a corner alert); empty
 * fields get gentle per-field hints instead of a disabled button.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth">
      <!-- ================= Brand ================= -->
      <aside class="brand">
        <div class="brand__glow brand__glow--a" aria-hidden="true"></div>
        <div class="brand__glow brand__glow--b" aria-hidden="true"></div>

        <div class="lockup">
          <svg class="lockup__mark" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
            <defs>
              <linearGradient id="ps-mark" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#a5b4fc" />
                <stop offset="1" stop-color="#6366f1" />
              </linearGradient>
            </defs>
            <rect width="40" height="40" rx="11" fill="url(#ps-mark)" />
            <path d="M13 9.5h10.2l6.3 6.3V29a2.5 2.5 0 0 1-2.5 2.5H13A2.5 2.5 0 0 1 10.5 29V12A2.5 2.5 0 0 1 13 9.5z" fill="#fff" />
            <path d="M23.2 9.5v4.8a1.5 1.5 0 0 0 1.5 1.5h4.8" fill="#c7d2fe" />
            <rect x="14.5" y="20" width="11" height="2.2" rx="1.1" fill="#6366f1" />
            <rect x="14.5" y="24.5" width="7.5" height="2.2" rx="1.1" fill="#a5b4fc" />
          </svg>
          <span class="lockup__name">PrintSetu</span>
        </div>

        <div class="brand__body">
          <h2 class="brand__headline">Print, without the wait.</h2>
          <p class="brand__desc">
            PrintSetu connects customers and print shops. Scan a code, upload a file, and it lands in the shop's queue, ready to print.
          </p>

          <ul class="points">
            <li><i class="pi pi-qrcode"></i><span>Customers upload from their phone with a QR code</span></li>
            <li><i class="pi pi-inbox"></i><span>A live queue with previews and quick edits</span></li>
            <li><i class="pi pi-print"></i><span>Jobs reach your printer automatically</span></li>
          </ul>

          <div class="visual" aria-hidden="true">
            <div class="glass glass--a">
              <span class="glass__icon glass__icon--ok"><i class="pi pi-check"></i></span>
              <div class="glass__text"><b>#42 &middot; Invoice_Sep.pdf</b><small>A4 &middot; B&amp;W &middot; 2 copies</small></div>
              <span class="tag">Ready to print</span>
            </div>
            <div class="glass glass--b">
              <span class="qrmini"></span>
              <div class="glass__text"><b>Scan to print</b><small>No app, no sign-up</small></div>
            </div>
          </div>
        </div>

        <p class="brand__foot">Trusted by print shops everywhere</p>
      </aside>

      <!-- ================= Form ================= -->
      <main class="panel">
        <div class="sheet">
          @if (mode() === 'login') {
            <header class="sheet__head">
              <h1 class="sheet__title">Welcome back</h1>
              <p class="sheet__sub">Sign in to manage your print queue.</p>
            </header>

            <form (ngSubmit)="submit()" novalidate class="form" [class.is-busy]="loading()">
              <!-- Email -->
              <div class="field" [class.has-error]="showUsernameError()">
                <label class="field__label" for="username">Email or username</label>
                <div class="control">
                  <i class="pi pi-user control__icon" aria-hidden="true"></i>
                  <input
                    #usernameInput
                    id="username"
                    name="username"
                    type="text"
                    class="control__input"
                    placeholder="you@shop.com"
                    autocomplete="username"
                    autocapitalize="none"
                    autocorrect="off"
                    spellcheck="false"
                    autofocus
                    [(ngModel)]="username"
                    (blur)="usernameTouched.set(true)"
                    (ngModelChange)="clearError()"
                    [attr.aria-invalid]="showUsernameError()"
                    [attr.aria-describedby]="showUsernameError() ? 'username-error' : null"
                  />
                </div>
                @if (showUsernameError()) {
                  <p class="field__error" id="username-error"><i class="pi pi-info-circle"></i> Enter your email or username.</p>
                }
              </div>

              <!-- Password -->
              <div class="field" [class.has-error]="showPasswordError()">
                <div class="field__row">
                  <label class="field__label" for="password">Password</label>
                  <button type="button" class="link" (click)="helpOpen.set(!helpOpen())" [attr.aria-expanded]="helpOpen()">Forgot password?</button>
                </div>
                <div class="control">
                  <i class="pi pi-lock control__icon" aria-hidden="true"></i>
                  <input
                    #passwordInput
                    id="password"
                    name="password"
                    class="control__input control__input--pw"
                    placeholder="Your password"
                    autocomplete="current-password"
                    [type]="showPassword() ? 'text' : 'password'"
                    [(ngModel)]="password"
                    (blur)="passwordTouched.set(true)"
                    (ngModelChange)="clearError()"
                    (keyup)="checkCaps($event)"
                    (keydown)="checkCaps($event)"
                    [attr.aria-invalid]="showPasswordError()"
                    [attr.aria-describedby]="showPasswordError() ? 'password-error' : null"
                  />
                  <button type="button" class="control__toggle" (click)="showPassword.set(!showPassword())" [attr.aria-pressed]="showPassword()" [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'">
                    <i class="pi" [ngClass]="showPassword() ? 'pi-eye-slash' : 'pi-eye'"></i>
                  </button>
                </div>
                @if (showPasswordError()) {
                  <p class="field__error" id="password-error"><i class="pi pi-info-circle"></i> Enter your password.</p>
                } @else if (capsOn()) {
                  <p class="field__hint"><i class="pi pi-exclamation-triangle"></i> Caps Lock is on</p>
                }
                @if (helpOpen()) {
                  <p class="help" role="note">
                    <i class="pi pi-info-circle"></i>
                    Passwords are managed by your administrator. Ask them to reset yours, then sign in with the new one.
                  </p>
                }
              </div>

              <!-- Inline error (re-created on every failure so it animates again) -->
              @for (e of errors(); track e.id) {
                <div class="alert" role="alert">
                  <i class="pi pi-exclamation-circle"></i>
                  <span>{{ e.text }}</span>
                </div>
              }

              <button type="submit" class="submit" [disabled]="loading()">
                @if (loading()) {
                  <span class="spinner" aria-hidden="true"></span>
                  <span>Signing in…</span>
                } @else {
                  <span>Sign in</span>
                  <i class="pi pi-arrow-right"></i>
                }
              </button>
            </form>

            @if (demoAccounts.length) {
              <div class="demo">
                <p class="demo__label"><span>Demo accounts</span></p>
                <div class="demo__row">
                  @for (d of demoAccounts; track d.label) {
                    <button type="button" class="chip" (click)="useDemo(d)">
                      <i class="pi" [ngClass]="d.icon"></i> {{ d.label }}
                    </button>
                  }
                </div>
              </div>
            }

            <p class="secure">
              <i class="pi pi-lock"></i>
              {{ secureConnection ? 'Encrypted connection' : 'Private session' }} &middot; signed out when you close this tab
            </p>
          } @else {
            <header class="sheet__head">
              <h1 class="sheet__title">Set a new password</h1>
              <p class="sheet__sub">This account still has the temporary password your administrator issued. Choose a new one to continue.</p>
            </header>

            <form (ngSubmit)="submitPasswordChange()" novalidate class="form" [class.is-busy]="loading()">
              <div class="field" [class.has-error]="showNewPasswordError()">
                <label class="field__label" for="newPassword">New password</label>
                <div class="control">
                  <i class="pi pi-lock control__icon" aria-hidden="true"></i>
                  <input
                    #newPasswordInput
                    id="newPassword"
                    name="newPassword"
                    class="control__input control__input--pw"
                    placeholder="At least 8 characters"
                    autocomplete="new-password"
                    [type]="showPassword() ? 'text' : 'password'"
                    [(ngModel)]="newPassword"
                    (blur)="newPasswordTouched.set(true)"
                    (ngModelChange)="clearError()"
                    [attr.aria-invalid]="showNewPasswordError()"
                  />
                  <button type="button" class="control__toggle" (click)="showPassword.set(!showPassword())" [attr.aria-pressed]="showPassword()" [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'">
                    <i class="pi" [ngClass]="showPassword() ? 'pi-eye-slash' : 'pi-eye'"></i>
                  </button>
                </div>
                @if (showNewPasswordError()) {
                  <p class="field__error"><i class="pi pi-info-circle"></i> {{ newPasswordErrorText() }}</p>
                }
              </div>

              <div class="field" [class.has-error]="showConfirmPasswordError()">
                <label class="field__label" for="confirmPassword">Confirm new password</label>
                <div class="control">
                  <i class="pi pi-lock control__icon" aria-hidden="true"></i>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    class="control__input"
                    placeholder="Type it again"
                    autocomplete="new-password"
                    [type]="showPassword() ? 'text' : 'password'"
                    [(ngModel)]="confirmPassword"
                    (blur)="confirmPasswordTouched.set(true)"
                    (ngModelChange)="clearError()"
                    [attr.aria-invalid]="showConfirmPasswordError()"
                  />
                </div>
                @if (showConfirmPasswordError()) {
                  <p class="field__error"><i class="pi pi-info-circle"></i> Passwords don't match.</p>
                }
              </div>

              @for (e of errors(); track e.id) {
                <div class="alert" role="alert">
                  <i class="pi pi-exclamation-circle"></i>
                  <span>{{ e.text }}</span>
                </div>
              }

              <button type="submit" class="submit" [disabled]="loading()">
                @if (loading()) {
                  <span class="spinner" aria-hidden="true"></span>
                  <span>Setting password…</span>
                } @else {
                  <span>Set password and sign in</span>
                  <i class="pi pi-arrow-right"></i>
                }
              </button>

              <button type="button" class="link" (click)="cancelPasswordChange()">&larr; Back to sign in</button>
            </form>
          }
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        height: 100dvh;
        overflow: hidden; /* the document itself must never scroll */
        --ink: #0f172a;
        --muted: #64748b;
        --line: #dfe4ee;
        --brand-1: #1e1b4b;
        --brand-2: #312e81;
        --brand-3: #4338ca;
        --focus: rgba(99, 102, 241, 0.18);
      }
      * {
        box-sizing: border-box;
      }
      .auth {
        height: 100vh;
        height: 100dvh;
        /* Sized to fit; if a very small screen (or the on-screen keyboard) still
           leaves too little room, this scrolls, but never shows a scrollbar. */
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: none;
        -ms-overflow-style: none;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto 1fr;
        background: #fff;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: var(--ink);
      }

      .auth::-webkit-scrollbar,
      .panel::-webkit-scrollbar {
        display: none;
      }

      /* =================== Brand panel =================== */
      .brand {
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: clamp(0.5rem, 2vh, 1.25rem);
        padding: max(1rem, env(safe-area-inset-top)) 1.25rem 3.75rem;
        color: #fff;
        background: linear-gradient(160deg, var(--brand-1) 0%, var(--brand-2) 48%, var(--brand-3) 100%);
      }
      .brand__glow {
        position: absolute;
        border-radius: 50%;
        filter: blur(60px);
        pointer-events: none;
      }
      .brand__glow--a {
        top: -120px;
        left: -80px;
        width: 340px;
        height: 340px;
        background: rgba(129, 140, 248, 0.5);
      }
      .brand__glow--b {
        right: -120px;
        bottom: -140px;
        width: 320px;
        height: 320px;
        background: rgba(56, 189, 248, 0.25);
      }
      .lockup {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .lockup__mark {
        flex: 0 0 auto;
        filter: drop-shadow(0 6px 14px rgba(15, 23, 42, 0.35));
      }
      .lockup__name {
        font-size: 1.375rem;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .brand__body {
        position: relative;
      }
      .brand__headline {
        margin: 0;
        font-size: 1.375rem;
        line-height: 1.2;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .brand__desc,
      .points,
      .visual,
      .brand__foot {
        display: none;
      }

      /* =================== Form panel =================== */
      .panel {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 0 1rem 1.25rem;
      }
      .sheet {
        position: relative;
        width: 100%;
        max-width: 440px;
        margin-top: -2.75rem;
        padding: clamp(1.25rem, 3.5vh, 2rem) 1.5rem 1.25rem;
        border-radius: 24px;
        background: #fff;
        box-shadow: 0 20px 50px rgba(30, 27, 75, 0.18), 0 2px 8px rgba(15, 23, 42, 0.06);
        animation: rise 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) both;
      }
      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(14px);
        }
      }
      .sheet__head {
        margin-bottom: clamp(0.875rem, 2.6vh, 1.75rem);
      }
      .sheet__title {
        margin: 0;
        font-size: clamp(1.5rem, 4vh, 1.75rem);
        line-height: 1.15;
        font-weight: 700;
        letter-spacing: -0.03em;
      }
      .sheet__sub {
        margin: 0.5rem 0 0;
        font-size: 0.9375rem;
        line-height: 1.5;
        color: var(--muted);
      }

      .form {
        display: flex;
        flex-direction: column;
        gap: clamp(0.75rem, 2.2vh, 1.25rem);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .field__row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
      }
      .field__label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: #334155;
        transition: color 0.15s ease;
      }
      .field:focus-within .field__label {
        color: var(--p-primary-700);
      }

      .control {
        position: relative;
        display: flex;
        align-items: center;
        border: 1.5px solid var(--line);
        border-radius: 14px;
        background: #f8fafc;
        transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
      }
      .control:hover {
        border-color: #c7cfe0;
      }
      .control:focus-within {
        border-color: var(--p-primary-500);
        background: #fff;
        box-shadow: 0 0 0 4px var(--focus);
      }
      .control__icon {
        position: absolute;
        left: 1rem;
        font-size: 1rem;
        color: #94a3b8;
        pointer-events: none;
        transition: color 0.15s ease;
      }
      .control:focus-within .control__icon {
        color: var(--p-primary-600);
      }
      .control__input {
        width: 100%;
        min-width: 0;
        height: clamp(2.75rem, 6.6vh, 3.25rem);
        padding: 0 1rem 0 2.875rem;
        border: none;
        border-radius: 14px;
        background: transparent;
        font: inherit;
        font-size: 1rem; /* 16px: stops iOS zooming into the field */
        color: var(--ink);
        outline: none;
      }
      .control__input--pw {
        padding-right: 3.25rem;
      }
      .control__input::placeholder {
        color: #a3aec2;
      }
      .control__toggle {
        position: absolute;
        right: 0.375rem;
        width: 2.5rem;
        height: 2.5rem;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: #64748b;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .control__toggle:hover {
        background: #eaeef6;
        color: var(--ink);
      }
      .control__toggle:focus-visible {
        outline: 2px solid var(--p-primary-500);
      }

      .field.has-error .control {
        border-color: #f0a3a3;
        background: #fffafa;
      }
      .field.has-error .control:focus-within {
        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.12);
      }
      .field__error,
      .field__hint,
      .help {
        display: flex;
        align-items: flex-start;
        gap: 0.4rem;
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.4;
        animation: fade 0.18s ease both;
      }
      .field__error {
        color: #b42318;
      }
      .field__hint {
        color: #b45309;
      }
      .field__error i,
      .field__hint i,
      .help i {
        margin-top: 0.15rem;
        font-size: 0.8125rem;
      }
      .help {
        padding: 0.75rem 0.875rem;
        border-radius: 12px;
        background: #eef2ff;
        color: #3730a3;
      }
      @keyframes fade {
        from {
          opacity: 0;
          transform: translateY(-3px);
        }
      }
      .link {
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--p-primary-600);
        cursor: pointer;
        border-radius: 4px;
      }
      .link:hover {
        color: var(--p-primary-800, var(--p-primary-700));
        text-decoration: underline;
      }

      /* Soft inline error instead of a harsh red alert */
      .alert {
        display: flex;
        align-items: flex-start;
        gap: 0.625rem;
        padding: 0.75rem 1rem;
        border: 1px solid #fbd5d5;
        border-radius: 12px;
        background: #fff5f5;
        color: #9f1c1c;
        font-size: 0.875rem;
        line-height: 1.45;
        animation: shake 0.42s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
      }
      .alert i {
        margin-top: 0.15rem;
        color: #e05252;
      }
      @keyframes shake {
        10%,
        90% {
          transform: translateX(-1px);
        }
        20%,
        80% {
          transform: translateX(3px);
        }
        30%,
        50%,
        70% {
          transform: translateX(-5px);
        }
        40%,
        60% {
          transform: translateX(5px);
        }
      }

      .submit {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.625rem;
        width: 100%;
        height: clamp(2.875rem, 6.8vh, 3.375rem);
        margin-top: 0.25rem;
        border: none;
        border-radius: 14px;
        background: linear-gradient(135deg, var(--p-primary-600), var(--p-primary-700));
        color: #fff;
        font: inherit;
        font-size: 1rem;
        font-weight: 600;
        letter-spacing: 0.005em;
        cursor: pointer;
        box-shadow: 0 10px 22px rgba(79, 70, 229, 0.32);
        transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
      }
      .submit::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(105deg, transparent 30%, rgba(255, 255, 255, 0.22) 50%, transparent 70%);
        transform: translateX(-120%);
      }
      .submit:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 14px 28px rgba(79, 70, 229, 0.4);
      }
      .submit:hover:not(:disabled)::after {
        transform: translateX(120%);
        transition: transform 0.7s ease;
      }
      .submit:active:not(:disabled) {
        transform: translateY(0) scale(0.99);
      }
      .submit:focus-visible {
        outline: 3px solid var(--focus);
        outline-offset: 3px;
      }
      .submit i {
        font-size: 0.9375rem;
        transition: transform 0.18s ease;
      }
      .submit:hover:not(:disabled) i {
        transform: translateX(4px);
      }
      .submit:disabled {
        cursor: progress;
        filter: saturate(0.85);
      }
      .spinner {
        width: 1.125rem;
        height: 1.125rem;
        border: 2.5px solid rgba(255, 255, 255, 0.4);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* Demo accounts (development builds only) */
      .demo {
        margin-top: clamp(0.75rem, 2.4vh, 1.5rem);
      }
      .demo__label {
        position: relative;
        margin: 0 0 0.75rem;
        text-align: center;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      .demo__label::before {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        height: 1px;
        background: var(--line);
      }
      .demo__label span {
        position: relative;
        padding: 0 0.75rem;
        background: #fff;
      }
      .demo__row {
        display: flex;
        gap: 0.625rem;
      }
      .chip {
        flex: 1 1 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        height: 2.75rem;
        border: 1.5px dashed #cbd3e6;
        border-radius: 12px;
        background: #fff;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        color: #475569;
        cursor: pointer;
        transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease, transform 0.1s ease;
      }
      .chip:hover {
        border-style: solid;
        border-color: var(--p-primary-300);
        background: var(--p-primary-50);
        color: var(--p-primary-700);
      }
      .chip:active {
        transform: scale(0.98);
      }
      .secure {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        margin: clamp(0.75rem, 2.4vh, 1.5rem) 0 0;
        font-size: 0.75rem;
        color: #8a95a8;
        text-align: center;
      }

      /* =================== Desktop: split screen =================== */
      @media (max-width: 959px) {
        .auth {
          background: #f4f6fc;
        }
      }
      @media (min-width: 960px) {
        .auth {
          grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr);
          grid-template-rows: minmax(0, 1fr);
          overflow: hidden;
        }
        .brand {
          justify-content: space-between;
          gap: clamp(0.75rem, 3vh, 2rem);
          min-height: 0;
          padding: clamp(1.25rem, min(4.5vw, 6vh), 4rem);
        }
        .brand__glow--a {
          width: 520px;
          height: 520px;
        }
        .brand__glow--b {
          width: 480px;
          height: 480px;
        }
        .lockup__name {
          font-size: 1.5rem;
        }
        .brand__headline {
          max-width: 14ch;
          text-wrap: balance;
          font-size: clamp(2rem, min(4vw, 6.5vh), 3.5rem);
          line-height: 1.05;
          letter-spacing: -0.035em;
        }
        .brand__desc {
          display: block;
          max-width: 46ch;
          margin: 1.25rem 0 0;
          font-size: 1.0625rem;
          line-height: 1.6;
          color: rgba(224, 231, 255, 0.85);
        }
        .points {
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
          margin: 2rem 0 0;
          padding: 0;
          list-style: none;
        }
        .points li {
          display: flex;
          align-items: center;
          gap: 0.875rem;
          font-size: 0.9375rem;
          color: #e0e7ff;
        }
        .points i {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.25rem;
          height: 2.25rem;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.16);
          font-size: 0.9375rem;
        }
        .brand__foot {
          display: block;
          margin: 0;
          font-size: 0.8125rem;
          color: rgba(199, 210, 254, 0.75);
        }
        .brand__foot::before {
          content: '';
          display: inline-block;
          width: 1.5rem;
          height: 1px;
          margin-right: 0.75rem;
          vertical-align: middle;
          background: rgba(199, 210, 254, 0.5);
        }

        /* floating glass cards */
        .visual {
          position: relative;
          display: block;
          height: 10rem;
          margin-top: 2.5rem;
        }
        .glass {
          position: absolute;
          display: flex;
          align-items: center;
          gap: 0.875rem;
          padding: 0.875rem 1rem;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.25);
          animation: float 7s ease-in-out infinite;
        }
        .glass--a {
          top: 0;
          left: 0;
          width: min(100%, 25rem);
        }
        .glass--b {
          top: 5.5rem;
          left: 3.5rem;
          animation-delay: -3.5s;
        }
        .glass__text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .glass__text b {
          font-size: 0.875rem;
          font-weight: 600;
          white-space: nowrap;
        }
        .glass__text small {
          font-size: 0.75rem;
          color: rgba(224, 231, 255, 0.78);
        }
        .glass__icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.25rem;
          height: 2.25rem;
          border-radius: 10px;
          background: rgba(74, 222, 128, 0.22);
          color: #86efac;
        }
        .tag {
          margin-left: auto;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          background: rgba(74, 222, 128, 0.22);
          font-size: 0.6875rem;
          font-weight: 700;
          white-space: nowrap;
          color: #bbf7d0;
        }
        .qrmini {
          flex: 0 0 auto;
          width: 2.25rem;
          height: 2.25rem;
          border-radius: 8px;
          background-color: #fff;
          background-image: repeating-conic-gradient(#312e81 0 25%, transparent 0 50%);
          background-size: 9px 9px;
          box-shadow: inset 0 0 0 4px #fff;
        }
        @keyframes float {
          50% {
            transform: translateY(-6px);
          }
        }

        .panel {
          align-items: flex-start;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto; /* only if the form is taller than the window; scrollbar hidden */
          padding: clamp(1rem, 3vh, 2rem) 2rem;
          scrollbar-width: none;
          background: linear-gradient(180deg, #fafbff 0%, #fff 60%);
        }
        .sheet {
          max-width: 420px;
          margin-block: auto; /* centres when there is room, top-aligns when there is not */
          padding: 0.5rem 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
        }
        .sheet__title {
          font-size: clamp(1.5rem, 4.4vh, 2rem);
        }
        .demo__label span {
          background: #fdfdff;
        }
      }

      /* Tablet portrait: give the sheet some breathing room */
      @media (min-width: 600px) and (max-width: 959px) {
        .brand {
          padding: 1.75rem 2rem 5rem;
        }
        .brand__headline {
          font-size: 1.75rem;
        }
        .sheet {
          padding: 2.5rem 2.25rem 2rem;
        }
      }

      /* Short windows: decorative brand content steps aside, never the form. */
      @media (min-width: 960px) and (max-height: 860px) {
        .visual {
          display: none;
        }
      }
      @media (min-width: 960px) and (max-height: 700px) {
        .points {
          display: none;
        }
        .brand__desc {
          margin-top: 0.75rem;
          font-size: 0.9375rem;
        }
      }
      @media (min-width: 960px) and (max-height: 560px) {
        .brand__desc {
          display: none;
        }
      }

      /* Stacked layout on short screens: trim the header and the extras. */
      @media (max-width: 959px) and (max-height: 700px) {
        .sheet__sub {
          display: none;
        }
        .brand {
          gap: 0.5rem;
          padding-bottom: 3.25rem;
        }
        .brand__headline {
          font-size: 1.125rem;
        }
      }
      @media (max-width: 959px) and (max-height: 620px) {
        .secure,
        .demo__label {
          display: none;
        }
        .demo {
          margin-top: 0.5rem;
        }
        .field__label {
          font-size: 0.75rem;
        }
      }
      @media (max-width: 359px) {
        .sheet {
          padding-inline: 1.125rem;
        }
        .demo__row {
          gap: 0.5rem;
        }
        .chip {
          font-size: 0.8125rem;
        }
      }

      /* Landscape phones and short landscape tablets: brand on the left, form on
         the right, so the whole form is visible without scrolling. */
      @media (max-height: 520px) and (orientation: landscape) and (max-width: 959px) {
        .auth {
          grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
          grid-template-rows: minmax(0, 1fr);
          overflow: hidden;
        }
        .brand {
          justify-content: center;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
        }
        .brand__body {
          position: relative;
        }
        .brand__headline {
          display: block;
          font-size: clamp(1.125rem, 4.4vw, 1.5rem);
        }
        .brand__foot {
          display: none;
        }
        .panel {
          align-items: flex-start;
          overflow-y: auto;
          padding: 0.75rem 1rem;
          scrollbar-width: none;
          background: #f4f6fc;
        }
        .sheet {
          margin-block: auto;
          max-width: 420px;
          padding: 0.875rem 1.25rem 0.75rem;
          border-radius: 18px;
        }
        .sheet__head {
          margin-bottom: 0.625rem;
        }
        .sheet__title {
          font-size: 1.25rem;
        }
        .sheet__sub,
        .secure,
        .demo__label {
          display: none;
        }
        .form {
          gap: 0.625rem;
        }
        .field {
          gap: 0.25rem;
        }
        .control__input {
          height: 2.5rem;
        }
        .submit {
          height: 2.625rem;
          margin-top: 0;
        }
        .demo {
          margin-top: 0.5rem;
        }
        .chip {
          height: 2.25rem;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation: none !important;
          transition: none !important;
        }
      }
    `,
  ],
})
export class LoginComponent {
  @ViewChild('usernameInput') usernameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') passwordInput?: ElementRef<HTMLInputElement>;
  @ViewChild('newPasswordInput') newPasswordInput?: ElementRef<HTMLInputElement>;

  username = '';
  password = '';

  loading = signal(false);
  showPassword = signal(false);
  capsOn = signal(false);
  helpOpen = signal(false);
  usernameTouched = signal(false);
  passwordTouched = signal(false);
  submitted = signal(false);
  errors = signal<{ id: number; text: string }[]>([]);
  private errorSeq = 0;

  /**
   * 'changePassword' = a temporary/admin-issued password was accepted by
   * Keycloak but still needs replacing before a session can start (see
   * AuthService.login / PasswordChangeRequiredError). `password` above is
   * reused as the verified current (temporary) password for that step.
   */
  mode = signal<'login' | 'changePassword'>('login');
  newPassword = '';
  confirmPassword = '';
  newPasswordTouched = signal(false);
  confirmPasswordTouched = signal(false);

  readonly secureConnection = typeof location !== 'undefined' && location.protocol === 'https:';

  /**
   * One-tap demo sign-ins; only offered in development builds.
   * The platform has exactly one admin account. Its dev-only credentials
   * (admin / admin) are fixed for convenience while building — they must
   * be replaced with a real, secure password (or a forced first-login
   * reset) before any non-development deployment. See
   * keycloak/printsetu-realm.json.
   */
  readonly demoAccounts: DemoAccount[] = environment.production
    ? []
    : [
        { label: 'Admin', icon: 'pi-shield', username: 'admin', password: 'admin' },
        { label: 'Shopkeeper', icon: 'pi-shop', username: 'shopkeeper.demo@printsetu.local', password: 'Shop@12345' },
      ];

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  showUsernameError(): boolean {
    return !this.username.trim() && (this.usernameTouched() || this.submitted());
  }

  showPasswordError(): boolean {
    // While a sign-in error is on screen the password was cleared on purpose; don't nag on top of it.
    return !this.password && this.errors().length === 0 && (this.passwordTouched() || this.submitted());
  }

  checkCaps(event: KeyboardEvent): void {
    this.capsOn.set(!!event.getModifierState?.('CapsLock'));
  }

  clearError(): void {
    if (this.errors().length) this.errors.set([]);
  }

  useDemo(account: DemoAccount): void {
    this.username = account.username;
    this.password = account.password;
    this.usernameTouched.set(false);
    this.passwordTouched.set(false);
    this.submitted.set(false);
    this.clearError();
  }

  async submit(): Promise<void> {
    if (this.loading()) return;
    this.submitted.set(true);
    if (!this.username.trim()) {
      this.usernameInput?.nativeElement.focus();
      return;
    }
    if (!this.password) {
      this.passwordInput?.nativeElement.focus();
      return;
    }

    this.loading.set(true);
    this.clearError();
    try {
      const user = await this.auth.login(this.username.trim(), this.password);
      this.router.navigate([user.role === 'ADMIN' ? '/admin' : '/shop']);
    } catch (err) {
      if (err instanceof PasswordChangeRequiredError) {
        // Credentials were correct — keep them (password becomes the
        // verified "current password" for the change-password step) and
        // switch screens instead of showing an error.
        this.mode.set('changePassword');
        this.submitted.set(false);
        setTimeout(() => this.newPasswordInput?.nativeElement.focus());
        return;
      }
      this.errors.set([{ id: ++this.errorSeq, text: this.describe(err) }]);
      this.password = '';
      this.passwordTouched.set(false);
      this.submitted.set(false);
      setTimeout(() => this.passwordInput?.nativeElement.focus());
    } finally {
      this.loading.set(false);
    }
  }

  showNewPasswordError(): boolean {
    return !!this.newPasswordErrorText() && (this.newPasswordTouched() || this.submitted());
  }

  newPasswordErrorText(): string {
    if (!this.newPassword) return 'Enter a new password.';
    if (this.newPassword.length < 8) return 'Password must be at least 8 characters.';
    if (this.newPassword === this.password) return 'Choose a password different from the temporary one.';
    return '';
  }

  showConfirmPasswordError(): boolean {
    return (
      !!this.confirmPassword &&
      this.confirmPassword !== this.newPassword &&
      (this.confirmPasswordTouched() || this.submitted())
    );
  }

  async submitPasswordChange(): Promise<void> {
    if (this.loading()) return;
    this.submitted.set(true);
    if (this.newPasswordErrorText()) {
      this.newPasswordInput?.nativeElement.focus();
      return;
    }
    if (this.confirmPassword !== this.newPassword) {
      return;
    }

    this.loading.set(true);
    this.clearError();
    try {
      const user = await this.auth.changeTemporaryPassword(this.username.trim(), this.password, this.newPassword);
      this.router.navigate([user.role === 'ADMIN' ? '/admin' : '/shop']);
    } catch (err) {
      this.errors.set([{ id: ++this.errorSeq, text: this.describe(err) }]);
      this.submitted.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  cancelPasswordChange(): void {
    this.mode.set('login');
    this.password = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.submitted.set(false);
    this.clearError();
    setTimeout(() => this.passwordInput?.nativeElement.focus());
  }

  /** Human, specific-enough messages; never leaks which of the two fields was wrong. */
  private describe(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return "We can't reach the server. Check your internet connection and try again.";
      if (err.status === 429) return 'Too many sign-in attempts. Please wait a minute and try again.';
      if (err.status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
      if (err.status === 400) return err.error?.message || 'That password is not valid. Please try a different one.';
      return "That email or password doesn't match. Please check and try again.";
    }
    if (err instanceof Error) return err.message;
    return "We couldn't sign you in. Please try again.";
  }
}
