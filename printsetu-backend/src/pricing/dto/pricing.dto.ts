import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { PaperSize, ColorMode, SideMode } from '@prisma/client';

export class SetPricingDto {
  @IsEnum(PaperSize) paperSize!: PaperSize;
  @IsEnum(ColorMode) colorMode!: ColorMode;
  @IsEnum(SideMode) sideMode!: SideMode;
  @IsNumber() @IsPositive() pricePerPage!: number;
}
