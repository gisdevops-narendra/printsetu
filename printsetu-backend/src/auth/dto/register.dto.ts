import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Step 1 of registration: email a one-time code to the address being registered. */
export class SendRegistrationOtpDto {
  @IsEmail() @MaxLength(254) email!: string;
}

/** Public shop self-registration: creates the shop and its owner's login in one go, once the email's OTP checks out. */
export class RegisterShopDto {
  @IsString() @IsNotEmpty() @MaxLength(120) shopName!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) ownerName!: string;
  @IsString() @IsNotEmpty() @MaxLength(20) mobile!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @IsNotEmpty() @MaxLength(300) address!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) city!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from the email.' })
  otp!: string;
}
