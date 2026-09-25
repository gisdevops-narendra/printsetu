import { Injectable } from '@nestjs/common';
import { Lead, LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';
import { CreateLeadDto, UpdateLeadDto } from './dto/lead.dto';

const TEXT_FIELDS = [
  'name',
  'contactName',
  'mobile',
  'email',
  'address',
  'city',
  'district',
  'notes',
] as const;
const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '').slice(-10);

/**
 * Business Map leads: shops the admin is trying to bring on board. When a
 * lead's shop registers, the admin marks it JOINED; a registered shop with
 * the same mobile or email is offered as the likely match.
 */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** All leads as GeoJSON. */
  async list() {
    const [leads, shops] = await Promise.all([
      this.prisma.lead.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { shop: { select: { id: true, name: true, shopCode: true } } },
      }),
      this.prisma.shop.findMany({
        select: { id: true, name: true, shopCode: true, mobile: true, email: true },
      }),
    ]);
    return {
      type: 'FeatureCollection' as const,
      features: leads.map((lead) => ({
        type: 'Feature' as const,
        id: lead.id,
        geometry: { type: 'Point' as const, coordinates: [lead.longitude, lead.latitude] },
        properties: {
          ...this.plain(lead),
          shop: lead.shop,
          // A registered shop that looks like this lead (same mobile or email), until it's linked.
          suggestedShop: lead.shop ? null : this.match(lead, shops),
        },
      })),
      meta: {
        counts: Object.fromEntries(
          Object.values(LeadStatus).map((status) => [
            status,
            leads.filter((l) => l.status === status).length,
          ]),
        ),
      },
    };
  }

  async create(dto: CreateLeadDto, actorUserId: string) {
    const status = dto.status ?? LeadStatus.CONTACTED;
    const shopId = status === LeadStatus.JOINED ? await this.existingShopId(dto.shopId) : null;
    const lead = await this.prisma.lead.create({
      data: {
        ...this.cleanText(dto),
        name: dto.name.trim(),
        status,
        shopId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        createdById: actorUserId,
      },
    });
    await this.log(actorUserId, 'LEAD_ADDED', lead, { name: lead.name });
    return this.plain(lead);
  }

  async update(id: string, dto: UpdateLeadDto, actorUserId: string) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new AppNotFoundException('This lead no longer exists.');
    const data: Prisma.LeadUncheckedUpdateInput = { ...this.cleanText(dto) };
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.shopId !== undefined) data.shopId = await this.existingShopId(dto.shopId);
    // A lead that is no longer "Joined" isn't linked to a shop.
    if ((dto.status ?? existing.status) !== LeadStatus.JOINED) data.shopId = null;

    const lead = await this.prisma.lead.update({ where: { id }, data });
    await this.log(actorUserId, 'LEAD_UPDATED', lead, {
      name: lead.name,
      ...(dto.status && dto.status !== existing.status
        ? { from: existing.status, to: dto.status }
        : {}),
    });
    return this.plain(lead);
  }

  async remove(id: string, actorUserId: string) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new AppNotFoundException('This lead no longer exists.');
    await this.prisma.lead.delete({ where: { id } });
    await this.log(actorUserId, 'LEAD_DELETED', existing, { name: existing.name });
    return { deleted: true };
  }

  private async existingShopId(shopId: string | null | undefined): Promise<string | null> {
    if (!shopId) return null;
    if (!(await this.prisma.shop.findUnique({ where: { id: shopId } }))) {
      throw new AppNotFoundException('That shop no longer exists.');
    }
    return shopId;
  }

  private match(
    lead: Lead,
    shops: { id: string; name: string; shopCode: string; mobile: string; email: string }[],
  ) {
    const mobile = digits(lead.mobile);
    const email = lead.email?.trim().toLowerCase();
    const found = shops.find(
      (s) =>
        (mobile.length === 10 && digits(s.mobile) === mobile) ||
        (!!email && s.email.toLowerCase() === email),
    );
    return found ? { id: found.id, name: found.name, shopCode: found.shopCode } : null;
  }

  /** Trims the optional text fields that were sent; blank becomes null. */
  private cleanText(dto: Partial<Record<(typeof TEXT_FIELDS)[number], string | undefined>>) {
    const data: Record<string, string | null> = {};
    for (const field of TEXT_FIELDS) {
      if (field === 'name' || dto[field] === undefined) continue;
      data[field] = dto[field]!.trim() || null;
    }
    return data;
  }

  private plain(lead: Lead) {
    return {
      id: lead.id,
      name: lead.name,
      contactName: lead.contactName,
      mobile: lead.mobile,
      email: lead.email,
      address: lead.address,
      city: lead.city,
      district: lead.district,
      notes: lead.notes,
      status: lead.status,
      shopId: lead.shopId,
      latitude: lead.latitude,
      longitude: lead.longitude,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    };
  }

  private log(actorUserId: string, action: string, lead: Lead, metadata: Record<string, unknown>) {
    return this.audit.log({ actorUserId, action, entityType: 'Lead', entityId: lead.id, metadata });
  }
}
