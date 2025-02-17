// src/services/workers/company.worker.js
const { parentPort } = require('worker_threads');
const mongoose = require('mongoose');
const config = require('../../config/config');
const { Company } = require('../../models');
const logger = require('../../config/logger');

let connected = false;
let processing = false;

async function connectDB() {
  if (!connected) {
    try {
      await mongoose.connect(config.mongoose.url, config.mongoose.options);
      connected = true;
    } catch (error) {
      logger.error('Worker DB connection error:', error);
      throw error;
    }
  }
}

async function processCompanies({ filter, options, batchSize = 50, cacheKey, caenCodes }) {
  if (processing) {
    return parentPort.postMessage({
      type: 'ERROR',
      data: { error: 'Worker is busy processing another request' },
    });
  }

  processing = true;
  try {
    await connectDB();

    const { page = 1, limit = 10 } = options;

    // Get total count and calculate pages
    const totalCount = await Company.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limit);

    // Calculate batch boundaries
    const batchStartPage = Math.floor((page - 1) / batchSize) * batchSize + 1;
    const batchEndPage = Math.min(batchStartPage + batchSize - 1, totalPages);

    // Process all pages in the current batch
    for (let currentPage = batchStartPage; currentPage <= batchEndPage; currentPage++) {
      const skip = (currentPage - 1) * limit;

      const companies = await Company.find(filter)
        .select({
          cui: 1,
          denumire: 1,
          cod_CAEN: 1,
          cod_inmatriculare: 1,
          'adresa_anaf.sediu_social': 1,
          date_generale: 1,
        })
        .sort({ cui: 1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const results = companies.map((company) => transformCompany(company, caenCodes));

      const pageResults = {
        results,
        page: currentPage,
        limit,
        totalPages,
        totalResults: totalCount,
        isComplete: currentPage === batchEndPage,
      };

      // Send progress for each page
      parentPort.postMessage({
        type: 'PROGRESS',
        data: {
          ...pageResults,
          cacheKey: `${cacheKey}_${currentPage}`,
        },
      });

      // Small delay to prevent overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Send completion message
    parentPort.postMessage({
      type: 'COMPLETE',
      data: {
        cacheKey,
        batchStartPage,
        batchEndPage,
        totalPages,
        totalResults: totalCount,
      },
    });
  } catch (error) {
    parentPort.postMessage({
      type: 'ERROR',
      data: { error: error.message },
    });
  } finally {
    processing = false;
  }
}

function transformCompany(company, caenCodes = {}) {
  const anafAddress = company.adresa_anaf?.sediu_social;
  const dateGenerale = company.date_generale;
  const caenInfo = caenCodes[company.cod_CAEN];

  return {
    cui: company.cui,
    nume: company.denumire,
    adresa: {
      strada: anafAddress?.sdenumire_Strada || '',
      numar: anafAddress?.snumar_Strada || '',
      localitate: anafAddress?.sdenumire_Localitate || '',
      judet: anafAddress?.sdenumire_Judet || '',
      cod_postal: anafAddress?.scod_Postal || '',
      detalii: anafAddress?.sdetalii_Adresa || '',
      tara: anafAddress?.stara || 'România',
      cod_judet: anafAddress?.scod_Judet || '',
      cod_judet_auto: anafAddress?.scod_JudetAuto || '',
    },
    adresa_completa: formatAnafAddress(anafAddress),
    contact: {
      email: dateGenerale?.email || '',
      telefon: dateGenerale?.telefon || '',
      fax: dateGenerale?.fax || '',
      website: dateGenerale?.website || '',
    },
    cod_CAEN: company.cod_CAEN || '',
    inregistrare: {
      numar: company.cod_inmatriculare || dateGenerale?.nrRegCom || '',
      stare: dateGenerale?.stare_inregistrare || '',
      data: dateGenerale?.data_inregistrare || '',
      organ_fiscal: dateGenerale?.organFiscalCompetent || '',
    },
    tip_firma: {
      forma_juridica: dateGenerale?.forma_juridica || '',
      forma_organizare: dateGenerale?.forma_organizare || '',
      forma_proprietate: dateGenerale?.forma_de_proprietate || '',
    },
    caen: caenInfo
      ? {
          code: caenInfo.code,
          name: caenInfo.name,
          section: `${caenInfo.section_code} - ${caenInfo.section_name}`,
          division: `${caenInfo.division_code} - ${caenInfo.division_name}`,
        }
      : null,
  };
}

function formatAnafAddress(anafAddress) {
  if (!anafAddress) return '';

  const parts = [];
  if (anafAddress.sdenumire_Strada?.trim()) parts.push(anafAddress.sdenumire_Strada.trim());
  if (anafAddress.snumar_Strada?.trim()) parts.push(`Nr. ${anafAddress.snumar_Strada.trim()}`);
  if (anafAddress.sdenumire_Localitate?.trim()) parts.push(anafAddress.sdenumire_Localitate.trim());
  if (anafAddress.sdenumire_Judet?.trim()) parts.push(`Jud. ${anafAddress.sdenumire_Judet.trim()}`);
  return parts.join(', ');
}

// Message handler
parentPort.on('message', async (message) => {
  const { type, data, taskId } = message;

  try {
    switch (type) {
      case 'PROCESS_COMPANIES':
        await processCompanies(data);
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    parentPort.postMessage({
      type: 'ERROR',
      data: { error: error.message },
      taskId,
    });
  }
});

// Handle cleanup
process.on('SIGTERM', async () => {
  if (connected) {
    try {
      await mongoose.connection.close();
    } catch (error) {
      logger.error('Error closing worker DB connection:', error);
    }
  }
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in worker:', error);
  parentPort.postMessage({
    type: 'ERROR',
    data: { error: error.message },
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection in worker:', reason);
  parentPort.postMessage({
    type: 'ERROR',
    data: { error: reason?.message || 'Unknown error' },
  });
});
