// resilient-financial-updater.js
const { MongoClient } = require('mongodb');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

// Convert exec to promise
const execPromise = util.promisify(exec);

// Configuration
const config = {
  mongodb: {
    uri: 'mongodb://localhost:27017',
    database: 'lista-firme',
    companyCollection: 'companies',
  },
  anafPhpPath: '/Users/petruinstagram/Desktop/web-apps/anaf-php',
  concurrentProcesses: 5, // Further reduced concurrency for more stability
  tempDir: path.join('/Users/petruinstagram/Desktop/web-apps/anaf-php', 'temp_scripts'),
  minDelayBetweenRequests: 150, // Small delay between requests to same server (milliseconds)
  maxRetries: 3, // Number of retries for failed requests
  retryDelay: 1000, // Delay between retries (milliseconds)
};

// Connect to MongoDB
async function connectToMongoDB() {
  const client = new MongoClient(config.mongodb.uri, { useUnifiedTopology: true });
  await client.connect();
  console.log('Connected to MongoDB');
  return client;
}

// Get all companies from MongoDB with their registration dates
async function getAllCompanies(db) {
  const collection = db.collection(config.mongodb.companyCollection);
  const companies = await collection
    .find(
      {},
      {
        projection: {
          cui: 1,
          'date_generale.data_inregistrare': 1,
        },
      }
    )
    .toArray();
  console.log(`Found ${companies.length} companies in database`);
  return companies;
}

// Ensure temp directory exists
function ensureTempDir() {
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
    console.log(`Created temp directory: ${config.tempDir}`);
  }
}

// Create a PHP script for a single year's balance sheet
// This is more reliable than fetching all years at once
async function createSingleYearBalanceSheetScript(cui, year) {
  const scriptPath = path.join(config.tempDir, `balance_${cui}_${year}.php`);

  const scriptContent = `<?php
// Redirect errors to stderr so they don't corrupt our JSON output
ini_set('display_errors', 'stderr');
ini_set('max_execution_time', 30); // 30 second timeout

require "vendor/autoload.php";

// Create an unauthenticated client
$client = Anaf::client();

// Set the CUI and year we're fetching
$cui = "${cui}";
$year = ${year};
$result = [
  'success' => false,
  'balanceSheet' => null,
  'year' => $year
];

try {
  $balanceSheet = $client->balanceSheet()->create([
    'cui' => $cui,
    'an' => $year,
  ]);
  
  if ($balanceSheet) {
    $result['balanceSheet'] = $balanceSheet->toArray();
    $result['success'] = true;
  }
} catch (Exception $e) {
  $result['error'] = $e->getMessage();
}

// Output JSON to stdout
echo json_encode($result);
`;

  fs.writeFileSync(scriptPath, scriptContent);
  return scriptPath;
}

// Extract registration year from date string or default to a safe value
function getRegistrationYear(dateString) {
  if (!dateString) return 2010; // Default to 2010 if no date available

  // Handle various date formats
  let match;

  // Try YYYY-MM-DD format
  match = dateString.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (match) return parseInt(match[1]);

  // Try DD.MM.YYYY format
  match = dateString.match(/^\d{2}\.\d{2}\.(\d{4})$/);
  if (match) return parseInt(match[1]);

  // If just a year is provided
  match = dateString.match(/^(\d{4})$/);
  if (match) return parseInt(match[1]);

  // Default to 5 years ago if format is unknown
  const currentYear = new Date().getFullYear();
  return currentYear - 5;
}

// Sleep function
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch a single year's balance sheet with retries
async function fetchYearBalanceSheet(cui, year, retryCount = 0) {
  try {
    const scriptPath = await createSingleYearBalanceSheetScript(cui, year);
    const { stdout } = await execPromise(`cd ${config.anafPhpPath} && php ${path.relative(config.anafPhpPath, scriptPath)}`);

    // Clean up the script
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }

    // Parse the JSON output
    try {
      return JSON.parse(stdout);
    } catch (parseError) {
      console.error(`Failed to parse balance sheet for CUI ${cui}, year ${year}:`, parseError.message);

      // Retry if we haven't reached max retries
      if (retryCount < config.maxRetries) {
        console.log(`Retrying CUI ${cui}, year ${year} (attempt ${retryCount + 1}/${config.maxRetries})...`);
        await sleep(config.retryDelay);
        return fetchYearBalanceSheet(cui, year, retryCount + 1);
      }

      return null;
    }
  } catch (error) {
    console.error(`Failed to fetch balance sheet for CUI ${cui}, year ${year}:`, error.message);

    // Retry if we haven't reached max retries
    if (retryCount < config.maxRetries) {
      console.log(`Retrying CUI ${cui}, year ${year} (attempt ${retryCount + 1}/${config.maxRetries})...`);
      await sleep(config.retryDelay);
      return fetchYearBalanceSheet(cui, year, retryCount + 1);
    }

    return null;
  }
}

// Fetch all balance sheets for a company, one year at a time
async function fetchAllBalanceSheets(cui, registrationYear) {
  const currentYear = new Date().getFullYear();
  const balanceSheets = {};
  let hasAnySheets = false;

  // Process each year from registration to current
  for (let year = registrationYear; year <= currentYear - 1; year++) {
    // Small delay between years to avoid overwhelming the server
    if (Object.keys(balanceSheets).length > 0) {
      await sleep(config.minDelayBetweenRequests);
    }

    const result = await fetchYearBalanceSheet(cui, year);

    if (result && result.success && result.balanceSheet) {
      balanceSheets[year] = result.balanceSheet;
      hasAnySheets = true;
      console.log(`Successfully fetched balance sheet for CUI ${cui}, year ${year}`);
    }
  }

  return {
    success: hasAnySheets,
    balanceSheets: balanceSheets,
  };
}

// Update only financial data in MongoDB
async function updateFinancialData(db, cui, balanceData) {
  const collection = db.collection(config.mongodb.companyCollection);

  // If we don't have balance sheets, skip the update
  if (!balanceData || !balanceData.success || Object.keys(balanceData.balanceSheets).length === 0) {
    return { modifiedCount: 0 };
  }

  const balanceSheets = balanceData.balanceSheets;

  // Format update data - ONLY updating financial_data
  const updateData = {
    $set: {
      financial_data: balanceSheets,
      last_anaf_update: new Date(),
    },
  };

  // Update the company in MongoDB
  try {
    const result = await collection.updateOne({ cui: parseInt(cui) }, updateData);
    return result;
  } catch (err) {
    console.error(`Failed to update MongoDB for CUI ${cui}:`, err.message);
    return { modifiedCount: 0 };
  }
}

// Process a single company - balance sheets only
async function processCompany(db, company, index, total) {
  const cui = company.cui;
  console.log(`[${index}/${total}] Starting processing for company with CUI: ${cui}`);

  try {
    // Determine registration year
    let registrationYear;

    // First try to use the year from the database if available
    if (company.date_generale && company.date_generale.data_inregistrare) {
      registrationYear = getRegistrationYear(company.date_generale.data_inregistrare);
    } else {
      // Default to 10 years ago if no registration date found
      const currentYear = new Date().getFullYear();
      registrationYear = currentYear - 10;
    }

    console.log(`[${index}/${total}] Company ${cui} registration year detected: ${registrationYear}`);

    // Fetch balance sheets from registration year to current, one year at a time
    const balanceData = await fetchAllBalanceSheets(cui, registrationYear);

    // Report on balance sheets
    if (balanceData && balanceData.success && Object.keys(balanceData.balanceSheets).length > 0) {
      console.log(
        `[${index}/${total}] Retrieved balance sheets for years: ${Object.keys(balanceData.balanceSheets).join(', ')}`
      );

      // Update MongoDB with just the financial data
      const result = await updateFinancialData(db, cui, balanceData);
      if (result.modifiedCount > 0) {
        console.log(`[${index}/${total}] Updated financial data for CUI ${cui}`);
        return { status: 'updated', cui, balanceSheets: true, years: Object.keys(balanceData.balanceSheets).length };
      } else {
        console.log(`[${index}/${total}] No changes for financial data for CUI ${cui}`);
        return { status: 'no_change', cui, balanceSheets: true, years: Object.keys(balanceData.balanceSheets).length };
      }
    } else {
      console.log(`[${index}/${total}] No balance sheets found for CUI ${cui}`);
      return { status: 'no_data', cui, balanceSheets: false };
    }
  } catch (error) {
    console.error(`[${index}/${total}] Error processing company with CUI ${cui}:`, error.message);
    return { status: 'error', cui, error: error.message };
  }
}

// Main function to process all companies with controlled concurrency
async function updateAllCompanies() {
  let mongoClient;

  try {
    mongoClient = await connectToMongoDB();
    const db = mongoClient.db(config.mongodb.database);

    // Ensure temp directory exists
    ensureTempDir();

    // Get all companies
    const companies = await getAllCompanies(db);
    console.log(`Starting resilient financial data update for ${companies.length} companies`);

    // Summary statistics
    let stats = {
      processed: 0,
      updated: 0,
      noData: 0,
      errors: 0,
      totalYears: 0,
    };

    // Use a queue to track companies
    const queue = [...companies];
    const activePromises = new Map(); // Track active tasks by company CUI

    // Process queue until empty
    while (queue.length > 0 || activePromises.size > 0) {
      // Fill up to concurrency limit
      while (activePromises.size < config.concurrentProcesses && queue.length > 0) {
        const company = queue.shift();
        const index = companies.length - queue.length;

        const promise = processCompany(db, company, index, companies.length)
          .then((result) => {
            // Update statistics
            stats.processed++;
            if (result.status === 'updated') {
              stats.updated++;
              if (result.years) {
                stats.totalYears += result.years;
              }
            } else if (result.status === 'error') {
              stats.errors++;
            } else if (result.status === 'no_data') {
              stats.noData++;
            }

            // Remove from active promises
            activePromises.delete(company.cui);

            // Show progress every 100 companies
            if (stats.processed % 100 === 0 || stats.processed === companies.length) {
              console.log(
                `Progress: ${stats.processed}/${companies.length} (${Math.round(
                  (stats.processed / companies.length) * 100
                )}%)`
              );
              console.log(
                `Updated: ${stats.updated}, No Data: ${stats.noData}, Errors: ${stats.errors}, Total Balance Sheet Years: ${stats.totalYears}`
              );
            }
          })
          .catch((err) => {
            console.error(`Error in task for CUI ${company.cui}:`, err);
            stats.errors++;
            stats.processed++;
            activePromises.delete(company.cui);
          });

        activePromises.set(company.cui, promise);
      }

      // Wait for any promise to complete
      if (activePromises.size > 0) {
        await Promise.race(Array.from(activePromises.values()));
      }
    }

    console.log('All companies have been processed');
    console.log(
      `Final stats: Processed: ${stats.processed}, Updated: ${stats.updated}, No Data: ${stats.noData}, Errors: ${stats.errors}, Total Balance Sheet Years: ${stats.totalYears}`
    );
  } catch (error) {
    console.error('Error in updateAllCompanies:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log('MongoDB connection closed');
    }
  }
}

// Run the main function
updateAllCompanies()
  .then(() => console.log('Script completed'))
  .catch((error) => console.error('Script failed:', error));
