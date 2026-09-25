import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class ChangeTemporaryPasswordDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

/** Forgot password, step 1 (and "Resend code"): email a reset code to the account's address. */
export class ForgotPasswordDto {
  @IsEmail() @MaxLength(254) email!: string;
}

/** Forgot password, step 2: the emailed code plus the new password. */
export class ResetPasswordDto {
  @IsEmail() @MaxLength(254) email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from the email.' })
  otp!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @MaxLength(128)
  newPassword!: string;
}
