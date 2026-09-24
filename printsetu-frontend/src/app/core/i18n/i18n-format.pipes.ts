import { Pipe, PipeTransform, inject } from '@angular/core';
import { formatDate, formatNumber } from '@angular/common';
import { LanguageService } from './language.service';

/**
 * `date` that follows the chosen UI language (month and day names in Hindi /
 * Gujarati). Impure so it re-renders when the language changes.
 */
@Pipe({ name: 'appDate', standalone: true, pure: false })
export class AppDatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: string | number | Date | null | undefined, format = 'mediumDate'): string | null {
    if (value === null || value === undefined || value === '') return null;
    return formatDate(value, format, this.language.locale());
  }
}

/** `number` that follows the chosen UI language. */
@Pipe({ name: 'appNumber', standalone: true, pure: false })
export class AppNumberPipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: number | string | null | undefined, digitsInfo?: string): string | null {
    if (value === null || value === undefined || value === '') return null;
    const num = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(num)) return null;
    return formatNumber(num, this.language.locale(), digitsInfo);
  }
}
