// scripts/seedDb.js
const mongoose = require('mongoose');
const config = require('./src/config/config');
const { seedLocations } = require('./init');
const logger = require('./src/config/logger');

mongoose.connect(config.mongoose.url, config.mongoose.options).then(() => {
  logger.info('Connected to MongoDB');
  seedLocations()
    .then(() => {
      logger.info('Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding failed:', error);
      process.exit(1);
    });
});

// Handle errors
mongoose.connection.on('error', (error) => {
  logger.error('MongoDB connection error:', error);
  process.exit(1);
});
