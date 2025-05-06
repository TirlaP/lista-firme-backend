const DataLoader = require('dataloader');
const { Company, CAEN, Location, CompanyStat } = require('../models');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');
const NodeCache = require('node-cache');
const mongoose = require('mongoose');
const { filterCompaniesByLocation } = require('./location.resolver');

const caenCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const locationCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const companyCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const countCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

const companyLoader = new DataLoader(
  async (cuis) => {
    const companies = await Company.find({ cui: { $in: cuis } }).lean();
    return cuis.map((cui) => {
      const company = companies.find((c) => c.cui === cui);
      if (company) {
        companyCache.set(`company_${cui}`, company);
      }
      return company || null;
    });
  },
  {
    cacheKeyFn: (key) => `company_${key}`,
    batch: true,
    maxBatchSize: 100,
  }
);

async function initializeCAENCodes() {
  try {
    const cacheKey = 'all_caen_codes';
    if (!caenCache.has(cacheKey)) {
      const codes = await CAEN.find({}).lean();
      const caenMap = {};
      codes.forEach((code) => {
        caenMap[code.code] = code;
        caenCache.set(`caen_${code.code}`, code);
      });
      caenCache.set(cacheKey, caenMap);
      logger.info('CAEN codes cache initialized with', codes.length, 'entries');
    }
  } catch (error) {
    logger.error('Failed to initialize CAEN codes:', error);
  }
}

async function initializeLocationData() {
  try {
    const cacheKey = 'all_locations';
    if (!locationCache.has(cacheKey)) {
      const locations = await Location.find({}).lean();

      const counties = locations.filter((loc) => loc.is_county);
      counties.forEach((county) => {
        locationCache.set(`county_${county.code}`, county);
        locationCache.set(`county_name_${county.name.toLowerCase()}`, county);
        county.aliases?.forEach((alias) => {
          locationCache.set(`county_name_${alias.toLowerCase()}`, county);
        });
      });

      const cities = locations.filter((loc) => !loc.is_county);
      cities.forEach((city) => {
        locationCache.set(`city_${city.code}`, city);
        locationCache.set(`city_name_${city.name.toLowerCase()}`, city);
        city.aliases?.forEach((alias) => {
          locationCache.set(`city_name_${alias.toLowerCase()}`, city);
        });
      });

      const cityByCounty = {};
      cities.forEach((city) => {
        if (!cityByCounty[city.county_code]) {
          cityByCounty[city.county_code] = [];
        }
        cityByCounty[city.county_code].push(city);
      });

      Object.entries(cityByCounty).forEach(([countyCode, cities]) => {
        locationCache.set(`cities_by_county_${countyCode}`, cities);
      });

      locationCache.set(cacheKey, locations);
      logger.info('Location cache initialized with', locations.length, 'entries');
    }
  } catch (error) {
    logger.error('Failed to initialize location cache:', error);
  }
}

initializeCAENCodes();
initializeLocationData();

async function getCaenData(code) {
  if (!code) return null;

  const cacheKey = `caen_${code}`;
  let caenData = caenCache.get(cacheKey);

  if (!caenData) {
    const allCodes = caenCache.get('all_caen_codes');
    if (allCodes && allCodes[code]) {
      caenData = allCodes[code];
    } else {
      caenData = await CAEN.findOne({ code }).lean();
      if (caenData) {
        caenCache.set(cacheKey, caenData);
      }
    }
  }

  return caenData;
}

const encodeCursor = (fieldName, fieldValue) =>
  Buffer.from(JSON.stringify({ fieldName, fieldValue }), 'utf8').toString('base64');

const decodeCursor = (cursor) => {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  } catch (e) {
    logger.error('Error decoding cursor:', e);
    return null;
  }
};

const getValueForSortField = (company, fieldName) =>
  fieldName.split('.').reduce((acc, key) => (acc ? acc[key] : null), company) || null;

const transformCompany = async (company) => {
  if (!company) return null;

  let caenData = null;
  if (company.cod_CAEN) {
    caenData = await getCaenData(company.cod_CAEN);
  }

  return {
    cui: company.cui || 0,
    nume: company.denumire || (company.date_generale && company.date_generale.denumire) || '',
    denumire: company.denumire || (company.date_generale && company.date_generale.denumire) || '',
    adresa: {
      strada: company.adresa?.strada || company.adresa_anaf?.sediu_social?.sdenumire_Strada || '',
      numar: company.adresa?.numar || company.adresa_anaf?.sediu_social?.snumar_Strada || '',
      localitate: company.adresa?.localitate || company.adresa_anaf?.sediu_social?.sdenumire_Localitate || '',
      judet: company.adresa?.judet || company.adresa_anaf?.sediu_social?.sdenumire_Judet || '',
      cod_postal: company.adresa?.cod_postal || company.adresa_anaf?.sediu_social?.scod_Postal || '',
      tara: company.adresa?.tara || company.adresa_anaf?.sediu_social?.stara || 'România',
      cod_judet: company.adresa_anaf?.sediu_social?.scod_Judet || '',
      cod_judet_auto: company.adresa_anaf?.sediu_social?.scod_JudetAuto || '',
      cod_localitate: company.adresa_anaf?.sediu_social?.scod_Localitate || '',
    },
    adresa_completa: company.adresa?.completa || '',
    contact: {
      email: company.date_generale?.email || '',
      telefon: company.date_generale?.telefon || '',
      fax: company.date_generale?.fax || '',
      website: company.date_generale?.website || '',
    },
    cod_CAEN: company.cod_CAEN || '',
    inregistrare: {
      numar: company.cod_inmatriculare || (company.date_generale && company.date_generale.nrRegCom) || '',
      stare: company.date_generale?.stare_inregistrare || '',
      data: company.date_generale?.data_inregistrare || '',
      organ_fiscal: company.date_generale?.organFiscalCompetent || '',
    },
    tip_firma: {
      forma_juridica: company.date_generale?.forma_juridica || '',
      forma_organizare: company.date_generale?.forma_organizare || '',
      forma_proprietate: company.date_generale?.forma_de_proprietate || '',
    },
    caen: caenData
      ? {
          code: caenData.code,
          name: caenData.name,
          section: caenData.section_name,
          division: caenData.division_name,
        }
      : null,
    date_generale: company.date_generale || {},
  };
};

const buildDateFilter = (timeRange, customStartDate, customEndDate) => {
  let start = customStartDate ? new Date(customStartDate) : new Date();
  let end = customEndDate ? new Date(customEndDate) : new Date();

  if (!customStartDate || !customEndDate) {
    switch (timeRange) {
      case 'TODAY':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'YESTERDAY':
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setHours(23, 59, 59, 999);
        break;
      case 'LAST7DAYS':
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'LAST30DAYS':
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
    }
  }

  return { $gte: start.toISOString().split('T')[0], $lte: end.toISOString().split('T')[0] };
};

async function transformExportCompany(company) {
  const anafAddress = company.adresa_anaf?.sediu_social;
  const dateGenerale = company.date_generale;

  let caenName = '';
  if (company.cod_CAEN) {
    const caenData = await getCaenData(company.cod_CAEN);
    caenName = caenData?.name || '';
  }

  const completeAddress = formatAddress(anafAddress);

  return {
    cui: company.cui,
    denumire: company.denumire,
    cod_caen: company.cod_CAEN || '',
    activitate_caen: caenName,
    nr_inregistrare: company.cod_inmatriculare || dateGenerale?.nrRegCom || '',
    telefon: dateGenerale?.telefon || '',
    email: dateGenerale?.email || '',
    website: dateGenerale?.website || '',
    fax: dateGenerale?.fax || '',
    adresa_completa: completeAddress,
    judet: anafAddress?.sdenumire_Judet || '',
    localitate: anafAddress?.sdenumire_Localitate || '',
    strada: anafAddress?.sdenumire_Strada || '',
    numar: anafAddress?.snumar_Strada || '',
    cod_postal: anafAddress?.scod_Postal || '',
    stare_inregistrare: dateGenerale?.stare_inregistrare || '',
    data_inregistrare: dateGenerale?.data_inregistrare || '',
    organ_fiscal: dateGenerale?.organFiscalCompetent || '',
    forma_juridica: dateGenerale?.forma_juridica || '',
    forma_organizare: dateGenerale?.forma_organizare || '',
    forma_proprietate: dateGenerale?.forma_de_proprietate || '',
  };
}

const formatAddress = (anafAddress) => {
  if (!anafAddress) return '';

  const parts = [];
  if (anafAddress.sdenumire_Strada?.trim()) parts.push(anafAddress.sdenumire_Strada.trim());
  if (anafAddress.snumar_Strada?.trim()) parts.push(`Nr. ${anafAddress.snumar_Strada.trim()}`);
  if (anafAddress.sdetalii_Adresa?.trim()) parts.push(anafAddress.sdetalii_Adresa.trim());
  if (anafAddress.sdenumire_Localitate?.trim()) parts.push(anafAddress.sdenumire_Localitate.trim());
  if (anafAddress.sdenumire_Judet?.trim()) parts.push(`Jud. ${anafAddress.sdenumire_Judet.trim()}`);
  if (anafAddress.scod_Postal?.trim()) parts.push(`CP ${anafAddress.scod_Postal.trim()}`);

  return parts.join(', ');
};

const createExcelWorkbook = async (companies) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Companies');

  worksheet.columns = [
    { header: 'CUI', key: 'cui', width: 12 },
    { header: 'Denumire', key: 'denumire', width: 40 },
    { header: 'Cod CAEN', key: 'cod_caen', width: 12 },
    { header: 'Activitate CAEN', key: 'activitate_caen', width: 40 },
    { header: 'Nr. Înregistrare', key: 'nr_inregistrare', width: 15 },
    { header: 'Telefon', key: 'telefon', width: 15 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Website', key: 'website', width: 25 },
    { header: 'Fax', key: 'fax', width: 15 },
    { header: 'Adresă Completă', key: 'adresa_completa', width: 50 },
    { header: 'Județ', key: 'judet', width: 15 },
    { header: 'Localitate', key: 'localitate', width: 20 },
    { header: 'Stradă', key: 'strada', width: 30 },
    { header: 'Număr', key: 'numar', width: 10 },
    { header: 'Cod Poștal', key: 'cod_postal', width: 12 },
    { header: 'Stare Înregistrare', key: 'stare_inregistrare', width: 20 },
    { header: 'Data Înregistrare', key: 'data_inregistrare', width: 15 },
    { header: 'Organ Fiscal', key: 'organ_fiscal', width: 30 },
    { header: 'Formă Juridică', key: 'forma_juridica', width: 20 },
    { header: 'Formă Organizare', key: 'forma_organizare', width: 20 },
    { header: 'Formă Proprietate', key: 'forma_proprietate', width: 20 },
  ];

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  const batchSize = 500;
  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);
    const transformedBatch = await Promise.all(batch.map(transformExportCompany));

    for (const company of transformedBatch) {
      worksheet.addRow(company);
    }
  }

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });
  });

  return workbook;
};

const createCsvContent = async (companies) => {
  const batchSize = 500;
  let allTransformedCompanies = [];

  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);
    const transformedBatch = await Promise.all(batch.map(transformExportCompany));
    allTransformedCompanies = [...allTransformedCompanies, ...transformedBatch];
  }

  const fields = [
    { label: 'CUI', value: 'cui' },
    { label: 'Denumire', value: 'denumire' },
    { label: 'Cod CAEN', value: 'cod_caen' },
    { label: 'Activitate CAEN', value: 'activitate_caen' },
    { label: 'Nr. Înregistrare', value: 'nr_inregistrare' },
    { label: 'Telefon', value: 'telefon' },
    { label: 'Email', value: 'email' },
    { label: 'Website', value: 'website' },
    { label: 'Fax', value: 'fax' },
    { label: 'Adresă Completă', value: 'adresa_completa' },
    { label: 'Județ', value: 'judet' },
    { label: 'Localitate', value: 'localitate' },
    { label: 'Stradă', value: 'strada' },
    { label: 'Număr', value: 'numar' },
    { label: 'Cod Poștal', value: 'cod_postal' },
    { label: 'Stare Înregistrare', value: 'stare_inregistrare' },
    { label: 'Data Înregistrare', value: 'data_inregistrare' },
    { label: 'Organ Fiscal', value: 'organ_fiscal' },
    { label: 'Formă Juridică', value: 'forma_juridica' },
    { label: 'Formă Organizare', value: 'forma_organizare' },
    { label: 'Formă Proprietate', value: 'forma_proprietate' },
  ];

  const parser = new Parser({
    fields,
    header: true,
    delimiter: ',',
    quote: '"',
  });

  return parser.parse(allTransformedCompanies);
};

const resolvers = {
  Query: {
    companies: async (_, { input }) => {
      try {
        const startTime = Date.now();
        logger.info('Received companies query input:', input);
        const {
          first = 50,
          after,
          cod_CAEN,
          caen_codes,
          judet,
          oras,
          hasWebsite,
          hasEmail,
          hasPhone,
          hasAdmin,
          stare,
          cifraAfaceriMin,
          cifraAfaceriMax,
          profitMin,
          profitMax,
          angajatiMin,
          angajatiMax,
          anInfiintareMin,
          anInfiintareMax,
          sortBy,
        } = input;

        let filter = {};
        const conditions = [];

        if (caen_codes && caen_codes.length > 0) {
          conditions.push({ cod_CAEN: { $in: caen_codes } });
        } else if (cod_CAEN) {
          conditions.push({ cod_CAEN });
        }

        if (stare) {
          // Create a more robust system for filtering by company status
          // based on the same logic used in populateStats.js

          switch (stare) {
            case 'Funcțională':
              // A company is functional if it's not inactive, not dissolved, and not radiated
              conditions.push({
                $and: [
                  {
                    $or: [
                      { 'stare_inactiv.statusInactivi': { $ne: true } },
                      { 'stare_inactiv.statusInactivi': { $exists: false } },
                    ],
                  },
                  {
                    $or: [
                      { 'date_generale.stare_inregistrare': { $not: { $regex: 'RADIERE', $options: 'i' } } },
                      { 'date_generale.stare_inregistrare': { $exists: false } },
                    ],
                  },
                  {
                    $or: [
                      { 'date_generale.stare_inregistrare': { $not: { $regex: 'DIZOLVARE', $options: 'i' } } },
                      { 'date_generale.stare_inregistrare': { $exists: false } },
                    ],
                  },
                  {
                    $or: [
                      { 'date_generale.stare_inregistrare': { $not: { $regex: 'SUSPENDARE ACTIVITATE', $options: 'i' } } },
                      { 'date_generale.stare_inregistrare': { $exists: false } },
                    ],
                  },
                ],
              });
              break;

            case 'Inactivă':
              // Based on deriveStatus function logic
              conditions.push({
                $and: [
                  { 'stare_inactiv.statusInactivi': true },
                  {
                    $or: [
                      { 'date_generale.stare_inregistrare': { $regex: 'INREGISTRAT', $options: 'i' } },
                      { 'date_generale.stare_inregistrare': { $regex: 'TRANSFER', $options: 'i' } },
                    ],
                  },
                ],
              });
              break;

            case 'Întrerupere temporară de activitate':
              conditions.push({
                $and: [
                  { 'stare_inactiv.statusInactivi': true },
                  { 'date_generale.stare_inregistrare': { $regex: 'SUSPENDARE ACTIVITATE', $options: 'i' } },
                ],
              });
              break;

            case 'Radiată':
              conditions.push({
                'date_generale.stare_inregistrare': { $regex: 'RADIERE', $options: 'i' },
              });
              break;

            case 'Dizolvare':
              conditions.push({
                'date_generale.stare_inregistrare': { $regex: 'DIZOLVARE', $options: 'i' },
              });
              break;

            default:
              // If none of the specific cases match, try a direct match on stare_firma
              // This handles cases where stare_firma might be stored as a direct value
              try {
                const stareRegex = new RegExp(stare, 'i');
                conditions.push({ stare_firma: stareRegex });
              } catch (error) {
                logger.error(`Invalid regex for stare filter: ${stare}`, error);
                // Fallback to exact match if regex construction fails
                conditions.push({ stare_firma: stare });
              }
          }
        }

        if (cifraAfaceriMin !== undefined || cifraAfaceriMax !== undefined) {
          const cifraFilter = {};
          if (cifraAfaceriMin !== undefined) cifraFilter.$gte = cifraAfaceriMin;
          if (cifraAfaceriMax !== undefined) cifraFilter.$lte = cifraAfaceriMax;
          conditions.push({ 'date_generale.cifra_afaceri': cifraFilter });
        }

        if (profitMin !== undefined || profitMax !== undefined) {
          const profitFilter = {};
          if (profitMin !== undefined) profitFilter.$gte = profitMin;
          if (profitMax !== undefined) profitFilter.$lte = profitMax;
          conditions.push({ 'date_generale.profit': profitFilter });
        }

        if (angajatiMin !== undefined || angajatiMax !== undefined) {
          const angajatiFilter = {};
          if (angajatiMin !== undefined) angajatiFilter.$gte = angajatiMin;
          if (angajatiMax !== undefined) angajatiFilter.$lte = angajatiMax;
          conditions.push({ 'date_generale.numar_angajati': angajatiFilter });
        }

        if (anInfiintareMin !== undefined || anInfiintareMax !== undefined) {
          const minDate = anInfiintareMin ? `${anInfiintareMin}-01-01` : '1900-01-01';
          const maxDate = anInfiintareMax ? `${anInfiintareMax}-12-31` : '2099-12-31';
          conditions.push({
            'date_generale.data_inregistrare': {
              $gte: minDate,
              $lte: maxDate,
            },
          });
        }

        // Apply location filtering using our helper function
        if (judet || oras) {
          if (conditions.length > 0) {
            filter = { $and: conditions };
          }

          // This is the key change - use the new filter function
          filter = await filterCompaniesByLocation(filter, judet, oras);
        } else if (conditions.length > 0) {
          filter = { $and: conditions };
        }

        if (hasWebsite === true) {
          if (filter.$and) {
            filter.$and.push({
              'date_generale.website': { $exists: true, $ne: '' },
            });
          } else {
            filter = {
              $and: [...(filter.$and || []), { 'date_generale.website': { $exists: true, $ne: '' } }],
            };
          }
        }

        if (hasEmail === true) {
          if (filter.$and) {
            filter.$and.push({
              'date_generale.email': { $exists: true, $ne: '' },
            });
          } else {
            filter = {
              $and: [...(filter.$and || []), { 'date_generale.email': { $exists: true, $ne: '' } }],
            };
          }
        }

        if (hasPhone === true) {
          if (filter.$and) {
            filter.$and.push({
              'date_generale.telefon': { $exists: true, $ne: '' },
            });
          } else {
            filter = {
              $and: [...(filter.$and || []), { 'date_generale.telefon': { $exists: true, $ne: '' } }],
            };
          }
        }

        if (hasAdmin === true) {
          if (filter.$and) {
            filter.$and.push({
              'date_generale.administrators': { $exists: true, $not: { $size: 0 } },
            });
          } else {
            filter = {
              $and: [...(filter.$and || []), { 'date_generale.administrators': { $exists: true, $not: { $size: 0 } } }],
            };
          }
        }

        let fieldName = 'date_generale.data_inregistrare';
        let direction = sortBy?.direction === 'DESC' ? -1 : 1;

        if (sortBy) {
          switch (sortBy.field) {
            case 'REGISTRATION_DATE':
              fieldName = 'date_generale.data_inregistrare';
              break;
            case 'CUI':
              fieldName = 'cui';
              break;
            case 'NUME':
              fieldName = 'denumire';
              break;
          }
        }

        if (after) {
          const cur = decodeCursor(after);
          if (cur && cur.fieldName === fieldName) {
            const comparisonOperator = direction === 1 ? '$gt' : '$lt';
            const cursorFilter = {
              [fieldName]: { [comparisonOperator]: cur.fieldValue },
            };

            if (filter.$and) {
              filter.$and.push(cursorFilter);
            } else {
              filter = {
                $and: [...(filter.$and || []), cursorFilter],
              };
            }
          }
        }

        const sortObj = { [fieldName]: direction };

        const countCacheKey = `count_${JSON.stringify(filter)}`;
        let totalCount = countCache.get(countCacheKey);

        if (totalCount === undefined) {
          totalCount = await Company.countDocuments(filter);
          countCache.set(countCacheKey, totalCount);
        }

        const results = await Company.find(filter)
          .sort(sortObj)
          .limit(first + 1)
          .lean({ virtuals: false })
          .exec();

        const hasNextPage = results.length > first;

        const edgesPromises = results.slice(0, first).map(async (company) => {
          const val = getValueForSortField(company, fieldName);
          const fieldValue = val instanceof Date ? val.toISOString() : val || '';
          const node = await transformCompany(company);
          return {
            node,
            cursor: encodeCursor(fieldName, fieldValue),
          };
        });

        const edges = await Promise.all(edgesPromises);

        const endTime = Date.now();
        logger.info(
          `Query completed in ${endTime - startTime}ms, returned ${edges.length} results out of ${totalCount} total matches`
        );

        return {
          edges,
          pageInfo: {
            hasNextPage,
            endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
          },
          totalCount,
        };
      } catch (error) {
        logger.error('Error in companies query:', error);
        throw error;
      }
    },

    latestCompanies: async (_, { input }) => {
      try {
        const startTime = Date.now();
        logger.info('LatestCompanies input:', input);

        const { first = 50, after, timeRange = 'LAST7DAYS', sortBy, customStartDate, customEndDate, judet, oras } = input;

        const dateFilter = buildDateFilter(timeRange, customStartDate, customEndDate);
        let filter = { 'date_generale.data_inregistrare': dateFilter };

        // Add location filtering
        if (judet || oras) {
          filter = await filterCompaniesByLocation(filter, judet, oras);
        }

        let fieldName = 'date_generale.data_inregistrare';
        let direction = sortBy && sortBy.direction === 'ASC' ? 1 : -1;

        if (sortBy) {
          if (sortBy.field === 'CUI') fieldName = 'cui';
          else if (sortBy.field === 'NUME') fieldName = 'denumire';
        }

        if (after) {
          const cur = decodeCursor(after);
          if (cur && cur.fieldName === fieldName) {
            const comparisonOperator = direction === 1 ? '$gt' : '$lt';
            filter[fieldName] = {
              ...filter[fieldName],
              [comparisonOperator]: cur.fieldValue,
            };
          }
        }

        const sortObj = { [fieldName]: direction };

        const countCacheKey = `latest_count_${JSON.stringify(filter)}`;
        let totalCount = countCache.get(countCacheKey);

        if (totalCount === undefined) {
          totalCount = await Company.countDocuments(filter);
          countCache.set(countCacheKey, totalCount);
        }

        const results = await Company.find(filter)
          .sort(sortObj)
          .limit(first + 1)
          .lean({ virtuals: false })
          .exec();

        const hasNextPage = results.length > first;

        const edgesPromises = results.slice(0, first).map(async (company) => {
          const val = getValueForSortField(company, fieldName);
          const fieldValue = val instanceof Date ? val.toISOString() : val || '';
          const node = await transformCompany(company);
          return {
            node,
            cursor: encodeCursor(fieldName, fieldValue),
          };
        });

        const edges = await Promise.all(edgesPromises);

        const endTime = Date.now();
        logger.info(`Latest companies query completed in ${endTime - startTime}ms, returned ${edges.length} results`);

        return {
          edges,
          pageInfo: {
            hasNextPage,
            endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
          },
          totalCount,
        };
      } catch (error) {
        logger.error('Error in latestCompanies resolver:', error);
        return { edges: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0 };
      }
    },

    // Additional resolvers remain the same...
    latestCompaniesStats: async (_, { input }) => {
      try {
        const { timeRange, customStartDate, customEndDate, judet, oras } = input;
        const { $gte: start, $lte: end } = buildDateFilter(timeRange, customStartDate, customEndDate);

        const statsCacheKey = `stats_${timeRange}_${start}_${end}_${judet || ''}_${oras || ''}`;
        const cachedStats = countCache.get(statsCacheKey);

        if (cachedStats) {
          return cachedStats;
        }

        // Build the match stage with date filter
        let matchStage = {
          'date_generale.data_inregistrare': { $gte: start, $lte: end },
        };

        // Add location filtering if needed
        if (judet || oras) {
          let locationFilter = {};
          locationFilter = await filterCompaniesByLocation(locationFilter, judet, oras);

          // Merge the location filter with the match stage
          if (locationFilter.$and) {
            if (!matchStage.$and) matchStage.$and = [];
            matchStage.$and = [...matchStage.$and, ...locationFilter.$and];
          }
        }

        const pipeline = [
          {
            $match: matchStage,
          },
          {
            $facet: {
              totalNew: [{ $count: 'count' }],
              topCAEN: [
                { $group: { _id: '$cod_CAEN', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 },
                { $project: { code: '$_id', count: 1, _id: 0 } },
              ],
              topLocations: [
                {
                  $group: {
                    _id: '$adresa_anaf.sediu_social.sdenumire_Judet',
                    count: { $sum: 1 },
                  },
                },
                { $sort: { count: -1 } },
                { $limit: 5 },
                { $project: { location: '$_id', count: 1, _id: 0 } },
              ],
              dailyTrend: [
                {
                  $group: {
                    _id: '$date_generale.data_inregistrare',
                    count: { $sum: 1 },
                  },
                },
                { $sort: { _id: -1 } },
                { $limit: 7 },
                { $project: { date: '$_id', count: 1, _id: 0 } },
              ],
            },
          },
        ];

        const [result] = await Company.aggregate(pipeline).allowDiskUse(true);

        if (!result) throw new Error('Aggregation failed');

        const stats = {
          totalNew: result.totalNew[0]?.count || 0,
          topCAEN: result.topCAEN || [],
          topLocations: result.topLocations || [],
          dailyTrend: result.dailyTrend || [],
          timeRange: input.timeRange || 'LAST7DAYS',
          dateRange: {
            from: new Date(start).toISOString(),
            to: new Date(end).toISOString(),
          },
        };

        countCache.set(statsCacheKey, stats, 300);

        return stats;
      } catch (error) {
        logger.error('Error in latestCompaniesStats resolver:', error);
        throw error;
      }
    },

    company: async (_, { cui }) => {
      try {
        const cacheKey = `company_${cui}`;
        let company = companyCache.get(cacheKey);

        if (!company) {
          company = await companyLoader.load(cui);
        }

        return transformCompany(company);
      } catch (error) {
        logger.error(`Error fetching company with CUI ${cui}:`, error);
        return null;
      }
    },

    companyStats: async () => {
      try {
        const statsCacheKey = 'overall_company_stats';
        const cachedStats = countCache.get(statsCacheKey);

        if (cachedStats) {
          return cachedStats;
        }

        const [totalCompanies, activeCompanies, withWebsite, withContact] = await Promise.all([
          Company.estimatedDocumentCount(),
          Company.countDocuments({ stare_firma: '1' }),
          Company.countDocuments({ 'date_generale.website': { $exists: true, $ne: '' } }),
          Company.countDocuments({
            $or: [
              { 'date_generale.telefon': { $exists: true, $ne: '' } },
              { 'date_generale.email': { $exists: true, $ne: '' } },
            ],
          }),
        ]);

        const stats = {
          totalCompanies,
          activeCompanies,
          withWebsite,
          withContact,
        };

        countCache.set(statsCacheKey, stats, 3600);

        return stats;
      } catch (error) {
        logger.error('Error in companyStats resolver:', error);
        throw error;
      }
    },

    companyStatsByStatus: async () => {
      try {
        const statsCacheKey = 'company_stats_by_status';
        const cachedStats = countCache.get(statsCacheKey);

        if (cachedStats) {
          return cachedStats;
        }

        const stats = await CompanyStat.find().sort({ count: -1 }).lean();

        countCache.set(statsCacheKey, stats, 3600);

        return stats;
      } catch (error) {
        logger.error('Error in companyStatsByStatus resolver:', error);
        return [];
      }
    },

    autocomplete: async (_, { text }) => {
      try {
        if (!text || text.length < 2) {
          return [];
        }

        const filter = /^\d+$/.test(text) ? { cui: parseInt(text, 10) } : { denumire: { $regex: text, $options: 'i' } };

        const results = await Company.find(filter)
          .limit(10)
          .select('cui denumire adresa adresa_anaf date_generale cod_inmatriculare')
          .lean()
          .exec();

        return results.map((c) => ({
          companyId: c.cod_inmatriculare || '',
          companyName: c.denumire || '',
          locality: c.adresa?.localitate || c.adresa_anaf?.sediu_social?.sdenumire_Localitate || '',
          county: c.adresa?.judet || c.adresa_anaf?.sediu_social?.sdenumire_Judet || '',
          streetName: c.adresa?.strada || c.adresa_anaf?.sediu_social?.sdenumire_Strada || '',
          streetNr: c.adresa?.numar || c.adresa_anaf?.sediu_social?.snumar_Strada || '',
          block: null,
          VAT: !!(c.date_generale && c.date_generale.nrRegCom),
          staircase: null,
          apartment: null,
          taxId: c.cui ? c.cui.toString() : '',
          status: (c.date_generale && c.date_generale.stare_inregistrare) || '',
        }));
      } catch (error) {
        logger.error('Error in autocomplete resolver:', error);
        return [];
      }
    },
  },

  Mutation: {
    exportCompanies: async (_, { input }) => {
      try {
        const { cod_CAEN, caen_codes, judet, oras, hasWebsite, hasEmail, hasPhone, hasAdmin, stare, format } = input;

        // Start with an empty filter
        let filter = {};
        const conditions = [];

        // Apply standard filters
        if (caen_codes && caen_codes.length > 0) {
          conditions.push({ cod_CAEN: { $in: caen_codes } });
        } else if (cod_CAEN) {
          conditions.push({ cod_CAEN });
        }

        if (stare) {
          conditions.push({ stare_firma: { $regex: stare } });
        }

        // Apply location filters
        if (judet || oras) {
          if (conditions.length > 0) {
            filter = { $and: conditions };
          }
          filter = await filterCompaniesByLocation(filter, judet, oras);
        } else if (conditions.length > 0) {
          filter = { $and: conditions };
        }

        // Apply contact-related filters
        if (hasWebsite) {
          if (filter.$and) {
            filter.$and.push({ 'date_generale.website': { $exists: true, $ne: '' } });
          } else {
            filter = { $and: [{ 'date_generale.website': { $exists: true, $ne: '' } }] };
          }
        }

        if (hasEmail) {
          if (filter.$and) {
            filter.$and.push({ 'date_generale.email': { $exists: true, $ne: '' } });
          } else {
            filter = { $and: [{ 'date_generale.email': { $exists: true, $ne: '' } }] };
          }
        }

        if (hasPhone) {
          if (filter.$and) {
            filter.$and.push({ 'date_generale.telefon': { $exists: true, $ne: '' } });
          } else {
            filter = { $and: [{ 'date_generale.telefon': { $exists: true, $ne: '' } }] };
          }
        }

        if (hasAdmin) {
          if (filter.$and) {
            filter.$and.push({ 'date_generale.administrators': { $exists: true, $not: { $size: 0 } } });
          } else {
            filter = { $and: [{ 'date_generale.administrators': { $exists: true, $not: { $size: 0 } } }] };
          }
        }

        const pageSize = 1000;
        const maxExportCount = 50000;

        const totalCount = await Company.countDocuments(filter);
        logger.info(`Exporting ${Math.min(totalCount, maxExportCount)} companies with filter:`, filter);

        let companies = [];
        let page = 1;

        while (companies.length < maxExportCount) {
          const batch = await Company.find(filter)
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .lean()
            .exec();

          if (batch.length === 0) break;

          companies = [...companies, ...batch];
          page++;

          if (companies.length >= maxExportCount) {
            companies = companies.slice(0, maxExportCount);
            break;
          }
        }

        const timestamp = Date.now();
        const uniqueId = uuidv4().substring(0, 8);
        const fileName = `export_${timestamp}_${uniqueId}`;

        let content;
        let mimeType;

        if (format === 'xlsx') {
          const workbook = await createExcelWorkbook(companies);
          const buffer = await workbook.xlsx.writeBuffer();
          content = buffer.toString('base64');
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else {
          const csvContent = await createCsvContent(companies);
          const bomPrefix = '\ufeff';
          content = bomPrefix + csvContent;
          mimeType = 'text/csv';
        }

        return {
          fileName: `companies_${fileName}.${format}`,
          content,
          mimeType,
        };
      } catch (error) {
        logger.error('Error in exportCompanies:', error);
        throw new Error(`Export failed: ${error.message}`);
      }
    },

    exportLatestCompanies: async (_, { input }) => {
      try {
        const { timeRange, customStartDate, customEndDate, format, judet, oras } = input;
        const dateFilter = buildDateFilter(timeRange, customStartDate, customEndDate);

        let filter = {
          'date_generale.data_inregistrare': dateFilter,
        };

        // Apply location filters
        if (judet || oras) {
          filter = await filterCompaniesByLocation(filter, judet, oras);
        }

        const totalCount = await Company.countDocuments(filter);
        const maxExportCount = 50000;
        logger.info(`Exporting ${Math.min(totalCount, maxExportCount)} latest companies`);

        const pipeline = [
          {
            $match: filter,
          },
          {
            $sort: {
              'date_generale.data_inregistrare': -1,
              cui: 1,
            },
          },
          {
            $limit: maxExportCount,
          },
        ];

        const companies = await Company.aggregate(pipeline).allowDiskUse(true);

        const timestamp = Date.now();
        const fileName = `latest_companies_${timestamp}`;

        let content;
        let mimeType;

        if (format === 'xlsx') {
          const workbook = await createExcelWorkbook(companies);
          const buffer = await workbook.xlsx.writeBuffer();
          content = buffer.toString('base64');
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else {
          const csvContent = await createCsvContent(companies);
          const bomPrefix = '\ufeff';
          content = bomPrefix + csvContent;
          mimeType = 'text/csv';
        }

        return {
          fileName: `latest_companies_${fileName}.${format}`,
          content,
          mimeType,
        };
      } catch (error) {
        logger.error('Error in exportLatestCompanies:', error);
        throw new Error(`Export failed: ${error.message}`);
      }
    },
  },
};

module.exports = resolvers;
