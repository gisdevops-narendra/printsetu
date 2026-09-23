import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Public shop self-registration: creates the shop and its owner's login in one go. */
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
}
