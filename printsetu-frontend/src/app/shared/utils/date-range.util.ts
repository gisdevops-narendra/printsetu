/** Admin date filters: Today / This week / This month / Custom. */
export type Preset = 'today' | 'week' | 'month' | 'custom';

/** YYYY-MM-DD of a local date. */
export function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Inclusive [from, to] for a preset; weeks start on Monday. */
export function presetRange(preset: Exclude<Preset, 'custom'>, now = new Date()): [string, string] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'today') return [ymd(today), ymd(today)];
  if (preset === 'week') {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return [ymd(monday), ymd(today)];
  }
  return [ymd(new Date(today.getFullYear(), today.getMonth(), 1)), ymd(today)];
}
