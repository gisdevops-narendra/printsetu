import { Injectable } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';
import { CreateShopDto, UpdateShopDto } from './dto/shop.dto';
import { cleanDistrict, resolveLocation } from './shop-location';
import { Prisma, ShopStatus } from '@prisma/client';

const shopCodeAlphabet = customAlphabet('0123456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `tx` lets shop registration create the shop and its owner's user atomically. */
  async create(dto: CreateShopDto, tx: Prisma.TransactionClient = this.prisma) {
    const shop = await tx.shop.create({
      data: {
        shopCode: `SHOP-${shopCodeAlphabet()}`,
        name: dto.name,
        ownerName: dto.ownerName,
        mobile: dto.mobile,
        email: dto.email,
        address: dto.address,
        city: dto.city,
        district: cleanDistrict(dto.district),
        ...resolveLocation(dto.latitude, dto.longitude),
        status: ShopStatus.ACTIVE,
        printSettings: { create: {} },
      },
      include: { printSettings: true },
    });
    return shop;
  }

  async list(page = 1, pageSize = 50) {
    const take = Math.min(pageSize, 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await Promise.all([
      this.prisma.shop.findMany({ orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.shop.count(),
    ]);
    return { items, total, page, pageSize: take };
  }

  async findByIdOrThrow(id: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new AppNotFoundException('Shop not found.');
    return shop;
  }

  async update(id: string, dto: UpdateShopDto) {
    await this.findByIdOrThrow(id);
    return this.prisma.shop.update({ where: { id }, data: dto });
  }

  async setStatus(id: string, status: ShopStatus) {
    await this.findByIdOrThrow(id);
    return this.prisma.shop.update({ where: { id }, data: { status } });
  }
}
