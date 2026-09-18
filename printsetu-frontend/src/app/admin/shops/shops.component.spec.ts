import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopsComponent } from './shops.component';
import { AdminService } from '../../core/services/admin.service';
import { Shop } from '../../core/models/models';

describe('ShopsComponent (SRS §6 admin shop management + §9 per-shop print settings)', () => {
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
      'createShop',
      'setShopStatus',
      'getShopSettings',
      'updateShopSettings',
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

  it('openSettings() loads the shop settings and converts bytes -> MB for the form', () => {
    adminService.getShopSettings.and.returnValue(
      of({
        id: 's1',
        shopId: 'shop-1',
        defaultPrinterId: null,
        retentionMinutes: 45,
        maxFileSizeBytes: 52_428_800,
        documentPreviewEnabled: false,
      }),
    );
    fixture.detectChanges();

    component.openSettings(shop);

    expect(adminService.getShopSettings).toHaveBeenCalledWith('shop-1');
    expect(component.settingsVisible).toBe(true);
    expect(component.settingsShop()).toBe(shop);
    expect(component.settingsForm).toEqual({ retentionMinutes: 45, maxFileSizeMb: 50, documentPreviewEnabled: false });
  });

  it('submitSettings() converts MB -> bytes and PATCHes the settings', () => {
    adminService.updateShopSettings.and.returnValue(
      of({
        id: 's1',
        shopId: 'shop-1',
        defaultPrinterId: null,
        retentionMinutes: 20,
        maxFileSizeBytes: 10_485_760,
        documentPreviewEnabled: false,
      }),
    );
    fixture.detectChanges();
    component.settingsShop.set(shop);
    component.settingsForm = { retentionMinutes: 20, maxFileSizeMb: 10, documentPreviewEnabled: false };

    component.submitSettings();

    expect(adminService.updateShopSettings).toHaveBeenCalledWith('shop-1', {
      retentionMinutes: 20,
      maxFileSizeBytes: 10_485_760,
      documentPreviewEnabled: false,
    });
    expect(component.settingsVisible).toBe(false);
    expect(component.savingSettings()).toBe(false);
  });

  it('submitSettings() is a no-op when no shop is selected', () => {
    fixture.detectChanges();
    component.submitSettings();
    expect(adminService.updateShopSettings).not.toHaveBeenCalled();
  });

  it('submitSettings() resets the saving flag without closing the dialog on error', () => {
    adminService.updateShopSettings.and.returnValue(throwError(() => new Error('boom')));
    fixture.detectChanges();
    component.settingsShop.set(shop);
    component.settingsVisible = true;

    component.submitSettings();

    expect(component.savingSettings()).toBe(false);
    expect(component.settingsVisible).toBe(true);
  });

  it('createShop flow: openCreate resets the form, submitCreate POSTs and reloads', () => {
    adminService.createShop.and.returnValue(of(shop));
    fixture.detectChanges();

    component.openCreate();
    expect(component.createVisible).toBe(true);
    expect(component.form).toEqual({});

    component.form = {
      name: 'New Shop',
      ownerName: 'X',
      mobile: '1',
      email: 'a@b.com',
      address: 'a',
      city: 'c',
    };
    component.submitCreate();

    expect(adminService.createShop).toHaveBeenCalledWith(component.form);
    expect(component.createVisible).toBe(false);
    expect(component.saving()).toBe(false);
    expect(adminService.listShops).toHaveBeenCalledTimes(2); // initial load + reload after create
  });
});
