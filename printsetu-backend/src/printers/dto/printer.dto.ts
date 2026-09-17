import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterPrinterDto {
  @IsString() @IsNotEmpty() shopId!: string;
  @IsString() @IsNotEmpty() printerName!: string;
  @IsOptional() @IsString() driverName?: string;
}

export class SetDefaultPrinterDto {
  @IsString() @IsNotEmpty() printerId!: string;
}
