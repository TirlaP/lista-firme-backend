// src/controllers/company.controller.js
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { companyService } = require('../services');
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

const getCompanyByCui = catchAsync(async (req, res) => {
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
    sortBy: req.query.sortBy,
  };

  const results = await companyService.searchCompanies(q, options);

  if (results.isPartial) {
    res.set('X-Results-Type', 'partial');
    res.set('X-Results-Count', results.totalResults.toString());
  }

  res.set('Cache-Control', 'public, max-age=30');
  res.send(results);
});

const getCompanyStats = catchAsync(async (req, res) => {
  const stats = await companyService.getStats();
  res.send(stats);
});

const getStats = catchAsync(async (req, res) => {
  const stats = await companyService.getStats();

  res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
  res.send(stats);
});

module.exports = {
  getCompanies,
  getCompany,
  getCompanyByCui,
  searchCompanies,
  getStats,
  getCompanyStats,
};
