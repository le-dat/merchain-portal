import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WorkerService } from './modules/reconciliation/worker.service';
import {
  Logger,
  INestApplication,
  INestApplicationContext,
} from '@nestjs/common';
import { UnknownAppRoleException } from './shared/exceptions/system.exceptions';

const logger = new Logger('Bootstrap');

const enum AppRole {
  API = 'api',
  WORKER = 'worker',
  ALL = 'all',
}

async function bootstrapWorker(): Promise<INestApplicationContext> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();

  const workerService = app.get(WorkerService);
  workerService.run();
  logger.log('Worker started (standalone mode)');
  return app;
}

async function bootstrapApi(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`API server listening on port ${port}`);
  return app;
}

async function bootstrapAll(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const workerService = app.get(WorkerService);
  workerService.run();
  logger.log('Worker started (inline mode)');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`API server listening on port ${port}`);
  return app;
}

async function bootstrap() {
  const role = (process.env.APP_ROLE || AppRole.ALL) as AppRole;

  switch (role) {
    case AppRole.WORKER:
      await bootstrapWorker();
      break;
    case AppRole.API:
      await bootstrapApi();
      break;
    case AppRole.ALL:
      await bootstrapAll();
      break;
    default:
      throw new UnknownAppRoleException(role);
  }
}

bootstrap().catch((err: Error) => {
  const bootstrapLogger = new Logger('BootstrapError');
  bootstrapLogger.error(err.message, err.stack);
  process.exit(1);
});
