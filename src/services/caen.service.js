const prisma = require('../config/prisma');
const cacheService = require('./cache.service');
const logger = require('../config/logger');

class CAENService {
  constructor() {
    this.CACHE_KEYS = {
      ALL_CODES: 'caen:all_codes',
      CODE_PREFIX: 'caen:code:',
      SEARCH_PREFIX: 'caen:search:',
      MAP_KEY: 'caen:code_map',
    };

    this.CACHE_TTL = {
      ALL_CODES: 86400, // 24 hours
      SINGLE_CODE: 86400, // 24 hours
      SEARCH: 3600, // 1 hour
      MAP: 86400, // 24 hours
    };

    this.initializeCodeMap();
  }

  async initializeCodeMap() {
    try {
      const hasMap = await cacheService.get(this.CACHE_KEYS.MAP_KEY);
      if (!hasMap) {
        const codes = await prisma.caenCode.findMany();
        const codeMap = {};

        codes.forEach((code) => {
          codeMap[code.code] = {
            code: code.code,
            name: code.name,
            section: `${code.sectionCode} - ${code.sectionName}`,
            division: `${code.divisionCode} - ${code.divisionName}`,
          };
        });

        await cacheService.set(this.CACHE_KEYS.MAP_KEY, codeMap, this.CACHE_TTL.MAP);
        logger.info('CAEN code map initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize CAEN code map:', error);
    }
  }

  async getCodeMap() {
    return cacheService.get(this.CACHE_KEYS.MAP_KEY);
  }

  async searchCAENCodes(query) {
    try {
      if (!query || query.length < 2) {
        return [];
      }

      const cacheKey = `${this.CACHE_KEYS.SEARCH_PREFIX}${query.toLowerCase()}`;
      let results = await cacheService.get(cacheKey);

      if (results) {
        return results;
      }

      results = await prisma.caenCode.findMany({
        where: {
          OR: [
            { code: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
            { divisionCode: { contains: query, mode: 'insensitive' } },
            { divisionName: { contains: query, mode: 'insensitive' } },
          ],
        },
        orderBy: { code: 'asc' },
      });

      const formattedResults = results.map((caen) => ({
        value: caen.code,
        label: `${caen.code} - ${caen.name}`,
        details: {
          division: `${caen.divisionCode} - ${caen.divisionName}`,
          section: `${caen.sectionCode} - ${caen.sectionName}`,
        },
      }));

      await cacheService.set(cacheKey, formattedResults, this.CACHE_TTL.SEARCH);
      return formattedResults;
    } catch (error) {
      logger.error('Error in searchCAENCodes:', error);
      throw error;
    }
  }

  async getCAENByCode(code) {
    try {
      if (!code) return null;

      const cacheKey = `${this.CACHE_KEYS.CODE_PREFIX}${code}`;
      let result = await cacheService.get(cacheKey);

      if (result) {
        return result;
      }

      result = await prisma.caenCode.findUnique({
        where: { code },
      });

      if (result) {
        await cacheService.set(cacheKey, result, this.CACHE_TTL.SINGLE_CODE);
      }

      return result;
    } catch (error) {
      logger.error('Error in getCAENByCode:', error);
      throw error;
    }
  }

  async getAllCAENCodes() {
    try {
      let results = await cacheService.get(this.CACHE_KEYS.ALL_CODES);

      if (results) {
        return results;
      }

      results = await prisma.caenCode.findMany({
        orderBy: { code: 'asc' },
      });

      if (results?.length > 0) {
        await cacheService.set(this.CACHE_KEYS.ALL_CODES, results, this.CACHE_TTL.ALL_CODES);
      }

      return results;
    } catch (error) {
      logger.error('Error in getAllCAENCodes:', error);
      throw error;
    }
  }

  async clearCache() {
    try {
      await Promise.all([
        cacheService.del(this.CACHE_KEYS.ALL_CODES),
        cacheService.del(this.CACHE_KEYS.MAP_KEY),
        cacheService.delPattern(`${this.CACHE_KEYS.CODE_PREFIX}*`),
        cacheService.delPattern(`${this.CACHE_KEYS.SEARCH_PREFIX}*`),
      ]);
      logger.info('CAEN cache cleared');
    } catch (error) {
      logger.error('Error clearing CAEN cache:', error);
      throw error;
    }
  }
}

module.exports = new CAENService();
