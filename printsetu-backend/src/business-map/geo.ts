import { BadRequestException } from '@nestjs/common';

/** [west, south, east, north] in degrees. */
export type BBox = [number, number, number, number];

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Parses "west,south,east,north". */
export function parseBBox(raw: string | undefined): BBox {
  const parts = (raw ?? '').split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new BadRequestException('Move the map a little and try again.');
  }
  const [w, s, e, n] = parts;
  if (
    w >= e ||
    s >= n ||
    Math.abs(s) > 90 ||
    Math.abs(n) > 90 ||
    Math.abs(w) > 180 ||
    Math.abs(e) > 180
  ) {
    throw new BadRequestException('Move the map a little and try again.');
  }
  return [w, s, e, n];
}

/** Size of one cached OpenStreetMap place tile, in degrees (about 11 km). */
export const TILE_DEG = 0.1;

/** Key of the tile containing (lon, lat), e.g. "725:230" (x = floor(lon / TILE_DEG)). */
export function tileKey(x: number, y: number): string {
  return `${x}:${y}`;
}

/** The [west, south, east, north] of tile (x, y). */
export function tileBBox(x: number, y: number): BBox {
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return [r(x * TILE_DEG), r(y * TILE_DEG), r((x + 1) * TILE_DEG), r((y + 1) * TILE_DEG)];
}

/** Every tile overlapping `bbox`. */
export function tilesFor(bbox: BBox): { x: number; y: number }[] {
  const [w, s, e, n] = bbox;
  const tiles: { x: number; y: number }[] = [];
  for (let x = Math.floor(w / TILE_DEG); x * TILE_DEG < e; x++) {
    for (let y = Math.floor(s / TILE_DEG); y * TILE_DEG < n; y++) tiles.push({ x, y });
  }
  return tiles;
}

export function inBBox(lat: number, lon: number, [w, s, e, n]: BBox): boolean {
  return lon >= w && lon <= e && lat >= s && lat <= n;
}
