const fs = require('fs');
const mongoose = require('mongoose');
const config = require('./src/config/config');

// First, connect to MongoDB
console.log('Connecting to MongoDB...');
mongoose
  .connect(config.mongoose.url, config.mongoose.options)
  .then(() => {
    console.log('Connected to MongoDB');
    runImport();
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

// Import models after connection
const { Location } = require('./src/models');

// Function to remove diacritics - ONLY for comparison, not for storage
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

// Standard Romanian county codes - with both diacritic and non-diacritic versions
const COUNTY_CODES = {
  Alba: 'AB',
  Arad: 'AR',
  Argeș: 'AG',
  Arges: 'AG',
  Bacău: 'BC',
  Bacau: 'BC',
  Bihor: 'BH',
  'Bistrița-Năsăud': 'BN',
  'Bistrita-Nasaud': 'BN',
  Botoșani: 'BT',
  Botosani: 'BT',
  Brăila: 'BR',
  Braila: 'BR',
  Brașov: 'BV',
  Brasov: 'BV',
  București: 'B',
  Bucuresti: 'B',
  Buzău: 'BZ',
  Buzau: 'BZ',
  Călărași: 'CL',
  Calarasi: 'CL',
  'Caraș-Severin': 'CS',
  'Caras-Severin': 'CS',
  Cluj: 'CJ',
  Constanța: 'CT',
  Constanta: 'CT',
  Covasna: 'CV',
  Dâmbovița: 'DB',
  Dambovita: 'DB',
  Dolj: 'DJ',
  Galați: 'GL',
  Galati: 'GL',
  Giurgiu: 'GR',
  Gorj: 'GJ',
  Harghita: 'HR',
  Hunedoara: 'HD',
  Ialomița: 'IL',
  Ialomita: 'IL',
  Iași: 'IS',
  Iasi: 'IS',
  Ilfov: 'IF',
  Maramureș: 'MM',
  Maramures: 'MM',
  Mehedinți: 'MH',
  Mehedinti: 'MH',
  Mureș: 'MS',
  Mures: 'MS',
  Neamț: 'NT',
  Neamt: 'NT',
  Olt: 'OT',
  Prahova: 'PH',
  Sălaj: 'SJ',
  Salaj: 'SJ',
  'Satu Mare': 'SM',
  Sibiu: 'SB',
  Suceava: 'SV',
  Teleorman: 'TR',
  Timiș: 'TM',
  Timis: 'TM',
  Tulcea: 'TL',
  Vâlcea: 'VL',
  Valcea: 'VL',
  Vaslui: 'VS',
  Vrancea: 'VN',
};

// Create the reverse mapping for county codes to names
const CODE_TO_COUNTY = {};
Object.entries(COUNTY_CODES).forEach(([name, code]) => {
  if (!CODE_TO_COUNTY[code]) {
    // Store only the first (canonical) name for each code
    CODE_TO_COUNTY[code] = name;
  }
});

async function runImport() {
  try {
    console.log('Starting location rebuild...');

    // Drop the existing collection manually using MongoDB's dropCollection
    try {
      console.log('Dropping the locations collection...');
      await mongoose.connection.db.collection('locations').drop();
      console.log('Collection dropped successfully');
    } catch (err) {
      // Ignore if collection doesn't exist
      console.log('Note: Collection may not exist yet or could not be dropped:', err.message);
    }

    // Read the JSON file
    console.log('Reading locations data...');
    const data = JSON.parse(fs.readFileSync('romanian_locations_full.json', 'utf8'));
    console.log(`Found ${data.length} locations in the data file`);

    // First count data by county to check coverage
    const countiesCounts = {};
    let selectatiCount = 0;

    for (const location of data) {
      if (location.name === 'Selectati') {
        selectatiCount++;
        continue;
      }

      if (location.state) {
        if (!countiesCounts[location.state]) {
          countiesCounts[location.state] = 0;
        }
        countiesCounts[location.state]++;
      }
    }

    console.log(`Found ${Object.keys(countiesCounts).length} counties in data`);
    console.log(`Selectati entries: ${selectatiCount}`);

    // Check if all counties in data have codes
    let missingCodes = [];
    for (const county of Object.keys(countiesCounts)) {
      if (!COUNTY_CODES[county]) {
        missingCodes.push(county);
      }
    }

    if (missingCodes.length > 0) {
      console.warn("WARNING: These counties from data don't have codes:");
      missingCodes.forEach((county) => {
        console.warn(`  - "${county}" (has ${countiesCounts[county]} locations)`);
      });
    }

    // Process counties first
    console.log('Processing counties...');

    // Store a mapping of county names to their codes for faster lookup
    const countyMap = {};

    for (const countyCode of Object.keys(CODE_TO_COUNTY)) {
      const countyName = CODE_TO_COUNTY[countyCode];

      // Create county document
      const county = new Location({
        name: countyName,
        full_name: countyName,
        code: countyCode,
        county_code: countyCode, // Self-reference for counties
        county_name: countyName,
        is_county: true,
      });

      await county.save();

      // Store both with and without diacritics for lookup
      countyMap[countyName] = countyCode;
      countyMap[removeDiacritics(countyName)] = countyCode;

      console.log(`Created county: ${countyName} (${countyCode})`);
    }

    // Create a map to track location codes per county
    const locationCounters = {};
    Object.values(COUNTY_CODES).forEach((code) => {
      locationCounters[code] = 0;
    });

    // Track processed locations to avoid duplicates
    const processedLocations = new Set();

    // First collect all parent locations
    console.log('Collecting parent locations...');
    const parentLocations = {}; // county_code + parenthetical -> location code

    for (const location of data) {
      if (location.name === 'Selectati' || !location.state || !location.parenthetical) {
        continue;
      }

      // Get county code - first try exact match, then without diacritics
      let countyCode = countyMap[location.state] || countyMap[removeDiacritics(location.state)];

      if (!countyCode) {
        console.warn(`County code not found for: ${location.state} - skipping parent: ${location.parenthetical}`);
        continue;
      }

      const parentKey = `${countyCode}_${location.parenthetical}`;
      if (parentLocations[parentKey]) {
        continue; // Already processed this parent
      }

      // This is a new parent location
      locationCounters[countyCode]++;
      const locationCode = `${countyCode}${locationCounters[countyCode].toString().padStart(3, '0')}`;

      // Create the parent location as a standalone place
      const parentLocation = new Location({
        name: location.parenthetical,
        full_name: location.parenthetical,
        code: locationCode,
        county_code: countyCode,
        county_name: location.state,
        parent_code: null,
        parent_name: null,
        is_county: false,
      });

      await parentLocation.save();
      parentLocations[parentKey] = locationCode;

      console.log(`Created parent location: ${location.parenthetical} (${locationCode})`);
    }

    // Now process all regular locations
    console.log('Processing all locations...');
    let processed = 0;
    let skipped = 0;

    for (const location of data) {
      if (location.name === 'Selectati' || !location.state) {
        skipped++;
        continue;
      }

      // Get county code - try both with and without diacritics
      let countyCode = countyMap[location.state] || countyMap[removeDiacritics(location.state)];

      if (!countyCode) {
        console.warn(`County code not found for: ${location.state} - skipping location: ${location.name}`);
        skipped++;
        continue;
      }

      // Skip counties (already processed)
      if (location.name === location.state && !location.parenthetical) {
        skipped++;
        continue;
      }

      // Create a unique key for this location
      const locationKey = `${countyCode}_${location.name}_${location.parenthetical || ''}`;

      // Skip if already processed
      if (processedLocations.has(locationKey)) {
        skipped++;
        continue;
      }

      processedLocations.add(locationKey);

      // Determine parent code if applicable
      let parentCode = null;
      let parentName = null;

      if (location.parenthetical) {
        parentName = location.parenthetical;
        const parentKey = `${countyCode}_${location.parenthetical}`;
        parentCode = parentLocations[parentKey];
      }

      // Increment counter for this county
      locationCounters[countyCode]++;
      const locationCode = `${countyCode}${locationCounters[countyCode].toString().padStart(3, '0')}`;

      // Create the location document
      const newLocation = new Location({
        name: location.name,
        full_name: location.full_name || location.name,
        code: locationCode,
        county_code: countyCode,
        county_name: location.state,
        parent_name: parentName,
        parent_code: parentCode,
        is_county: false,
      });

      await newLocation.save();
      processed++;

      if (processed % 500 === 0 || processed + skipped === data.length) {
        console.log(`Processed ${processed} locations (skipped ${skipped}, total ${processed + skipped}/${data.length})`);
      }
    }

    // Create indexes for better performance
    console.log('Creating indexes...');
    await Location.collection.createIndex({ code: 1 }, { unique: true });
    await Location.collection.createIndex({ county_code: 1, name: 1 });
    await Location.collection.createIndex({ name: 1 });
    await Location.collection.createIndex({ is_county: 1 });

    // Get stats about the rebuild
    const totalLocations = await Location.countDocuments();
    const totalCounties = await Location.countDocuments({ is_county: true });
    const totalCities = await Location.countDocuments({ is_county: false });

    console.log(`\nImport completed successfully!`);
    console.log(`Total locations created: ${totalLocations}`);
    console.log(`Counties: ${totalCounties}`);
    console.log(`Cities/Villages: ${totalCities}`);
    console.log(`Processed ${processed} locations, skipped ${skipped}, from total of ${data.length}`);

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (err) {
    console.error('Rebuild failed:', err);

    // Attempt to disconnect
    try {
      await mongoose.disconnect();
    } catch (disconnectErr) {
      console.error('Error disconnecting from MongoDB:', disconnectErr);
    }

    process.exit(1);
  }
}
