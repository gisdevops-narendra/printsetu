import { PrismaClient, RoleName, ColorMode, PaperSize, SideMode } from '@prisma/client';

const prisma = new PrismaClient();

// Fixed to match keycloak/printsetu-realm.json's pre-provisioned demo users,
// so a fresh docker-compose + migrate + seed run logs straight in.
const ADMIN_KEYCLOAK_ID = '11111111-1111-1111-1111-111111111111';
const SHOPKEEPER_KEYCLOAK_ID = '22222222-2222-2222-2222-222222222222';
const DEMO_SHOP_ID = '33333333-3333-3333-3333-333333333333';

async function main() {
  console.log('Seeding PrintSetu demo data...');

  const [adminRole, shopkeeperRole] = await Promise.all([
    prisma.role.upsert({
      where: { name: RoleName.ADMIN },
      update: {},
      create: { name: RoleName.ADMIN, description: 'Platform administrator' },
    }),
    prisma.role.upsert({
      where: { name: RoleName.SHOPKEEPER },
      update: {},
      create: { name: RoleName.SHOPKEEPER, description: 'Shop-level operator' },
    }),
  ]);

  const shop = await prisma.shop.upsert({
    where: { id: DEMO_SHOP_ID },
    update: {},
    create: {
      id: DEMO_SHOP_ID,
      shopCode: 'SHOP-DEMO001',
      name: 'PrintSetu Demo Shop',
      ownerName: 'Demo Owner',
      mobile: '9999999999',
      email: 'demo.shop@printsetu.local',
      address: '1st Floor, MG Road',
      city: 'Ahmedabad',
      status: 'ACTIVE',
    },
  });

  await prisma.printSettings.upsert({
    where: { shopId: shop.id },
    update: {},
    create: { shopId: shop.id, retentionMinutes: 30, maxFileSizeBytes: 26214400 },
  });

  await prisma.user.upsert({
    where: { email: 'admin.demo@printsetu.local' },
    update: { keycloakUserId: ADMIN_KEYCLOAK_ID },
    create: {
      email: 'admin.demo@printsetu.local',
      name: 'PrintSetu Admin',
      mobile: '9000000001',
      roleId: adminRole.id,
      shopId: null,
      keycloakUserId: ADMIN_KEYCLOAK_ID,
      status: 'ACTIVE',
    },
  });

  await prisma.user.upsert({
    where: { email: 'shopkeeper.demo@printsetu.local' },
    update: { keycloakUserId: SHOPKEEPER_KEYCLOAK_ID, shopId: shop.id },
    create: {
      email: 'shopkeeper.demo@printsetu.local',
      name: 'PrintSetu Shopkeeper',
      mobile: '9000000002',
      roleId: shopkeeperRole.id,
      shopId: shop.id,
      keycloakUserId: SHOPKEEPER_KEYCLOAK_ID,
      status: 'ACTIVE',
    },
  });

  const rates: Array<{ paperSize: PaperSize; colorMode: ColorMode; sideMode: SideMode; pricePerPage: number }> = [
    { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', pricePerPage: 2.0 },
    { paperSize: 'A4', colorMode: 'BW', sideMode: 'DUPLEX', pricePerPage: 1.5 },
    { paperSize: 'A4', colorMode: 'COLOR', sideMode: 'SIMPLEX', pricePerPage: 8.0 },
    { paperSize: 'A4', colorMode: 'COLOR', sideMode: 'DUPLEX', pricePerPage: 7.0 },
    { paperSize: 'A3', colorMode: 'BW', sideMode: 'SIMPLEX', pricePerPage: 4.0 },
    { paperSize: 'A3', colorMode: 'COLOR', sideMode: 'SIMPLEX', pricePerPage: 14.0 },
    { paperSize: 'LEGAL', colorMode: 'BW', sideMode: 'SIMPLEX', pricePerPage: 3.0 },
    { paperSize: 'LETTER', colorMode: 'BW', sideMode: 'SIMPLEX', pricePerPage: 2.0 },
  ];

  for (const rate of rates) {
    const existing = await prisma.pricing.findFirst({
      where: {
        shopId: shop.id,
        paperSize: rate.paperSize,
        colorMode: rate.colorMode,
        sideMode: rate.sideMode,
        active: true,
      },
    });
    if (!existing) {
      await prisma.pricing.create({ data: { shopId: shop.id, ...rate, active: true } });
    }
  }

  const existingQr = await prisma.qrCode.findFirst({ where: { shopId: shop.id, status: 'ACTIVE' } });
  if (!existingQr) {
    await prisma.qrCode.create({
      data: {
        shopId: shop.id,
        publicCode: 'demoShopQR001',
        targetPath: '/s/demoShopQR001',
        status: 'ACTIVE',
      },
    });
  }

  console.log('Seed complete:');
  console.log(`  Shop:       ${shop.name} (${shop.shopCode})`);
  console.log('  Admin:      admin.demo@printsetu.local / Admin@12345 (Keycloak)');
  console.log('  Shopkeeper: shopkeeper.demo@printsetu.local / Shop@12345 (Keycloak)');
  console.log('  QR public code: demoShopQR001 -> /s/demoShopQR001');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
