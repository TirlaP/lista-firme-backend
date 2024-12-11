const prisma = require('../config/prisma');
const cacheService = require('./cache.service');
const caenService = require('./caen.service');
const logger = require('../config/logger');

class CompanyService {
  constructor() {
    this.CACHE_KEYS = {
      COMPANIES_PREFIX: 'companies:list:',
      COMPANY_PREFIX: 'company:detail:',
      COUNT_PREFIX: 'companies:count:',
      STATS: 'companies:stats',
    };

    this.CACHE_TTL = {
      COMPANIES_LIST: 3600, // 1 hour
      COMPANY_DETAIL: 7200, // 2 hours
      COUNT: 3600, // 1 hour
      STATS: 3600, // 1 hour
    };

    this.PAGE_SIZE_LIMIT = 100;
  }

  _buildCacheKey(filter, options) {
    const filterKey = Object.entries(filter || {})
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}:${value}`)
      .join('_');
    return `${this.CACHE_KEYS.COMPANIES_PREFIX}${filterKey}:page:${options.page}:limit:${options.limit}`;
  }

  async _getCompanyCount(filter) {
    const cacheKey = `${this.CACHE_KEYS.COUNT_PREFIX}${JSON.stringify(filter)}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached !== null) {
        return parseInt(cached, 10);
      }

      const where = this._buildFilter(filter);
      const count = await prisma.company.count({ where });

      await cacheService.set(cacheKey, count.toString(), this.CACHE_TTL.COUNT);
      return count;
    } catch (error) {
      logger.error('Error getting company count:', error);
      throw error;
    }
  }

  _buildFilter(filter) {
    const where = {};

    if (filter?.cod_CAEN) {
      where.codCaen = filter.cod_CAEN;
    }

    if (filter?.judet) {
      where.adresaJudet = {
        contains: filter.judet,
        mode: 'insensitive',
      };
    }

    if (filter?.oras) {
      where.adresaLocalitate = {
        contains: filter.oras,
        mode: 'insensitive',
      };
    }

    if (filter?.hasWebsite === 'true') {
      where.dateGenerale = {
        path: ['website'],
        not: { equals: '' },
      };
    }

    if (filter?.hasContact === 'true') {
      where.OR = [
        {
          dateGenerale: {
            path: ['telefon'],
            not: { equals: '' },
          },
        },
        {
          dateGenerale: {
            path: ['email'],
            not: { equals: '' },
          },
        },
      ];
    }

    return where;
  }

  async queryCompanies(filter, options) {
    const cacheKey = this._buildCacheKey(filter, options);

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const { page = 1, limit = 10 } = options;
      const actualLimit = Math.min(limit, this.PAGE_SIZE_LIMIT);
      const offset = (page - 1) * actualLimit;

      const where = this._buildFilter(filter);

      // Get companies using Prisma's standard query
      const [companies, totalCount, caenMap] = await Promise.all([
        prisma.company.findMany({
          where,
          skip: offset,
          take: actualLimit,
          orderBy: {
            cui: 'asc',
          },
          select: {
            cui: true,
            denumire: true,
            codInmatriculare: true,
            codCaen: true,
            stareFirma: true,
            adresaStrada: true,
            adresaNumar: true,
            adresaLocalitate: true,
            adresaJudet: true,
            adresaCodPostal: true,
            adresaTara: true,
            adresaCompleta: true,
            dateGenerale: true,
            adresaAnaf: true,
          },
        }),
        this._getCompanyCount(filter),
        caenService.getCodeMap(),
      ]);

      const result = {
        results: companies.map((company) => this._transformCompany(company, caenMap)),
        page,
        limit: actualLimit,
        totalPages: Math.ceil(totalCount / actualLimit),
        totalResults: totalCount,
      };

      await cacheService.set(cacheKey, result, this.CACHE_TTL.COMPANIES_LIST);
      return result;
    } catch (error) {
      logger.error('Error in queryCompanies:', error);
      throw error;
    }
  }

  _transformCompany(company, caenMap = {}) {
    const dateGenerale = company.dateGenerale || {};
    const adresaAnaf = company.adresaAnaf?.sediu_social || {};

    const result = {
      cui: company.cui,
      nume: company.denumire,
      adresa: {
        strada: company.adresaStrada || '',
        numar: company.adresaNumar || '',
        localitate: company.adresaLocalitate || '',
        judet: company.adresaJudet || '',
        cod_postal: company.adresaCodPostal || '',
        detalii: adresaAnaf.sdetalii_Adresa || '',
        tara: company.adresaTara || 'România',
      },
      adresa_completa: company.adresaCompleta || this._formatAddress(company),
      contact: {
        email: dateGenerale.email || '',
        telefon: dateGenerale.telefon || '',
        fax: dateGenerale.fax || '',
        website: dateGenerale.website || '',
      },
      cod_CAEN: company.codCaen || '',
      inregistrare: {
        numar: company.codInmatriculare || dateGenerale.nrRegCom || '',
        stare: dateGenerale.stare_inregistrare || '',
        data: dateGenerale.data_inregistrare || '',
      },
    };

    if (company.codCaen && caenMap?.[company.codCaen]) {
      result.caen = caenMap[company.codCaen];
    }

    return result;
  }

  _formatAddress(company) {
    const parts = [];
    if (company.adresaStrada) parts.push(company.adresaStrada);
    if (company.adresaNumar) parts.push(`Nr. ${company.adresaNumar}`);
    if (company.adresaLocalitate) parts.push(company.adresaLocalitate);
    if (company.adresaJudet) parts.push(`Jud. ${company.adresaJudet}`);
    return parts.join(', ');
  }

  async getCompanyByCui(cui) {
    const cacheKey = `${this.CACHE_KEYS.COMPANY_PREFIX}${cui}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const [company, caenMap] = await Promise.all([
        prisma.company.findUnique({
          where: { cui },
          select: {
            cui: true,
            denumire: true,
            codInmatriculare: true,
            codCaen: true,
            stareFirma: true,
            adresaStrada: true,
            adresaNumar: true,
            adresaLocalitate: true,
            adresaJudet: true,
            adresaCodPostal: true,
            adresaTara: true,
            adresaCompleta: true,
            dateGenerale: true,
            adresaAnaf: true,
          },
        }),
        caenService.getCodeMap(),
      ]);

      if (!company) {
        return null;
      }

      const transformed = this._transformCompany(company, caenMap);
      await cacheService.set(cacheKey, transformed, this.CACHE_TTL.COMPANY_DETAIL);
      return transformed;
    } catch (error) {
      logger.error('Error in getCompanyByCui:', error);
      throw error;
    }
  }

  async searchCompanies(query, options) {
    const filter = { search: query };
    return this.queryCompanies(filter, options);
  }

  async getStats() {
    try {
      const cached = await cacheService.get(this.CACHE_KEYS.STATS);
      if (cached) {
        return cached;
      }

      const [totalCompanies, activeCompanies, withWebsite, withContact] = await prisma.$transaction([
        prisma.company.count(),
        prisma.company.count({
          where: { stareFirma: '1' },
        }),
        prisma.company.count({
          where: {
            dateGenerale: {
              path: ['website'],
              not: { equals: '' },
            },
          },
        }),
        prisma.company.count({
          where: {
            OR: [
              {
                dateGenerale: {
                  path: ['telefon'],
                  not: { equals: '' },
                },
              },
              {
                dateGenerale: {
                  path: ['email'],
                  not: { equals: '' },
                },
              },
            ],
          },
        }),
      ]);

      const stats = {
        totalCompanies,
        activeCompanies,
        withWebsite,
        withContact,
      };

      await cacheService.set(this.CACHE_KEYS.STATS, stats, this.CACHE_TTL.STATS);
      return stats;
    } catch (error) {
      logger.error('Error in getStats:', error);
      throw error;
    }
  }
}

module.exports = new CompanyService();
