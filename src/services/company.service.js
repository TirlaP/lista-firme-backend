const { Company } = require('../models');
const { CAEN } = require('../models');
const NodeCache = require('node-cache');

class CompanyService {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: 300,
      checkperiod: 60,
    });

    this.caenCache = new NodeCache({
      stdTTL: 3600,
      checkperiod: 120,
    });

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
      console.error('Failed to initialize CAEN codes:', error);
    }
  }

  async queryCompanies(filter, options) {
    const cacheKey = `companies_${JSON.stringify(filter)}_${options.page}_${options.limit}_${options.sortBy}`;
    let result = this.cache.get(cacheKey);

    if (result) {
      return result;
    }

    try {
      const { page = 1, limit = 10, sortBy = 'registration_date_desc' } = options;
      const skip = (page - 1) * limit;

      // Determine sort configuration
      let sortConfig = { cui: 1 }; // default sort
      if (sortBy === 'registration_date_desc') {
        sortConfig = { 'date_generale.data_inregistrare': -1, cui: 1 };
      } else if (sortBy === 'registration_date_asc') {
        sortConfig = { 'date_generale.data_inregistrare': 1, cui: 1 };
      }

      // Fast query for non-filtered case
      if (Object.keys(filter).length === 0) {
        const [companies, totalCount] = await Promise.all([
          Company.find({})
            .select({
              cui: 1,
              denumire: 1,
              cod_CAEN: 1,
              cod_inmatriculare: 1,
              'adresa_anaf.sediu_social': 1,
              date_generale: 1,
            })
            .sort(sortConfig)
            .skip(skip)
            .limit(limit)
            .lean(),

          Company.estimatedDocumentCount(),
        ]);

        const caenCodes = this.caenCache.get('caen-codes') || {};
        const transformedResults = companies.map((company) => this._transformCompany(company, caenCodes));

        result = {
          results: transformedResults,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
          totalResults: totalCount,
        };
      } else {
        // Use aggregation for filtered queries
        const pipeline = [
          {
            $match: this._buildFilter(filter),
          },
          {
            $facet: {
              metadata: [{ $count: 'total' }],
              results: [
                { $sort: sortConfig },
                { $skip: skip },
                { $limit: limit },
                {
                  $project: {
                    cui: 1,
                    denumire: 1,
                    cod_CAEN: 1,
                    cod_inmatriculare: 1,
                    'adresa_anaf.sediu_social': 1,
                    date_generale: 1,
                  },
                },
              ],
            },
          },
        ];

        const [aggregationResult] = await Company.aggregate(pipeline).allowDiskUse(true);
        const totalCount = aggregationResult.metadata[0]?.total || 0;
        const companies = aggregationResult.results;

        const caenCodes = this.caenCache.get('caen-codes') || {};
        const transformedResults = companies.map((company) => this._transformCompany(company, caenCodes));

        result = {
          results: transformedResults,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
          totalResults: totalCount,
        };
      }

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error in queryCompanies:', error);
      throw error;
    }
  }

  _buildFilter(filter) {
    const query = {};

    if (filter.cod_CAEN) {
      query.cod_CAEN = filter.cod_CAEN;
    }

    if (filter.judet) {
      query['adresa_anaf.sediu_social.sdenumire_Judet'] = {
        $regex: filter.judet,
        $options: 'i',
      };
    }

    if (filter.oras) {
      query['adresa_anaf.sediu_social.sdenumire_Localitate'] = {
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

    return query;
  }

  _transformCompany(company, caenCodes) {
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
        cod_localitate: anafAddress?.scod_Localitate || '',
      },
      adresa_completa: this._formatAnafAddress(anafAddress),
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

  _formatAnafAddress(anafAddress) {
    if (!anafAddress) return '';

    const parts = [];
    if (anafAddress.sdenumire_Strada?.trim()) parts.push(anafAddress.sdenumire_Strada.trim());
    if (anafAddress.snumar_Strada?.trim()) parts.push(`Nr. ${anafAddress.snumar_Strada.trim()}`);
    if (anafAddress.sdenumire_Localitate?.trim()) parts.push(anafAddress.sdenumire_Localitate.trim());
    if (anafAddress.sdenumire_Judet?.trim()) parts.push(`Jud. ${anafAddress.sdenumire_Judet.trim()}`);
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
    const filter = {
      search: query,
    };
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
