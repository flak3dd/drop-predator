/**
 * Database seed script for Drop Predator development
 * This script populates the database with sample data for testing
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create sample shop
  const shop = await prisma.session.upsert({
    where: { shop: 'test-shop.myshopify.com' },
    update: {},
    create: {
      shop: 'test-shop.myshopify.com',
      accessToken: 'test_token_' + Date.now(),
    },
  });

  console.log('✅ Created/updated shop:', shop.shop);

  // Create settings for the shop
  const settings = await prisma.setting.upsert({
    where: { shop: shop.shop },
    update: {},
    create: {
      shop: shop.shop,
      autoActivate: true,
      autoRevertPrice: true,
      autoPublish: false,
      engineConfig: JSON.stringify({
        scoreThreshold: 65,
        marginFloor: 35,
        moqMax: 50,
        autonomyLevel: 3,
        negotiationEnabled: true,
        pricingEnabled: true,
        importEnabled: false,
        deathPredictor: true,
        surgeEnabled: true,
      }),
    },
  });

  console.log('✅ Created/updated settings for shop');

  // Create sample drops
  const drop1 = await prisma.drop.create({
    data: {
      shop: shop.shop,
      title: 'Summer Sale Drop',
      description: 'Hot products for the summer season',
      status: 'DRAFT',
      scheduledAt: null,
    },
  });

  const drop2 = await prisma.drop.create({
    data: {
      shop: shop.shop,
      title: 'Flash Sale Friday',
      description: 'Limited time flash sale event',
      status: 'COMPLETED',
      startedAt: new Date(Date.now() - 86400000 * 2),
      endedAt: new Date(Date.now() - 86400000),
    },
  });

  console.log('✅ Created sample drops');

  // Create sample engine run
  const engineRun = await prisma.engineRun.create({
    data: {
      shop: shop.shop,
      status: 'COMPLETED',
      phase: 'Monitor',
      configuration: JSON.stringify({
        niche: 'gym',
        scoreThreshold: 65,
        marginFloor: 35,
        moqMax: 50,
        autonomyLevel: 3,
      }),
      startedAt: new Date(Date.now() - 3600000),
      completedAt: new Date(Date.now() - 1800000),
    },
  });

  console.log('✅ Created sample engine run');

  // Create sample engine products
  const product1 = await prisma.engineProduct.create({
    data: {
      sourceId: 'prod_001',
      title: 'Adjustable Dumbbell Set',
      description: 'Adjustable weight dumbbells for home fitness',
      imageUrl: 'https://example.com/dumbbell.jpg',
      price: 89.99,
      cost: 45.00,
      score: 85,
      margin: 50.0,
      lifecycle: 'growing',
      supplier: JSON.stringify({
        name: 'FitnessPro Equipment',
        rating: 4.8,
        moq: 10,
        leadTime: 7,
      }),
      engineRunId: engineRun.id,
      imported: false,
      discoveredAt: new Date(Date.now() - 3600000),
    },
  });

  const product2 = await prisma.engineProduct.create({
    data: {
      sourceId: 'prod_002',
      title: 'Resistance Bands Set',
      description: 'Professional grade resistance bands for workouts',
      imageUrl: 'https://example.com/bands.jpg',
      price: 24.99,
      cost: 8.00,
      score: 78,
      margin: 68.0,
      lifecycle: 'viral',
      supplier: JSON.stringify({
        name: 'HomeFit Direct',
        rating: 4.6,
        moq: 25,
        leadTime: 5,
      }),
      engineRunId: engineRun.id,
      imported: true,
      discoveredAt: new Date(Date.now() - 3600000),
    },
  });

  console.log('✅ Created sample engine products');

  // Create sample drop products
  await prisma.dropProduct.create({
    data: {
      dropId: drop1.id,
      productId: 'gid://shopify/Product/123456789',
      productTitle: 'Yoga Mat Premium',
      productImage: 'https://example.com/yoga-mat.jpg',
      allocatedQuantity: 50,
      dropPrice: '29.99',
      originalPrice: '49.99',
    },
  });

  await prisma.dropProduct.create({
    data: {
      dropId: drop2.id,
      productId: 'gid://shopify/Product/987654321',
      productTitle: 'Foam Roller',
      productImage: 'https://example.com/foam-roller.jpg',
      allocatedQuantity: 30,
      dropPrice: '19.99',
      originalPrice: '34.99',
    },
  });

  console.log('✅ Created sample drop products');

  console.log('🎉 Database seed completed successfully!');
}

main()
  .catch((error) => {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
