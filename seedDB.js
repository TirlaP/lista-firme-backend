// scripts/seedDb.js
const mongoose = require('mongoose');
const config = require('./src/config/config');
const { seedLocations } = require('./init');

mongoose.connect(config.mongoose.url, config.mongoose.options).then(() => {
  console.log('Connected to MongoDB');
  seedLocations()
    .then(() => {
      console.log('Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
});

// Handle errors
mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error);
  process.exit(1);
});
