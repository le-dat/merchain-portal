import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  Controller,
  Get,
  BadRequestException,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseConfigException } from '../src/shared/exceptions/system.exceptions';

import { Public } from '../src/modules/auth/decorators/public.decorator';

@Controller('test-exceptions')
@Public()
class TestExceptionsController {
  @Get('http')
  triggerHttpError() {
    throw new BadRequestException('Bad request');
  }

  @Get('system')
  triggerSystemError() {
    throw new DatabaseConfigException();
  }

  @Get('generic')
  triggerGenericError() {
    throw new Error('Bad DB connection');
  }
}

describe('Exceptions & Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestExceptionsController],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET) -> 200', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res: request.Response) => {
        const body = res.body as { status: string; timestamp: string };
        expect(body.status).toBe('ok');
        expect(body.timestamp).toBeDefined();
      });
  });

  it('/test-exceptions/http (GET) -> 400', () => {
    return request(app.getHttpServer())
      .get('/test-exceptions/http')
      .expect(400)
      .expect((res: request.Response) => {
        const body = res.body as {
          statusCode: number;
          message: string;
          timestamp: string;
        };
        expect(body.statusCode).toBe(400);
        expect(body.message).toBe('Bad request');
        expect(body.timestamp).toBeDefined();
      });
  });

  it('/test-exceptions/system (GET) -> 500', () => {
    return request(app.getHttpServer())
      .get('/test-exceptions/system')
      .expect(500)
      .expect((res: request.Response) => {
        const body = res.body as {
          statusCode: number;
          message: string;
          error: string;
        };
        expect(body.statusCode).toBe(500);
        expect(body.message).toContain('System configuration issue');
        expect(body.error).toBe('DatabaseConfigException');
      });
  });

  it('/test-exceptions/generic (GET) -> 500', () => {
    return request(app.getHttpServer())
      .get('/test-exceptions/generic')
      .expect(500)
      .expect((res: request.Response) => {
        const body = res.body as { statusCode: number; message: string };
        expect(body.statusCode).toBe(500);
        expect(body.message).toBe('Bad DB connection');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
