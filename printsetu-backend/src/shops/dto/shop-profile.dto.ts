import { Type } from 'class-transformer';
import { IsBoolean, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

/** Fields a shop owner may edit themselves. Name, code, owner and status stay admin-managed. */
export class UpdateShopProfileDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;

  /** { mon: { open, from: "09:00", to: "18:00" }, ... tue..sun } — validated in ShopProfileService. */
  @IsOptional() @IsObject() openingHours?: Record<string, unknown>;
}

export class NotificationPrefsDto {
  @IsOptional() @IsBoolean() newOrderSound?: boolean;
  @IsOptional() @IsBoolean() desktopAlerts?: boolean;
  @IsOptional() @IsBoolean() failureAlerts?: boolean;
}

export class UpdateShopSettingsDto {
  /** Send confirmed customer orders straight to the printer. Off by default. */
  @IsOptional() @IsBoolean() autoAcceptOrders?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPrefsDto)
  notificationPrefs?: NotificationPrefsDto;

  @IsOptional() @IsUUID() defaultPrinterId?: string;
}
