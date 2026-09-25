import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { Subscription, forkJoin } from 'rxjs';
import OlMap from 'ol/Map';
import View from 'ol/View';
import Overlay from 'ol/Overlay';
import Feature, { FeatureLike } from 'ol/Feature';
import Point from 'ol/geom/Point';
import Circle from 'ol/geom/Circle';
import VectorLayer from 'ol/layer/Vector';
import HeatmapLayer from 'ol/layer/Heatmap';
import VectorSource from 'ol/source/Vector';
import Cluster from 'ol/source/Cluster';
import { Fill, Stroke, Style } from 'ol/style';
import { boundingExtent, buffer as bufferExtent } from 'ol/extent';
import { fromLonLat, transformExtent } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control/defaults';
import ScaleLine from 'ol/control/ScaleLine';
import { AdminService } from '../../core/services/admin.service';
import { ThemeService } from '../../core/services/theme.service';
import {
  LeadStatus,
  MapAreaProps,
  MapAreasResponse,
  MapCoverageResponse,
  MapLead,
  MapLeadsResponse,
  MapPlaceProps,
  MapShopProps,
  MapShopsResponse,
  PlaceCategory,
} from '../../core/models/models';
import { AppDatePipe, AppNumberPipe } from '../../core/i18n/i18n-format.pipes';
import { intlLocale, t } from '../../core/i18n/i18n';
import { INDIA_CENTER, INDIA_ZOOM, osmLayer } from '../../shared/map/osm';
import { Preset, presetRange, ymd } from '../../shared/utils/date-range.util';
import {
  ALERT_COLOR,
  LEAD_COLOR,
  MAX_BUBBLE,
  MIN_BUBBLE,
  PLACE_COLOR,
  STATUS_COLOR,
  SizeBy,
  areaStyle,
  clusterStyle,
  healthStyle,
  hidden,
  leadStyle,
  placeStyle,
  shopProps,
  shopStyle,
} from './map-styles';
import { LEAD_STATUSES, LeadDialogComponent, leadStatusLabel } from './lead-dialog.component';

type Popup =
  | { kind: 'shop'; data: MapShopProps }
  | { kind: 'area'; data: MapAreaProps }
  | { kind: 'lead'; data: MapLead }
  | { kind: 'place'; data: MapPlaceProps };
type ListTab = 'layers' | 'shops' | 'areas' | 'leads';

/** Zoom level from which shops are drawn one by one instead of clustered. */
const UNCLUSTER_ZOOM = 12;
/** Coverage gaps are only fetched for views about a city wide (the server caps it too). */
const COVERAGE_MAX_SPAN_DEG = 0.38;
const RADIUS_CHOICES = [500, 1000, 2000, 3000, 5000];
const PLACE_CATEGORIES: PlaceCategory[] = ['college', 'school', 'office', 'government'];

/**
 * Admin-only Business Map: every placed shop on OpenStreetMap, coloured by
 * live status and sized by revenue or print jobs, with heatmap, area totals,
 * health highlights, coverage gaps, leads and a month-by-month growth replay.
 * All figures come from the server (/admin/map/*) for the chosen date range.
 */
@Component({
  selector: 'app-business-map',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe, DatePickerModule, AppDatePipe, AppNumberPipe, LeadDialogComponent],
  templateUrl: './business-map.component.html',
  styleUrl: './business-map.component.scss',
})
export class BusinessMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;
  @ViewChild('popupEl', { static: true }) popupEl!: ElementRef<HTMLDivElement>;

  private readonly admin = inject(AdminService);
  private readonly theme = inject(ThemeService);
  private readonly zone = inject(NgZone);

  readonly statusColor = STATUS_COLOR;
  readonly leadColor = LEAD_COLOR;
  readonly placeColor = PLACE_COLOR;
  readonly alertColor = ALERT_COLOR;
  readonly bubbleMin = MIN_BUBBLE;
  readonly bubbleMax = MAX_BUBBLE;
  readonly leadStatuses = LEAD_STATUSES;
  readonly placeCategories = PLACE_CATEGORIES;
  readonly radiusChoices = RADIUS_CHOICES;
  readonly today = new Date();

  // ---- filters & layer switches ----
  readonly presets: { value: Preset; label: () => string }[] = [
    { value: 'today', label: () => t('common.today') },
    { value: 'week', label: () => t('adminDashboard.this_week') },
    { value: 'month', label: () => t('adminDashboard.this_month') },
    { value: 'custom', label: () => t('adminDashboard.custom') },
  ];
  preset = signal<Preset>('month');
  range = signal<[string, string]>(presetRange('month'));
  customRange: Date[] | null = null;

  showShops = signal(true);
  sizeBy = signal<SizeBy>('revenue');
  showHeat = signal(false);
  showAreas = signal(false);
  areaGroup = signal<'city' | 'district'>('city');
  showInactive = signal(false);
  inactiveDays = signal<7 | 30>(7);
  showAlerts = signal(true);
  showProblems = signal(true);
  showCoverage = signal(false);
  radius = signal(1000);
  showLeads = signal(true);
  replayOn = signal(false);
  replayIndex = signal(0);
  replayPlaying = signal(false);

  // ---- data ----
  loading = signal(false);
  shops = signal<MapShopsResponse | null>(null);
  areas = signal<MapAreasResponse | null>(null);
  leads = signal<MapLeadsResponse | null>(null);
  coverage = signal<MapCoverageResponse | null>(null);
  coverageState = signal<'idle' | 'zoom' | 'loading' | 'ready' | 'error'>('idle');
  coverageError = signal('');

  // ---- UI ----
  search = signal('');
  listTab = signal<ListTab>('layers');
  mobileView = signal<'map' | 'list'>('map');
  popup = signal<Popup | null>(null);
  leadDialog = signal<{ visible: boolean; lead: Partial<MapLead> | null }>({ visible: false, lead: null });

  readonly popupShop = computed(() => {
    const p = this.popup();
    return p?.kind === 'shop' ? p.data : null;
  });
  readonly popupArea = computed(() => {
    const p = this.popup();
    return p?.kind === 'area' ? p.data : null;
  });
  readonly popupLead = computed(() => {
    const p = this.popup();
    return p?.kind === 'lead' ? p.data : null;
  });
  readonly popupPlace = computed(() => {
    const p = this.popup();
    return p?.kind === 'place' ? p.data : null;
  });

  readonly growth = computed(() => this.shops()?.meta.growth ?? []);
  readonly replayMonth = computed(() => {
    const g = this.growth();
    return this.replayOn() && g.length ? g[Math.min(this.replayIndex(), g.length - 1)] : null;
  });

  readonly shopList = computed(() => {
    const data = this.shops();
    if (!data) return [];
    const q = this.search().trim().toLowerCase();
    const month = this.replayMonth()?.month;
    const key = this.sizeBy();
    return data.features
      .map((f) => f.properties)
      .filter((p) => !month || p.registeredMonth <= month)
      .filter((p) => !q || [p.name, p.shopCode, p.city, p.district ?? '', p.ownerName].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => (key === 'revenue' ? (b.revenue ?? -1) - (a.revenue ?? -1) : 0) || b.jobs - a.jobs || a.name.localeCompare(b.name));
  });
  readonly unplacedList = computed(() => {
    const q = this.search().trim().toLowerCase();
    return (this.shops()?.meta.unplaced ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q));
  });
  readonly areaList = computed(() => {
    const q = this.search().trim().toLowerCase();
    return (this.areas()?.meta.areas ?? []).filter((a) => !q || a.name.toLowerCase().includes(q));
  });
  readonly leadList = computed(() => {
    const q = this.search().trim().toLowerCase();
    return (this.leads()?.features ?? [])
      .map((f) => f.properties)
      .filter((l) => !q || [l.name, l.contactName ?? '', l.city ?? '', l.mobile ?? ''].some((v) => v.toLowerCase().includes(q)));
  });
  readonly allShopsForLink = computed(() => [
    ...(this.shops()?.features ?? []).map((f) => ({ id: f.properties.id, name: f.properties.name, shopCode: f.properties.shopCode })),
    ...(this.shops()?.meta.unplaced ?? []).map((s) => ({ id: s.id, name: s.name })),
  ]);

  // ---- OpenLayers ----
  private map?: OlMap;
  private overlay?: Overlay;
  private readonly shopSource = new VectorSource<Feature<Point>>();
  private readonly clusterSource = new Cluster<Feature<Point>>({
    distance: 44,
    minDistance: 12,
    source: this.shopSource,
    geometryFunction: (f) => (this.visibleInReplay(f) ? (f.getGeometry() as Point) : null),
  });
  private readonly areaSource = new VectorSource<Feature<Point>>();
  private readonly leadSource = new VectorSource<Feature<Point>>();
  private readonly placeSource = new VectorSource<Feature<Point>>();
  private readonly radiusSource = new VectorSource<Feature<Circle>>();
  private shopLayer!: VectorLayer<Cluster<Feature<Point>>>;
  private healthLayer!: VectorLayer<VectorSource<Feature<Point>>>;
  private heatLayer!: HeatmapLayer;
  private areaLayer!: VectorLayer<VectorSource<Feature<Point>>>;
  private leadLayer!: VectorLayer<VectorSource<Feature<Point>>>;
  private placeLayer!: VectorLayer<VectorSource<Feature<Point>>>;
  private radiusLayer!: VectorLayer<VectorSource<Feature<Circle>>>;
  private selectedId: string | null = null;
  private dataSub?: Subscription;
  private coverageSub?: Subscription;
  private coverageTimer?: ReturnType<typeof setTimeout>;
  private replayTimer?: ReturnType<typeof setInterval>;
  private fittedOnce = false;

  constructor() {
    // Redraw canvas styles when anything they depend on changes.
    effect(() => {
      this.theme.dark();
      this.sizeBy();
      this.showInactive();
      this.showAlerts();
      this.showProblems();
      this.redraw();
    });
    effect(() => {
      this.replayMonth();
      this.clusterSource.refresh();
      this.heatLayer?.changed();
    });
    effect(() => {
      // Read every switch first: an `a?.b(signal())` call skips reading the signal while the
      // layer doesn't exist yet, and the effect would then never run again.
      const [shops, heat, areas, leads, coverage] = [
        this.showShops(),
        this.showHeat(),
        this.showAreas(),
        this.showLeads(),
        this.showCoverage(),
      ];
      if (!this.shopLayer) return;
      this.shopLayer.setVisible(shops);
      this.healthLayer.setVisible(shops);
      this.heatLayer.setVisible(heat);
      this.areaLayer.setVisible(areas);
      this.leadLayer.setVisible(leads);
      this.placeLayer.setVisible(coverage);
      this.radiusLayer.setVisible(coverage);
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.createMap());
    this.loadAll();
    this.loadLeads();
  }

  ngOnDestroy(): void {
    this.dataSub?.unsubscribe();
    this.coverageSub?.unsubscribe();
    clearTimeout(this.coverageTimer);
    this.stopReplay();
    this.map?.setTarget(undefined);
  }

  // ---------------------------------------------------------------- data

  choosePreset(preset: Preset): void {
    this.preset.set(preset);
    if (preset !== 'custom') {
      this.range.set(presetRange(preset));
      this.loadAll();
    }
  }

  onCustomSelect(): void {
    const [start, end] = this.customRange ?? [];
    if (start && end) {
      this.range.set([ymd(start), ymd(end)]);
      this.loadAll();
    }
  }

  setInactiveDays(days: 7 | 30): void {
    this.inactiveDays.set(days);
    this.loadAll();
  }

  setAreaGroup(group: 'city' | 'district'): void {
    this.areaGroup.set(group);
    this.loadAll();
  }

  loadAll(): void {
    const [from, to] = this.range();
    this.loading.set(true);
    this.dataSub?.unsubscribe();
    this.dataSub = forkJoin({
      shops: this.admin.mapShops(from, to, this.inactiveDays()),
      areas: this.admin.mapAreas(from, to, this.areaGroup()),
    }).subscribe({
      next: ({ shops, areas }) => {
        this.shops.set(shops);
        this.areas.set(areas);
        this.fillShops(shops);
        this.fillAreas(areas);
        if (this.replayIndex() >= shops.meta.growth.length) this.replayIndex.set(Math.max(0, shops.meta.growth.length - 1));
        this.refreshPopup();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadLeads(): void {
    this.admin.mapLeads().subscribe((leads) => {
      this.leads.set(leads);
      this.leadSource.clear();
      this.leadSource.addFeatures(
        leads.features.map((f) => {
          const feature = new Feature({ geometry: new Point(fromLonLat(f.geometry.coordinates)), lead: f.properties });
          feature.setId(f.id);
          return feature;
        }),
      );
      this.refreshPopup();
    });
  }

  private fillShops(data: MapShopsResponse): void {
    this.shopSource.clear();
    this.shopSource.addFeatures(
      data.features.map((f) => {
        const feature = new Feature({ geometry: new Point(fromLonLat(f.geometry.coordinates)), shop: f.properties });
        feature.setId(f.id);
        return feature;
      }),
    );
    this.updateRadiusRings();
    if (!this.fittedOnce && data.features.length) {
      this.fittedOnce = true;
      const extent = boundingExtent(data.features.map((f) => fromLonLat(f.geometry.coordinates)));
      this.map?.getView().fit(bufferExtent(extent, 2000), { maxZoom: 13, padding: [60, 60, 60, 60], duration: 0 });
    }
  }

  private fillAreas(data: MapAreasResponse): void {
    this.areaSource.clear();
    this.areaSource.addFeatures(
      data.features.map((f) => {
        const feature = new Feature({ geometry: new Point(fromLonLat(f.geometry.coordinates)), area: f.properties });
        feature.setId(f.id);
        return feature;
      }),
    );
  }

  // ------------------------------------------------------------ coverage

  toggleCoverage(on: boolean): void {
    this.showCoverage.set(on);
    if (on) this.scheduleCoverage(0);
  }

  setRadius(radius: number): void {
    this.radius.set(radius);
    this.updateRadiusRings();
    this.scheduleCoverage(0);
  }

  private scheduleCoverage(delay = 450): void {
    clearTimeout(this.coverageTimer);
    if (!this.showCoverage()) return;
    this.coverageTimer = setTimeout(() => this.zone.run(() => this.loadCoverage()), delay);
  }

  private loadCoverage(): void {
    if (!this.map) return;
    const size = this.map.getSize();
    if (!size) return;
    const [w, s, e, n] = transformExtent(this.map.getView().calculateExtent(size), 'EPSG:3857', 'EPSG:4326');
    if (e - w > COVERAGE_MAX_SPAN_DEG || n - s > COVERAGE_MAX_SPAN_DEG) {
      this.coverageState.set('zoom');
      this.placeSource.clear();
      this.coverage.set(null);
      return;
    }
    this.coverageState.set('loading');
    this.coverageSub?.unsubscribe();
    this.coverageSub = this.admin.mapCoverage([w, s, e, n], this.radius()).subscribe({
      next: (res) => {
        this.coverage.set(res);
        this.placeSource.clear();
        this.placeSource.addFeatures(
          res.features.map((f) => {
            const feature = new Feature({ geometry: new Point(fromLonLat(f.geometry.coordinates)), place: f.properties });
            feature.setId(f.id);
            return feature;
          }),
        );
        this.coverageState.set('ready');
      },
      error: (err) => {
        this.coverageState.set('error');
        this.coverageError.set(err?.error?.message ?? t('businessMap.couldnt_load_places'));
      },
    });
  }

  /** Faint circles showing each active shop's reach, for the coverage layer. */
  private updateRadiusRings(): void {
    this.radiusSource.clear();
    const data = this.shops();
    if (!data) return;
    this.radiusSource.addFeatures(
      data.features
        .filter((f) => f.properties.markerStatus !== 'DEACTIVATED')
        .map((f) => {
          const center = fromLonLat(f.geometry.coordinates);
          // Web Mercator stretches distances by 1/cos(latitude).
          const r = this.radius() / Math.cos((f.geometry.coordinates[1] * Math.PI) / 180);
          return new Feature({ geometry: new Circle(center, r) });
        }),
    );
  }

  // --------------------------------------------------------------- leads

  openLead(lead: Partial<MapLead>): void {
    this.leadDialog.set({ visible: true, lead });
  }

  markJoined(lead: MapLead): void {
    this.openLead({ ...lead, status: 'JOINED' });
  }

  onLeadDialog(visible: boolean): void {
    this.leadDialog.update((d) => ({ ...d, visible }));
  }

  onLeadsChanged(): void {
    this.closePopup();
    this.loadLeads();
  }

  leadLabel(status: LeadStatus): string {
    return leadStatusLabel(status);
  }

  // -------------------------------------------------------------- replay

  toggleReplay(on: boolean): void {
    this.replayOn.set(on);
    if (on) this.replayIndex.set(Math.max(0, this.growth().length - 1));
    else this.stopReplay();
  }

  playReplay(): void {
    if (this.replayPlaying()) return this.stopReplay();
    const g = this.growth();
    if (!g.length) return;
    if (this.replayIndex() >= g.length - 1) this.replayIndex.set(0);
    this.replayPlaying.set(true);
    this.replayTimer = setInterval(() => {
      if (this.replayIndex() >= this.growth().length - 1) return this.stopReplay();
      this.replayIndex.update((i) => i + 1);
    }, 900);
  }

  private stopReplay(): void {
    clearInterval(this.replayTimer);
    this.replayPlaying.set(false);
  }

  private visibleInReplay(feature: FeatureLike): boolean {
    const month = this.replayMonth()?.month;
    return !month || shopProps(feature).registeredMonth <= month;
  }

  // ------------------------------------------------------------- list/UI

  zoomToShop(shop: MapShopProps): void {
    const feature = this.shopSource.getFeatureById(shop.id);
    if (!feature) return;
    this.mobileView.set('map');
    const coordinate = feature.getGeometry()!.getCoordinates();
    this.openPopup({ kind: 'shop', data: shop }, coordinate, shop.id, Math.max(this.map?.getView().getZoom() ?? 0, 15));
  }

  zoomToArea(area: MapAreaProps & { placed?: boolean }): void {
    const feature = this.areaSource.getFeatureById(area.key);
    if (!feature) return;
    this.mobileView.set('map');
    const coordinate = feature.getGeometry()!.getCoordinates();
    if (!this.showAreas()) this.showAreas.set(true);
    this.openPopup({ kind: 'area', data: area }, coordinate, area.key, 11);
  }

  zoomToLead(lead: MapLead): void {
    const coordinate = fromLonLat([lead.longitude, lead.latitude]);
    this.mobileView.set('map');
    if (!this.showLeads()) this.showLeads.set(true);
    this.openPopup({ kind: 'lead', data: lead }, coordinate, lead.id, 15);
  }

  onSearchEnter(): void {
    const first = this.shopList()[0];
    if (first) this.zoomToShop(first);
  }

  closePopup(): void {
    this.popup.set(null);
    this.overlay?.setPosition(undefined);
    this.select(null);
  }

  // Formatting helpers for the template.
  inr(value: number): string {
    return `₹${value.toLocaleString(intlLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  statusLabel(status: MapShopProps['markerStatus']): string {
    return status === 'ONLINE' ? t('common.online') : status === 'OFFLINE' ? t('common.offline') : t('businessMap.deactivated');
  }

  categoryLabel(category: PlaceCategory): string {
    return t(`businessMap.place_${category}`);
  }

  distanceLabel(meters: number | null): string {
    if (meters === null) return t('businessMap.more_than_10x_the_radius');
    return meters < 1000 ? t('businessMap.meters', { m: meters }) : t('businessMap.km', { km: (meters / 1000).toFixed(1) });
  }

  monthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(intlLocale(), { month: 'short', year: 'numeric' });
  }

  areaName(area: MapAreaProps): string {
    return area.name || t('businessMap.not_set');
  }

  // -------------------------------------------------------------- map

  private createMap(): void {
    const opts = () => ({ sizeBy: this.sizeBy(), dark: this.theme.dark(), selectedId: this.selectedId });

    this.shopLayer = new VectorLayer({
      source: this.clusterSource,
      zIndex: 10,
      style: (cluster) => {
        const members = cluster.get('features') as Feature<Point>[];
        if (members.length > 1) return clusterStyle(members.length, this.theme.dark());
        return shopStyle(shopProps(members[0]), opts());
      },
    });
    // Health rings follow the individual shops, only once they are drawn one by one.
    this.healthLayer = new VectorLayer({
      source: this.shopSource,
      zIndex: 11,
      minZoom: UNCLUSTER_ZOOM,
      style: (f) =>
        this.visibleInReplay(f)
          ? healthStyle(shopProps(f), { ...opts(), inactive: this.showInactive(), alerts: this.showAlerts(), problems: this.showProblems() })
          : hidden(),
    });
    this.heatLayer = new HeatmapLayer({
      source: this.shopSource,
      zIndex: 5,
      blur: 26,
      radius: 18,
      weight: (f) => (this.visibleInReplay(f) ? shopProps(f).heat : 0),
      visible: false,
    });
    this.areaLayer = new VectorLayer({
      source: this.areaSource,
      zIndex: 4,
      visible: false,
      style: (f) => {
        const area = f.get('area') as MapAreaProps;
        const max = Math.max(1, ...(this.areas()?.features ?? []).map((a) => a.properties.jobs));
        return areaStyle(this.areaName(area), area.jobs, max, this.theme.dark(), area.key === this.selectedId);
      },
    });
    this.leadLayer = new VectorLayer({
      source: this.leadSource,
      zIndex: 12,
      style: (f) => {
        const lead = f.get('lead') as MapLead;
        return leadStyle(lead.status, this.theme.dark(), lead.id === this.selectedId);
      },
    });
    this.placeLayer = new VectorLayer({
      source: this.placeSource,
      zIndex: 3,
      visible: false,
      style: (f) => {
        const place = f.get('place') as MapPlaceProps;
        return placeStyle(place.category, place.covered, this.theme.dark());
      },
    });
    this.radiusLayer = new VectorLayer({
      source: this.radiusSource,
      zIndex: 2,
      visible: false,
      style: () =>
        new Style({
          fill: new Fill({ color: this.theme.dark() ? 'rgba(74, 222, 128, 0.08)' : 'rgba(22, 163, 74, 0.08)' }),
          stroke: new Stroke({ color: this.theme.dark() ? 'rgba(74, 222, 128, 0.5)' : 'rgba(22, 163, 74, 0.45)', width: 1 }),
        }),
    });

    this.overlay = new Overlay({
      element: this.popupEl.nativeElement,
      positioning: 'bottom-center',
      offset: [0, -14],
      autoPan: { margin: 24, animation: { duration: 250 } },
      stopEvent: true,
    });

    this.map = new OlMap({
      target: this.mapEl.nativeElement,
      layers: [osmLayer(), this.radiusLayer, this.placeLayer, this.areaLayer, this.heatLayer, this.shopLayer, this.healthLayer, this.leadLayer],
      overlays: [this.overlay],
      controls: defaultControls({ rotate: false, attributionOptions: { collapsible: true } }).extend([new ScaleLine()]),
      view: new View({ center: fromLonLat(INDIA_CENTER), zoom: INDIA_ZOOM, maxZoom: 19 }),
    });

    const view = this.map.getView();
    view.on('change:resolution', () => this.clusterSource.setDistance((view.getZoom() ?? 0) >= UNCLUSTER_ZOOM ? 0 : 44));
    this.map.on('moveend', () => this.scheduleCoverage());
    this.map.on('pointermove', (e) => {
      if (e.dragging) return;
      const hit = this.map!.hasFeatureAtPixel(e.pixel, { layerFilter: (l) => l !== this.heatLayer && l !== this.radiusLayer });
      this.mapEl.nativeElement.style.cursor = hit ? 'pointer' : '';
    });
    this.map.on('singleclick', (e) => this.zone.run(() => this.onMapClick(e.pixel)));
    new ResizeObserver(() => this.map?.updateSize()).observe(this.mapEl.nativeElement);
  }

  private onMapClick(pixel: number[]): void {
    const hit = this.map!.forEachFeatureAtPixel(
      pixel,
      (feature, layer) => ({ feature, layer }),
      { layerFilter: (l) => l !== this.heatLayer && l !== this.radiusLayer && l !== this.healthLayer, hitTolerance: 4 },
    );
    if (!hit) return this.closePopup();
    const { feature, layer } = hit;
    const at = (feature.getGeometry() as Point).getCoordinates();
    if (layer === this.shopLayer) {
      const members = feature.get('features') as Feature<Point>[];
      if (members.length > 1) {
        const extent = boundingExtent(members.map((m) => m.getGeometry()!.getCoordinates()));
        this.map!.getView().fit(bufferExtent(extent, 300), { duration: 400, padding: [80, 80, 80, 80], maxZoom: 16 });
        return this.closePopup();
      }
      const shop = shopProps(members[0]);
      return this.openPopup({ kind: 'shop', data: shop }, at, shop.id);
    }
    if (layer === this.leadLayer) {
      const lead = feature.get('lead') as MapLead;
      return this.openPopup({ kind: 'lead', data: lead }, at, lead.id);
    }
    if (layer === this.areaLayer) {
      const area = feature.get('area') as MapAreaProps;
      return this.openPopup({ kind: 'area', data: area }, at, area.key);
    }
    if (layer === this.placeLayer) {
      const place = feature.get('place') as MapPlaceProps;
      return this.openPopup({ kind: 'place', data: place }, at, null);
    }
  }

  /**
   * Shows a popup over `coordinate`. From the list (`zoom` given) the view
   * first zooms there with the point a little below the middle, leaving room
   * above it for the popup; OpenLayers' auto-pan handles the rest.
   */
  private openPopup(popup: Popup, coordinate: number[], selectId: string | null, zoom?: number): void {
    this.popup.set(popup);
    this.select(selectId);
    this.overlay?.setPosition(undefined);
    const view = this.map?.getView();
    const size = this.map?.getSize();
    const show = () => void setTimeout(() => this.overlay?.setPosition(coordinate));
    if (!view || !size || zoom === undefined) return show();

    const resolution = view.getResolutionForZoom(zoom);
    const center = [coordinate[0], coordinate[1] + (size[1] / 5) * resolution];
    view.animate({ center, zoom, duration: 450 }, show);
  }

  /** After a reload, show the same shop / lead / area with fresh figures (or close if it's gone). */
  private refreshPopup(): void {
    const current = this.popup();
    if (!current) return;
    if (current.kind === 'shop') {
      const fresh = this.shops()?.features.find((f) => f.id === current.data.id)?.properties;
      if (fresh) this.popup.set({ kind: 'shop', data: fresh });
      else this.closePopup();
    } else if (current.kind === 'area') {
      const fresh = this.areas()?.meta.areas.find((a) => a.key === current.data.key);
      if (fresh) this.popup.set({ kind: 'area', data: fresh });
      else this.closePopup();
    } else if (current.kind === 'lead') {
      const fresh = this.leads()?.features.find((f) => f.id === current.data.id)?.properties;
      if (fresh) this.popup.set({ kind: 'lead', data: fresh });
      else this.closePopup();
    }
  }

  private select(id: string | null): void {
    this.selectedId = id;
    this.redraw();
  }

  private redraw(): void {
    this.shopLayer?.changed();
    this.healthLayer?.changed();
    this.leadLayer?.changed();
    this.areaLayer?.changed();
    this.placeLayer?.changed();
    this.radiusLayer?.changed();
  }
}
