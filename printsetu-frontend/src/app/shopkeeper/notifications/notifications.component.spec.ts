import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { NotificationsComponent } from './notifications.component';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { NotificationRow } from '../../core/models/models';

describe('NotificationsComponent (SRS §20 in-app notification feed)', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let component: NotificationsComponent;
  let shopkeeperService: jasmine.SpyObj<ShopkeeperService>;

  const rows: NotificationRow[] = [
    {
      id: 'n1',
      shopId: 'shop-1',
      printJobId: null,
      eventType: 'UPLOAD_RECEIVED',
      channel: 'IN_APP',
      status: 'SENT',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'n2',
      shopId: 'shop-1',
      printJobId: 'job-1',
      eventType: 'PRINT_FAILED',
      channel: 'IN_APP',
      status: 'SENT',
      createdAt: new Date().toISOString(),
    },
  ];

  beforeEach(async () => {
    shopkeeperService = jasmine.createSpyObj<ShopkeeperService>('ShopkeeperService', [
      'notifications',
    ]);
    shopkeeperService.notifications.and.returnValue(
      of({ items: rows, total: 2, page: 1, pageSize: 50 }),
    );

    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ShopkeeperService, useValue: shopkeeperService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance;
  });

  it('loads notifications on init and renders without error', () => {
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(component.notifications()).toEqual(rows);
    expect(component.loading()).toBe(false);
  });

  it('maps each known event type to a distinct label/severity', () => {
    expect(component.meta('UPLOAD_RECEIVED')).toEqual(
      jasmine.objectContaining({ label: 'Document uploaded', severity: 'info' }),
    );
    expect(component.meta('PRINT_QUEUED')).toEqual(
      jasmine.objectContaining({ label: 'Print queued', severity: 'info' }),
    );
    expect(component.meta('PRINT_COMPLETED')).toEqual(
      jasmine.objectContaining({ label: 'Print completed', severity: 'success' }),
    );
    expect(component.meta('PRINT_FAILED')).toEqual(
      jasmine.objectContaining({ label: 'Print failed', severity: 'danger' }),
    );
  });

  it('falls back to a generic secondary tag for an unrecognized event type', () => {
    expect(component.meta('SOME_FUTURE_EVENT' as any)).toEqual({
      label: 'SOME_FUTURE_EVENT',
      icon: 'pi pi-bell',
      severity: 'secondary',
    });
  });
});
