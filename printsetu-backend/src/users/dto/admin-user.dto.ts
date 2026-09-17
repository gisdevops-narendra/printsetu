import { IsEmail, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RoleName } from '@prisma/client';

export class CreateUserDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() mobile?: string;
  @IsEnum(RoleName) role!: RoleName;
  @IsOptional() @IsString() shopId?: string;
}

export class UpdateUserStatusDto {
  @IsIn(['ACTIVE', 'DISABLED'])
  status!: 'ACTIVE' | 'DISABLED';
}
