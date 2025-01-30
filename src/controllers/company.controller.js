const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { companyService, latestCompaniesService } = require('../services');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');

const getCompanies = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['cod_CAEN', 'judet', 'oras', 'hasWebsite', 'hasContact']);

  const options = {
    page: parseInt(req.query.page, 10) || 1,
    limit: Math.min(parseInt(req.query.limit, 10) || 10, 100),
    sortBy: req.query.sortBy || 'registration_date_desc',
  };

  const result = await companyService.queryCompanies(filter, options);

  if (result.isPartial) {
    res.set('X-Results-Type', 'partial');
    res.set('X-Results-Count', result.totalResults.toString());
  }

  res.set('Cache-Control', 'public, max-age=60');
  res.send(result);
});

const getCompany = catchAsync(async (req, res) => {
  const { cui } = req.params;

  if (!cui || isNaN(parseInt(cui, 10))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid CUI provided');
  }

  const company = await companyService.getCompanyByCui(parseInt(cui, 10));

  if (!company) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');
  }

  res.send(company);
});

const searchCompanies = catchAsync(async (req, res) => {
  const { q } = req.query;

  if (!q || q.length < 2) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Search query must be at least 2 characters long');
  }

  const options = {
    page: parseInt(req.query.page, 10) || 1,
    limit: Math.min(parseInt(req.query.limit, 10) || 10, 100),
    sortBy: req.query.sortBy || 'registration_date_desc',
  };

  const results = await companyService.searchCompanies(q, options);

  if (results.isPartial) {
    res.set('X-Results-Type', 'partial');
    res.set('X-Results-Count', results.totalResults.toString());
  }

  res.set('Cache-Control', 'public, max-age=30');
  res.send(results);
});

const getStats = catchAsync(async (req, res) => {
  const stats = await companyService.getStats();
  res.set('Cache-Control', 'public, max-age=300');
  res.send(stats);
});

const getLatestCompanies = catchAsync(async (req, res) => {
  const options = pick(req.query, ['timeRange', 'customStartDate', 'customEndDate', 'page', 'limit']);

  // Parse page and limit
  options.page = parseInt(options.page, 10) || 1;
  options.limit = Math.min(parseInt(options.limit, 10) || 10, 100);

  // Convert date strings to Date objects if present
  if (options.customStartDate) {
    options.customStartDate = new Date(options.customStartDate);
  }
  if (options.customEndDate) {
    options.customEndDate = new Date(options.customEndDate);
    // Set end date to end of day
    options.customEndDate.setHours(23, 59, 59, 999);
  }

  const result = await latestCompaniesService.getLatestCompanies(options);

  // Set cache headers
  res.set('Cache-Control', 'public, max-age=60');

  // Set partial results headers if applicable
  if (result.isPartial) {
    res.set('X-Results-Type', 'partial');
    res.set('X-Results-Count', result.totalResults.toString());
  }

  res.send(result);
});

const getLatestStats = catchAsync(async (req, res) => {
  const options = pick(req.query, ['timeRange', 'customStartDate', 'customEndDate']);

  // Convert date strings to Date objects if present
  if (options.customStartDate) {
    options.customStartDate = new Date(options.customStartDate);
  }
  if (options.customEndDate) {
    options.customEndDate = new Date(options.customEndDate);
    // Set end date to end of day
    options.customEndDate.setHours(23, 59, 59, 999);
  }

  const stats = await latestCompaniesService.getLatestStats(options);

  // Set cache headers
  res.set('Cache-Control', 'public, max-age=300');

  res.send(stats);
});

module.exports = {
  getCompanies,
  getCompany,
  searchCompanies,
  getStats,
  getLatestCompanies,
  getLatestStats,
};
