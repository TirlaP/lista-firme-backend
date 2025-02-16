const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const exportValidation = require('../../validations/export.validation');
const exportController = require('../../controllers/export.controller');
const { checkExportAccess } = require('../../middlewares/subscription');
const { exportLimiter } = require('../../middlewares/rateLimiter');

const router = express.Router();

router.route('/companies').get(
  auth(),
  exportLimiter,
  // checkExportAccess,
  validate(exportValidation.exportCompanies),
  exportController.exportCompanies
);

router.route('/companies/latest').get(
  auth(),
  exportLimiter,
  // checkExportAccess,
  validate(exportValidation.exportLatestCompanies),
  exportController.exportLatestCompanies
);

module.exports = router;
