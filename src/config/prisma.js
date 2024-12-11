const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Add connection pooling settings
  __internal: {
    engine: {
      connectionLimit: 20,
      queueLimit: 50,
      connectionTimeout: 20000,
    },
  },
});

// Add proper shutdown handling
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Add connection error handling
prisma.$on('query', (e) => {
  if (e.duration > 5000) {
    console.warn(`Slow query detected (${e.duration}ms):`, e.query);
  }
});

module.exports = prisma;
