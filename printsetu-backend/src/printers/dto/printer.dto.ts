import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterPrinterDto {
  @IsString() @IsNotEmpty() shopId!: string;
  @IsString() @IsNotEmpty() printerName!: string;
  @IsOptional() @IsString() driverName?: string;
}

export class SetDefaultPrinterDto {
  @IsString() @IsNotEmpty() printerId!: string;
}

export class DetectedPrinterDto {
  @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
  @IsBoolean() isDefault!: boolean;
}

/** What an agent reports about its own computer's OS printers (POST /api/agent/printers). */
export class ReportPrintersDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DetectedPrinterDto)
  printers!: DetectedPrinterDto[];

  @IsOptional() @IsString() @MaxLength(32) platform?: string;
  @IsOptional() @IsString() @MaxLength(255) hostname?: string;
}

/** Shopkeeper's choice of OS printer for one agent; null = that computer's default printer. */
export class SelectOsPrinterDto {
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  osPrinterName!: string | null;
}

export const AGENT_PACKAGE_OS = ['windows', 'linux'] as const;
export type AgentPackageOs = (typeof AGENT_PACKAGE_OS)[number];

export class DownloadAgentPackageDto {
  @IsOptional() @IsIn(AGENT_PACKAGE_OS) os?: AgentPackageOs;
}
