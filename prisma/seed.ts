import { hash } from "bcryptjs";
import {
  CalculationMethod,
  PermissionKey,
  Prisma,
  PrismaClient,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

const thicknessSeeds = [
  { code: "0.5", millimeters: 0.5, label: "0,5 мм", metalCost: 350, sortOrder: 10 },
  { code: "0.7", millimeters: 0.7, label: "0,7 мм", metalCost: 450, sortOrder: 20 },
  { code: "0.9", millimeters: 0.9, label: "0,9 мм", metalCost: 550, sortOrder: 30 },
] as const;

const productSeeds = [
  {
    code: "duct",
    name: "Воздуховод",
    category: "Воздуховоды",
    imagePath: "/products/duct.png",
    defaultDimensions: { width: 400, height: 250, length: 1500, rail: "20/20" },
    calculationMethod: CalculationMethod.RECTANGULAR_DUCT,
    sortOrder: 10,
    tiers: [{ key: "default", gross: [742.61, 870.76, 1097.69] }],
  },
  {
    code: "elbow",
    name: "Отвод",
    category: "Фасонные изделия",
    imagePath: "/products/elbow.png",
    defaultDimensions: { width: 400, height: 250, radius: 100, angle: 90, rail: "20/20" },
    calculationMethod: CalculationMethod.RECTANGULAR_ELBOW,
    sortOrder: 20,
    tiers: [
      { key: "up-to-1200", max: 1200, gross: [1691.07, 2058.96, 2488.13] },
      { key: "1200-to-3200", min: 1200, max: 3200, gross: [1616.72, 1296.41, 2397.79] },
      { key: "over-3200", min: 3200, gross: [2112.18, 1733.81, 2971.82] },
    ],
  },
  {
    code: "transition",
    name: "Переход прямоугольный → прямоугольный",
    category: "Фасонные изделия",
    imagePath: "/products/transition.png",
    defaultDimensions: { width: 400, height: 250, width2: 300, height2: 200, length: 1000, rail: "20/20" },
    calculationMethod: CalculationMethod.RECTANGULAR_TRANSITION,
    sortOrder: 30,
    tiers: [
      { key: "up-to-1200", max: 1200, gross: [2171.81, 1965.85, 2109.61] },
      { key: "1200-to-3200", min: 1200, max: 3200, gross: [1770.34, 1801.26, 1988.32] },
      { key: "over-3200", min: 3200, gross: [3116.02, 2611.73, 2734.72] },
    ],
  },
  {
    code: "transitionRound",
    name: "Переход прямоугольный → круглый",
    category: "Фасонные изделия",
    imagePath: "/products/transition.png",
    defaultDimensions: { width: 400, height: 250, diameter: 300, length: 1000, rail: "20/20" },
    calculationMethod: CalculationMethod.RECTANGULAR_TO_ROUND_TRANSITION,
    sortOrder: 35,
    tiers: [
      { key: "up-to-1200", max: 1200, gross: [2171.81, 1965.85, 2109.61] },
      { key: "1200-to-3200", min: 1200, max: 3200, gross: [1770.34, 1801.26, 1988.32] },
      { key: "over-3200", min: 3200, gross: [3116.02, 2611.73, 2734.72] },
    ],
  },
  {
    code: "damperRound",
    name: "Дроссель-заслонка круглая",
    category: "Регулирующие изделия",
    imagePath: "/products/damper-round.png",
    defaultDimensions: { width: 250, length: 300 },
    calculationMethod: CalculationMethod.ROUND_DAMPER,
    sortOrder: 40,
    tiers: [{ key: "default", gross: [4120, 2450, 4340] }],
  },
  {
    code: "damperRect",
    name: "Дроссель-заслонка прямоугольная",
    category: "Регулирующие изделия",
    imagePath: "/products/damper-rect.png",
    defaultDimensions: { width: 400, height: 250, length: 300 },
    calculationMethod: CalculationMethod.RECTANGULAR_DAMPER,
    sortOrder: 50,
    tiers: [{ key: "default", gross: [3430, 2600, 2390] }],
  },
] as const;

const coefficientSeeds = [
  { key: "manufacturing", name: "Коэффициент изготовления", sortOrder: 10 },
  { key: "complexity", name: "Коэффициент сложности", sortOrder: 20 },
  { key: "waste", name: "Коэффициент отходов", sortOrder: 30 },
  { key: "urgency", name: "Коэффициент срочности", sortOrder: 40 },
  { key: "delivery", name: "Коэффициент доставки", sortOrder: 50 },
  { key: "seasonal", name: "Коэффициент сезонной наценки", sortOrder: 60 },
] as const;

async function seed() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME?.trim();
  if (!adminEmail || !adminPassword || !adminName) {
    throw new Error("Для seed задайте ADMIN_EMAIL, ADMIN_PASSWORD и ADMIN_NAME");
  }
  if (adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD должен содержать не менее 12 символов");
  }

  const thicknesses = [];
  for (const item of thicknessSeeds) {
    const thickness = await prisma.thickness.upsert({
      where: { code: item.code },
      update: {},
      create: {
        code: item.code,
        millimeters: item.millimeters,
        label: item.label,
        sortOrder: item.sortOrder,
        metalPrice: { create: { costPerSquareMeter: item.metalCost } },
      },
      include: { metalPrice: true },
    });
    thicknesses.push(thickness);
  }

  for (const productSeed of productSeeds) {
    const product = await prisma.productType.upsert({
      where: { code: productSeed.code },
      update: {
        name: productSeed.name,
        category: productSeed.category,
        imagePath: productSeed.imagePath,
        defaultDimensions: productSeed.defaultDimensions,
        calculationMethod: productSeed.calculationMethod,
        sortOrder: productSeed.sortOrder,
        active: true,
      },
      create: {
        code: productSeed.code,
        name: productSeed.name,
        category: productSeed.category,
        imagePath: productSeed.imagePath,
        defaultDimensions: productSeed.defaultDimensions,
        calculationMethod: productSeed.calculationMethod,
        sortOrder: productSeed.sortOrder,
      },
    });

    for (const tier of productSeed.tiers) {
      for (const [index, thickness] of thicknesses.entries()) {
        const targetNet = new Prisma.Decimal(tier.gross[index]).div(1.22);
        const materialCost = thickness.metalPrice?.costPerSquareMeter ?? new Prisma.Decimal(0);
        await prisma.productRate.upsert({
          where: {
            productTypeId_thicknessId_tierKey: {
              productTypeId: product.id,
              thicknessId: thickness.id,
              tierKey: tier.key,
            },
          },
          update: {},
          create: {
            productTypeId: product.id,
            thicknessId: thickness.id,
            tierKey: tier.key,
            minBoundary: "min" in tier ? tier.min : null,
            maxBoundary: "max" in tier ? tier.max : null,
            materialMultiplier: 1,
            laborCost: targetNet.minus(materialCost).greaterThan(0) ? targetNet.minus(materialCost) : 0,
          },
        });
      }
    }
  }

  await prisma.productType.updateMany({
    where: { code: "custom" },
    data: { active: false },
  });

  for (const coefficient of coefficientSeeds) {
    await prisma.coefficient.upsert({
      where: { key: coefficient.key },
      update: {},
      create: { ...coefficient, value: 1, enabled: true },
    });
  }

  await prisma.taxSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", enabled: true, rate: 22 },
  });
  await prisma.companyProfile.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", name: "СБС", legalName: 'ООО "ФЮСИС-В"', website: "sbs-schet.ru" },
  });
  await prisma.invoiceNumberSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", pattern: "{NUMBER:6}", nextValue: 1 },
  });

  const passwordHash = await hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: adminName, active: true, role: UserRole.ADMIN },
    create: { email: adminEmail, name: adminName, passwordHash, role: UserRole.ADMIN },
  });
  await prisma.userPermission.deleteMany({ where: { userId: admin.id } });
  await prisma.userPermission.createMany({
    data: Object.values(PermissionKey).map((permission) => ({ userId: admin.id, permission, allowed: true })),
    skipDuplicates: true,
  });

  console.log("Database seed completed");
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
