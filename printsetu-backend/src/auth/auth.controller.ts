import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  ChangeTemporaryPasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
} from './dto/login.dto';
import { RegisterShopDto, SendRegistrationOtpDto } from './dto/register.dto';
import { RegistrationService } from './registration.service';
import { PasswordResetService } from './password-reset.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly registrationService: RegistrationService,
    private readonly passwordReset: PasswordResetService,
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
    return this.authService.changeTemporaryPassword(
      dto.username,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /** "Forgot password?" step 1 (and "Resend code"): emails a reset code if the address has an active account. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password/send-otp')
  @HttpCode(200)
  sendPasswordResetCode(@Body() dto: ForgotPasswordDto) {
    return this.passwordReset.sendCode(dto.email);
  }

  /** "Forgot password?" step 2: checks the emailed code, sets the new password and signs the user in. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('forgot-password/reset')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.passwordReset.reset(dto.email, dto.otp, dto.newPassword, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /** Registration step 1 (and "Resend code"): emails a one-time code to the address being registered. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register/send-otp')
  @HttpCode(200)
  sendRegistrationOtp(@Body() dto: SendRegistrationOtpDto) {
    return this.registrationService.sendOtp(dto.email);
  }

  /** Shop self-registration from the login screen: checks the emailed code, creates the shop + its owner's login and signs them in. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterShopDto, @Req() req: Request) {
    return this.registrationService.register(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
