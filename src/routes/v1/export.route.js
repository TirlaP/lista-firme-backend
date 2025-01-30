const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const exportValidation = require('../../validations/export.validation');
const exportController = require('../../controllers/export.controller');

const router = express.Router();

router.route('/companies').get(auth(), validate(exportValidation.exportCompanies), exportController.exportCompanies);

router
  .route('/companies/latest')
  .get(auth(), validate(exportValidation.exportLatestCompanies), exportController.exportLatestCompanies);

module.exports = router;
