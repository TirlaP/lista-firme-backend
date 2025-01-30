const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const companyValidation = require('../../validations/company.validation');
const companyController = require('../../controllers/company.controller');

const router = express.Router();

router.route('/').get(auth(), validate(companyValidation.getCompanies), companyController.getCompanies);

router.route('/latest').get(auth(), validate(companyValidation.getLatestCompanies), companyController.getLatestCompanies);

router.route('/latest/stats').get(auth(), validate(companyValidation.getLatestStats), companyController.getLatestStats);

router.route('/search').get(auth(), validate(companyValidation.searchCompanies), companyController.searchCompanies);

router.route('/stats').get(auth(), companyController.getStats);

router.route('/:cui').get(auth(), validate(companyValidation.getCompany), companyController.getCompany);

module.exports = router;
