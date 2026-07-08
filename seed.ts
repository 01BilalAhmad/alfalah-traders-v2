import { db } from './src/lib/db';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('🌱 Seeding database...');

  // Create Admin
  const adminPassword = await bcrypt.hash('@AFE@123654', 10);
  const admin = await db.user.upsert({
    where: { username: 'al-falah trader' },
    update: {},
    create: {
      username: 'al-falah trader',
      password: adminPassword,
      name: 'AL-FALAH TRADER',
      role: 'admin',
      phone: '0300-0000001',
    },
  });
  console.log(`✅ Admin created: ${admin.name}`);

  // Create Orderbookers
  const ob1Password = await bcrypt.hash('ob123', 10);
  const orderbooker1 = await db.user.upsert({
    where: { username: 'ahmed' },
    update: {},
    create: {
      username: 'ahmed',
      password: ob1Password,
      name: 'Ahmed Khan',
      role: 'orderbooker',
      phone: '0300-1000001',
    },
  });
  console.log(`✅ Orderbooker created: ${orderbooker1.name}`);

  const ob2Password = await bcrypt.hash('ob123', 10);
  const orderbooker2 = await db.user.upsert({
    where: { username: 'bilal' },
    update: {},
    create: {
      username: 'bilal',
      password: ob2Password,
      name: 'Bilal Ali',
      role: 'orderbooker',
      phone: '0300-1000002',
    },
  });
  console.log(`✅ Orderbooker created: ${orderbooker2.name}`);

  // Create shops for Ahmed Khan
  const shopsOb1 = [
    { name: 'Al-Madina General Store', ownerName: 'Muhammad Aslam', area: 'Gulshan-e-Iqbal', routeDays: ['monday'] },
    { name: 'City Mart', ownerName: 'Tariq Mehmood', area: 'Gulshan-e-Iqbal', routeDays: ['monday'] },
    { name: 'Fresh Bakers', ownerName: 'Imran Ahmed', area: 'Bahadurabad', routeDays: ['monday'] },
    { name: 'Karachi Electronics', ownerName: 'Faisal Shah', area: 'Tariq Road', routeDays: ['tuesday'] },
    { name: 'Super Market Plus', ownerName: 'Kamran Raza', area: 'Tariq Road', routeDays: ['tuesday'] },
    { name: 'Green Grocers', ownerName: 'Nasir Hussain', area: 'PECHS', routeDays: ['tuesday'] },
    { name: 'Quetta Dry Fruits', ownerName: 'Abdul Waheed', area: 'Saddar', routeDays: ['wednesday'] },
    { name: 'Al-Noor Traders', ownerName: 'Rashid Ali', area: 'Saddar', routeDays: ['wednesday'] },
    { name: 'Metro Cash & Carry', ownerName: 'Zubair Ahmed', area: 'Clifton', routeDays: ['thursday'] },
    { name: 'D-Mart', ownerName: 'Salman Farooqi', area: 'DHA', routeDays: ['thursday'] },
    { name: 'Habib Grocery', ownerName: 'Habib Ullah', area: 'North Nazimabad', routeDays: ['friday'] },
    { name: 'Jhelum Stores', ownerName: 'Arshad Mehmood', area: 'North Nazimabad', routeDays: ['friday'] },
  ];

  for (const shopData of shopsOb1) {
    await db.shop.upsert({
      where: { id: `shop-ahmed-${shopData.name.toLowerCase().replace(/\s+/g, '-')}` },
      update: {},
      create: {
        id: `shop-ahmed-${shopData.name.toLowerCase().replace(/\s+/g, '-')}`,
        ...shopData,
        orderbookerId: orderbooker1.id,
        balance: Math.floor(Math.random() * 50000) + 5000,
      },
    });
  }
  console.log(`✅ Created ${shopsOb1.length} shops for ${orderbooker1.name}`);

  // Create shops for Bilal Ali
  const shopsOb2 = [
    { name: 'Hyderi Market', ownerName: 'Syed Ali', area: 'Hyderi', routeDays: ['monday'] },
    { name: 'Nazimabad General Store', ownerName: 'Pervez Akhtar', area: 'Nazimabad', routeDays: ['monday'] },
    { name: 'Pak Electronics', ownerName: 'Waqar Hasan', area: 'Liaquatabad', routeDays: ['tuesday'] },
    { name: 'Rana Traders', ownerName: 'Rana Muhammad', area: 'Landhi', routeDays: ['wednesday'] },
    { name: 'Malir Cash & Carry', ownerName: 'Yousuf Memon', area: 'Malir', routeDays: ['thursday'] },
    { name: 'Shahrah-e-Faisal Store', ownerName: 'Shahid Iqbal', area: 'Shahrah-e-Faisal', routeDays: ['friday'] },
    { name: 'Korangi Whole Sale', ownerName: 'Aslam Korangi', area: 'Korangi', routeDays: ['saturday'] },
    { name: 'Bin Qasim Traders', ownerName: 'Qasim Ali', area: 'Bin Qasim', routeDays: ['saturday'] },
  ];

  for (const shopData of shopsOb2) {
    await db.shop.upsert({
      where: { id: `shop-bilal-${shopData.name.toLowerCase().replace(/\s+/g, '-')}` },
      update: {},
      create: {
        id: `shop-bilal-${shopData.name.toLowerCase().replace(/\s+/g, '-')}`,
        ...shopData,
        orderbookerId: orderbooker2.id,
        balance: Math.floor(Math.random() * 40000) + 3000,
      },
    });
  }
  console.log(`✅ Created ${shopsOb2.length} shops for ${orderbooker2.name}`);

  // Create some sample transactions for today
  const today = new Date();
  const allShops = await db.shop.findMany();

  for (const shop of allShops.slice(0, 5)) {
    const creditAmount = Math.floor(Math.random() * 10000) + 1000;
    const prevBalance = shop.balance;
    await db.transaction.create({
      data: {
        shopId: shop.id,
        type: 'credit',
        amount: creditAmount,
        previousBalance: prevBalance,
        newBalance: prevBalance + creditAmount,
        description: 'Monthly credit posting',
        createdBy: admin.id,
      },
    });
    // Update shop balance
    await db.shop.update({
      where: { id: shop.id },
      data: { balance: prevBalance + creditAmount },
    });
  }

  console.log('\n🎉 Seeding completed!');
  console.log('\n📋 Login Credentials:');
  console.log('   Admin: username=AL-FALAH TRADER, password=@AFE@123654');
  console.log('   Orderbooker 1: username=ahmed, password=ob123');
  console.log('   Orderbooker 2: username=bilal, password=ob123');
}

seed()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
