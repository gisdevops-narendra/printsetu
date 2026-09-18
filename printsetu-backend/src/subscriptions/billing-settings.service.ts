import { Injectable } from '@nestjs/common';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import {
  BILLING_SETTINGS_KEY,
  BillingChannel,
  BillingSettings,
  DEFAULT_BILLING_SETTINGS,
  DowngradeTiming,
  UpgradeTiming,
} from './subscription.constants';
import { UpdateBillingSettingsDto } from './dto/subscription.dto';

@Injectable()
export class BillingSettingsService {
  constructor(private readonly systemSettings: SystemSettingsService) {}

  async get(): Promise<BillingSettings> {
    const stored = await this.systemSettings.get<Partial<BillingSettings>>(BILLING_SETTINGS_KEY);
    return { ...DEFAULT_BILLING_SETTINGS, ...(stored ?? {}) };
  }

  async update(dto: UpdateBillingSettingsDto): Promise<BillingSettings> {
    const current = await this.get();
    const next: BillingSettings = { ...current };
    if (dto.graceDays !== undefined) next.graceDays = dto.graceDays;
    if (dto.suspendAfterPastDueDays !== undefined) next.suspendAfterPastDueDays = dto.suspendAfterPastDueDays;
    if (dto.retryAttempts !== undefined) next.retryAttempts = dto.retryAttempts;
    if (dto.retryIntervalDays !== undefined) next.retryIntervalDays = dto.retryIntervalDays;
    if (dto.renewalReminderDays !== undefined) next.renewalReminderDays = dto.renewalReminderDays;
    if (dto.defaultChannels !== undefined) {
      // In-app is always on: it is the one channel that is guaranteed to reach the shop.
      next.defaultChannels = Array.from(new Set(['IN_APP', ...dto.defaultChannels])) as BillingChannel[];
    }
    if (dto.upgradeTiming) next.upgradeTiming = dto.upgradeTiming as UpgradeTiming;
    if (dto.downgradeTiming) next.downgradeTiming = dto.downgradeTiming as DowngradeTiming;
    await this.systemSettings.set(BILLING_SETTINGS_KEY, next);
    return next;
  }
}
