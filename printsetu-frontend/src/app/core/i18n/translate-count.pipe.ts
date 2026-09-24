import { Pipe, PipeTransform } from '@angular/core';
import { tn } from './i18n';

/**
 * `{{ 'common.count.pages' | translateCount: n }}` -> "3 pages" / "1 page".
 * Impure: re-renders when the language changes.
 */
@Pipe({ name: 'translateCount', standalone: true, pure: false })
export class TranslateCountPipe implements PipeTransform {
  transform(key: string, count: number | null | undefined, params?: Record<string, unknown>): string {
    return tn(key, count ?? 0, params);
  }
}
