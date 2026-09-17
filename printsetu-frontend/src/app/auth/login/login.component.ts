import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule, PasswordModule, MessageModule],
  template: `
    <div class="login-page flex align-items-center justify-content-center">
      <p-card styleClass="login-card">
        <div class="text-center mb-4">
          <h1 class="text-3xl font-bold m-0" style="color: var(--p-primary-600)">PrintSetu</h1>
          <p class="text-color-secondary mt-2 mb-0">Shop &amp; admin sign in</p>
        </div>

        <form (ngSubmit)="submit()" class="flex flex-column gap-3">
          <div class="flex flex-column gap-2">
            <label for="username">Email</label>
            <input pInputText id="username" name="username" [(ngModel)]="username" autocomplete="username" />
          </div>
          <div class="flex flex-column gap-2">
            <label for="password">Password</label>
            <p-password
              id="password"
              name="password"
              [(ngModel)]="password"
              [feedback]="false"
              [toggleMask]="true"
              styleClass="w-full"
              inputStyleClass="w-full"
            />
          </div>

          @if (error()) {
            <p-message severity="error" [text]="error()!" />
          }

          <p-button
            type="submit"
            label="Sign in"
            styleClass="w-full mt-2"
            [loading]="loading()"
            [disabled]="!username || !password"
          />
        </form>

        <p class="text-xs text-color-secondary text-center mt-4 mb-0">
          Demo: admin.demo&#64;printsetu.local / Admin&#64;12345 &middot; shopkeeper.demo&#64;printsetu.local / Shop&#64;12345
        </p>
      </p-card>
    </div>
  `,
  styles: [
    `
      .login-page {
        min-height: 100vh;
        background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 60%);
        padding: 1rem;
      }
      :host ::ng-deep .login-card {
        width: 100%;
        max-width: 400px;
        border-radius: 16px;
      }
    `,
  ],
})
export class LoginComponent {
  username = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  async submit(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.login(this.username, this.password);
      this.router.navigate([user.role === 'ADMIN' ? '/admin' : '/shop']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Login failed. Check your credentials.');
    } finally {
      this.loading.set(false);
    }
  }
}
