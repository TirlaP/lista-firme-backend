const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { csvExportService, xlsExportService } = require('../services');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');

const getExportService = (format) => {
  return format === 'xlsx' ? xlsExportService : csvExportService;
};

/**
 * Calculate max rows based on subscription plan
 */
const getMaxExportRows = (plan) => {
  const limits = {
    basic: 1000,
    premium: 5000,
    enterprise: 10000,
  };
  return limits[plan] || 1000;
};

const exportCompanies = catchAsync(async (req, res) => {
  try {
    const filter = pick(req.query, ['cod_CAEN', 'judet', 'oras', 'hasWebsite', 'hasContact', 'sortBy']);
    const format = req.query.format || 'csv';

    // Get max rows from subscription plan
    const maxRows = getMaxExportRows(req.userSubscription.plan.name);

    // Add the maxRows limit to the filter
    const exportFilter = {
      ...filter,
      maxRows,
    };

    const exportService = getExportService(format);

    // Set appropriate headers based on format
    if (format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="companies.xlsx"');
    } else {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="companies.csv"');
    }

    await exportService.exportCompanies(exportFilter, res, format);
  } catch (error) {
    console.error('Export error:', error);
    if (!res.headersSent) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Export failed');
    }
  }
});

const exportLatestCompanies = catchAsync(async (req, res) => {
  try {
    const filter = pick(req.query, ['timeRange', 'customStartDate', 'customEndDate']);
    const format = req.query.format || 'csv';

    // Get max rows from subscription plan
    const maxRows = getMaxExportRows(req.userSubscription.plan.name);

    // Add the maxRows limit to the filter
    const exportFilter = {
      ...filter,
      maxRows,
    };

    // Convert date strings to Date objects if present
    if (exportFilter.customStartDate) {
      exportFilter.customStartDate = new Date(exportFilter.customStartDate);
    }
    if (exportFilter.customEndDate) {
      exportFilter.customEndDate = new Date(exportFilter.customEndDate);
      // Set end date to end of day
      exportFilter.customEndDate.setHours(23, 59, 59, 999);
    }

    const exportService = getExportService(format);

    // Set appropriate headers based on format
    if (format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="latest_companies.xlsx"');
    } else {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="latest_companies.csv"');
    }

    await exportService.exportLatestCompanies(exportFilter, res, format);
  } catch (error) {
    console.error('Latest export error:', error);
    if (!res.headersSent) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Export failed');
    }
  }
});

module.exports = {
  exportCompanies,
  exportLatestCompanies,
};
