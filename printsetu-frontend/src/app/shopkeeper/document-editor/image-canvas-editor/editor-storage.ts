/**
 * Browser-local persistence for the image editor: named presets, the shop's
 * saved logo, and each document's saved-edit history. localStorage is
 * per browser (not synced across devices); every access is guarded because
 * it can throw (private windows, blocked storage) or hit its quota.
 */

import type { ColorEffect, FitMode } from './editor-core';
import { t } from '../../../core/i18n/i18n';

const PRESETS_KEY = 'printsetu.editor.presets.v1';
const STAMP_KEY = 'printsetu.editor.stamp.v1';
const VERSIONS_PREFIX = 'printsetu.editor.versions.v1.';
const MAX_VERSIONS = 10;
const MAX_STAMP_CHARS = 600_000;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---------- Presets ----------

export interface EditorPreset {
  id: string;
  name: string;
  builtin?: boolean;
  adjust: { brightness: number; contrast: number; saturation: number; effect: ColorEffect };
  layout: { fitMode: FitMode; marginMm: number; borderMm: number; borderColor: string };
}

export const BUILTIN_PRESETS: EditorPreset[] = [
  {
    id: 'builtin-scan',
    get name() { return t('imageEditor.clean_document_scan'); },
    builtin: true,
    adjust: { brightness: 12, contrast: 35, saturation: 0, effect: 'bw' },
    layout: { fitMode: 'fit', marginMm: 8, borderMm: 0, borderColor: '#000000' },
  },
  {
    id: 'builtin-photo',
    get name() { return t('imageEditor.vivid_photo'); },
    builtin: true,
    adjust: { brightness: 4, contrast: 12, saturation: 22, effect: 'none' },
    layout: { fitMode: 'fill', marginMm: 0, borderMm: 0, borderColor: '#000000' },
  },
  {
    id: 'builtin-id',
    get name() { return t('imageEditor.grayscale_id_copy'); },
    builtin: true,
    adjust: { brightness: 6, contrast: 20, saturation: 0, effect: 'grayscale' },
    layout: { fitMode: 'fit', marginMm: 10, borderMm: 0.5, borderColor: '#000000' },
  },
];

export function loadPresets(): EditorPreset[] {
  return read<EditorPreset[]>(PRESETS_KEY) ?? [];
}

export function savePresets(presets: EditorPreset[]): void {
  write(PRESETS_KEY, presets);
}

// ---------- Logo / stamp ----------

export function loadStamp(): string | null {
  return read<string>(STAMP_KEY);
}

export function saveStamp(dataUrl: string): boolean {
  if (dataUrl.length > MAX_STAMP_CHARS) return false;
  return write(STAMP_KEY, dataUrl);
}

export function clearStamp(): void {
  try {
    localStorage.removeItem(STAMP_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- Per-document edit history ----------

export interface EditorVersion {
  id: string;
  savedAt: number;
  label: string;
  /** Tiny JPEG data URL of what was saved. */
  thumb: string;
  /** Opaque editor state (the component's own snapshot type). */
  state: unknown;
}

interface StoredVersions {
  versions: EditorVersion[];
  /** State to reopen the editor with (cleared by "Revert to original"). */
  latest: unknown | null;
}

function readVersions(key: string): StoredVersions {
  return read<StoredVersions>(VERSIONS_PREFIX + key) ?? { versions: [], latest: null };
}

export function loadVersions(key: string): EditorVersion[] {
  return readVersions(key).versions;
}

export function loadLatestState(key: string): unknown | null {
  return readVersions(key).latest;
}

export function addVersion(key: string, version: EditorVersion): void {
  const stored = readVersions(key);
  stored.versions = [version, ...stored.versions].slice(0, MAX_VERSIONS);
  stored.latest = version.state;
  // Quota: shed the oldest versions (then thumbnails) until it fits.
  while (!write(VERSIONS_PREFIX + key, stored) && stored.versions.length > 1) {
    stored.versions.pop();
  }
}

export function clearLatestState(key: string): void {
  const stored = readVersions(key);
  stored.latest = null;
  write(VERSIONS_PREFIX + key, stored);
}
