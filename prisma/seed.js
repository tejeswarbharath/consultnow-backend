const prisma = require('../src/prisma');

async function main() {
  console.log('Seed process initialized. No dummy expert data is seeded.');
  console.log('Real expert accounts will be registered dynamically via the platform.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
