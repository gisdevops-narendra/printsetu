import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BillingCycle, PaymentMethod } from '@prisma/client';
import { BILLING_CHANNELS } from '../subscription.constants';

// ---------------------------------------------------------------- plans

export class UpsertPlanDto {
  @IsString() @Length(2, 60) name!: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000) dailyPrice!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) monthlyPrice!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) yearlyPrice!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) trialDays?: number;

  /** null / omitted = unlimited. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxPrintsPerMonth?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxTokensPerDay?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxPrinters?: number | null;

  @IsOptional() @IsBoolean() prioritySupport?: boolean;
  @IsOptional() @IsBoolean() analyticsAccess?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) highlights?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

// ------------------------------------------------- manual admin actions
// Every manual action needs a reason: it is written to the audit trail.

export class ReasonDto {
  @IsString() @Length(3, 300) reason!: string;
}

export class AssignPlanDto {
  @IsUUID() planId!: string;
  @IsEnum(BillingCycle) cycle!: BillingCycle;
  /** Start with the plan's free trial (when it has one). */
  @IsOptional() @IsBoolean() startTrial?: boolean;
  /** The first invoice was paid offline already. */
  @IsOptional() @IsBoolean() markPaid?: boolean;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(120) paymentReference?: string;
  @IsOptional() @IsBoolean() autoRenew?: boolean;
  @IsString() @Length(3, 300) reason!: string;
}

export class ChangePlanDto {
  @IsUUID() planId!: string;
  @IsOptional() @IsEnum(BillingCycle) cycle?: BillingCycle;
  /** Override the platform rule: apply the change right now. */
  @IsOptional() @IsBoolean() applyNow?: boolean;
  @IsString() @Length(3, 300) reason!: string;
}

export class ExtendDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(366) days!: number;
  @IsString() @Length(3, 300) reason!: string;
}

export class CancelDto {
  @IsIn(['IMMEDIATE', 'PERIOD_END']) mode!: 'IMMEDIATE' | 'PERIOD_END';
  @IsString() @Length(3, 300) reason!: string;
}

export class MarkPaidDto {
  /** Defaults to the shop's oldest unpaid invoice. */
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsString() @Length(3, 300) reason!: string;
}

export class ForceOverrideDto {
  /** Days the override holds before automation takes over again. Omit to hold until released. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
  @IsString() @Length(3, 300) reason!: string;
}

export class RefundDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsString() @Length(3, 300) reason!: string;
}

export class SubscriptionPreferencesDto {
  @IsOptional() @IsBoolean() autoRenew?: boolean;
  /** null resets the shop to the platform default channels. */
  @IsOptional() @IsArray() @IsIn(BILLING_CHANNELS, { each: true }) channels?: string[] | null;
}

export class ShopCancelDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

// ------------------------------------------------------------ settings

export class UpdateBillingSettingsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) graceDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(90) suspendAfterPastDueDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10) retryAttempts?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(14) retryIntervalDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(30) renewalReminderDays?: number;
  @IsOptional() @IsArray() @IsIn(BILLING_CHANNELS, { each: true }) defaultChannels?: string[];
  @IsOptional() @IsIn(['IMMEDIATE_PRORATED', 'NEXT_CYCLE']) upgradeTiming?: string;
  @IsOptional() @IsIn(['END_OF_CYCLE', 'IMMEDIATE']) downgradeTiming?: string;
}
