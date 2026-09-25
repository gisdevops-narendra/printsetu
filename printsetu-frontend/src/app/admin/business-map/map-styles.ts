import { FeatureLike } from 'ol/Feature';
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, Text } from 'ol/style';
import { LeadStatus, MapMarkerStatus, MapShopProps, PlaceCategory } from '../../core/models/models';

/** Marker colours; the legend reads from here too. */
export const STATUS_COLOR: Record<MapMarkerStatus, string> = {
  ONLINE: '#16a34a',
  OFFLINE: '#f97316',
  DEACTIVATED: '#94a3b8',
};
export const LEAD_COLOR: Record<LeadStatus, string> = {
  CONTACTED: '#2563eb',
  DEMO_GIVEN: '#9333ea',
  JOINED: '#0d9488',
  NOT_INTERESTED: '#64748b',
};
export const PLACE_COLOR: Record<PlaceCategory, string> = {
  college: '#0284c7',
  school: '#ca8a04',
  office: '#475569',
  government: '#7c3aed',
};
export const ALERT_COLOR = { expiring: '#f59e0b', expired: '#dc2626', problem: '#dc2626', inactive: '#64748b', gap: '#dc2626' };

export const MIN_BUBBLE = 7;
export const MAX_BUBBLE = 26;
export const bubbleRadius = (size: number) => MIN_BUBBLE + Math.max(0, Math.min(1, size)) * (MAX_BUBBLE - MIN_BUBBLE);

export type SizeBy = 'revenue' | 'jobs';

export interface ShopStyleOptions {
  sizeBy: SizeBy;
  dark: boolean;
  selectedId: string | null;
}

/** Where the "no location"/replay filters hide a shop, its style is empty. */
const HIDDEN: Style[] = [];
const cache = new Map<string, Style[]>();

function haloColor(dark: boolean) {
  return dark ? '#0b1220' : '#ffffff';
}

/** A shop bubble: colour = live status, size = revenue or print jobs (0..1 from the server). */
export function shopStyle(props: MapShopProps, opts: ShopStyleOptions): Style[] {
  const radius = Math.round(bubbleRadius(props.size[opts.sizeBy]));
  const selected = props.id === opts.selectedId;
  const key = `s|${props.markerStatus}|${radius}|${selected}|${opts.dark}`;
  let style = cache.get(key);
  if (!style) {
    const color = STATUS_COLOR[props.markerStatus];
    style = [
      new Style({
        image: new CircleStyle({
          radius,
          fill: new Fill({ color: color + (radius > 12 ? 'cc' : 'ee') }),
          stroke: new Stroke({ color: selected ? (opts.dark ? '#f8fafc' : '#0f172a') : haloColor(opts.dark), width: selected ? 3 : 1.5 }),
        }),
        zIndex: 10 - radius / 10,
      }),
    ];
    cache.set(key, style);
  }
  return style;
}

/** Rings / badges drawn over a shop for the health layers that are switched on. */
export function healthStyle(
  props: MapShopProps,
  opts: ShopStyleOptions & { inactive: boolean; alerts: boolean; problems: boolean },
): Style[] {
  const r = Math.round(bubbleRadius(props.size[opts.sizeBy]));
  const out: Style[] = [];
  if (opts.inactive && props.inactive) {
    out.push(ring(`in|${r}`, r + 5, ALERT_COLOR.inactive, 2.5, [4, 4]));
  }
  const alert = props.subscription?.alert;
  if (opts.alerts && alert) {
    out.push(ring(`al|${alert}|${r}`, r + (opts.inactive && props.inactive ? 9 : 5), alert === 'EXPIRED' ? ALERT_COLOR.expired : ALERT_COLOR.expiring, 3));
  }
  if (opts.problems && props.printerProblem) {
    const key = `pb|${r}|${opts.dark}`;
    let style = cache.get(key);
    if (!style) {
      const offset = Math.round(r * 0.75);
      style = [
        new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: ALERT_COLOR.problem }),
            stroke: new Stroke({ color: haloColor(opts.dark), width: 1.5 }),
            displacement: [offset, offset],
          }),
          text: new Text({
            text: '!',
            font: 'bold 11px system-ui, sans-serif',
            fill: new Fill({ color: '#fff' }),
            offsetX: offset,
            offsetY: -offset,
          }),
          zIndex: 20,
        }),
      ];
      cache.set(key, style);
    }
    out.push(...style);
  }
  return out;
}

function ring(key: string, radius: number, color: string, width: number, dash?: number[]): Style {
  let style = cache.get(key);
  if (!style) {
    style = [new Style({ image: new CircleStyle({ radius, stroke: new Stroke({ color, width, lineDash: dash }) }), zIndex: 15 })];
    cache.set(key, style);
  }
  return style[0];
}

/** A cluster of shops when zoomed out: count in a circle, sized by how many. */
export function clusterStyle(count: number, dark: boolean): Style[] {
  const radius = Math.min(30, 13 + Math.sqrt(count) * 3);
  const key = `c|${count}|${dark}`;
  let style = cache.get(key);
  if (!style) {
    style = [
      new Style({
        image: new CircleStyle({
          radius,
          fill: new Fill({ color: dark ? 'rgba(129, 140, 248, 0.9)' : 'rgba(79, 70, 229, 0.88)' }),
          stroke: new Stroke({ color: dark ? 'rgba(129, 140, 248, 0.35)' : 'rgba(79, 70, 229, 0.25)', width: 7 }),
        }),
        text: new Text({ text: String(count), font: '600 13px system-ui, sans-serif', fill: new Fill({ color: '#fff' }) }),
      }),
    ];
    cache.set(key, style);
  }
  return style;
}

/** A lead: a diamond, coloured by where the conversation is. */
export function leadStyle(status: LeadStatus, dark: boolean, selected: boolean): Style[] {
  const key = `l|${status}|${dark}|${selected}`;
  let style = cache.get(key);
  if (!style) {
    style = [
      new Style({
        image: new RegularShape({
          points: 4,
          radius: selected ? 13 : 11,
          angle: 0,
          fill: new Fill({ color: LEAD_COLOR[status] }),
          stroke: new Stroke({ color: selected ? (dark ? '#f8fafc' : '#0f172a') : haloColor(dark), width: selected ? 3 : 2 }),
        }),
        zIndex: 30,
      }),
    ];
    cache.set(key, style);
  }
  return style;
}

/** An OpenStreetMap place: small marker in its category colour; gaps (no shop in reach) get a red halo. */
export function placeStyle(category: PlaceCategory, covered: boolean, dark: boolean): Style[] {
  const key = `p|${category}|${covered}|${dark}`;
  let style = cache.get(key);
  if (!style) {
    const shape = new RegularShape({
      points: category === 'college' ? 3 : category === 'school' ? 4 : category === 'government' ? 5 : 30,
      radius: covered ? 5 : 6,
      angle: category === 'school' ? Math.PI / 4 : 0,
      fill: new Fill({ color: PLACE_COLOR[category] + (covered ? '66' : 'ff') }),
      stroke: new Stroke({ color: haloColor(dark), width: 1 }),
    });
    style = covered
      ? [new Style({ image: shape, zIndex: 1 })]
      : [
          new Style({
            image: new CircleStyle({ radius: 10, fill: new Fill({ color: 'rgba(220, 38, 38, 0.18)' }), stroke: new Stroke({ color: ALERT_COLOR.gap, width: 1.5 }) }),
            zIndex: 2,
          }),
          new Style({ image: shape, zIndex: 3 }),
        ];
    cache.set(key, style);
  }
  return style;
}

/** An area (city / district) summary bubble with its name, sized by print jobs. */
export function areaStyle(name: string, jobs: number, maxJobs: number, dark: boolean, selected: boolean): Style[] {
  const radius = Math.round(22 + (maxJobs > 0 ? Math.sqrt(jobs / maxJobs) : 0) * 36);
  return [
    new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({ color: dark ? 'rgba(56, 189, 248, 0.16)' : 'rgba(14, 165, 233, 0.14)' }),
        stroke: new Stroke({ color: dark ? '#38bdf8' : '#0284c7', width: selected ? 3 : 1.5, lineDash: [6, 4] }),
      }),
      text: new Text({
        text: `${name}\n${jobs}`,
        font: '600 12px system-ui, sans-serif',
        fill: new Fill({ color: dark ? '#e0f2fe' : '#075985' }),
        stroke: new Stroke({ color: haloColor(dark), width: 3 }),
        textAlign: 'center',
      }),
      zIndex: 0,
    }),
  ];
}

export function hidden(): Style[] {
  return HIDDEN;
}

/** Shop properties stored on an OpenLayers feature. */
export function shopProps(feature: FeatureLike): MapShopProps {
  return feature.get('shop') as MapShopProps;
}
