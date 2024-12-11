// src/routes/v1/caen.route.js
const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const caenValidation = require('../../validations/caen.validation');
const caenController = require('../../controllers/caen.controller');

const router = express.Router();

router.get('/search', auth(), validate(caenValidation.searchCAENCodes), caenController.searchCAENCodes);
router.get('/', auth(), caenController.getAllCAENCodes);
router.get('/:code', auth(), validate(caenValidation.getCAENByCode), caenController.getCAENByCode);

module.exports = router;
