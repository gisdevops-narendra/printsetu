import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateShopDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() ownerName!: string;
  @IsString() @IsNotEmpty() mobile!: string;
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() address!: string;
  @IsString() @IsNotEmpty() city!: string;
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

/**
 * SRS §9: "Recommended default retention: delete the actual document
 * shortly after confirmed successful printing, for example within 15–60
 * minutes. Exact retention is a business setting and must be confirmed
 * before production." / §5.2: "Recommended maximum upload size: 25 MB per
 * document, configurable." Both are per-shop (print_settings), not global.
 */
export class UpdatePrintSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_080) // 1 minute .. 7 days
  retentionMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1024)
  @Max(104_857_600) // 1 KB .. 100 MB
  maxFileSizeBytes?: number;
}
