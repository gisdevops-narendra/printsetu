import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastModule, ConfirmDialogModule],
  template: `
    <p-toast position="top-right" [breakpoints]="{ '640px': { width: 'calc(100% - 1.5rem)', right: '0.75rem', left: '0.75rem' } }" />
    <p-confirmDialog />
    <router-outlet />
  `,
})
export class App {}
