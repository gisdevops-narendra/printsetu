import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopsComponent } from './shops.component';
import { AdminService } from '../../core/services/admin.service';
import { Shop } from '../../core/models/models';
import { provideEnglishTranslations } from '../../../testing/english-translations';

describe('ShopsComponent (SRS §6 admin shop management)', () => {
  let fixture: ComponentFixture<ShopsComponent>;
  let component: ShopsComponent;
  let adminService: jasmine.SpyObj<AdminService>;

  const shop: Shop = {
    id: 'shop-1',
    shopCode: 'SHOP-ABC123',
    name: 'Test Shop',
    ownerName: 'Owner',
    mobile: '9000000000',
    email: 'shop@test.local',
    address: 'Addr',
    city: 'City',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    adminService = jasmine.createSpyObj<AdminService>('AdminService', [
      'listShops',
      'setShopStatus',
    ]);
    adminService.listShops.and.returnValue(of({ items: [shop], total: 1 }));

    await TestBed.configureTestingModule({
      imports: [ShopsComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideRouter([]),
        MessageService,
        ConfirmationService,
        provideEnglishTranslations(),
        { provide: AdminService, useValue: adminService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShopsComponent);
    component = fixture.componentInstance;
  });

  it('loads shops on init and renders without error', () => {
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(component.shops()).toEqual([shop]);
    expect(component.loading()).toBe(false);
  });
});
