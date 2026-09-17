// Loaded once before every e2e spec file. These tests boot the *real*
// AppModule against the real dev docker-compose stack (Postgres, Redis,
// MinIO, Keycloak) rather than mocks — see test/support/app.ts — so they
// need the same environment variables the app itself reads at startup.
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
