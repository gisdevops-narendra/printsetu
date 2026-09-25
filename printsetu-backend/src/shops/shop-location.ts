import { BadRequestException } from '@nestjs/common';

/**
 * A shop's optional map position (Business Map). Latitude and longitude come
 * as a pair: both set, or both null (not placed on the map).
 */
export interface ShopLocation {
  latitude: number | null;
  longitude: number | null;
}

export function resolveLocation(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): ShopLocation {
  const lat = latitude ?? null;
  const lng = longitude ?? null;
  if (lat === null && lng === null) return { latitude: null, longitude: null };
  if (lat === null || lng === null) {
    throw new BadRequestException('Pick the shop location on the map again.');
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new BadRequestException('That map location is not valid. Pick it on the map again.');
  }
  // ~1 m precision is plenty for a shop pin.
  return { latitude: Math.round(lat * 1e5) / 1e5, longitude: Math.round(lng * 1e5) / 1e5 };
}

/** Trims an optional district; empty = none. */
export function cleanDistrict(district: string | null | undefined): string | null {
  const value = district?.trim();
  return value ? value.slice(0, 80) : null;
}
