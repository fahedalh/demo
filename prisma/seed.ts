/**
 * Demo data: accounts for every role, vehicle categories with pricing, a service area,
 * coupons, ~60 days of realistic ride history with payments/earnings/ratings, tickets and
 * notifications. Re-running wipes and recreates everything (refuses in production).
 *
 *   pnpm db:seed
 */
import { PrismaClient, type PaymentType } from '@prisma/client';
import argon2 from 'argon2';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { calculateFare, haversine, splitEarnings, type PricingRule } from '../packages/shared/src/index';
import { DUBAI_PLACES } from '../apps/api/src/services/geo/places-dubai';

if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') {
  console.error('Refusing to seed a production database (set SEED_FORCE=true to override).');
  process.exit(1);
}

const prisma = new PrismaClient();
const hash = (p: string) =>
  argon2.hash(p, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

// Deterministic PRNG so every seed produces the same demo story.
let s = 42;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (prefix: string) =>
  `${prefix}-${Array.from({ length: 6 }, () => ALPHA[Math.floor(rnd() * ALPHA.length)]).join('')}`;
const receipt = (d: Date) =>
  `RC-${d.toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`;

// 1×1 PNG used as placeholder document scans.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const STORAGE = path.resolve('apps/api', process.env.STORAGE_DIR ?? './storage');

async function wipe() {
  const tables = await prisma.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

const CATEGORIES = [
  {
    code: 'ECONOMY',
    name: 'Economy',
    nameAr: 'اقتصادي',
    description: 'Affordable everyday rides',
    descriptionAr: 'رحلات يومية بأسعار مناسبة',
    capacity: 4,
    icon: 'car',
    sortOrder: 1,
    price: [500, 180, 35, 1200, 100, 1000],
  },
  {
    code: 'COMFORT',
    name: 'Comfort',
    nameAr: 'مريح',
    description: 'Newer cars with extra legroom',
    descriptionAr: 'سيارات أحدث بمساحة أرحب',
    capacity: 4,
    icon: 'car-front',
    sortOrder: 2,
    price: [700, 230, 45, 1600, 100, 1200],
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    nameAr: 'فاخر',
    description: 'High-end cars, top-rated drivers',
    descriptionAr: 'سيارات فاخرة وسائقون بأعلى تقييم',
    capacity: 4,
    icon: 'gem',
    sortOrder: 3,
    price: [1200, 380, 70, 3000, 150, 2000],
  },
  {
    code: 'XL',
    name: 'XL',
    nameAr: 'عائلي XL',
    description: 'SUVs and vans for up to 6',
    descriptionAr: 'سيارات دفع رباعي وفان حتى 6 ركاب',
    capacity: 6,
    icon: 'bus',
    sortOrder: 4,
    price: [900, 280, 50, 2000, 100, 1500],
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    nameAr: 'رجال الأعمال',
    description: 'Executive sedans with pro chauffeurs',
    descriptionAr: 'سيارات تنفيذية مع سائقين محترفين',
    capacity: 3,
    icon: 'briefcase',
    sortOrder: 5,
    price: [1500, 450, 80, 3500, 150, 2500],
  },
  {
    code: 'ELECTRIC',
    name: 'Electric',
    nameAr: 'كهربائي',
    description: 'Zero-emission rides',
    descriptionAr: 'رحلات صديقة للبيئة بلا انبعاثات',
    capacity: 4,
    icon: 'zap',
    sortOrder: 6,
    price: [600, 200, 40, 1400, 100, 1000],
  },
];

const DRIVERS = [
  {
    first: 'Omar',
    last: 'Haddad',
    firstAr: 'عمر',
    email: 'driver@masar.demo',
    phone: '+971500000101',
    cat: 'ECONOMY',
    car: ['Toyota', 'Camry', 2023, 'White', 'DXB A 41872'],
    at: [25.2003, 55.2742],
  },
  {
    first: 'Ahmed',
    last: 'Karim',
    email: 'ahmed.k@masar.demo',
    phone: '+971500000102',
    cat: 'ECONOMY',
    car: ['Nissan', 'Altima', 2022, 'Silver', 'DXB B 20931'],
    at: [25.2101, 55.2817],
  },
  {
    first: 'Priya',
    last: 'Nair',
    email: 'priya.n@masar.demo',
    phone: '+971500000103',
    cat: 'COMFORT',
    car: ['Honda', 'Accord', 2024, 'Grey', 'DXB C 77120'],
    at: [25.1912, 55.2655],
  },
  {
    first: 'Yousef',
    last: 'Al Mansoori',
    email: 'yousef.m@masar.demo',
    phone: '+971500000104',
    cat: 'PREMIUM',
    car: ['Mercedes-Benz', 'E-Class', 2024, 'Black', 'DXB P 10500'],
    at: [25.2049, 55.261],
  },
  {
    first: 'Carlos',
    last: 'Mendes',
    email: 'carlos.m@masar.demo',
    phone: '+971500000105',
    cat: 'XL',
    car: ['Toyota', 'Highlander', 2023, 'Blue', 'DXB X 88012'],
    at: [25.2182, 55.284],
  },
  {
    first: 'Fatima',
    last: 'Zahra',
    email: 'fatima.z@masar.demo',
    phone: '+971500000106',
    cat: 'BUSINESS',
    car: ['BMW', '7 Series', 2024, 'Black', 'DXB E 7007'],
    at: [25.213, 55.2795],
  },
  {
    first: 'Li',
    last: 'Wei',
    email: 'li.w@masar.demo',
    phone: '+971500000107',
    cat: 'ELECTRIC',
    car: ['Tesla', 'Model 3', 2024, 'Red', 'DXB T 31415'],
    at: [25.1985, 55.27],
  },
  {
    first: 'Rashid',
    last: 'Saleh',
    email: 'rashid.s@masar.demo',
    phone: '+971500000108',
    cat: 'ECONOMY',
    car: ['Hyundai', 'Sonata', 2022, 'White', 'DXB K 52210'],
    at: [25.079, 55.142],
  },
  {
    first: 'Grace',
    last: 'Okafor',
    email: 'grace.o@masar.demo',
    phone: '+971500000109',
    cat: 'COMFORT',
    car: ['Kia', 'K5', 2024, 'Grey', 'DXB M 64120'],
    at: [25.118, 55.2],
  },
];

const PASSENGERS = [
  ['Sara', 'Al Hashimi', 'passenger@masar.demo', '+971500000001'],
  ['James', 'Carter', 'james.c@masar.demo', '+971500000002'],
  ['Layla', 'Nasser', 'layla.n@masar.demo', '+971500000003'],
  ['Mohammed', 'Faris', 'mohammed.f@masar.demo', '+971500000004'],
  ['Anna', 'Kowalski', 'anna.k@masar.demo', '+971500000005'],
  ['Hassan', 'Ali', 'hassan.a@masar.demo', '+971500000006'],
  ['Noura', 'Saeed', 'noura.s@masar.demo', '+971500000007'],
  ['Daniel', 'Smith', 'daniel.s@masar.demo', '+971500000008'],
  ['Mariam', 'Khalil', 'mariam.k@masar.demo', '+971500000009'],
  ['Arjun', 'Patel', 'arjun.p@masar.demo', '+971500000010'],
  ['Huda', 'Rahman', 'huda.r@masar.demo', '+971500000011'],
  ['Tom', 'Becker', 'tom.b@masar.demo', '+971500000012'],
];

async function main() {
  console.log('🌱 Seeding Masar demo data…');
  await wipe();

  // ── Platform settings, area, categories, pricing ──
  await prisma.systemSetting.create({
    data: {
      key: 'platform',
      value: {
        dispatchRadiusKm: 10,
        offerTimeoutSeconds: 20,
        maxDispatchAttempts: 5,
        freeCancellationSeconds: 120,
        supportPhone: '+971800627271',
        supportEmail: 'support@masar.example',
        maintenanceMode: false,
      },
    },
  });
  const dubai = await prisma.serviceArea.create({
    data: {
      name: 'Dubai',
      nameAr: 'دبي',
      city: 'Dubai',
      country: 'AE',
      currency: 'AED',
      timezone: 'Asia/Dubai',
      centerLat: 25.15,
      centerLng: 55.25,
      radiusKm: 45,
    },
  });
  await prisma.serviceArea.create({
    data: {
      name: 'Abu Dhabi',
      nameAr: 'أبوظبي',
      city: 'Abu Dhabi',
      country: 'AE',
      currency: 'AED',
      timezone: 'Asia/Dubai',
      centerLat: 24.4539,
      centerLng: 54.3773,
      radiusKm: 35,
    },
  });
  // Madinah (Saudi Arabia): centred on Al-Masjid an-Nabawi; covers the city and the airport.
  await prisma.serviceArea.create({
    data: {
      name: 'Madinah',
      nameAr: 'المدينة المنورة',
      city: 'Madinah',
      country: 'SA',
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      centerLat: 24.4672,
      centerLng: 39.6111,
      radiusKm: 30,
    },
  });
  const areas = await prisma.serviceArea.findMany();
  const cats: Record<string, { id: string; rule: PricingRule }> = {};
  for (const c of CATEGORIES) {
    const { price, ...data } = c;
    const cat = await prisma.vehicleCategory.create({ data });
    const [baseFare, perKm, perMinute, minimumFare, bookingFee, cancellationFee] = price;
    for (const a of areas) {
      await prisma.pricingConfiguration.create({
        data: {
          categoryId: cat.id,
          serviceAreaId: a.id,
          baseFare,
          perKm,
          perMinute,
          minimumFare,
          bookingFee,
          cancellationFee,
          commissionRate: c.code === 'BUSINESS' || c.code === 'PREMIUM' ? 0.25 : 0.2,
          surgeMultiplier: c.code === 'ECONOMY' ? 1.8 : 1.5,
          surgeEnabled: c.code === 'ECONOMY',
          currency: a.currency,
        },
      });
    }
    cats[c.code] = {
      id: cat.id,
      rule: {
        baseFare,
        perKm,
        perMinute,
        minimumFare,
        bookingFee,
        cancellationFee,
        commissionRate: c.code === 'BUSINESS' || c.code === 'PREMIUM' ? 0.25 : 0.2,
        surgeMultiplier: 1,
        currency: 'AED',
      },
    };
  }

  // ── Admins ──
  const admin = await prisma.user.create({
    data: {
      email: 'admin@masar.demo',
      phone: '+971500000900',
      firstName: 'Mona',
      lastName: 'Al Qasimi',
      role: 'ADMIN',
      adminRole: 'SUPER_ADMIN',
      passwordHash: await hash('Admin123!'),
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.user.create({
    data: {
      email: 'finance@masar.demo',
      firstName: 'Khalid',
      lastName: 'Ibrahim',
      role: 'ADMIN',
      adminRole: 'FINANCE',
      passwordHash: await hash('Admin123!'),
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.user.create({
    data: {
      email: 'support@masar.demo',
      firstName: 'Reem',
      lastName: 'Tariq',
      role: 'ADMIN',
      adminRole: 'SUPPORT',
      passwordHash: await hash('Admin123!'),
      emailVerifiedAt: new Date(),
    },
  });

  // ── Passengers ──
  const passengerHash = await hash('Passenger123!');
  const passengers = [];
  for (const [i, [first, last, email, phone]] of PASSENGERS.entries()) {
    const u = await prisma.user.create({
      data: {
        email,
        phone,
        firstName: first,
        lastName: last,
        role: 'PASSENGER',
        passwordHash: passengerHash,
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
        locale: i === 2 || i === 6 ? 'ar' : 'en',
        createdAt: new Date(Date.now() - between(5, 120) * 86_400_000),
        passengerProfile: { create: {} },
        wallet: { create: { balance: i === 0 ? 15_000 : Math.round(between(0, 8000)) } },
      },
    });
    passengers.push(u);
  }
  const sara = passengers[0];
  const saraCard = await prisma.paymentMethod.create({
    data: {
      userId: sara.id,
      type: 'CARD',
      provider: 'SANDBOX',
      providerRef: 'sbx_pm_4242_demo0001',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: new Date().getFullYear() + 3,
      isDefault: true,
    },
  });
  await prisma.paymentMethod.create({
    data: {
      userId: sara.id,
      type: 'CARD',
      provider: 'SANDBOX',
      providerRef: 'sbx_pm_4444_demo0002',
      brand: 'mastercard',
      last4: '4444',
      expMonth: 8,
      expYear: new Date().getFullYear() + 2,
    },
  });
  await prisma.walletTransaction.create({
    data: {
      walletId: (await prisma.wallet.findUniqueOrThrow({ where: { userId: sara.id } })).id,
      type: 'TOPUP',
      amount: 15_000,
      balanceAfter: 15_000,
      description: 'Top-up •••• 4242',
    },
  });
  await prisma.savedPlace.createMany({
    data: [
      {
        userId: sara.id,
        label: 'Home',
        type: 'HOME',
        address: 'Dubai Marina Mall, Sheikh Zayed Rd',
        lat: 25.0763,
        lng: 55.1403,
      },
      {
        userId: sara.id,
        label: 'Work',
        type: 'WORK',
        address: 'DIFC Gate Building, Trade Centre',
        lat: 25.2131,
        lng: 55.2826,
      },
      {
        userId: sara.id,
        label: 'Gym',
        type: 'FAVORITE',
        address: 'City Walk, Al Wasl Rd',
        lat: 25.2066,
        lng: 55.2627,
      },
    ],
  });
  await prisma.emergencyContact.create({
    data: { userId: sara.id, name: 'Ali Al Hashimi', phone: '+971501112233', relationship: 'Brother' },
  });

  // ── Drivers ──
  const driverHash = await hash('Driver123!');
  const drivers: { id: string; profileId: string; vehicleId: string; cat: string }[] = [];
  for (const d of DRIVERS) {
    const u = await prisma.user.create({
      data: {
        email: d.email,
        phone: d.phone,
        firstName: d.first,
        lastName: d.last,
        role: 'DRIVER',
        passwordHash: driverHash,
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
        createdAt: new Date(Date.now() - between(60, 200) * 86_400_000),
        wallet: { create: {} },
      },
    });
    const profile = await prisma.driverProfile.create({
      data: {
        userId: u.id,
        licenseNumber: `DL-${Math.floor(between(100000, 999999))}`,
        licenseExpiry: new Date(Date.now() + 700 * 86_400_000),
        dateOfBirth: new Date(1980 + Math.floor(between(0, 18)), 3, 12),
        nationalId: `784-19${Math.floor(between(70, 99))}-${Math.floor(between(1000000, 9999999))}-1`,
        verificationStatus: 'APPROVED',
        submittedAt: new Date(Date.now() - 50 * 86_400_000),
        approvedAt: new Date(Date.now() - 48 * 86_400_000),
        approvedById: admin.id,
        lastLat: d.at[0],
        lastLng: d.at[1],
        lastLocationAt: new Date(),
      },
    });
    const [make, model, year, color, plate] = d.car as [string, string, number, string, string];
    const v = await prisma.vehicle.create({
      data: {
        driverId: profile.id,
        categoryId: cats[d.cat].id,
        make,
        model,
        year,
        color,
        plateNumber: plate,
        seats: d.cat === 'XL' ? 6 : 4,
        isElectric: d.cat === 'ELECTRIC',
        status: 'APPROVED',
      },
    });
    await prisma.driverProfile.update({ where: { id: profile.id }, data: { activeVehicleId: v.id } });
    for (const type of [
      'PROFILE_PHOTO',
      'DRIVING_LICENSE',
      'NATIONAL_ID',
      'VEHICLE_REGISTRATION',
      'INSURANCE',
      'VEHICLE_PHOTO',
    ] as const) {
      const key = `drivers/${profile.id}/${type.toLowerCase()}.png`;
      mkdirSync(path.join(STORAGE, path.dirname(key)), { recursive: true });
      writeFileSync(path.join(STORAGE, key), PNG);
      await prisma.driverDocument.create({
        data: {
          driverId: profile.id,
          vehicleId: type.startsWith('VEHICLE') || type === 'INSURANCE' ? v.id : null,
          type,
          storageKey: key,
          originalName: `${type.toLowerCase()}.png`,
          mimeType: 'image/png',
          sizeBytes: PNG.length,
          status: 'APPROVED',
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      });
    }
    drivers.push({ id: u.id, profileId: profile.id, vehicleId: v.id, cat: d.cat });
  }

  // A driver waiting for verification (shows up in the admin review queue).
  const pendingUser = await prisma.user.create({
    data: {
      email: 'newdriver@masar.demo',
      phone: '+971500000199',
      firstName: 'Bilal',
      lastName: 'Qureshi',
      role: 'DRIVER',
      passwordHash: driverHash,
      wallet: { create: {} },
    },
  });
  const pendingProfile = await prisma.driverProfile.create({
    data: {
      userId: pendingUser.id,
      licenseNumber: 'DL-551203',
      licenseExpiry: new Date(Date.now() + 900 * 86_400_000),
      dateOfBirth: new Date(1992, 6, 1),
      nationalId: '784-1992-5512033-1',
      verificationStatus: 'UNDER_REVIEW',
      submittedAt: new Date(Date.now() - 2 * 3600_000),
    },
  });
  const pv = await prisma.vehicle.create({
    data: {
      driverId: pendingProfile.id,
      categoryId: cats.COMFORT.id,
      make: 'Hyundai',
      model: 'Elantra',
      year: 2024,
      color: 'White',
      plateNumber: 'DXB F 90311',
      seats: 4,
    },
  });
  await prisma.driverProfile.update({ where: { id: pendingProfile.id }, data: { activeVehicleId: pv.id } });
  for (const type of [
    'PROFILE_PHOTO',
    'DRIVING_LICENSE',
    'NATIONAL_ID',
    'VEHICLE_REGISTRATION',
    'INSURANCE',
    'VEHICLE_PHOTO',
  ] as const) {
    const key = `drivers/${pendingProfile.id}/${type.toLowerCase()}.png`;
    mkdirSync(path.join(STORAGE, path.dirname(key)), { recursive: true });
    writeFileSync(path.join(STORAGE, key), PNG);
    await prisma.driverDocument.create({
      data: {
        driverId: pendingProfile.id,
        vehicleId: type.startsWith('VEHICLE') || type === 'INSURANCE' ? pv.id : null,
        type,
        storageKey: key,
        originalName: `${type.toLowerCase()}.png`,
        mimeType: 'image/png',
        sizeBytes: PNG.length,
      },
    });
  }

  // ── Marketing ──
  const promo = await prisma.promotion.create({
    data: {
      title: 'Welcome to Masar',
      titleAr: 'أهلاً بك في مسار',
      description: '20% off your first rides',
      descriptionAr: 'خصم 20% على رحلاتك الأولى',
      endsAt: new Date(Date.now() + 90 * 86_400_000),
    },
  });
  const welcome = await prisma.coupon.create({
    data: {
      code: 'WELCOME20',
      description: '20% off, up to AED 15',
      type: 'PERCENT',
      value: 20,
      maxDiscount: 1500,
      perUserLimit: 3,
      promotionId: promo.id,
    },
  });
  await prisma.coupon.create({
    data: {
      code: 'MASAR10',
      description: 'AED 10 off trips over AED 30',
      type: 'FIXED',
      value: 1000,
      minFare: 3000,
      perUserLimit: 5,
      usageLimit: 1000,
    },
  });
  await prisma.coupon.create({
    data: {
      code: 'SUMMER25',
      description: 'Expired summer promo',
      type: 'PERCENT',
      value: 25,
      maxDiscount: 2000,
      endsAt: new Date(Date.now() - 10 * 86_400_000),
    },
  });

  // ── Ride history (last 60 days) ──
  console.log('   generating ride history…');
  const driverStats = new Map<
    string,
    {
      completed: number;
      cancelled: number;
      ratingSum: number;
      ratingCount: number;
      offers: number;
      accepted: number;
      wallet: number;
    }
  >();
  drivers.forEach((d) =>
    driverStats.set(d.id, {
      completed: 0,
      cancelled: 0,
      ratingSum: 0,
      ratingCount: 0,
      offers: 0,
      accepted: 0,
      wallet: 0,
    }),
  );
  const passengerRides = new Map<string, number>();
  const comments = [
    'Great driver, very polite',
    'Clean car and smooth ride',
    'Arrived quickly',
    'Knew the best route',
    'Friendly and professional',
    null,
    null,
    'Good music, comfortable trip',
  ];
  const commentsAr = ['سائق محترم جداً', 'سيارة نظيفة ورحلة مريحة', 'وصل بسرعة', null];
  const TOTAL = 160;
  for (let i = 0; i < TOTAL; i++) {
    const daysAgo = Math.pow(rnd(), 1.4) * 59.5; // more recent rides are more common
    const when = new Date(Date.now() - daysAgo * 86_400_000);
    when.setHours(Math.floor(between(6, 23)), Math.floor(between(0, 59)));
    if (when.getTime() > Date.now()) when.setTime(Date.now() - 3600_000);
    const passenger = i % 4 === 0 ? sara : pick(passengers);
    const driver = pick(drivers);
    const from = pick(DUBAI_PLACES.filter((p) => p.lat > 24.95));
    let to = pick(DUBAI_PLACES.filter((p) => p.lat > 24.95));
    if (to.id === from.id) to = DUBAI_PLACES[(DUBAI_PLACES.indexOf(from) + 3) % DUBAI_PLACES.length];
    const distance = Math.round(haversine(from, to) * 1.28);
    const duration = Math.round((distance / 1000 / 34) * 3600) + 120;
    const rule = cats[driver.cat].rule;
    const roll = rnd();
    const status =
      roll < 0.82
        ? 'PAYMENT_COMPLETED'
        : roll < 0.93
          ? 'CANCELLED'
          : roll < 0.97
            ? 'NO_DRIVER_AVAILABLE'
            : 'EXPIRED';
    const paymentType: PaymentType = pick(['CARD', 'CARD', 'CASH', 'CASH', 'WALLET']);
    const useCoupon = status === 'PAYMENT_COMPLETED' && rnd() < 0.12;
    const gross = calculateFare(rule, { distanceMeters: distance, durationSeconds: duration });
    const discount = useCoupon ? Math.min(1500, Math.round(gross.total * 0.2)) : 0;
    const fare = calculateFare(rule, { distanceMeters: distance, durationSeconds: duration }, discount);
    const hasDriver = status === 'PAYMENT_COMPLETED' || (status === 'CANCELLED' && rnd() < 0.5);
    const accepted = new Date(when.getTime() + between(20, 90) * 1000);
    const arrived = new Date(accepted.getTime() + between(3, 9) * 60_000);
    const started = new Date(arrived.getTime() + between(1, 4) * 60_000);
    const completed = new Date(started.getTime() + duration * 1000);

    const ride = await prisma.ride.create({
      data: {
        code: code('MS'),
        passengerId: passenger.id,
        driverId: hasDriver ? driver.id : null,
        vehicleId: hasDriver ? driver.vehicleId : null,
        categoryId: cats[driver.cat].id,
        serviceAreaId: dubai.id,
        status,
        pickupAddress: `${from.name}, ${from.address}`,
        pickupLat: from.lat,
        pickupLng: from.lng,
        dropoffAddress: `${to.name}, ${to.address}`,
        dropoffLat: to.lat,
        dropoffLng: to.lng,
        estimatedDistanceM: distance,
        estimatedDurationS: duration,
        estimatedFare: fare.total,
        fareBreakdown: fare as any,
        finalFare: status === 'PAYMENT_COMPLETED' ? fare.total : null,
        discountAmount: fare.discount,
        currency: 'AED',
        commissionRate: rule.commissionRate,
        paymentType,
        paymentMethodId: paymentType === 'CARD' && passenger.id === sara.id ? saraCard.id : null,
        couponId: useCoupon ? welcome.id : null,
        startPin: String(Math.floor(between(1000, 9999))),
        dispatchAttempts: hasDriver ? 1 : 3,
        requestedAt: when,
        createdAt: when,
        acceptedAt: hasDriver ? accepted : null,
        arrivedAt: status === 'PAYMENT_COMPLETED' ? arrived : null,
        startedAt: status === 'PAYMENT_COMPLETED' ? started : null,
        completedAt: status === 'PAYMENT_COMPLETED' ? completed : null,
        cancelledAt: status === 'CANCELLED' ? new Date(when.getTime() + 120_000) : null,
        cancelledByRole: status === 'CANCELLED' ? 'PASSENGER' : null,
        cancelledById: status === 'CANCELLED' ? passenger.id : null,
        cancellationReason:
          status === 'CANCELLED' ? pick(['Changed my plans', 'Driver too far', 'Booked by mistake']) : null,
        actualDistanceM: status === 'PAYMENT_COMPLETED' ? distance : null,
        actualDurationS: status === 'PAYMENT_COMPLETED' ? duration : null,
      },
    });
    const hist: { to: any; at: Date; role: any }[] = [
      { to: 'REQUESTED', at: when, role: 'PASSENGER' },
      { to: 'SEARCHING', at: when, role: 'SYSTEM' },
    ];
    if (hasDriver) hist.push({ to: 'ACCEPTED', at: accepted, role: 'DRIVER' });
    if (status === 'PAYMENT_COMPLETED') {
      hist.push(
        { to: 'DRIVER_ARRIVING', at: accepted, role: 'SYSTEM' },
        { to: 'ARRIVED', at: arrived, role: 'DRIVER' },
        { to: 'IN_PROGRESS', at: started, role: 'DRIVER' },
        { to: 'COMPLETED', at: completed, role: 'DRIVER' },
        { to: 'PAYMENT_COMPLETED', at: completed, role: 'SYSTEM' },
      );
    } else
      hist.push({
        to: status,
        at: new Date(when.getTime() + 120_000),
        role: status === 'CANCELLED' ? 'PASSENGER' : 'SYSTEM',
      });
    let prev: any = null;
    for (const h of hist) {
      await prisma.rideStatusHistory.create({
        data: { rideId: ride.id, fromStatus: prev, toStatus: h.to, actorRole: h.role, createdAt: h.at },
      });
      prev = h.to;
    }
    const stats = driverStats.get(driver.id)!;
    if (hasDriver) {
      stats.offers++;
      stats.accepted++;
      await prisma.rideOffer.create({
        data: {
          rideId: ride.id,
          driverId: driver.id,
          status: 'ACCEPTED',
          distanceM: Math.round(between(400, 3500)),
          offeredAt: when,
          expiresAt: new Date(when.getTime() + 20_000),
          respondedAt: accepted,
        },
      });
    }
    if (rnd() < 0.15) {
      const other = pick(drivers);
      driverStats.get(other.id)!.offers++;
      await prisma.rideOffer.create({
        data: {
          rideId: ride.id,
          driverId: other.id,
          status: pick(['REJECTED', 'EXPIRED']),
          distanceM: Math.round(between(800, 5000)),
          offeredAt: when,
          expiresAt: new Date(when.getTime() + 20_000),
          respondedAt: new Date(when.getTime() + 20_000),
        },
      });
    }
    if (status === 'CANCELLED' && hasDriver && rnd() < 0.3) stats.cancelled++;

    if (status === 'PAYMENT_COMPLETED') {
      const split = splitEarnings(fare.subtotal, rule.commissionRate);
      const tip = rnd() < 0.18 && paymentType !== 'CASH' ? pick([500, 1000, 1500]) : 0;
      await prisma.driverEarning.create({
        data: {
          driverId: driver.id,
          rideId: ride.id,
          grossFare: split.gross,
          commission: split.commission,
          netEarning: split.net,
          tip,
          paymentType,
          createdAt: completed,
        },
      });
      stats.wallet += paymentType === 'CASH' ? fare.discount - split.commission : split.net + tip;
      if (tip) await prisma.ride.update({ where: { id: ride.id }, data: { tipAmount: tip } });
      await prisma.payment.create({
        data: {
          rideId: ride.id,
          userId: passenger.id,
          amount: fare.total,
          currency: 'AED',
          purpose: 'RIDE',
          type: paymentType,
          provider: paymentType === 'CASH' ? 'CASH' : paymentType === 'WALLET' ? 'WALLET' : 'SANDBOX',
          providerRef: paymentType === 'CARD' ? `sbx_pi_seed${i}` : null,
          paymentMethodId: paymentType === 'CARD' && passenger.id === sara.id ? saraCard.id : null,
          status: 'SUCCEEDED',
          paidAt: completed,
          createdAt: completed,
          receiptNumber: receipt(completed),
        },
      });
      if (useCoupon)
        await prisma.couponRedemption.create({
          data: {
            couponId: welcome.id,
            userId: passenger.id,
            rideId: ride.id,
            discount: fare.discount,
            createdAt: completed,
          },
        });
      stats.completed++;
      passengerRides.set(passenger.id, (passengerRides.get(passenger.id) ?? 0) + 1);
      if (rnd() < 0.8) {
        const score = rnd() < 0.75 ? 5 : rnd() < 0.7 ? 4 : 3;
        const r = await prisma.rating.create({
          data: {
            rideId: ride.id,
            raterId: passenger.id,
            rateeId: driver.id,
            raterRole: 'PASSENGER',
            score,
            createdAt: completed,
          },
        });
        const comment = passenger.locale === 'ar' ? pick(commentsAr) : pick(comments);
        if (comment)
          await prisma.review.create({
            data: {
              ratingId: r.id,
              comment,
              tags: score === 5 ? ['Great conversation', 'Clean car'].slice(0, Math.ceil(rnd() * 2)) : [],
            },
          });
        stats.ratingSum += score;
        stats.ratingCount++;
      }
      if (rnd() < 0.7)
        await prisma.rating.create({
          data: {
            rideId: ride.id,
            raterId: driver.id,
            rateeId: passenger.id,
            raterRole: 'DRIVER',
            score: rnd() < 0.85 ? 5 : 4,
            createdAt: completed,
          },
        });
    }
  }
  await prisma.coupon.update({
    where: { id: welcome.id },
    data: { usedCount: await prisma.couponRedemption.count({ where: { couponId: welcome.id } }) },
  });

  for (const d of drivers) {
    const st = driverStats.get(d.id)!;
    await prisma.driverProfile.update({
      where: { id: d.profileId },
      data: {
        completedRides: st.completed,
        cancelledRides: st.cancelled,
        rating: st.ratingCount ? st.ratingSum / st.ratingCount : 5,
        ratingCount: st.ratingCount,
        offersReceived: st.offers,
        offersAccepted: st.accepted,
      },
    });
    const wallet = await prisma.wallet.update({ where: { userId: d.id }, data: { balance: st.wallet } });
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'ADJUSTMENT',
        amount: st.wallet,
        balanceAfter: st.wallet,
        description: 'Opening balance (historical trips)',
      },
    });
  }
  for (const p of passengers) {
    const agg = await prisma.rating.aggregate({
      where: { rateeId: p.id },
      _avg: { score: true },
      _count: true,
    });
    await prisma.passengerProfile.update({
      where: { userId: p.id },
      data: {
        totalRides: passengerRides.get(p.id) ?? 0,
        rating: agg._avg.score ?? 5,
        ratingCount: agg._count,
      },
    });
  }

  // Payout history for the demo driver.
  const omar = drivers[0];
  await prisma.driverPayout.create({
    data: {
      driverId: omar.id,
      amount: 45_000,
      method: 'BANK_TRANSFER',
      destination: '•••• 8812',
      status: 'PAID',
      processedById: admin.id,
      processedAt: new Date(Date.now() - 9 * 86_400_000),
      createdAt: new Date(Date.now() - 10 * 86_400_000),
    },
  });
  await prisma.driverPayout.create({
    data: {
      driverId: drivers[2].id,
      amount: 30_000,
      method: 'BANK_TRANSFER',
      destination: '•••• 2231',
      status: 'REQUESTED',
      createdAt: new Date(Date.now() - 5 * 3600_000),
    },
  });

  // ── Scheduled ride for Sara ──
  const tomorrow = new Date(Date.now() + 86_400_000);
  tomorrow.setHours(8, 30, 0, 0);
  const sched = calculateFare(cats.COMFORT.rule, { distanceMeters: 21_000, durationSeconds: 1500 });
  await prisma.ride.create({
    data: {
      code: code('MS'),
      passengerId: sara.id,
      categoryId: cats.COMFORT.id,
      serviceAreaId: dubai.id,
      status: 'REQUESTED',
      pickupAddress: 'Dubai Marina Mall, Sheikh Zayed Rd',
      pickupLat: 25.0763,
      pickupLng: 55.1403,
      dropoffAddress: 'Dubai International Airport T3, Airport Rd',
      dropoffLat: 25.2486,
      dropoffLng: 55.3527,
      estimatedDistanceM: 21_000,
      estimatedDurationS: 1500,
      estimatedFare: sched.total,
      fareBreakdown: sched as any,
      currency: 'AED',
      commissionRate: 0.2,
      paymentType: 'CARD',
      paymentMethodId: saraCard.id,
      startPin: '4821',
      scheduledAt: tomorrow,
      pickupNotes: 'Main entrance, near the taxi stand',
      statusHistory: {
        create: { toStatus: 'REQUESTED', actorRole: 'PASSENGER', actorId: sara.id, note: 'scheduled' },
      },
    },
  });

  // ── Support tickets & notifications ──
  const t1 = await prisma.supportTicket.create({
    data: {
      userId: passengers[1].id,
      subject: 'Charged twice for one trip',
      category: 'PAYMENT',
      description: 'I see two charges on my card for yesterday evening’s trip from Dubai Mall.',
      priority: 'HIGH',
    },
  });
  await prisma.ticketMessage.create({
    data: { ticketId: t1.id, authorId: passengers[1].id, body: 'Attaching my bank statement screenshot.' },
  });
  await prisma.supportTicket.create({
    data: {
      userId: sara.id,
      subject: 'Left my sunglasses in the car',
      category: 'LOST_ITEM',
      description: 'Black Ray-Ban sunglasses on the back seat, trip from DIFC to Marina.',
      status: 'IN_PROGRESS',
      assignedToId: admin.id,
    },
  });
  await prisma.supportTicket.create({
    data: {
      userId: drivers[1].id,
      subject: 'App froze while accepting a ride',
      category: 'RIDE_ISSUE',
      description: 'The accept button did not respond for a few seconds around 9pm.',
      status: 'RESOLVED',
      resolvedAt: new Date(),
    },
  });
  await prisma.notification.createMany({
    data: [
      {
        userId: sara.id,
        type: 'PROMO',
        title: '20% off your next rides',
        body: 'Use code WELCOME20 at checkout.',
      },
      {
        userId: sara.id,
        type: 'RIDE_COMPLETED',
        title: 'You have arrived',
        body: 'Thanks for riding with Masar.',
        readAt: new Date(),
      },
      {
        userId: omar.id,
        type: 'DRIVER_APPROVED',
        title: "You're approved 🎉",
        body: 'You can now go online and start receiving trips.',
        readAt: new Date(),
      },
      {
        userId: omar.id,
        type: 'WEEKLY_REPORT',
        title: 'Your weekly summary is ready',
        body: 'See how you did this week in Earnings.',
      },
    ],
  });
  await prisma.adminActivityLog.createMany({
    data: [
      {
        adminId: admin.id,
        action: 'driver.approve',
        entityType: 'DriverProfile',
        entityId: omar.id,
        createdAt: new Date(Date.now() - 48 * 86_400_000),
      },
      {
        adminId: admin.id,
        action: 'coupon.created',
        entityType: 'Coupon',
        entityId: welcome.id,
        metadata: { code: 'WELCOME20' },
      },
    ],
  });

  const rides = await prisma.ride.count();
  console.log(
    `✅ Seed complete: ${passengers.length} passengers, ${drivers.length + 1} drivers, 3 admins, ${rides} rides.`,
  );
  console.log('   Passenger: passenger@masar.demo / Passenger123!');
  console.log('   Driver:    driver@masar.demo    / Driver123!');
  console.log('   Admin:     admin@masar.demo     / Admin123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
