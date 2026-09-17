import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Boots the real application (no mocked providers) against whatever
 * Postgres/Redis/MinIO/Keycloak the .env points at — mirrors main.ts's
 * bootstrap() exactly so these e2e tests exercise the same middleware
 * pipeline (helmet, CORS, global prefix, validation, exception mapping)
 * a real request would hit in production.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.init();
  return app;
}

export async function closeTestApp(app: INestApplication | undefined): Promise<void> {
  if (app) await app.close();
}
