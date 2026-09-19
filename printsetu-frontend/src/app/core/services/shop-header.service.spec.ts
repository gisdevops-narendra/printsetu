import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { ShopHeaderService } from './shop-header.service';
import { ShopkeeperService } from './shopkeeper.service';
import { OrderAlertsService } from './order-alerts.service';
import { PrintJobRow, PrintJobStatus, ShopProfileResponse } from '../models/models';

const job = (status: PrintJobStatus, i: number) => ({ id: 'j' + i, status }) as PrintJobRow;

describe('ShopHeaderService', () => {
  let service: ShopHeaderService;
  let jobs: ReturnType<typeof signal<PrintJobRow[]>>;
  let shopkeeper: { updateSettings: jasmine.Spy; profile: jasmine.Spy; notifications: jasmine.Spy; profileChanged: Subject<ShopProfileResponse> };

  beforeEach(() => {
    jobs = signal<PrintJobRow[]>([]);
    shopkeeper = {
      updateSettings: jasmine.createSpy('updateSettings').and.returnValue(of({})),
      profile: jasmine.createSpy('profile').and.returnValue(of({})),
      notifications: jasmine.createSpy('notifications').and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 10 })),
      profileChanged: new Subject<ShopProfileResponse>(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ShopkeeperService, useValue: shopkeeper },
        { provide: OrderAlertsService, useValue: { jobs } },
      ],
    });
    service = TestBed.inject(ShopHeaderService);
  });

  it('summarises the queue: waiting, printing, and jobs that need attention', () => {
    jobs.set([
      job('PRINT_ELIGIBLE', 1),
      job('PRINT_ELIGIBLE', 2),
      job('QUEUED', 3),
      job('PRINTING', 4),
      job('AGENT_OFFLINE', 5),
      job('PRINT_FAILED', 6),
    ]);
    expect(service.queue()).toEqual({ pending: 3, printing: 1, attention: 2 });
  });

  it('reports an empty queue as zeros', () => {
    expect(service.queue()).toEqual({ pending: 0, printing: 0, attention: 0 });
  });

  it('flips the Online switch immediately and confirms once the API accepts it', () => {
    const done = jasmine.createSpy('done');
    const fail = jasmine.createSpy('fail');
    service.setAccepting(false, done, fail);
    expect(shopkeeper.updateSettings).toHaveBeenCalledWith({ acceptingOrders: false });
    expect(service.acceptingOrders()).toBeFalse();
    expect(service.togglingOnline()).toBeFalse();
    expect(done).toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });

  it('rolls the switch back and reports when the API refuses', () => {
    shopkeeper.updateSettings.and.returnValue(throwError(() => new Error('boom')));
    const done = jasmine.createSpy('done');
    const fail = jasmine.createSpy('fail');
    service.setAccepting(false, done, fail);
    expect(service.acceptingOrders()).toBeTrue();
    expect(fail).toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });

  it('follows profile payloads published elsewhere in the app (name, logo, Online switch)', () => {
    service.start();
    shopkeeper.profileChanged.next({
      shop: { name: 'Copy Point' } as never,
      settings: { acceptingOrders: false } as never,
    });
    expect(service.shop()?.name).toBe('Copy Point');
    expect(service.acceptingOrders()).toBeFalse();
    service.stop();
  });

  it('counts only notifications newer than the last time the bell was read as unread', () => {
    const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
    service.alerts.set([
      { id: 'a', icon: '', tone: 'info', title: 'new', at: at(60_000) },
      { id: 'b', icon: '', tone: 'info', title: 'old', at: at(3 * 3600_000) },
    ]);
    service.seenAt.set(Date.now() - 3600_000);
    expect(service.unread()).toBe(1);
    service.markAllRead();
    expect(service.unread()).toBe(0);
  });
});
