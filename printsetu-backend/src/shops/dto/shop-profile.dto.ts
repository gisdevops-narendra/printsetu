import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

/** Fields a shop owner may edit themselves. Name, code, owner and status stay admin-managed. */
export class UpdateShopProfileDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;

  /** Map position: send both (set) or both null (remove); leave out to keep. */
  @IsOptional() @IsNumber() latitude?: number | null;
  @IsOptional() @IsNumber() longitude?: number | null;
  /** null or "" removes it. */
  @IsOptional() @IsString() @MaxLength(80) district?: string | null;

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

  /** Show rates and amounts to customers while they upload. Off by default. */
  @IsOptional() @IsBoolean() pricingEnabled?: boolean;

  /**
   * The shop's Online / Offline switch: false pauses new customer orders.
   * While autoSchedule is on, this sets a temporary override instead
   * (until flipped back or the next scheduled open/close).
   */
  @IsOptional() @IsBoolean() acceptingOrders?: boolean;

  /** Go Online / Offline automatically on the shop's opening hours. Off by default. */
  @IsOptional() @IsBoolean() autoSchedule?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPrefsDto)
  notificationPrefs?: NotificationPrefsDto;

  @IsOptional() @IsUUID() defaultPrinterId?: string;
}
