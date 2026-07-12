const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

let connectionString = process.env.DATABASE_URL;
if (connectionString) {
  try {
    const dbUrl = new URL(connectionString);
    dbUrl.searchParams.set('sslmode', 'verify-full');
    dbUrl.searchParams.set('connect_timeout', '60');
    connectionString = dbUrl.toString();
  } catch (e) {
    console.error("Failed to parse DATABASE_URL:", e);
  }
}

const pool = new Pool({ 
  connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 60000 // Allow up to 60s for serverless DB cold starts
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
