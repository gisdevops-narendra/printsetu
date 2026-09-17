import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { AuthService, SessionUser } from './auth.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let authServiceStub: { user: () => SessionUser | null };
  let router: jasmine.SpyObj<Router>;
  const loginTree = {} as UrlTree;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['createUrlTree']);
    router.createUrlTree.and.returnValue(loginTree);
  });

  function configure(user: SessionUser | null) {
    authServiceStub = { user: () => user };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceStub },
        { provide: Router, useValue: router },
      ],
    });
  }

  it('redirects to /login when nobody is signed in', () => {
    configure(null);
    const result = TestBed.runInInjectionContext(() => authGuard()({} as any, {} as any));
    expect(result).toBe(loginTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });

  it('allows access when no specific role is required, for any signed-in user', () => {
    configure({ email: 'a@b.com', name: 'A', role: 'SHOPKEEPER' });
    const result = TestBed.runInInjectionContext(() => authGuard()({} as any, {} as any));
    expect(result).toBe(true);
  });

  it('allows access when the signed-in user has one of the allowed roles', () => {
    configure({ email: 'a@b.com', name: 'A', role: 'ADMIN' });
    const result = TestBed.runInInjectionContext(() =>
      authGuard('ADMIN', 'SHOPKEEPER')({} as any, {} as any),
    );
    expect(result).toBe(true);
  });

  it('redirects to /login when the signed-in user does not have an allowed role', () => {
    configure({ email: 'a@b.com', name: 'A', role: 'SHOPKEEPER' });
    const result = TestBed.runInInjectionContext(() => authGuard('ADMIN')({} as any, {} as any));
    expect(result).toBe(loginTree);
  });
});
