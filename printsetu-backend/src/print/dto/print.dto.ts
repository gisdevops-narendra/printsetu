import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNotEmpty, IsString, Max, Min, ValidateNested } from 'class-validator';
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
