import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Translate from 'ol/interaction/Translate';
import { Icon, Style } from 'ol/style';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control/defaults';
import { GeoError, INDIA_CENTER, INDIA_ZOOM, currentPosition, osmLayer } from './osm';
import { t } from '../../core/i18n/i18n';

export interface PickedLocation {
  latitude: number;
  longitude: number;
}

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44"><path d="M17 1C8.2 1 1 8 1 16.7 1 28.4 17 43 17 43s16-14.6 16-26.3C33 8 25.8 1 17 1z" fill="#4f46e5" stroke="#fff" stroke-width="2"/><circle cx="17" cy="16.5" r="6" fill="#fff"/></svg>`;
const PIN_STYLE = new Style({
  image: new Icon({ src: 'data:image/svg+xml;utf8,' + encodeURIComponent(PIN_SVG), anchor: [0.5, 1] }),
});

/**
 * Optional shop location: tap the map to drop a pin, drag it to adjust, or
 * "Use my current location". Emits null when the pin is removed.
 */
@Component({
  selector: 'app-location-picker',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="picker">
      <div class="picker__map" #mapEl [attr.aria-label]="'location.map_aria' | translate" role="application"></div>
      <p class="picker__hint">
        <i class="pi pi-info-circle"></i>
        {{ (value() ? 'location.drag_the_pin_to_adjust' : 'location.tap_the_map_to_place') | translate }}
      </p>
      <div class="picker__bar">
        <button type="button" class="picker__btn" (click)="useCurrentLocation()" [disabled]="locating()">
          <i class="pi" [class.pi-spin]="locating()" [class.pi-spinner]="locating()" [class.pi-map-marker]="!locating()"></i>
          {{ (locating() ? 'location.finding_you' : 'location.use_my_current_location') | translate }}
        </button>
        @if (value(); as v) {
          <span class="picker__coords">{{ v.latitude.toFixed(5) }}, {{ v.longitude.toFixed(5) }}</span>
          <button type="button" class="picker__btn picker__btn--text" (click)="clear()">
            <i class="pi pi-times"></i> {{ 'location.remove_pin' | translate }}
          </button>
        }
      </div>
      @if (error()) {
        <p class="picker__error" role="alert"><i class="pi pi-exclamation-circle"></i> {{ error() }}</p>
      }
    </div>
  `,
  styles: [
    `
      .picker {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .picker__map {
        height: 15rem;
        border-radius: 12px;
        overflow: hidden;
        border: 1.5px solid var(--bd-e2e8f0, #e2e8f0);
        background: var(--bg-f8fafc, #f8fafc);
        cursor: crosshair;
      }
      .picker__hint,
      .picker__error {
        display: flex;
        gap: 0.375rem;
        align-items: flex-start;
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.4;
        color: var(--tx-64748b, #64748b);
      }
      .picker__error {
        color: var(--tone-bad-fg, #b91c1c);
      }
      .picker__bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 0.75rem;
      }
      .picker__btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.5rem 0.8rem;
        border: 1.5px solid var(--p-primary-200, #c7d2fe);
        border-radius: 10px;
        background: var(--p-primary-50, #eef2ff);
        color: var(--accent-text-700, #4338ca);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
      }
      .picker__btn:disabled {
        opacity: 0.7;
        cursor: default;
      }
      .picker__btn--text {
        border-color: transparent;
        background: none;
        color: var(--tx-64748b, #64748b);
      }
      .picker__coords {
        font-size: 0.8125rem;
        font-variant-numeric: tabular-nums;
        color: var(--tx-334155, #334155);
      }
    `,
  ],
})
export class LocationPickerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Output() locationChange = new EventEmitter<PickedLocation | null>();
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  value = signal<PickedLocation | null>(null);
  locating = signal(false);
  error = signal('');

  private map?: Map;
  private readonly pin = new Feature<Point>();
  private readonly source = new VectorSource<Feature<Point>>();
  private resizeObserver?: ResizeObserver;

  constructor(private readonly zone: NgZone) {}

  ngOnChanges(): void {
    const next = this.latitude !== null && this.longitude !== null ? { latitude: this.latitude, longitude: this.longitude } : null;
    const current = this.value();
    if (next?.latitude === current?.latitude && next?.longitude === current?.longitude) return;
    this.value.set(next);
    this.syncPin(true);
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const layer = new VectorLayer({ source: this.source, style: PIN_STYLE, zIndex: 5 });
      this.map = new Map({
        target: this.mapEl.nativeElement,
        layers: [osmLayer(), layer],
        controls: defaultControls({ rotate: false, attributionOptions: { collapsible: true } }),
        view: new View({ center: fromLonLat(INDIA_CENTER), zoom: INDIA_ZOOM, maxZoom: 19 }),
      });
      const translate = new Translate({ layers: [layer] });
      translate.on('translateend', () => this.zone.run(() => this.setFromMap(this.pin.getGeometry()!.getCoordinates())));
      this.map.addInteraction(translate);
      this.map.on('singleclick', (e) => {
        // A click on the pin itself starts a drag instead.
        if (this.map!.hasFeatureAtPixel(e.pixel, { layerFilter: (l) => l === layer })) return;
        this.zone.run(() => this.setFromMap(e.coordinate));
      });
      // The picker often starts hidden (dialog, collapsed section): re-measure when it gets a size.
      this.resizeObserver = new ResizeObserver(() => this.map?.updateSize());
      this.resizeObserver.observe(this.mapEl.nativeElement);
    });
    this.syncPin(true);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.setTarget(undefined);
  }

  async useCurrentLocation(): Promise<void> {
    this.error.set('');
    this.locating.set(true);
    try {
      const pos = await currentPosition();
      this.set({ latitude: pos.latitude, longitude: pos.longitude });
      this.syncPin(true);
    } catch (reason) {
      this.error.set(geoErrorText(reason as GeoError));
    } finally {
      this.locating.set(false);
    }
  }

  clear(): void {
    this.error.set('');
    this.set(null);
    this.syncPin(false);
  }

  private setFromMap(coordinate: number[]): void {
    const [lon, lat] = toLonLat(coordinate);
    this.error.set('');
    this.set({ latitude: round5(lat), longitude: round5(lon) });
    this.syncPin(false);
    // A tap on a zoomed-out map is only roughly right: zoom in there so the pin can be fine-tuned.
    const view = this.map?.getView();
    if (view && (view.getZoom() ?? 0) < 14) view.animate({ center: coordinate, zoom: 16, duration: 400 });
  }

  private set(value: PickedLocation | null): void {
    const rounded = value ? { latitude: round5(value.latitude), longitude: round5(value.longitude) } : null;
    this.value.set(rounded);
    this.locationChange.emit(rounded);
  }

  /** Puts the pin where `value` says; `center` also moves the view there. */
  private syncPin(center: boolean): void {
    const v = this.value();
    this.source.clear();
    if (!v) return;
    this.pin.setGeometry(new Point(fromLonLat([v.longitude, v.latitude])));
    this.source.addFeature(this.pin);
    if (center && this.map) {
      this.map.getView().animate({ center: fromLonLat([v.longitude, v.latitude]), zoom: 16, duration: 350 });
    }
  }
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function geoErrorText(reason: GeoError): string {
  switch (reason) {
    case 'insecure':
      return t('location.your_browser_only_shares_location_on');
    case 'denied':
      return t('location.location_permission_was_blocked');
    case 'unsupported':
      return t('location.this_browser_cant_share_its_location');
    default:
      return t('location.we_couldnt_find_your_location');
  }
}
