const { Location } = require('../models');
const logger = require('../config/logger');
const NodeCache = require('node-cache');

// Cache for frequently accessed location data
const locationCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// Helper function to create a diacritic-insensitive regex pattern
function createFlexibleRegex(query) {
  if (!query) return null;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let pattern = '';
  for (let i = 0; i < escaped.length; i++) {
    const char = escaped[i];

    switch (char.toLowerCase()) {
      case 'a':
        pattern += '[aăâAĂÂ]';
        break;
      case 'i':
        pattern += '[iîIÎ]';
        break;
      case 's':
        pattern += '[sșşSȘŞ]';
        break;
      case 't':
        pattern += '[tțţTȚŢ]';
        break;
      default:
        pattern += char;
    }
  }

  return new RegExp(pattern, 'i');
}

// Filtering function to directly use in company resolvers
async function filterCompaniesByLocation(filter = {}, judet, oras) {
  try {
    if (!judet && !oras) return filter;

    const locationFilter = { ...filter };
    const conditions = filter.$and ? [...filter.$and] : [];

    if (judet) {
      const county = await Location.findOne({ code: judet, is_county: true }).lean();

      if (county) {
        const countyCondition = {
          $or: [
            { countyCode: county.code },
            { 'adresa.judet': county.name },
            { 'adresa_anaf.sediu_social.sdenumire_Judet': county.name },
          ],
        };

        if (oras) {
          const city = await Location.findOne({
            code: oras,
            is_county: false,
            county_code: county.code,
          }).lean();

          if (city) {
            conditions.push({
              $and: [
                countyCondition,
                {
                  $or: [
                    { cityCode: city.code },
                    { 'adresa.localitate': city.name },
                    { 'adresa.localitate': city.full_name || '' },
                    { 'adresa_anaf.sediu_social.sdenumire_Localitate': city.name },
                    { 'adresa_anaf.sediu_social.sdenumire_Localitate': city.full_name || '' },
                  ],
                },
              ],
            });
          } else {
            conditions.push({
              $and: [
                countyCondition,
                {
                  $or: [
                    { cityCode: oras },
                    { 'adresa.localitate': oras },
                    { 'adresa_anaf.sediu_social.sdenumire_Localitate': oras },
                  ],
                },
              ],
            });
          }
        } else {
          conditions.push(countyCondition);
        }
      } else {
        // Direct string matching as fallback
        const countyCondition = {
          $or: [{ countyCode: judet }, { 'adresa.judet': judet }, { 'adresa_anaf.sediu_social.sdenumire_Judet': judet }],
        };

        conditions.push(countyCondition);
      }
    } else if (oras) {
      const city = await Location.findOne({ code: oras, is_county: false }).lean();

      if (city) {
        conditions.push({
          $or: [
            { cityCode: city.code },
            { 'adresa.localitate': city.name },
            { 'adresa.localitate': city.full_name || '' },
            { 'adresa_anaf.sediu_social.sdenumire_Localitate': city.name },
            { 'adresa_anaf.sediu_social.sdenumire_Localitate': city.full_name || '' },
          ],
        });
      } else {
        conditions.push({
          $or: [
            { cityCode: oras },
            { 'adresa.localitate': oras },
            { 'adresa_anaf.sediu_social.sdenumire_Localitate': oras },
          ],
        });
      }
    }

    if (conditions.length > 0) {
      locationFilter.$and = conditions;
    }

    return locationFilter;
  } catch (error) {
    logger.error('Error in filterCompaniesByLocation:', error);
    return filter;
  }
}

const resolvers = {
  Query: {
    counties: async () => {
      try {
        const cacheKey = 'graphql_counties';
        let counties = locationCache.get(cacheKey);

        if (!counties) {
          counties = await Location.find({ is_county: true }).select('name code').sort({ name: 1 }).lean();

          counties = counties.map((county) => ({
            value: county.code,
            label: county.name,
          }));

          locationCache.set(cacheKey, counties);
        }

        return counties;
      } catch (error) {
        logger.error('Error fetching counties:', error);
        throw error;
      }
    },

    searchCounties: async (_, { query }) => {
      try {
        if (!query || query.length < 1) {
          return resolvers.Query.counties();
        }

        const searchRegex = createFlexibleRegex(query);

        const counties = await Location.find({
          is_county: true,
          name: searchRegex,
        })
          .select('name code')
          .sort({ name: 1 })
          .limit(20)
          .lean();

        return counties.map((county) => ({
          value: county.code,
          label: county.name,
        }));
      } catch (error) {
        logger.error('Error searching counties:', error);
        throw error;
      }
    },

    citiesByCounty: async (_, { countyCode }) => {
      try {
        if (!countyCode) {
          return [];
        }

        const cacheKey = `graphql_cities_${countyCode}`;
        let cities = locationCache.get(cacheKey);

        if (!cities) {
          cities = await Location.find({
            is_county: false,
            county_code: countyCode,
          })
            .select('name code full_name')
            .sort({ name: 1 })
            .lean();

          cities = cities.map((city) => ({
            value: city.code,
            label: city.full_name || city.name,
          }));

          locationCache.set(cacheKey, cities);
        }

        return cities;
      } catch (error) {
        logger.error('Error fetching cities by county:', error);
        throw error;
      }
    },

    searchCities: async (_, { query, countyCode }) => {
      try {
        if (!query || query.length < 1) {
          return countyCode ? resolvers.Query.citiesByCounty(null, { countyCode }) : [];
        }

        const searchRegex = createFlexibleRegex(query);

        const searchQuery = {
          is_county: false,
          $or: [{ name: searchRegex }, { full_name: searchRegex }],
        };

        if (countyCode) {
          searchQuery.county_code = countyCode;
        }

        const cities = await Location.find(searchQuery).select('name code full_name').sort({ name: 1 }).limit(20).lean();

        return cities.map((city) => ({
          value: city.code,
          label: city.full_name || city.name,
        }));
      } catch (error) {
        logger.error('Error searching cities:', error);
        throw error;
      }
    },

    location: async (_, { code }) => {
      try {
        if (!code) return null;

        const location = await Location.findOne({ code }).lean();
        if (!location) return null;

        return {
          code: location.code,
          name: location.name,
          fullName: location.full_name,
          countyCode: location.county_code,
          countyName: location.county_name,
          parentCode: location.parent_code,
          parentName: location.parent_name,
          isCounty: location.is_county,
        };
      } catch (error) {
        logger.error('Error fetching location by code:', error);
        throw error;
      }
    },

    locationVariations: async (_, { code }) => {
      try {
        if (!code) return [];

        const location = await Location.findOne({ code }).lean();
        if (!location) return [];

        const variations = [location.name, location.name.toUpperCase(), location.full_name].filter(Boolean);

        return variations;
      } catch (error) {
        logger.error('Error fetching location variations:', error);
        throw error;
      }
    },
  },
};

// Export the resolver and the filtering function
module.exports = {
  ...resolvers,
  filterCompaniesByLocation,
};
