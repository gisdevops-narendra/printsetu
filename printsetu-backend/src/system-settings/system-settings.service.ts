import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SRS §6 Admin Module "System settings" / §16 system_settings table
 * ("Global settings; restrict admin access" — enforced by @Roles('ADMIN')
 * on AdminSystemSettingsController, not by this service). A generic
 * key/JSON-value store for platform-wide operational knobs that should be
 * admin-tunable at runtime without a redeploy.
 */
@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row ? (row.valueJson as T) : null;
  }

  /** Falls back to `defaultValue` (e.g. an env-sourced default) when no admin override exists yet. */
  async getOrDefault<T>(key: string, defaultValue: T): Promise<T> {
    const value = await this.get<T>(key);
    return value ?? defaultValue;
  }

  async set(key: string, value: unknown) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      update: { valueJson: value as Prisma.InputJsonValue },
      create: { key, valueJson: value as Prisma.InputJsonValue },
    });
  }
}
