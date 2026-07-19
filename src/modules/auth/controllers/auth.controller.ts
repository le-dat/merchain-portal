import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { Public } from '../decorators/public.decorator';
import { GetUser } from '../decorators/get-user.decorator';

@Controller('auth')
export class AuthController {
  private readonly REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
  private readonly REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 1 week

  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(loginDto);
    const tokens = await this.authService.login(user);

    res.cookie(this.REFRESH_TOKEN_COOKIE_NAME, tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: this.REFRESH_TOKEN_COOKIE_MAX_AGE,
    });

    return { access_token: tokens.access_token };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const refreshToken = cookies?.[this.REFRESH_TOKEN_COOKIE_NAME];
    if (typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token not found');
    }

    const tokens = await this.authService.refresh(refreshToken);

    res.cookie(this.REFRESH_TOKEN_COOKIE_NAME, tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: this.REFRESH_TOKEN_COOKIE_MAX_AGE,
    });

    return { access_token: tokens.access_token };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @GetUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(userId);
    res.clearCookie(this.REFRESH_TOKEN_COOKIE_NAME);
    return { message: 'Logged out successfully' };
  }
}
