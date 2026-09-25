import { LeadStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** A prospective shop on the Business Map. */
export class CreateLeadDto {
  @IsString() @IsNotEmpty({ message: 'Enter the shop name.' }) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string;
  @IsOptional()
  @ValidateIf((_o, v) => v !== '')
  @IsEmail({}, { message: 'Enter a valid email.' })
  email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) district?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;

  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;

  /** The registered shop, when the lead is added as JOINED. */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID() shopId?: string | null;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Enter the shop name.' })
  @MaxLength(120)
  name?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string;
  @IsOptional()
  @ValidateIf((_o, v) => v !== '')
  @IsEmail({}, { message: 'Enter a valid email.' })
  email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) district?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;

  /** The registered shop this lead became (with status JOINED); null unlinks it. */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID() shopId?: string | null;
}
