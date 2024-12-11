// src/validations/caen.validation.js
const Joi = require('joi');

const searchCAENCodes = {
  query: Joi.object().keys({
    q: Joi.string().required().min(1).max(100).trim(),
    type: Joi.string().valid('code', 'name', 'division', 'section').default('code'),
  }),
};

const getCAENByCode = {
  params: Joi.object().keys({
    code: Joi.string()
      .required()
      .pattern(/^\d{4}$/)
      .message('CAEN code must be exactly 4 digits'),
  }),
};

const getCAENBySection = {
  params: Joi.object().keys({
    section: Joi.string()
      .required()
      .length(1)
      .uppercase()
      .pattern(/^[A-U]$/)
      .message('Section code must be a single uppercase letter from A to U'),
  }),
};

const getCAENByDivision = {
  params: Joi.object().keys({
    division: Joi.string()
      .required()
      .length(2)
      .pattern(/^\d{2}$/)
      .message('Division code must be exactly 2 digits'),
  }),
};

module.exports = {
  searchCAENCodes,
  getCAENByCode,
  getCAENBySection,
  getCAENByDivision,
};
