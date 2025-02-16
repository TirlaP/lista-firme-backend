// src/routes/v1/location.route.js
const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const locationValidation = require('../../validations/location.validation');
const locationController = require('../../controllers/location.controller');

const router = express.Router();

router.route('/counties').get(validate(locationValidation.getCounties), locationController.getCounties);

router.route('/counties/search').get(validate(locationValidation.searchCounties), locationController.searchCounties);

router.route('/cities').get(validate(locationValidation.getCities), locationController.getCities);

router.route('/cities/search').get(validate(locationValidation.searchCities), locationController.searchCities);

router
  .route('/cities/:countyCode')
  .get(validate(locationValidation.getCitiesByCounty), locationController.getCitiesByCounty);

module.exports = router;
