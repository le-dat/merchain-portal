import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/shared/database/prisma.service';
import { AuthService } from './../src/modules/auth/services/auth.service';
import cookieParser from 'cookie-parser';

describe('Auth & RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;

  const adminEmail = 'test-admin@merchain.com';
  const accountantEmail = 'test-accountant@merchain.com';
  const rawPassword = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    authService = moduleFixture.get<AuthService>(AuthService);
    await app.init();

    // Clean up if exist
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, accountantEmail] } },
    });

    // Create test users
    const hashedPassword = await authService.hashPassword(rawPassword);
    await prisma.user.createMany({
      data: [
        { email: adminEmail, password: hashedPassword, role: 'ADMIN' },
        {
          email: accountantEmail,
          password: hashedPassword,
          role: 'ACCOUNTANT',
        },
      ],
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, accountantEmail] } },
    });
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('should return access token and set refresh token cookie on valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminEmail, password: rawPassword })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('access_token');

      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const hasRefreshToken = cookies.some((c) =>
        c.startsWith('refresh_token='),
      );
      expect(hasRefreshToken).toBe(true);
    });

    it('should fail with invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminEmail, password: 'wrongpassword' })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail with invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'invalid-email', password: rawPassword })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('Protected Endpoints & RBAC', () => {
    let adminAccessToken: string;
    let accountantAccessToken: string;
    let adminCookie: string;

    beforeAll(async () => {
      // Login Admin
      const adminLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminEmail, password: rawPassword });
      const adminBody = adminLogin.body as { access_token: string };
      adminAccessToken = adminBody.access_token;
      adminCookie = adminLogin.headers['set-cookie']
        ? (adminLogin.headers['set-cookie'] as unknown as string[])[0]
        : '';

      // Login Accountant
      const accountantLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: accountantEmail, password: rawPassword });
      const accountantBody = accountantLogin.body as { access_token: string };
      accountantAccessToken = accountantBody.access_token;
    });

    it('should reject requests without a token with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/api/users/list')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should allow ADMIN to access /api/users/list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/users/list')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('users');
    });

    it('should reject ACCOUNTANT to access /api/users/list with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/users/list')
        .set('Authorization', `Bearer ${accountantAccessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    describe('POST /api/auth/refresh', () => {
      it('should refresh access token using valid refresh cookie', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', [adminCookie])
          .expect(HttpStatus.OK);

        expect(response.body).toHaveProperty('access_token');
        const newCookies = response.headers[
          'set-cookie'
        ] as unknown as string[];
        expect(newCookies).toBeDefined();
        const hasRefreshToken = newCookies.some((c) =>
          c.startsWith('refresh_token='),
        );
        expect(hasRefreshToken).toBe(true);
      });

      it('should reject refresh request with invalid cookie', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', ['refresh_token=invalidtokenvalue'])
          .expect(HttpStatus.UNAUTHORIZED);
      });

      it('should reject refresh request with no cookie', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .expect(HttpStatus.UNAUTHORIZED);
      });
    });

    describe('POST /api/auth/logout', () => {
      it('should logout and clear refresh token', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(HttpStatus.OK);

        // Verifying DB record has refreshToken as null
        const user = await prisma.user.findUnique({
          where: { email: adminEmail },
        });
        expect(user?.refreshToken).toBeNull();
      });
    });
  });
});
