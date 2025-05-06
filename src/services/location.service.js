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
        is_county: true,
        isActive: true,
      })
        .select('name code full_name standardizedNames')
        .sort({ name: 1 })
        .lean();

      this.cache.set(cacheKey, counties);
    }

    return counties.map((county) => ({
      value: county.code,
      label: county.name,
    }));
  }

  async searchCounties(query) {
    if (!query) {
      return this.getCounties();
    }

    const searchRegex = new RegExp(query, 'i');

    const counties = await Location.find({
      is_county: true,
      isActive: true,
      $or: [{ name: searchRegex }, { standardizedNames: searchRegex }, { aliases: searchRegex }],
    })
      .select('name code full_name standardizedNames')
      .sort({ name: 1 })
      .lean();

    return counties.map((county) => ({
      value: county.code,
      label: county.name,
    }));
  }

  async getCities(countyCode) {
    if (!countyCode) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'County code is required');
    }

    const cacheKey = `cities_by_county_${countyCode}`;
    let cities = this.cache.get(cacheKey);

    if (!cities) {
      cities = await Location.find({
        county_code: countyCode,
        is_county: false,
        isActive: true,
      })
        .select('name code full_name parent_name parent_code')
        .sort({ name: 1 })
        .lean();

      this.cache.set(cacheKey, cities);
    }

    return cities.map((city) => ({
      value: city.code,
      label: city.full_name || city.name,
    }));
  }

  async searchCities(query, countyCode) {
    if (!countyCode) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'County code is required');
    }

    if (!query) {
      return this.getCities(countyCode);
    }

    const searchRegex = new RegExp(query, 'i');

    const cities = await Location.find({
      county_code: countyCode,
      is_county: false,
      isActive: true,
      $or: [{ name: searchRegex }, { full_name: searchRegex }, { standardizedNames: searchRegex }, { aliases: searchRegex }],
    })
      .select('name code full_name parent_name parent_code')
      .sort({ name: 1 })
      .lean();

    return cities.map((city) => ({
      value: city.code,
      label: city.full_name || city.name,
    }));
  }

  async getCitiesByCounty(countyCode) {
    if (!countyCode) {
      throw new ApiError(httpStatus.NOT_FOUND, 'County code is required');
    }

    const cacheKey = `cities_by_county_${countyCode}`;
    let cities = this.cache.get(cacheKey);

    if (!cities) {
      const county = await Location.findOne({
        code: countyCode,
        is_county: true,
        isActive: true,
      });

      if (!county) {
        throw new ApiError(httpStatus.NOT_FOUND, 'County not found');
      }

      cities = await Location.find({
        county_code: countyCode,
        is_county: false,
        isActive: true,
      })
        .select('name code full_name')
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
        is_county: true,
        $or: [{ name: countyRegex }, { standardizedNames: countyRegex }, { aliases: countyRegex }],
      });
    }

    if (cityName) {
      const cityRegex = new RegExp(`^${cityName}$`, 'i');
      searchQueries.push({
        is_county: false,
        $or: [{ name: cityRegex }, { full_name: cityRegex }, { standardizedNames: cityRegex }, { aliases: cityRegex }],
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
      county: locations.find((loc) => loc.is_county),
      city: locations.find((loc) => !loc.is_county),
    };
  }

  // Get all name variations for a location by code
  async getLocationNameVariations(code) {
    const cacheKey = `location_names_${code}`;
    let variations = this.cache.get(cacheKey);

    if (!variations) {
      const location = await Location.findOne({ code }).lean();
      if (location) {
        // Create array of all possible names for this location
        variations = [
          location.name,
          location.name.toUpperCase(),
          location.full_name,
          ...(location.standardizedNames || []),
          ...(location.aliases || []),
        ].filter(Boolean); // Remove null/undefined

        // For cities, add common prefixes
        if (!location.is_county) {
          const extraNames = [];
          // Add variations with prefixes
          ['Mun.', 'Municipiul', 'Oraș', 'Oras', 'Comuna'].forEach((prefix) => {
            extraNames.push(`${prefix} ${location.name}`);
            extraNames.push(`${prefix} ${location.name}`.toUpperCase());
          });
          variations = [...variations, ...extraNames];
        }

        this.cache.set(cacheKey, variations);
      } else {
        variations = [];
      }
    }

    return variations;
  }

  // Get county and city codes based on address strings
  async getLocationCodesByAddress(countyName, cityName) {
    if (!countyName) return null;

    const countyCacheKey = `county_by_name_${countyName.toLowerCase()}`;
    let county = this.cache.get(countyCacheKey);

    if (!county) {
      county = await Location.findOne({
        is_county: true,
        $or: [
          { name: { $regex: new RegExp(`^${countyName}$`, 'i') } },
          { standardizedNames: { $regex: new RegExp(`^${countyName}$`, 'i') } },
          { aliases: { $regex: new RegExp(`^${countyName}$`, 'i') } },
        ],
      }).lean();

      if (county) {
        this.cache.set(countyCacheKey, county);
      }
    }

    if (!county) return null;

    if (!cityName) {
      return { countyCode: county.code };
    }

    const cityCacheKey = `city_by_name_county_${cityName.toLowerCase()}_${county.code}`;
    let city = this.cache.get(cityCacheKey);

    if (!city) {
      city = await Location.findOne({
        is_county: false,
        county_code: county.code,
        $or: [
          { name: { $regex: new RegExp(`^${cityName}$`, 'i') } },
          { full_name: { $regex: new RegExp(`^${cityName}$`, 'i') } },
          { standardizedNames: { $regex: new RegExp(`^${cityName}$`, 'i') } },
          { aliases: { $regex: new RegExp(`^${cityName}$`, 'i') } },
        ],
      }).lean();

      if (city) {
        this.cache.set(cityCacheKey, city);
      }
    }

    return {
      countyCode: county.code,
      cityCode: city ? city.code : undefined,
    };
  }
}

module.exports = new LocationService();
