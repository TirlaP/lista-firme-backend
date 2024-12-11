const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { exportService } = require('../services');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');

const exportCompanies = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['cod_CAEN', 'judet', 'oras', 'hasWebsite', 'hasContact']);

  try {
    await exportService.startCompanyExport(filter, res);
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Export failed');
  }
});

module.exports = {
  exportCompanies,
};
