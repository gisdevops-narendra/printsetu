import axios from 'axios';
import { CoverageService, nearestDistance, overpassQuery, toPlace } from './coverage.service';
import { distanceMeters, parseBBox, tilesFor } from './geo';

jest.mock('axios');

describe('geo helpers', () => {
  it('measures distance in metres', () => {
    // 0.01 degree of latitude is about 1.11 km.
    expect(distanceMeters(23, 72.5, 23.01, 72.5)).toBeGreaterThan(1100);
    expect(distanceMeters(23, 72.5, 23.01, 72.5)).toBeLessThan(1115);
  });

  it('covers a bbox with 0.1-degree tiles', () => {
    expect(tilesFor([72.55, 23.01, 72.6, 23.04])).toEqual([{ x: 725, y: 230 }]);
    expect(tilesFor([72.55, 23.01, 72.65, 23.04])).toHaveLength(2);
  });

  it('rejects a malformed bbox', () => {
    expect(() => parseBBox('1,2,3')).toThrow();
    expect(() => parseBBox('10,20,5,25')).toThrow();
  });
});

describe('toPlace', () => {
  it.each([
    [{ amenity: 'university', name: 'Uni' }, 'college'],
    [{ amenity: 'school' }, 'school'],
    [{ office: 'government' }, 'government'],
    [{ amenity: 'townhall' }, 'government'],
    [{ office: 'company', name: 'Acme' }, 'office'],
  ])('%j -> %s', (tags, category) => {
    expect(toPlace({ type: 'node', id: 1, lat: 23, lon: 72, tags })?.category).toBe(category);
  });

  it('uses the centre of areas and drops unrelated or position-less elements', () => {
    expect(
      toPlace({
        type: 'way',
        id: 2,
        center: { lat: 23.1, lon: 72.2 },
        tags: { amenity: 'school' },
      }),
    ).toMatchObject({
      id: 'way/2',
      lat: 23.1,
      lon: 72.2,
    });
    expect(
      toPlace({ type: 'node', id: 3, lat: 23, lon: 72, tags: { amenity: 'cafe' } }),
    ).toBeNull();
    expect(toPlace({ type: 'way', id: 4, tags: { amenity: 'school' } })).toBeNull();
  });

  it('builds an Overpass query in south,west,north,east order', () => {
    expect(overpassQuery([72.5, 23, 72.6, 23.1])).toContain('(23,72.5,23.1,72.6)');
  });
});

describe('nearestDistance', () => {
  it('finds the closest shop, or null when none is near', () => {
    const shops = [
      { latitude: 23.005, longitude: 72.5 },
      { latitude: 23.02, longitude: 72.5 },
    ];
    expect(nearestDistance({ lat: 23, lon: 72.5 }, shops, 1000)).toBeCloseTo(556, -1);
    expect(nearestDistance({ lat: 24, lon: 72.5 }, shops, 1000)).toBeNull();
  });
});

describe('CoverageService', () => {
  const mockedPost = axios.post as jest.Mock;
  let prisma: any;
  let service: CoverageService;
  const tileRow = (fetchedAt: Date) => ({
    key: '725:230',
    fetchedAt,
    places: [
      { id: 'node/1', name: 'Near School', category: 'school', lat: 23.02, lon: 72.57 },
      { id: 'node/2', name: 'Far College', category: 'college', lat: 23.035, lon: 72.595 },
    ],
  });

  beforeEach(() => {
    mockedPost.mockReset();
    prisma = {
      mapPlaceTile: { findMany: jest.fn(), upsert: jest.fn().mockResolvedValue({}) },
      shop: { findMany: jest.fn().mockResolvedValue([{ latitude: 23.0225, longitude: 72.5714 }]) },
    };
    service = new CoverageService(prisma, {
      get: jest.fn(() => ({ overpassUrl: 'https://overpass.test/api' })),
    } as any);
  });

  it('uses a fresh cached tile without calling Overpass, and marks places covered within the radius', async () => {
    prisma.mapPlaceTile.findMany.mockResolvedValue([tileRow(new Date())]);

    const result = await service.coverage({ bbox: '72.55,23.01,72.60,23.04', radius: '1000' });

    expect(mockedPost).not.toHaveBeenCalled();
    expect(result.features.map((f) => [f.properties.name, f.properties.covered])).toEqual([
      ['Near School', true],
      ['Far College', false],
    ]);
    expect(result.meta).toMatchObject({ radius: 1000, gaps: 1, failedTiles: 0 });
    expect(result.meta.byCategory.school).toEqual({ total: 1, covered: 1, gaps: 0 });
  });

  it('fetches a missing tile from Overpass and caches it', async () => {
    prisma.mapPlaceTile.findMany.mockResolvedValue([]);
    mockedPost.mockResolvedValue({
      data: {
        elements: [
          {
            type: 'node',
            id: 9,
            lat: 23.03,
            lon: 72.58,
            tags: { office: 'government', name: 'Collectorate' },
          },
        ],
      },
    });

    const result = await service.coverage({ bbox: '72.55,23.01,72.60,23.04' });

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(prisma.mapPlaceTile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: '725:230' } }),
    );
    expect(result.features[0].properties).toMatchObject({
      name: 'Collectorate',
      category: 'government',
    });
  });

  it('retries when Overpass is busy', async () => {
    jest.useFakeTimers();
    prisma.mapPlaceTile.findMany.mockResolvedValue([]);
    mockedPost.mockRejectedValueOnce({ response: { status: 504 } }).mockResolvedValueOnce({
      data: {
        elements: [{ type: 'node', id: 7, lat: 23.03, lon: 72.58, tags: { amenity: 'school' } }],
      },
    });

    const pending = service.coverage({ bbox: '72.55,23.01,72.60,23.04' });
    await jest.advanceTimersByTimeAsync(3000);
    const result = await pending;
    jest.useRealTimers();

    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(result.features).toHaveLength(1);
  });

  it('does not retry a query Overpass rejects as bad', async () => {
    prisma.mapPlaceTile.findMany.mockResolvedValue([]);
    mockedPost.mockRejectedValue({ response: { status: 400 } });

    const result = await service.coverage({ bbox: '72.55,23.01,72.60,23.04' });

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(result.meta.failedTiles).toBe(1);
  });

  it('falls back to a stale cached tile when Overpass fails', async () => {
    jest.useFakeTimers();
    prisma.mapPlaceTile.findMany.mockResolvedValue([tileRow(new Date('2026-01-01'))]);
    mockedPost.mockRejectedValue(new Error('timeout'));

    const pending = service.coverage({ bbox: '72.55,23.01,72.60,23.04' });
    await jest.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    jest.useRealTimers();

    expect(mockedPost).toHaveBeenCalledTimes(3);
    expect(result.features).toHaveLength(2);
    expect(result.meta.failedTiles).toBe(0);
    expect(result.meta.dataAsOf).toBe(new Date('2026-01-01').toISOString());
  });

  it('fetches all missing tiles in one Overpass request and caches each tile, even empty ones', async () => {
    prisma.mapPlaceTile.findMany.mockResolvedValue([]);
    mockedPost.mockResolvedValue({
      data: {
        elements: [
          { type: 'node', id: 1, lat: 23.03, lon: 72.58, tags: { amenity: 'school' } },
          { type: 'node', id: 2, lat: 23.05, lon: 72.66, tags: { amenity: 'college' } },
        ],
      },
    });

    const result = await service.coverage({ bbox: '72.55,23.01,72.69,23.09' });

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(prisma.mapPlaceTile.upsert.mock.calls.map((c: any) => c[0].where.key).sort()).toEqual([
      '725:230',
      '726:230',
    ]);
    expect(result.features.map((f) => f.properties.id)).toEqual(['node/1', 'node/2']);
  });

  it('reports tiles it could not load at all', async () => {
    jest.useFakeTimers();
    prisma.mapPlaceTile.findMany.mockResolvedValue([]);
    mockedPost.mockRejectedValue(new Error('down'));

    const pending = service.coverage({ bbox: '72.55,23.01,72.60,23.04' });
    await jest.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    jest.useRealTimers();

    expect(result.features).toEqual([]);
    expect(result.meta.failedTiles).toBe(1);
  });

  it('asks to zoom in when the view covers too many tiles', async () => {
    await expect(service.coverage({ bbox: '70,20,75,25' })).rejects.toThrow('Zoom in closer');
  });
});
