import { IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateShopDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() ownerName!: string;
  @IsString() @IsNotEmpty() mobile!: string;
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() address!: string;
  @IsString() @IsNotEmpty() city!: string;
  @IsOptional() @IsString() district?: string | null;
  @IsOptional() @IsNumber() latitude?: number | null;
  @IsOptional() @IsNumber() longitude?: number | null;
}

export class UpdateShopDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() ownerName?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
}

export class UpdateShopStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}
