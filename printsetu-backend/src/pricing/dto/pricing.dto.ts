import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { PaperSize, ColorMode, SideMode } from '@prisma/client';

export class SetPricingDto {
  @IsEnum(PaperSize) paperSize!: PaperSize;
  @IsEnum(ColorMode) colorMode!: ColorMode;
  @IsEnum(SideMode) sideMode!: SideMode;
  @IsNumber() @IsPositive() pricePerPage!: number;
}

/** Page range + rate; maxPages omitted/null = open-ended ("21 pages and above"). */
export class UpdatePricingTierDto {
  @IsInt() @Min(1) @Max(100000) minPages!: number;
  @IsOptional() @IsInt() @Min(1) @Max(100000) maxPages?: number | null;
  @IsNumber() @IsPositive() pricePerPage!: number;
}

export class CreatePricingTierDto extends UpdatePricingTierDto {
  @IsEnum(PaperSize) paperSize!: PaperSize;
  @IsEnum(ColorMode) colorMode!: ColorMode;
  @IsEnum(SideMode) sideMode!: SideMode;
}
