import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ShopStatus } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import {
  BBox,
  TILE_DEG,
  distanceMeters,
  inBBox,
  parseBBox,
  tileBBox,
  tileKey,
  tilesFor,
} from './geo';

export type PlaceCategory = 'college' | 'school' | 'office' | 'government';
export const PLACE_CATEGORIES: PlaceCategory[] = ['college', 'school', 'office', 'government'];

export interface Place {
  id: string;
  name: string | null;
  category: PlaceCategory;
  lat: number;
  lon: number;
}

/** Cached tiles are reused this long before being fetched again. */
export const TILE_MAX_AGE_MS = 14 * 86_400_000;
/** At most this many tiles (0.1 degree, ~11 km each) per request: about a city. */
export const MAX_TILES_PER_REQUEST = 16;
/** Places per tile we keep (dense city centres can have thousands of offices). */
const MAX_PLACES_PER_TILE = 1500;
export const DEFAULT_RADIUS_M = 1000;

/** Overpass QL for the places a print shop can serve, inside [south, west, north, east]. */
export function overpassQuery([w, s, e, n]: BBox, limit = MAX_PLACES_PER_TILE): string {
  const box = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:25];
(
  nwr["amenity"~"^(college|university)$"]${box};
  nwr["amenity"="school"]${box};
  nwr["office"="government"]${box};
  nwr["amenity"~"^(townhall|courthouse)$"]${box};
  nwr["office"]["name"]["office"!="government"]${box};
);
out center tags ${limit};`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function toPlace(el: OverpassElement): Place | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const tags = el.tags ?? {};
  if (lat === undefined || lon === undefined) return null;
  let category: PlaceCategory | null = null;
  if (tags.amenity === 'college' || tags.amenity === 'university') category = 'college';
  else if (tags.amenity === 'school') category = 'school';
  else if (
    tags.office === 'government' ||
    tags.amenity === 'townhall' ||
    tags.amenity === 'courthouse'
  ) {
    category = 'government';
  } else if (tags.office) category = 'office';
  if (!category) return null;
  return {
    id: `${el.type}/${el.id}`,
    name: tags['name:en'] || tags.name || null,
    category,
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
  };
}

/**
 * Business Map "coverage gaps": colleges, schools, offices and government
 * buildings from OpenStreetMap, each marked covered or not by whether an
 * active PrintSetu shop is within the radius. Places are fetched from the
 * Overpass API per 0.1-degree tile and cached in the database
 * (map_place_tiles) for TILE_MAX_AGE_MS, so page loads don't hit Overpass.
 */
@Injectable()
export class CoverageService {
  private readonly logger = new Logger(CoverageService.name);
  /** Tiles being fetched right now, so two admins viewing the same area share one request. */
  private readonly inFlight = new Map<string, Promise<Map<string, Place[]> | null>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async coverage(query: { bbox?: string; radius?: string | number }) {
    const bbox = parseBBox(query.bbox);
    const radius = clampRadius(Number(query.radius ?? DEFAULT_RADIUS_M));
    const tiles = tilesFor(bbox);
    if (tiles.length > MAX_TILES_PER_REQUEST) {
      throw new BadRequestException('Zoom in closer (to about one city) to see coverage gaps.');
    }

    const { tiles: loaded, failedTiles } = await this.loadTiles(tiles);
    let oldestFetch: Date | null = null;
    const places: Place[] = [];
    for (const tile of loaded) {
      if (!oldestFetch || tile.fetchedAt < oldestFetch) oldestFetch = tile.fetchedAt;
      for (const place of tile.places) if (inBBox(place.lat, place.lon, bbox)) places.push(place);
    }

    const shops = await this.prisma.shop.findMany({
      where: { status: ShopStatus.ACTIVE, latitude: { not: null }, longitude: { not: null } },
      select: { latitude: true, longitude: true },
    });
    const features = places.map((place) => {
      const nearest = nearestDistance(
        place,
        shops as { latitude: number; longitude: number }[],
        radius,
      );
      return {
        type: 'Feature' as const,
        id: place.id,
        geometry: { type: 'Point' as const, coordinates: [place.lon, place.lat] },
        properties: {
          id: place.id,
          name: place.name,
          category: place.category,
          nearestShopM: nearest === null ? null : Math.round(nearest),
          covered: nearest !== null && nearest <= radius,
        },
      };
    });

    const byCategory = Object.fromEntries(
      PLACE_CATEGORIES.map((category) => {
        const ofCategory = features.filter((f) => f.properties.category === category);
        const covered = ofCategory.filter((f) => f.properties.covered).length;
        return [category, { total: ofCategory.length, covered, gaps: ofCategory.length - covered }];
      }),
    );
    return {
      type: 'FeatureCollection' as const,
      features,
      meta: {
        radius,
        byCategory,
        gaps: features.filter((f) => !f.properties.covered).length,
        failedTiles,
        dataAsOf: oldestFetch?.toISOString() ?? null,
      },
    };
  }

  /**
   * The tiles' places: fresh ones from the cache, and every missing or stale
   * tile in ONE Overpass request (the public server allows very few
   * parallel requests), split back into tiles and cached. If Overpass fails,
   * a stale cached copy is used; a tile with neither counts as failed.
   */
  private async loadTiles(
    tiles: { x: number; y: number }[],
  ): Promise<{ tiles: { places: Place[]; fetchedAt: Date }[]; failedTiles: number }> {
    const keys = tiles.map(({ x, y }) => tileKey(x, y));
    const cached = new Map(
      (await this.prisma.mapPlaceTile.findMany({ where: { key: { in: keys } } })).map((row) => [
        row.key,
        row,
      ]),
    );
    const now = Date.now();
    const stale = tiles.filter(({ x, y }) => {
      const row = cached.get(tileKey(x, y));
      return !row || now - row.fetchedAt.getTime() >= TILE_MAX_AGE_MS;
    });

    let fetched: Map<string, Place[]> | null = null;
    if (stale.length) {
      const flightKey = stale
        .map(({ x, y }) => tileKey(x, y))
        .sort()
        .join('|');
      let request = this.inFlight.get(flightKey);
      if (!request) {
        request = this.fetchTiles(stale).finally(() => this.inFlight.delete(flightKey));
        this.inFlight.set(flightKey, request);
      }
      fetched = await request;
      if (fetched) {
        const fetchedAt = new Date();
        await Promise.all(
          [...fetched].map(([key, places]) => {
            const data = { places: places as unknown as Prisma.InputJsonValue, fetchedAt };
            return this.prisma.mapPlaceTile.upsert({
              where: { key },
              create: { key, ...data },
              update: data,
            });
          }),
        );
        for (const [key, places] of fetched)
          cached.set(key, { key, places: places as unknown as Prisma.JsonValue, fetchedAt });
      }
    }

    const result: { places: Place[]; fetchedAt: Date }[] = [];
    let failedTiles = 0;
    for (const key of keys) {
      const row = cached.get(key);
      if (row) result.push({ places: row.places as unknown as Place[], fetchedAt: row.fetchedAt });
      else failedTiles++;
    }
    return { tiles: result, failedTiles };
  }

  /** One Overpass request covering all `tiles`; the places come back grouped by tile key (every tile present, maybe empty). */
  private async fetchTiles(
    tiles: { x: number; y: number }[],
  ): Promise<Map<string, Place[]> | null> {
    const xs = tiles.map((t) => t.x);
    const ys = tiles.map((t) => t.y);
    const [w, s] = tileBBox(Math.min(...xs), Math.min(...ys));
    const [, , e, n] = tileBBox(Math.max(...xs), Math.max(...ys));
    try {
      const data = await this.overpass(
        overpassQuery([w, s, e, n], MAX_PLACES_PER_TILE * tiles.length),
      );
      const byTile = new Map<string, Place[]>(tiles.map(({ x, y }) => [tileKey(x, y), []]));
      const seen = new Set<string>();
      for (const el of data.elements ?? []) {
        const place = toPlace(el);
        if (!place || seen.has(place.id)) continue;
        seen.add(place.id);
        // Only the tiles that were asked for (the request's box can also cover fresh ones).
        byTile
          .get(tileKey(Math.floor(place.lon / TILE_DEG), Math.floor(place.lat / TILE_DEG)))
          ?.push(place);
      }
      return byTile;
    } catch (err) {
      this.logger.warn(
        `Could not fetch OpenStreetMap places for ${tiles.length} tile(s): ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Runs an Overpass query. The public servers often answer "busy" (429 /
   * 504) or time out, so retry a few times with a growing pause, rotating
   * through the configured servers (OVERPASS_URL may list several, comma-separated).
   */
  private async overpass(query: string): Promise<{ elements?: OverpassElement[] }> {
    const urls = this.config
      .get('map', { infer: true })
      .overpassUrl.split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    let lastError: unknown;
    for (let attempt = 0; attempt < OVERPASS_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(OVERPASS_RETRY_MS * attempt);
      try {
        const { data } = await axios.post<{ elements?: OverpassElement[] }>(
          urls[attempt % urls.length],
          new URLSearchParams({ data: query }),
          {
            timeout: 45_000,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'PrintSetu-BusinessMap/1.0 (admin coverage map)',
            },
          },
        );
        return data;
      } catch (err) {
        lastError = err;
        if (!isRetryable(err)) break;
      }
    }
    throw lastError;
  }
}

const OVERPASS_ATTEMPTS = 3;
const OVERPASS_RETRY_MS = 2500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Busy / overloaded / timed out: worth another try. A bad query (400) is not. */
function isRetryable(err: unknown): boolean {
  const e = err as { response?: { status?: number }; code?: string };
  const status = e.response?.status;
  if (status) return status === 429 || status >= 500;
  return true;
}

export function clampRadius(radius: number): number {
  if (!Number.isFinite(radius)) return DEFAULT_RADIUS_M;
  return Math.min(10_000, Math.max(100, Math.round(radius)));
}

/** Distance to the closest shop, or null when none is within 10 x radius (not worth measuring). */
export function nearestDistance(
  place: { lat: number; lon: number },
  shops: { latitude: number; longitude: number }[],
  radius: number,
): number | null {
  const limit = radius * 10;
  const latWindow = limit / 111_000;
  let best: number | null = null;
  for (const shop of shops) {
    if (Math.abs(shop.latitude - place.lat) > latWindow) continue;
    const d = distanceMeters(place.lat, place.lon, shop.latitude, shop.longitude);
    if (d <= limit && (best === null || d < best)) best = d;
  }
  return best;
}
