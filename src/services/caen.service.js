const logger = require('../config/logger');
const { CAEN } = require('../models');
const cacheService = require('./cache.service');

class CAENService {
  constructor() {
    this.CACHE_KEYS = {
      ALL_CODES: 'all_caen_codes',
      CODE_PREFIX: 'caencode',
      SEARCH_PREFIX: 'caensearch',
    };
    this.CACHE_TTL = {
      ALL_CODES: 3600, // 1 hour
      SINGLE_CODE: 1800, // 30 minutes
      SEARCH: 900, // 15 minutes
    };
  }

  async searchCAENCodes(query) {
    try {
      const cacheKey = `${this.CACHE_KEYS.SEARCH_PREFIX}${query}`;

      // Try to get from cache first
      const cachedResults = await cacheService.get(cacheKey);
      if (cachedResults) {
        return cachedResults;
      }

      // Convert query to lowercase for case-insensitive search
      const searchTerm = query.toLowerCase();
      logger.info('Searching for:', searchTerm);

      const searchQuery = {
        $or: [
          { code: { $regex: searchTerm, $options: 'i' } },
          { name: { $regex: searchTerm, $options: 'i' } },
          { division_code: { $regex: searchTerm, $options: 'i' } },
          { division_name: { $regex: searchTerm, $options: 'i' } },
        ],
      };

      const results = await CAEN.find(searchQuery)
        .select('code name division_code division_name section_code section_name')
        .sort({ code: 1 })
        .lean();

      logger.info(`Found ${results.length} results`);

      const formattedResults = results.map((caen) => ({
        value: caen.code,
        label: `${caen.code} - ${caen.name}`,
        details: {
          division: `${caen.division_code} - ${caen.division_name}`,
          section: `${caen.section_code} - ${caen.section_name}`,
        },
      }));

      // Cache the results
      await cacheService.set(cacheKey, formattedResults, this.CACHE_TTL.SEARCH);

      return formattedResults;
    } catch (error) {
      logger.error('Error in searchCAENCodes:', error);
      throw error;
    }
  }

  async getCAENByCode(code) {
    try {
      const cacheKey = `${this.CACHE_KEYS.CODE_PREFIX}${code}`;

      // Try to get from cache first
      const cachedResult = await cacheService.get(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      const result = await CAEN.findOne({ code }).lean();

      if (result) {
        // Cache the result
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
      // Try to get from cache first
      const cachedResults = await cacheService.get(this.CACHE_KEYS.ALL_CODES);
      if (cachedResults) {
        return cachedResults;
      }

      const results = await CAEN.find({}).sort({ code: 1 }).lean().exec(); // Added .exec() for better error handling

      if (results && results.length > 0) {
        // Cache the results
        await cacheService.set(this.CACHE_KEYS.ALL_CODES, results, this.CACHE_TTL.ALL_CODES);
      }

      return results;
    } catch (error) {
      logger.error('Error in getAllCAENCodes:', error);
      throw error;
    }
  }

  // Method to clear all CAEN-related caches
  async clearCache() {
    try {
      const keys = [
        this.CACHE_KEYS.ALL_CODES,
        ...(await cacheService.keys(`${this.CACHE_KEYS.CODE_PREFIX}*`)),
        ...(await cacheService.keys(`${this.CACHE_KEYS.SEARCH_PREFIX}*`)),
      ];

      for (const key of keys) {
        await cacheService.del(key);
      }
    } catch (error) {
      logger.error('Error clearing CAEN cache:', error);
      throw error;
    }
  }
}

const caenService = new CAENService();
module.exports = caenService;
