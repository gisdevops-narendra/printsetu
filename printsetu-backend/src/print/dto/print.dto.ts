import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { ColorMode, PaperSize, SideMode } from '@prisma/client';

export class CreateQuoteDto {
  @IsString() @IsNotEmpty() documentId!: string;
  @IsEnum(PaperSize) paperSize!: PaperSize;
  @IsEnum(ColorMode) colorMode!: ColorMode;
  @IsEnum(SideMode) sideMode!: SideMode;
  @IsInt() @Min(1) @Max(999) copies!: number;
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
