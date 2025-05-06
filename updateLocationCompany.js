const mongoose = require('mongoose');
const config = require('./src/config/config');

// Connect to MongoDB
console.log('Connecting to MongoDB...');
mongoose
  .connect(config.mongoose.url, config.mongoose.options)
  .then(() => {
    console.log('Connected to MongoDB');
    updateBucharestCompanies();
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

// Import models after connection
const { Location } = require('./src/models');

// Function to remove diacritics for comparison
function removeDiacritics(str) {
  if (!str) return '';
  const diacriticsMap = {
    ă: 'a',
    â: 'a',
    î: 'i',
    ș: 's',
    ş: 's',
    ț: 't',
    ţ: 't',
    Ă: 'A',
    Â: 'A',
    Î: 'I',
    Ș: 'S',
    Ş: 'S',
    Ț: 'T',
    Ţ: 'T',
  };

  return str.replace(/[ăâîșşțţĂÂÎȘŞȚŢ]/g, (match) => diacriticsMap[match] || match);
}

// Special function for extracting Bucharest sector number
function extractBucharestSector(address) {
  if (!address) return null;

  // Common patterns in addresses
  const patterns = [
    /sector\s*(\d+)/i, // "sector 3"
    /sectorul\s*(\d+)/i, // "sectorul 3"
    /bucuresti,\s*sector\s*(\d+)/i, // "bucuresti, sector 3"
    /bucuresti\s*sector\s*(\d+)/i, // "bucuresti sector 3"
    /sector\s*(\d+)[\s,]+bucuresti/i, // "sector 3, bucuresti"
    /s(\d+)/i, // "S3" (less reliable, use as last resort)
  ];

  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1]);
    }
  }

  return null;
}

async function updateBucharestCompanies() {
  try {
    console.log('Starting Bucharest companies update...');

    // Get direct access to collections
    const companiesCollection = mongoose.connection.db.collection('companies');

    // 1. First get Bucharest county code and all sector codes
    const bucharestCounty = await Location.findOne({ code: 'B', is_county: true });
    if (!bucharestCounty) {
      throw new Error('Bucharest county record not found');
    }

    // Get all sectors
    const bucharestSectors = await Location.find({
      county_code: 'B',
      is_county: false,
      name: { $regex: /^Sector/i },
    }).lean();

    // Create a map of sector number to sector code
    const sectorCodeMap = {};
    for (const sector of bucharestSectors) {
      const sectorNumber = sector.name.match(/\d+/)[0];
      sectorCodeMap[sectorNumber] = sector.code;
    }

    console.log('Bucharest county code:', bucharestCounty.code);
    console.log('Sector codes:', sectorCodeMap);

    // 2. Find all companies with Bucharest in the address but no location codes
    const bucharestQuery = {
      $or: [
        { 'adresa.judet': { $regex: /bucuresti|bucureşti/i } },
        { 'adresa_anaf.sediu_social.sdenumire_Judet': { $regex: /bucuresti|bucureşti/i } },
      ],
      countyCode: { $exists: false },
    };

    const totalBucharestCompanies = await companiesCollection.countDocuments(bucharestQuery);
    console.log(`Found ${totalBucharestCompanies} companies in Bucharest without location codes`);

    // Process in batches
    const batchSize = 1000;
    let processed = 0;
    let updated = 0;
    let sectorMatches = 0;

    const cursor = companiesCollection.find(bucharestQuery).batchSize(batchSize);
    let batch = [];
    let company;

    while ((company = await cursor.next())) {
      processed++;

      // First set the county code for Bucharest
      const updateFields = {
        countyCode: bucharestCounty.code,
      };

      // Try to extract the sector from address fields
      let sectorNumber = null;
      let addressToCheck = '';

      // Check various address fields
      if (company.adresa) {
        if (company.adresa.completa) {
          addressToCheck += company.adresa.completa + ' ';
        }
        if (company.adresa.judet) {
          addressToCheck += company.adresa.judet + ' ';
        }
        if (company.adresa.localitate) {
          addressToCheck += company.adresa.localitate + ' ';
        }
      }

      if (company.adresa_anaf && company.adresa_anaf.sediu_social) {
        if (company.adresa_anaf.sediu_social.sdenumire_Judet) {
          addressToCheck += company.adresa_anaf.sediu_social.sdenumire_Judet + ' ';
        }
        if (company.adresa_anaf.sediu_social.sdenumire_Localitate) {
          addressToCheck += company.adresa_anaf.sediu_social.sdenumire_Localitate + ' ';
        }
        if (company.adresa_anaf.sediu_social.sdetalii_Adresa) {
          addressToCheck += company.adresa_anaf.sediu_social.sdetalii_Adresa + ' ';
        }
      }

      // Extract sector from combined address
      sectorNumber = extractBucharestSector(addressToCheck);

      // If we found a sector, add the city code
      if (sectorNumber && sectorCodeMap[sectorNumber]) {
        updateFields.cityCode = sectorCodeMap[sectorNumber];
        sectorMatches++;
      }

      // Add to batch update
      batch.push({
        updateOne: {
          filter: { _id: company._id },
          update: { $set: updateFields },
        },
      });

      updated++;

      // Execute batch update when batch size is reached
      if (batch.length === batchSize) {
        await companiesCollection.bulkWrite(batch);
        batch = [];
        console.log(
          `Processed ${processed}/${totalBucharestCompanies} companies (${updated} updated, ${sectorMatches} with sector matches)`
        );
      }
    }

    // Process any remaining items in the batch
    if (batch.length > 0) {
      await companiesCollection.bulkWrite(batch);
      console.log(
        `Final batch: Processed ${processed}/${totalBucharestCompanies} companies (${updated} updated, ${sectorMatches} with sector matches)`
      );
    }

    console.log(`\nCompleted: Processed ${processed} Bucharest companies`);
    console.log(`Updated ${updated} companies with Bucharest county code`);
    console.log(`Matched ${sectorMatches} companies with specific sector codes`);

    // 3. Now find companies that already have county code B but no city code
    const bucharestWithoutSectorQuery = {
      countyCode: 'B',
      cityCode: { $exists: false },
    };

    const totalWithoutSector = await companiesCollection.countDocuments(bucharestWithoutSectorQuery);
    console.log(`\nFound ${totalWithoutSector} companies with Bucharest county code but no sector code`);

    processed = 0;
    updated = 0;
    sectorMatches = 0;
    batch = [];

    const cursor2 = companiesCollection.find(bucharestWithoutSectorQuery).batchSize(batchSize);

    while ((company = await cursor2.next())) {
      processed++;

      // Try to extract the sector from address fields
      let sectorNumber = null;
      let addressToCheck = '';

      // Check various address fields
      if (company.adresa) {
        if (company.adresa.completa) {
          addressToCheck += company.adresa.completa + ' ';
        }
        if (company.adresa.judet) {
          addressToCheck += company.adresa.judet + ' ';
        }
        if (company.adresa.localitate) {
          addressToCheck += company.adresa.localitate + ' ';
        }
      }

      if (company.adresa_anaf && company.adresa_anaf.sediu_social) {
        if (company.adresa_anaf.sediu_social.sdenumire_Judet) {
          addressToCheck += company.adresa_anaf.sediu_social.sdenumire_Judet + ' ';
        }
        if (company.adresa_anaf.sediu_social.sdenumire_Localitate) {
          addressToCheck += company.adresa_anaf.sediu_social.sdenumire_Localitate + ' ';
        }
        if (company.adresa_anaf.sediu_social.sdetalii_Adresa) {
          addressToCheck += company.adresa_anaf.sediu_social.sdetalii_Adresa + ' ';
        }
      }

      // Extract sector from combined address
      sectorNumber = extractBucharestSector(addressToCheck);

      // If we found a sector, update the company
      if (sectorNumber && sectorCodeMap[sectorNumber]) {
        batch.push({
          updateOne: {
            filter: { _id: company._id },
            update: { $set: { cityCode: sectorCodeMap[sectorNumber] } },
          },
        });

        updated++;
        sectorMatches++;
      }

      // Execute batch update when batch size is reached
      if (batch.length === batchSize) {
        await companiesCollection.bulkWrite(batch);
        batch = [];
        console.log(`Processed ${processed}/${totalWithoutSector} companies (${updated} updated with sector codes)`);
      }
    }

    // Process any remaining items in the batch
    if (batch.length > 0) {
      await companiesCollection.bulkWrite(batch);
      console.log(
        `Final batch: Processed ${processed}/${totalWithoutSector} companies (${updated} updated with sector codes)`
      );
    }

    console.log(`\nSecond phase completed: Processed ${processed} companies`);
    console.log(`Updated ${updated} companies with specific sector codes`);

    console.log('\nBucharest companies update completed successfully!');

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (err) {
    console.error('Bucharest update failed:', err);

    try {
      await mongoose.disconnect();
    } catch (disconnectErr) {
      console.error('Error disconnecting:', disconnectErr);
    }

    process.exit(1);
  }
}
