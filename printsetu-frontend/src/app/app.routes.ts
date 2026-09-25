import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { shopAccessGuard } from './core/auth/shop-access.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 's/:shopCode',
    loadComponent: () =>
      import('./customer/order-flow/order-flow.component').then((m) => m.OrderFlowComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard('ADMIN')],
    loadComponent: () =>
      import('./layout/admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./admin/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'shops',
        loadComponent: () => import('./admin/shops/shops.component').then((m) => m.ShopsComponent),
      },
      {
        path: 'shops/:shopId/qr',
        loadComponent: () => import('./admin/qr/qr.component').then((m) => m.QrComponent),
      },
      {
        path: 'subscriptions',
        loadComponent: () =>
          import('./admin/subscriptions/subscriptions.component').then((m) => m.SubscriptionsComponent),
      },
      {
        path: 'users',
        loadComponent: () => import('./admin/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'printers',
        loadComponent: () =>
          import('./admin/printers/printers.component').then((m) => m.PrintersComponent),
      },
      {
        path: 'print-history',
        loadComponent: () =>
          import('./admin/print-history/print-history.component').then(
            (m) => m.PrintHistoryComponent,
          ),
      },
      {
        path: 'business-map',
        loadComponent: () =>
          import('./admin/business-map/business-map.component').then((m) => m.BusinessMapComponent),
      },
      {
        path: 'audit-logs',
        loadComponent: () =>
          import('./admin/audit-logs/audit-logs.component').then((m) => m.AuditLogsComponent),
      },
    ],
  },
  {
    path: 'shop',
    canActivate: [authGuard('SHOPKEEPER')],
    canActivateChild: [shopAccessGuard],
    loadComponent: () =>
      import('./layout/shopkeeper-layout/shopkeeper-layout.component').then(
        (m) => m.ShopkeeperLayoutComponent,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'queue' },
      {
        path: 'queue',
        loadComponent: () =>
          import('./shopkeeper/queue/queue.component').then((m) => m.QueueComponent),
      },
      {
        path: 'print-jobs/:id/edit',
        loadComponent: () =>
          import('./shopkeeper/document-editor/document-editor.component').then(
            (m) => m.DocumentEditorComponent,
          ),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./shopkeeper/history/history.component').then((m) => m.HistoryComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./shopkeeper/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'pricing',
        loadComponent: () =>
          import('./shopkeeper/pricing/pricing.component').then((m) => m.ShopPricingComponent),
      },
      {
        path: 'qr',
        loadComponent: () =>
          import('./shopkeeper/qr/qr.component').then((m) => m.ShopQrComponent),
      },
      {
        path: 'print-agent',
        loadComponent: () =>
          import('./shopkeeper/print-agent/print-agent.component').then(
            (m) => m.PrintAgentComponent,
          ),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./shopkeeper/notifications/notifications.component').then(
            (m) => m.NotificationsComponent,
          ),
      },
      {
        path: 'billing',
        loadComponent: () =>
          import('./shopkeeper/billing/billing.component').then((m) => m.ShopBillingComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
