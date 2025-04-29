const cron = require('node-cron');
const Company = require('../models/company.model');
const CompanyStat = require('../models/companyStat.model');
const logger = require('../config/logger');

// Map of status codes to human-readable labels
const statusMap = {
  1048: 'funcțiune',
  '1048,2069': 'inactivă',
  1066: 'radiată',
  1063: 'întrerupere temporară de activitate',
  1064: 'dizolvare',
  // Add more mappings as needed - customize this map based on your actual data
};

// Function to get human-readable label for a status code
function getStatusLabel(statusCode) {
  // Try direct lookup
  if (statusMap[statusCode]) {
    return statusMap[statusCode];
  }

  // Try partial matching for compound status codes
  for (const [code, label] of Object.entries(statusMap)) {
    if (statusCode.includes(code)) {
      return label;
    }
  }

  // Fallback to the code itself
  return statusCode;
}

// Function to update stats
async function updateCompanyStats() {
  try {
    logger.info('Starting company stats update');

    // Get all unique status values and their counts
    const statusCounts = await Company.aggregate([
      {
        $group: {
          _id: '$stare_firma',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Process each status
    for (const { _id: status, count } of statusCounts) {
      if (!status) continue; // Skip if status is null/undefined

      // Get or create the status record
      let statusRecord = await CompanyStat.findOne({ stare: status });

      if (!statusRecord) {
        statusRecord = new CompanyStat({
          stare: status,
          count,
          label: getStatusLabel(status),
        });
      } else {
        statusRecord.count = count;
        statusRecord.lastUpdated = new Date();
      }

      await statusRecord.save();
    }

    logger.info(`Updated stats for ${statusCounts.length} company statuses`);
  } catch (error) {
    logger.error('Error updating company stats:', error);
  }
}

// Run the update job on startup and every day at midnight
function initializeStatsService() {
  // Update immediately on startup
  updateCompanyStats();

  // Then schedule daily updates
  cron.schedule('0 0 * * *', updateCompanyStats);

  logger.info('Company stats service initialized');
}

module.exports = {
  initializeStatsService,
  updateCompanyStats,
};
