const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Start seeding...');

  const passwordHash = await bcrypt.hash('password123', 10);

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

  // 2. Create Experts
  const expertsData = [
    {
      name: 'Alice Johnson',
      email: 'alice.tutoring@example.com',
      password: passwordHash,
      yearsExperience: 5,
      pricePerHour: 40.0,
      subjectExpertise: ['Mathematics', 'Physics'],
      categoryId: categories['Student Tutoring Services'].id,
      photoUrl: 'https://i.pravatar.cc/150?u=alice'
    },
    {
      name: 'Dr. Bob Smith',
      email: 'bob.medical@example.com',
      password: passwordHash,
      yearsExperience: 12,
      pricePerHour: 150.0,
      subjectExpertise: ['General Practice', 'Pediatrics'],
      categoryId: categories['Medical Advice'].id,
      photoUrl: 'https://i.pravatar.cc/150?u=bob'
    },
    {
      name: 'Charlie Davis',
      email: 'charlie.it@example.com',
      password: passwordHash,
      yearsExperience: 8,
      pricePerHour: 80.0,
      subjectExpertise: ['Software Engineering', 'System Design'],
      categoryId: categories['IT Career Guidance'].id,
      photoUrl: 'https://i.pravatar.cc/150?u=charlie'
    },
    {
      name: 'Diana Prince',
      email: 'diana.legal@example.com',
      password: passwordHash,
      yearsExperience: 15,
      pricePerHour: 200.0,
      subjectExpertise: ['Corporate Law', 'Contracts'],
      categoryId: categories['Legal Advice'].id,
      photoUrl: 'https://i.pravatar.cc/150?u=diana'
    },
    {
      name: 'Eve Adams',
      email: 'eve.hr@example.com',
      password: passwordHash,
      yearsExperience: 10,
      pricePerHour: 90.0,
      subjectExpertise: ['Recruitment', 'Employee Relations'],
      categoryId: categories['HR Services'].id,
      photoUrl: 'https://i.pravatar.cc/150?u=eve'
    }
  ];

  for (const expertData of expertsData) {
    const expert = await prisma.expert.upsert({
      where: { email: expertData.email },
      update: {},
      create: expertData,
    });
    console.log(`Upserted expert: ${expert.name}`);
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
