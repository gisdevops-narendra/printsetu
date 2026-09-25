import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';

/** Rough centre of India, for maps with nothing to show yet. */
export const INDIA_CENTER: [number, number] = [78.9629, 22.5937];
export const INDIA_ZOOM = 4.6;

/**
 * OpenStreetMap base layer. Its canvas carries the `osm-tiles` class so dark
 * mode can dim and invert the (light-only) tiles with a CSS filter; see
 * styles.scss.
 */
export function osmLayer(): TileLayer<OSM> {
  return new TileLayer({ source: new OSM(), className: 'osm-tiles' });
}

export type GeoError = 'insecure' | 'unsupported' | 'denied' | 'unavailable';

/** The device's position, or why it isn't available (browsers only share it on https:// pages). */
export function currentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) return reject('insecure' as GeoError);
    if (!navigator.geolocation) return reject('unsupported' as GeoError);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject((err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable') as GeoError),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}
