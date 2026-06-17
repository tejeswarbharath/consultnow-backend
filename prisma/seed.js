const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

let connectionString = process.env.DATABASE_URL;
// Fix the pg v9 warning by using libpq compatibility mode
if (connectionString && connectionString.includes('sslmode=require')) {
  connectionString = connectionString.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Start seeding...');

  // 1. Create Categories
  const categoriesData = [
    { name: 'Student Tutoring Services', description: 'Academic help and tutoring for students.' },
    { name: 'Medical Advice', description: 'Consultations with certified healthcare professionals.' },
    { name: 'IT Career Guidance', description: 'Mentorship and advice for tech careers.' },
    { name: 'Legal Advice', description: 'Consultations with legal experts and attorneys.' },
    { name: 'HR Services', description: 'Human resources consulting and advice.' }
  ];

  const categories = {};
  for (const catData of categoriesData) {
    const category = await prisma.category.upsert({
      where: { name: catData.name },
      update: {},
      create: catData,
    });
    categories[category.name] = category;
    console.log(`Upserted category: ${category.name}`);
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
