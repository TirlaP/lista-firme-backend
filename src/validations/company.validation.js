// src/validations/company.validation.js
const Joi = require('joi');

const getCompanies = {
  query: Joi.object().keys({
    cod_CAEN: Joi.string(),
    judet: Joi.string(),
    oras: Joi.string(),
    hasWebsite: Joi.string().valid('true', 'false'),
    hasContact: Joi.string().valid('true', 'false'),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    sortBy: Joi.string().valid('registration_date_desc', 'registration_date_asc'),
  }),
};

const getCompany = {
  params: Joi.object().keys({
    cui: Joi.number().required(),
  }),
};

const searchCompanies = {
  query: Joi.object().keys({
    q: Joi.string().required().min(2),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

module.exports = {
  getCompanies,
  getCompany,
  searchCompanies,
};
