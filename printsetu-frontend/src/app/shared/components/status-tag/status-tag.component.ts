import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TagModule } from 'primeng/tag';
import { PrintJobStatus } from '../../../core/models/models';
import { t } from '../../../core/i18n/i18n';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

const STATUS_META: Record<PrintJobStatus, { label: string; severity: Severity }> = {
  CREATED: { get label() { return t('shared.new_2'); }, severity: 'secondary' },
  PRINT_ELIGIBLE: { get label() { return t('shared.ready_to_print'); }, severity: 'info' },
  QUEUED: { get label() { return t('common.pending'); }, severity: 'info' },
  PRINTING: { get label() { return t('common.printing'); }, severity: 'warn' },
  PRINTED: { get label() { return t('common.printed'); }, severity: 'success' },
  // After printing, the file is cleaned up; to the shopkeeper the job is simply printed.
  RETENTION_PENDING: { get label() { return t('common.printed'); }, severity: 'success' },
  DELETED: { get label() { return t('common.printed'); }, severity: 'success' },
  PRINT_FAILED: { get label() { return t('shared.print_failed'); }, severity: 'danger' },
  AGENT_OFFLINE: { get label() { return t('shared.printer_offline'); }, severity: 'danger' },
  PRINT_UNKNOWN: { get label() { return t('shared.check_if_printed'); }, severity: 'warn' },
  CANCELLED: { get label() { return t('common.cancelled'); }, severity: 'secondary' },
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
