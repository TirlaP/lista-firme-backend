// src/validations/company.validation.js
const Joi = require('joi');

const getCompanies = {
  query: Joi.object().keys({
    cod_CAEN: Joi.string().allow(''),
    judet: Joi.string().allow(''),
    oras: Joi.string().allow(''),
    hasWebsite: Joi.string().valid('true', 'false', ''),
    hasContact: Joi.string().valid('true', 'false', ''),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
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
