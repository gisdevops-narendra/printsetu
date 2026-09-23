import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ChangeTemporaryPasswordDto, LoginDto, RefreshDto } from './dto/login.dto';
import { RegisterShopDto } from './dto/register.dto';
import { RegistrationService } from './registration.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly registrationService: RegistrationService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** Signs out: revokes the refresh token in Keycloak. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('logout')
  @HttpCode(204)
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  /** Completes a forced first-login password change (see AuthService.changeTemporaryPassword) and signs the user in. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('change-temporary-password')
  changeTemporaryPassword(@Body() dto: ChangeTemporaryPasswordDto) {
    return this.authService.changeTemporaryPassword(dto.username, dto.currentPassword, dto.newPassword);
  }

  /** Shop self-registration from the login screen: creates the shop + its owner's login and signs them in. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterShopDto, @Req() req: Request) {
    return this.registrationService.register(dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }
}
