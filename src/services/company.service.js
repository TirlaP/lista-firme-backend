// src/services/company.service.js
const logger = require('../config/logger');
const { Company, Location, CAEN } = require('../models');
const NodeCache = require('node-cache');

class CompanyService {
  constructor() {
    // Cache for companies (5 minutes) and for CAEN and location data (1 hour)
    this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    this.caenCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
    this.locationCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
    this.initializeCAENCodes();
  }

  async initializeCAENCodes() {
    try {
      const codes = await CAEN.find({}).lean();
      const caenMap = {};
      codes.forEach((code) => {
        caenMap[code.code] = code;
      });
      this.caenCache.set('caen-codes', caenMap);
    } catch (error) {
      logger.error('Failed to initialize CAEN codes:', error);
    }
  }

  async getCountyNameByCode(code) {
    let county = this.locationCache.get(`county_${code}`);
    if (!county) {
      county = await Location.findOne({ code, type: 'county' }).lean();
      logger.info('Found county:', county);
      if (county) {
        this.locationCache.set(`county_${code}`, county);
      }
    }
    return county?.name;
  }

  async getCityNameByCode(code) {
    let city = this.locationCache.get(`city_${code}`);
    if (!city) {
      city = await Location.findOne({
        code,
        type: { $in: ['city', 'municipality', 'sector'] },
      }).lean();
      logger.info('Found city:', city);
      if (city) {
        this.locationCache.set(`city_${code}`, city);
      }
    }
    return city?.name;
  }

  async queryCompanies(filter, options) {
    try {
      logger.info('Received filter:', filter);
      logger.info('Received options:', options);

      const { page = 1, limit = 10, sortBy = 'registration_date_desc' } = options;
      const skip = (Math.max(1, page) - 1) * limit;

      // If the filter has a "judet" value that is a county code,
      // look up the county name and then use it in the query.
      if (filter.judet) {
        const countyName = await this.getCountyNameByCode(filter.judet);
        logger.info('Converting county code to name:', filter.judet, '->', countyName);
        if (countyName) {
          filter.judet = countyName;
        }
      }

      // If the filter has an "oras" value that is a city code,
      // look up the city name and then use it in the query.
      if (filter.oras) {
        const cityName = await this.getCityNameByCode(filter.oras);
        logger.info('Converting city code to name:', filter.oras, '->', cityName);
        if (cityName) {
          filter.oras = cityName;
        }
      }

      const query = this._buildFilter(filter);
      logger.info('Built MongoDB query:', JSON.stringify(query, null, 2));

      const pipeline = [
        { $match: query },
        {
          $facet: {
            metadata: [{ $count: 'total' }],
            results: [
              {
                $sort: {
                  'date_generale.data_inregistrare': sortBy === 'registration_date_desc' ? -1 : 1,
                  cui: 1,
                },
              },
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  cui: 1,
                  denumire: 1,
                  cod_CAEN: 1,
                  cod_inmatriculare: 1,
                  adresa: 1,
                  adresa_anaf: 1,
                  date_generale: 1,
                },
              },
            ],
          },
        },
      ];

      const [aggregationResult] = await Company.aggregate(pipeline).allowDiskUse(true);
      // logger.info('Pipeline result:', JSON.stringify(aggregationResult, null, 2));

      const totalCount = aggregationResult.metadata[0]?.total || 0;
      const companies = aggregationResult.results;

      const caenCodes = this.caenCache.get('caen-codes') || {};
      const transformedResults = companies.map((company) => this._transformCompany(company, caenCodes));

      const result = {
        results: transformedResults,
        page: Math.max(1, page),
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalResults: totalCount,
      };

      logger.info('Final response:', {
        totalResults: result.totalResults,
        resultsCount: result.results.length,
        page: result.page,
        totalPages: result.totalPages,
      });

      return result;
    } catch (error) {
      logger.error('Error in queryCompanies:', error);
      throw error;
    }
  }

  _buildFilter(filter) {
    const query = {};

    if (filter.cod_CAEN) {
      query.cod_CAEN = filter.cod_CAEN;
    }

    if (filter.judet) {
      // Use case-insensitive exact match for county name.
      // IMPORTANT: This now targets adresa.judet based on your actual document structure.
      query['adresa.judet'] = {
        $regex: `^${filter.judet}$`,
        $options: 'i',
      };
    }

    if (filter.oras) {
      // Use case-insensitive match for the city/locality.
      query['adresa.localitate'] = {
        $regex: filter.oras,
        $options: 'i',
      };
    }

    if (filter.hasWebsite === 'true') {
      query['date_generale.website'] = { $exists: true, $ne: '' };
    }

    if (filter.hasContact === 'true') {
      query.$or = [
        { 'date_generale.telefon': { $exists: true, $ne: '' } },
        { 'date_generale.email': { $exists: true, $ne: '' } },
      ];
    }

    if (filter.search) {
      query.denumire = {
        $regex: filter.search,
        $options: 'i',
      };
    }

    logger.info('Built query:', JSON.stringify(query, null, 2));
    return query;
  }

  _transformCompany(company, caenCodes) {
    // Try to get the ANAF address from the nested field.
    // If it does not exist, fall back to the "adresa" field.
    let anafAddress = company.adresa_anaf?.sediu_social;
    if (!anafAddress) {
      // Fallback to the plain address from the document.
      anafAddress = company.adresa || {};
    }

    const dateGenerale = company.date_generale || {};
    const caenInfo = caenCodes[company.cod_CAEN];

    return {
      cui: company.cui,
      nume: company.denumire,
      adresa: {
        strada: anafAddress.sdenumire_Strada || company.adresa?.strada || '',
        numar: anafAddress.snumar_Strada || company.adresa?.numar || '',
        localitate: anafAddress.sdenumire_Localitate || company.adresa?.localitate || '',
        judet: anafAddress.sdenumire_Judet || company.adresa?.judet || '',
        cod_postal: anafAddress.scod_Postal || company.adresa?.cod_postal || '',
        detalii: anafAddress.sdetalii_Adresa || '',
        tara: anafAddress.stara || company.adresa?.tara || 'România',
        cod_judet: anafAddress.scod_Judet || '',
        cod_judet_auto: anafAddress.scod_JudetAuto || '',
        cod_localitate: anafAddress.scod_Localitate || '',
      },
      adresa_completa: this._formatAnafAddress(anafAddress, company.adresa),
      contact: {
        email: dateGenerale.email || '',
        telefon: dateGenerale.telefon || '',
        fax: dateGenerale.fax || '',
        website: dateGenerale.website || '',
      },
      cod_CAEN: company.cod_CAEN || '',
      inregistrare: {
        numar: company.cod_inmatriculare || dateGenerale.nrRegCom || '',
        stare: dateGenerale.stare_inregistrare || '',
        data: dateGenerale.data_inregistrare || '',
        organ_fiscal: dateGenerale.organFiscalCompetent || '',
      },
      tip_firma: {
        forma_juridica: dateGenerale.forma_juridica || '',
        forma_organizare: dateGenerale.forma_organizare || '',
        forma_proprietate: dateGenerale.forma_de_proprietate || '',
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

  _formatAnafAddress(anafAddress, fallbackAddress) {
    // Try formatting using ANAF address fields.
    const parts = [];
    if (anafAddress && anafAddress.sdenumire_Strada && anafAddress.sdenumire_Strada.trim()) {
      parts.push(anafAddress.sdenumire_Strada.trim());
    } else if (fallbackAddress && fallbackAddress.strada && fallbackAddress.strada.trim()) {
      parts.push(fallbackAddress.strada.trim());
    }
    if (anafAddress && anafAddress.snumar_Strada && anafAddress.snumar_Strada.trim()) {
      parts.push(`Nr. ${anafAddress.snumar_Strada.trim()}`);
    } else if (fallbackAddress && fallbackAddress.numar && fallbackAddress.numar.trim()) {
      parts.push(`Nr. ${fallbackAddress.numar.trim()}`);
    }
    if (anafAddress && anafAddress.sdenumire_Localitate && anafAddress.sdenumire_Localitate.trim()) {
      parts.push(anafAddress.sdenumire_Localitate.trim());
    } else if (fallbackAddress && fallbackAddress.localitate && fallbackAddress.localitate.trim()) {
      parts.push(fallbackAddress.localitate.trim());
    }
    if (anafAddress && anafAddress.sdenumire_Judet && anafAddress.sdenumire_Judet.trim()) {
      parts.push(`Jud. ${anafAddress.sdenumire_Judet.trim()}`);
    } else if (fallbackAddress && fallbackAddress.judet && fallbackAddress.judet.trim()) {
      parts.push(`Jud. ${fallbackAddress.judet.trim()}`);
    }
    return parts.join(', ');
  }

  async getCompanyByCui(cui) {
    const cacheKey = `company_${cui}`;
    let company = this.cache.get(cacheKey);

    if (!company) {
      company = await Company.findOne({ cui }).lean();
      if (company) {
        const caenCodes = this.caenCache.get('caen-codes') || {};
        company = this._transformCompany(company, caenCodes);
        this.cache.set(cacheKey, company);
      }
    }

    return company;
  }

  async searchCompanies(query, options) {
    const filter = { search: query };
    return this.queryCompanies(filter, options);
  }

  async getStats() {
    const cacheKey = 'company_stats';
    let stats = this.cache.get(cacheKey);

    if (!stats) {
      const pipeline = [
        {
          $facet: {
            totalCompanies: [{ $count: 'count' }],
            activeCompanies: [{ $match: { stare_firma: '1' } }, { $count: 'count' }],
            withWebsite: [{ $match: { 'date_generale.website': { $exists: true, $ne: '' } } }, { $count: 'count' }],
            withContact: [
              {
                $match: {
                  $or: [
                    { 'date_generale.telefon': { $exists: true, $ne: '' } },
                    { 'date_generale.email': { $exists: true, $ne: '' } },
                  ],
                },
              },
              { $count: 'count' },
            ],
          },
        },
      ];

      const [result] = await Company.aggregate(pipeline);

      stats = {
        totalCompanies: result.totalCompanies[0]?.count || 0,
        activeCompanies: result.activeCompanies[0]?.count || 0,
        withWebsite: result.withWebsite[0]?.count || 0,
        withContact: result.withContact[0]?.count || 0,
      };

      this.cache.set(cacheKey, stats, 3600);
    }

    return stats;
  }
}

module.exports = new CompanyService();
