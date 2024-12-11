const fs = require('fs');
const { Pool } = require('pg');
const JSONStream = require('JSONStream');
const es = require('event-stream');
require('dotenv').config();

const BATCH_SIZE = 1000;
const PROGRESS_INTERVAL = 1000;

const pgConfig = {
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || 'lista-firme-postgres.cjk0ak0gyv0p.us-east-1.rds.amazonaws.com',
  database: process.env.POSTGRES_DB || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'C6779d3cc6779d3c!',
  port: process.env.POSTGRES_PORT || 5432,
  max: 10,
};

// First, let's fix the table schema
async function setupTable() {
  const pool = new Pool(pgConfig);
  try {
    logWithTime('INFO', 'Updating table schema...');
    await pool.query(`
      DROP TABLE IF EXISTS companies;
      CREATE TABLE companies (
        id SERIAL PRIMARY KEY,
        cui INTEGER UNIQUE NOT NULL,
        denumire TEXT NOT NULL,
        cod_inmatriculare TEXT,
        stare_firma TEXT,
        cod_caen TEXT,
        e_factura BOOLEAN DEFAULT FALSE,
        platitor_tva BOOLEAN DEFAULT FALSE,
        tva_incasare BOOLEAN DEFAULT FALSE,
        last_updated TIMESTAMP,
        adresa_completa TEXT,
        adresa_tara TEXT,
        adresa_localitate TEXT,
        adresa_judet TEXT,
        adresa_strada TEXT,
        adresa_numar TEXT,
        adresa_bloc TEXT,
        adresa_scara TEXT,
        adresa_etaj TEXT,
        adresa_apartament TEXT,
        adresa_cod_postal TEXT,
        adresa_sector TEXT,
        adresa_anaf JSONB DEFAULT '{}'::jsonb,
        date_generale JSONB DEFAULT '{}'::jsonb,
        split_tva JSONB DEFAULT '{}'::jsonb,
        stare_inactiv JSONB DEFAULT '{}'::jsonb
      );

      CREATE INDEX idx_companies_cui ON companies(cui);
      CREATE INDEX idx_companies_denumire ON companies(denumire);
      CREATE INDEX idx_companies_cod_caen ON companies(cod_caen);
    `);
    logWithTime('INFO', 'Table schema updated successfully');
  } finally {
    await pool.end();
  }
}

function logWithTime(type, message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${type}: ${message}`);
}

function sanitizeValue(value) {
  if (value === null || value === undefined) return null;
  return String(value)
    .replace(/[\n\r\t]/g, ' ')
    .substring(0, 1000000); // Prevent extreme lengths
}

async function processBatch(companies, pool) {
  const client = await pool.connect();
  try {
    // Use parameterized query to avoid SQL injection and syntax issues
    const valuesList = companies
      .map((_, index) => {
        const offset = index * 25;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, 
              $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10},
              $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15},
              $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20},
              $${offset + 21}, $${offset + 22}, $${offset + 23}, $${offset + 24}, $${offset + 25})`;
      })
      .join(',');

    const query = `
      INSERT INTO companies (
        cui, denumire, cod_inmatriculare, stare_firma, cod_caen,
        e_factura, platitor_tva, tva_incasare, last_updated,
        adresa_completa, adresa_tara, adresa_localitate, adresa_judet,
        adresa_strada, adresa_numar, adresa_bloc, adresa_scara,
        adresa_etaj, adresa_apartament, adresa_cod_postal, adresa_sector,
        adresa_anaf, date_generale, split_tva, stare_inactiv
      )
      VALUES ${valuesList}
      ON CONFLICT (cui) DO NOTHING
    `;

    const params = companies.flatMap((company) => [
      company.cui,
      sanitizeValue(company.denumire),
      sanitizeValue(company.cod_inmatriculare),
      sanitizeValue(company.stare_firma),
      sanitizeValue(company.cod_CAEN),
      company.e_factura || false,
      company.platitor_tva || false,
      company.tva_incasare || false,
      company.last_updated?.$date ? new Date(company.last_updated.$date) : null,
      sanitizeValue(company.adresa?.completa),
      sanitizeValue(company.adresa?.tara),
      sanitizeValue(company.adresa?.localitate),
      sanitizeValue(company.adresa?.judet),
      sanitizeValue(company.adresa?.strada),
      sanitizeValue(company.adresa?.numar),
      sanitizeValue(company.adresa?.bloc),
      sanitizeValue(company.adresa?.scara),
      sanitizeValue(company.adresa?.etaj),
      sanitizeValue(company.adresa?.apartament),
      sanitizeValue(company.adresa?.cod_postal),
      sanitizeValue(company.adresa?.sector),
      company.adresa_anaf ? JSON.stringify(company.adresa_anaf) : '{}',
      company.date_generale ? JSON.stringify(company.date_generale) : '{}',
      company.split_tva ? JSON.stringify(company.split_tva) : '{}',
      company.stare_inactiv ? JSON.stringify(company.stare_inactiv) : '{}',
    ]);

    await client.query('BEGIN');
    await client.query('SET LOCAL synchronous_commit TO off');
    await client.query(query, params);
    await client.query('COMMIT');
    return companies.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function migrate() {
  const pool = new Pool(pgConfig);
  const startTime = Date.now();
  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let currentBatch = [];

  try {
    const existingCUIs = new Set((await pool.query('SELECT cui FROM companies')).rows.map((r) => r.cui));
    logWithTime('INFO', `Found ${existingCUIs.size} existing records`);

    return new Promise((resolve, reject) => {
      const jsonStream = fs
        .createReadStream('lista-firme.companies.json', { encoding: 'utf8' })
        .pipe(JSONStream.parse('*'))
        .pipe(
          es.through(
            async function write(company) {
              this.pause();
              processedCount++;

              if (existingCUIs.has(company.cui)) {
                skippedCount++;
                this.resume();
                return;
              }

              currentBatch.push(company);

              if (currentBatch.length >= BATCH_SIZE) {
                try {
                  await processBatch(currentBatch, pool);
                  successCount += currentBatch.length;
                } catch (error) {
                  failedCount += currentBatch.length;
                  logWithTime('ERROR', `Failed to process batch: ${error.message}`);
                }

                if (processedCount % PROGRESS_INTERVAL === 0) {
                  const elapsedMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
                  const rate = (processedCount / elapsedMinutes).toFixed(2);
                  logWithTime(
                    'INFO',
                    `Processed ${processedCount} | Success: ${successCount} | ` +
                      `Failed: ${failedCount} | Skipped: ${skippedCount} | ` +
                      `Rate: ${rate} companies/minute`
                  );
                }

                currentBatch = [];
              }

              this.resume();
            },
            async function end() {
              if (currentBatch.length > 0) {
                try {
                  await processBatch(currentBatch, pool);
                  successCount += currentBatch.length;
                } catch (error) {
                  failedCount += currentBatch.length;
                  logWithTime('ERROR', `Failed to process final batch: ${error.message}`);
                }
              }

              const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
              logWithTime('SUCCESS', `Migration completed in ${duration} minutes`);
              logWithTime(
                'SUCCESS',
                `Final results - Success: ${successCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`
              );
              await pool.end();
              resolve();
            }
          )
        );

      jsonStream.on('error', async (error) => {
        await pool.end();
        reject(error);
      });
    });
  } catch (error) {
    logWithTime('ERROR', `Migration failed: ${error.message}`);
    await pool.end();
  }
}

// Run the migration
setupTable()
  .then(() => migrate())
  .catch((error) => {
    logWithTime('ERROR', `Unhandled error: ${error.message}`);
    process.exit(1);
  });
