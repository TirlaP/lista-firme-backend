// src/services/location.service.js
const httpStatus = require('http-status');
const { Location } = require('../models');
const ApiError = require('../utils/ApiError');
const NodeCache = require('node-cache');

class LocationService {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: 3600, // 1 hour
      checkperiod: 120,
    });
  }

  async getCounties() {
    const cacheKey = 'counties_list';
    let counties = this.cache.get(cacheKey);

    if (!counties) {
      counties = await Location.find({
        type: 'county',
        isActive: true,
      })
        .select('name code standardizedNames')
        .sort({ name: 1 })
        .lean();

      this.cache.set(cacheKey, counties);
    }

    return counties;
  }

  async searchCounties(query) {
    if (!query) {
      return this.getCounties();
    }

    const searchRegex = new RegExp(query, 'i');

    return Location.find({
      type: 'county',
      isActive: true,
      $or: [{ name: searchRegex }, { standardizedNames: searchRegex }, { aliases: searchRegex }],
    })
      .select('name code standardizedNames')
      .sort({ name: 1 })
      .lean();
  }

  async getCities() {
    const cacheKey = 'cities_list';
    let cities = this.cache.get(cacheKey);

    if (!cities) {
      cities = await Location.find({
        type: { $in: ['city', 'municipality', 'sector'] },
        isActive: true,
      })
        .select('name code countyCode type')
        .sort({ name: 1 })
        .lean();

      this.cache.set(cacheKey, cities);
    }

    return cities;
  }

  async searchCities(query, countyCode) {
    const searchQuery = {
      type: { $in: ['city', 'municipality', 'sector'] },
      isActive: true,
    };

    if (query) {
      const searchRegex = new RegExp(query, 'i');
      searchQuery.$or = [{ name: searchRegex }, { standardizedNames: searchRegex }, { aliases: searchRegex }];
    }

    if (countyCode) {
      searchQuery.countyCode = countyCode;
    }

    return Location.find(searchQuery).select('name code countyCode type').sort({ name: 1 }).lean();
  }

  async getCitiesByCounty(countyCode) {
    const cacheKey = `cities_by_county_${countyCode}`;
    let cities = this.cache.get(cacheKey);

    if (!cities) {
      const county = await Location.findOne({
        code: countyCode,
        type: 'county',
        isActive: true,
      });

      if (!county) {
        throw new ApiError(httpStatus.NOT_FOUND, 'County not found');
      }

      cities = await Location.find({
        countyCode,
        type: { $in: ['city', 'municipality', 'sector'] },
        isActive: true,
      })
        .select('name code type')
        .sort({ name: 1 })
        .lean();

      this.cache.set(cacheKey, cities);
    }

    return cities;
  }

  async getLocationsByNames(countyName, cityName) {
    const searchQueries = [];

    if (countyName) {
      const countyRegex = new RegExp(`^${countyName}$`, 'i');
      searchQueries.push({
        type: 'county',
        $or: [{ name: countyRegex }, { standardizedNames: countyRegex }, { aliases: countyRegex }],
      });
    }

    if (cityName) {
      const cityRegex = new RegExp(`^${cityName}$`, 'i');
      searchQueries.push({
        type: { $in: ['city', 'municipality', 'sector'] },
        $or: [{ name: cityRegex }, { standardizedNames: cityRegex }, { aliases: cityRegex }],
      });
    }

    if (searchQueries.length === 0) {
      return null;
    }

    const locations = await Location.find({
      $or: searchQueries,
      isActive: true,
    }).lean();

    return {
      county: locations.find((loc) => loc.type === 'county'),
      city: locations.find((loc) => loc.type !== 'county'),
    };
  }
}

module.exports = new LocationService();
