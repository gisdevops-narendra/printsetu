import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TagModule } from 'primeng/tag';
import { PrintJobStatus } from '../../../core/models/models';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

const STATUS_META: Record<PrintJobStatus, { label: string; severity: Severity }> = {
  CREATED: { label: 'Created', severity: 'secondary' },
  PRINT_ELIGIBLE: { label: 'Ready to Print', severity: 'info' },
  QUEUED: { label: 'Queued', severity: 'info' },
  PRINTING: { label: 'Printing', severity: 'warn' },
  PRINTED: { label: 'Printed', severity: 'success' },
  RETENTION_PENDING: { label: 'Printed (cleanup pending)', severity: 'success' },
  DELETED: { label: 'Completed', severity: 'success' },
  PRINT_FAILED: { label: 'Print Failed', severity: 'danger' },
  AGENT_OFFLINE: { label: 'Printer Offline', severity: 'danger' },
  PRINT_UNKNOWN: { label: 'Needs Review', severity: 'warn' },
  CANCELLED: { label: 'Cancelled', severity: 'secondary' },
};

@Component({
  selector: 'app-status-tag',
  standalone: true,
  imports: [CommonModule, TagModule],
  template: `<p-tag [value]="meta.label" [severity]="meta.severity" />`,
})
export class StatusTagComponent {
  @Input({ required: true }) status!: PrintJobStatus;

  get meta() {
    return STATUS_META[this.status] ?? { label: this.status, severity: 'secondary' as Severity };
  }
}
