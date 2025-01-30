const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { csvExportService, xlsExportService } = require('../services');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');

const getExportService = (format) => {
  return format === 'xlsx' ? xlsExportService : csvExportService;
};

const exportCompanies = catchAsync(async (req, res) => {
  try {
    const filter = pick(req.query, ['cod_CAEN', 'judet', 'oras', 'hasWebsite', 'hasContact', 'sortBy']);
    const format = req.query.format || 'csv';

    const exportService = getExportService(format);
    await exportService.exportCompanies(filter, res, format);
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

    const exportService = getExportService(format);
    await exportService.exportLatestCompanies(filter, res, format);
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
