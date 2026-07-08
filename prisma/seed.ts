import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const WORKING_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'saturday'];

const AREAS = [
  'Nazimabad', 'North Nazimabad', 'Buffer Zone', 'Gulshan-e-Iqbal',
  'FB Area', 'Tariq Road', 'DHA Phase 5', 'Bahadurabad',
  'Saddar', 'Korangi', 'Landhi', 'Malir',
];

async function seed() {
  console.log('🌱 Seeding database...');

  const hashedAdminPassword = await bcrypt.hash('Admin@123', 10);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedAdminPassword,
      name: 'AL-FALAH TRADER',
      role: 'admin',
      phone: '03001234567',
      status: 'active',
    },
  });
  console.log('✅ Admin user created:', admin.username, '(Admin@123)');

  // Create orderbookers
  const ob1Password = await bcrypt.hash('ob123', 10);
  const ob2Password = await bcrypt.hash('ob123', 10);

  const ob1 = await prisma.user.upsert({
    where: { username: 'ahmed' },
    update: {},
    create: {
      username: 'ahmed',
      password: ob1Password,
      name: 'Ahmed Khan',
      role: 'orderbooker',
      phone: '03121234567',
      status: 'active',
    },
  });

  const ob2 = await prisma.user.upsert({
    where: { username: 'bilal' },
    update: {},
    create: {
      username: 'bilal',
      password: ob2Password,
      name: 'Bilal Ali',
      role: 'orderbooker',
      phone: '03211234567',
      status: 'active',
    },
  });

  console.log('✅ Orderbookers created:', ob1.name, '/', ob2.name, '(ob123)');

  // Create shops
  const shopNames = [
    'Al-Madina General Store', ' Karachi Electronics', ' Rahim Traders',
    'Super Market', 'Fresh Bakery', 'Crown Medical Store',
    'Habib Oil Mill', 'Bismillah Cloth House', 'Star Telecom',
    'Pakistan Stationery', 'New Shalimar Restaurant', 'Qadri General Store',
    'Hyderi Electronics', 'Ayesha Cosmetics', 'Chennai Rice Traders',
    'Al-Noor Furniture', 'Metro Shoe House', 'Dawood Hardware',
    'Khalid Cold Drink', 'Ghousia Groceries',
  ];

  const orderbookers = [ob1, ob2];
  let shopCount = 0;

  for (let i = 0; i < shopNames.length; i++) {
    const name = shopNames[i].trim();
    const area = AREAS[i % AREAS.length];
    const routeDays = [WORKING_DAYS[i % WORKING_DAYS.length]];
    const orderbooker = orderbookers[i % 2];
    const balance = Math.floor(Math.random() * 50000) + 5000;
    const creditLimit = Math.random() > 0.5 ? Math.floor(Math.random() * 100000) + 20000 : 0;

    await prisma.shop.create({
      data: {
        id: `shop_seed_${i + 1}_${Date.now()}`,
        name,
        ownerName: `Owner ${i + 1}`,
        area,
        address: `Shop #${i + 1}, ${area}, Karachi`,
        phone: `03${String(Math.floor(Math.random() * 9000000000 + 1000000000)).slice(0, 10)}`,
        routeDays: routeDays,
        orderbookerId: orderbooker.id,
        balance,
        creditLimit,
        status: 'active',
      },
    });
    shopCount++;
  }

  console.log(`✅ ${shopCount} shops created`);

  // Create some sample transactions
  const shops = await prisma.shop.findMany({ take: 10 });
  let txnCount = 0;

  for (const shop of shops) {
    // Add 1-3 credit transactions per shop
    const numTxns = Math.floor(Math.random() * 3) + 1;
    let currentBalance = 0;

    for (let j = 0; j < numTxns; j++) {
      const amount = Math.floor(Math.random() * 10000) + 1000;
      const previousBalance = currentBalance;
      currentBalance += amount;

      await prisma.transaction.create({
        data: {
          id: `txn_seed_${txnCount + 1}_${Date.now()}`,
          shopId: shop.id,
          type: 'credit',
          status: 'approved',
          amount,
          previousBalance,
          newBalance: currentBalance,
          description: 'Goods supplied',
          createdBy: admin.id,
        },
      });
      txnCount++;
    }
  }

  console.log(`✅ ${txnCount} sample transactions created`);
  console.log('🎉 Seeding complete!');
  console.log('');
  console.log('--- Login Credentials ---');
  console.log('Admin: admin / Admin@123');
  console.log('Orderbooker 1: ahmed / ob123');
  console.log('Orderbooker 2: bilal / ob123');
}

seed()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
