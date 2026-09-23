// Dev builds talk to the backend on the same host the page was opened from
// (localhost, or this machine's LAN IP when testing from a phone), so a
// changed DHCP address doesn't silently break login. The guard keeps SSR,
// where there is no window, working.
const devHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export const environment = {
  production: false,
  apiBaseUrl: `http://${devHost}:53100/api`,
  appBaseUrl: `http://${devHost}:54200`,
};
