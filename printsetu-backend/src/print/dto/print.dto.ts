import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ColorMode, PaperSize, SideMode } from '@prisma/client';

// One line item per uploaded document — per-document print options (SRS
// extension: a photo and a text PDF in the same request can have
// different paper/color/side/copies), priced individually and summed.
export class QuoteItemDto {
  @IsString() @IsNotEmpty() documentId!: string;
  @IsEnum(PaperSize) paperSize!: PaperSize;
  @IsEnum(ColorMode) colorMode!: ColorMode;
  @IsEnum(SideMode) sideMode!: SideMode;
  @IsInt() @Min(1) @Max(999) copies!: number;
}

export class CreateQuoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];
}

export class ConfirmPrintJobDto {
  @IsString() @IsNotEmpty() quoteId!: string;
}

export class AgentJobStatusDto {
  @IsEnum(['ACCEPTED', 'PRINTING', 'PRINTED', 'PRINT_FAILED', 'PRINT_UNKNOWN'])
  status!: 'ACCEPTED' | 'PRINTING' | 'PRINTED' | 'PRINT_FAILED' | 'PRINT_UNKNOWN';

  @IsString() @IsNotEmpty() agentAttemptId!: string;

  message?: string;
}

export class ReconcileJobDto {
  @IsEnum(['PRINTED', 'PRINT_FAILED'])
  outcome!: 'PRINTED' | 'PRINT_FAILED';

  message?: string;
}

// Shop-side document editor (dedicated full-page workspace) — reordering,
// per-document settings, and rotate/crop/brightness/contrast/sharpness
// editing, all scoped to a PrintJobItem within a still-PRINT_ELIGIBLE job.

export class ReorderItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  itemIds!: string[];
}

export class UpdateItemSettingsDto {
  @IsOptional() @IsEnum(PaperSize) paperSize?: PaperSize;
  @IsOptional() @IsEnum(ColorMode) colorMode?: ColorMode;
  @IsOptional() @IsEnum(SideMode) sideMode?: SideMode;
  @IsOptional() @IsInt() @Min(1) @Max(999) copies?: number;
}

// Normalized (0..1) crop rectangle relative to the document's native
// page/image size — resolution-independent so the same rect applies
// whether it was drawn against a thumbnail or a full-res preview.
export class CropRectDto {
  @IsNumber() @Min(0) @Max(1) x!: number;
  @IsNumber() @Min(0) @Max(1) y!: number;
  @IsNumber() @Min(0) @Max(1) width!: number;
  @IsNumber() @Min(0) @Max(1) height!: number;
}

export class EditItemDto {
  @IsOptional() @IsEnum([0, 90, 180, 270]) rotation?: 0 | 90 | 180 | 270;

  @IsOptional()
  @ValidateNested()
  @Type(() => CropRectDto)
  crop?: CropRectDto | null;

  // Images only (v1) — rejected for PDF documents when non-zero.
  @IsOptional() @IsNumber() @Min(-100) @Max(100) brightness?: number;
  @IsOptional() @IsNumber() @Min(-100) @Max(100) contrast?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) sharpness?: number;
}
