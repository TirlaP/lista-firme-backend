const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { locationService } = require('../services');

/**
 * Get all counties
 * @route GET /v1/locations/counties
 */
const getCounties = catchAsync(async (req, res) => {
  const result = await locationService.getCounties();
  res.send(result);
});

/**
 * Search counties by name
 * @route GET /v1/locations/counties/search?query={query}
 */
const searchCounties = catchAsync(async (req, res) => {
  const { query } = req.query;
  const result = await locationService.searchCounties(query);
  res.send(result);
});

/**
 * Get all cities
 * @route GET /v1/locations/cities
 */
const getCities = catchAsync(async (req, res) => {
  const result = await locationService.getCities();
  res.send(result);
});

/**
 * Search cities by name and optionally by county
 * @route GET /v1/locations/cities/search?query={query}&countyCode={countyCode}
 */
const searchCities = catchAsync(async (req, res) => {
  const { query, countyCode } = req.query;
  const result = await locationService.searchCities(query, countyCode);
  res.send(result);
});

/**
 * Get cities by county code
 * @route GET /v1/locations/cities/:countyCode
 */
const getCitiesByCounty = catchAsync(async (req, res) => {
  const { countyCode } = req.params;
  const result = await locationService.getCitiesByCounty(countyCode);
  res.send(result);
});

/**
 * Get location metadata
 * @route GET /v1/locations/meta
 */
const getLocationMeta = catchAsync(async (req, res) => {
  const countyCount = await locationService.countLocations({ is_county: true });
  const cityCount = await locationService.countLocations({ is_county: false });

  res.send({
    countyCount,
    cityCount,
    lastUpdated: new Date().toISOString(),
  });
});

/**
 * Get location by code
 * @route GET /v1/locations/:code
 */
const getLocationByCode = catchAsync(async (req, res) => {
  const { code } = req.params;
  const location = await locationService.getLocationByCode(code);
  if (!location) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Location not found' });
  }
  res.send(location);
});

/**
 * Get location variations by code
 * @route GET /v1/locations/:code/variations
 */
const getLocationVariations = catchAsync(async (req, res) => {
  const { code } = req.params;
  const variations = await locationService.getLocationNameVariations(code);
  res.send(variations);
});

module.exports = {
  getCounties,
  searchCounties,
  getCities,
  searchCities,
  getCitiesByCounty,
  getLocationMeta,
  getLocationByCode,
  getLocationVariations,
};
