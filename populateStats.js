// scripts/populateStats.js
require('dotenv').config();
const mongoose = require('mongoose');
const Company = require('./src/models/company.model');
const CompanyStat = require('./src/models/companyStat.model');
const logger = require('./src/config/logger');

// Function to determine company status based on rules
function deriveStatus(company) {
  const inactiveFlag = company.stare_inactiv?.statusInactivi === true;
  const stareReg = company.date_generale?.stare_inregistrare || '';

  // 2) Întrerupere temporară de activitate:
  //    - inactiveFlag true AND stare_inregistrare conține "SUSPENDARE ACTIVITATE"
  if (inactiveFlag && /SUSPENDARE ACTIVITATE/.test(stareReg)) {
    return 'Întrerupere temporară de activitate';
  }

  // 1) Inactiv:
  //    - inactiveFlag true AND stare_inregistrare e "INREGISTRAT din data"
  if ((inactiveFlag && /INREGISTRAT/.test(stareReg)) || (inactiveFlag && /TRANSFER/.test(stareReg))) {
    return 'Inactivă';
  }

  // 3) Radiată:
  //    - stare_inregistrare conține "RADIERE"
  if (/RADIERE/.test(stareReg)) {
    return 'Radiată';
  }

  // 4) Dizolvare:
  //    - stare_inregistrare conține "DIZOLVARE"
  if (/DIZOLVARE/.test(stareReg)) {
    return 'Dizolvare';
  }

  // 5) Funcțională:
  //    - orice alt caz
  return 'Funcțională';
}

async function populateStats() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lista-firme';
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    logger.info('Connected to MongoDB');

    // Delete old entries
    await CompanyStat.deleteMany({});
    logger.info('Cleared CompanyStat');

    // Category counts
    const counts = {};

    // Process all companies in batches to update stare_firma field
    const batchSize = 1000;
    let processed = 0;
    let totalCompanies = await Company.countDocuments();

    logger.info(`Starting to process ${totalCompanies} companies`);

    // Process in batches
    let skip = 0;

    while (skip < totalCompanies) {
      // Get a batch of companies
      const companies = await Company.find().skip(skip).limit(batchSize).lean(); // Use lean for better performance

      // No more companies to process
      if (!companies.length) break;

      const bulkOps = [];

      // Process each company in this batch
      for (const company of companies) {
        // Derive status based on rules
        const status = deriveStatus(company);

        // Update count for statistics
        counts[status] = (counts[status] || 0) + 1;

        // Only update stare_firma if it's different from derived status
        if (company.stare_firma !== status) {
          bulkOps.push({
            updateOne: {
              filter: { _id: company._id },
              update: { $set: { stare_firma: status } },
              // Skip validation to avoid errors with other required fields
              upsert: false,
            },
          });
        }
      }

      // Execute bulk operation if there are any updates
      if (bulkOps.length > 0) {
        await Company.bulkWrite(bulkOps, { ordered: false });
      }

      processed += companies.length;
      skip += batchSize;

      logger.info(`Processed ${processed}/${totalCompanies} companies`);
    }

    // Insert new statistics
    const now = new Date();
    const statsDocs = Object.entries(counts).map(([stare, count]) => ({
      stare,
      count,
      label: stare,
      lastUpdated: now,
    }));

    // Only insert if there are stats to insert
    if (statsDocs.length > 0) {
      await CompanyStat.insertMany(statsDocs);
      logger.info(`Inserted ${statsDocs.length} CompanyStat records`);
    } else {
      logger.warn('No company stats to insert');
    }

    await mongoose.connection.close();
    logger.info('Disconnected');
    process.exit(0);
  } catch (err) {
    logger.error('Error populating stats:', err);
    console.error(err); // Log the full error for more details
    process.exit(1);
  }
}

populateStats();
