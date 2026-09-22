// Swapped in for src/environments/environment.ts by the "production"
// build configuration (see angular.json -> fileReplacements). Nginx
// serves this app and proxies /api/ to the backend on the SAME origin
// (see infra/nginx/nginx.conf), so both URLs are relative — no
// EC2/LAN IP or backend port baked into the production bundle.
export const environment = {
  production: true,
  apiBaseUrl: '/api',
  appBaseUrl: '',
};
