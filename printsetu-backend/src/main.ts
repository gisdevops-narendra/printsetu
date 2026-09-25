import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });
  const config = app.get(ConfigService<AppConfig, true>);

  // In production every request arrives through Nginx on the Docker network.
  // Trust X-Forwarded-For from private-network proxies so req.ip is the real
  // visitor: rate limits are per visitor (not one shared bucket for everyone)
  // and the activity log records real addresses.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  app.use(helmet());
  app.enableCors({
    origin: config.get('corsAllowedOrigins', { infer: true }),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`PrintSetu backend listening on http://0.0.0.0:${port}/api`);
}

bootstrap();
