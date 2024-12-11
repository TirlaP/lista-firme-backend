const Joi = require('joi');

const exportCompanies = {
  query: Joi.object().keys({
    cod_CAEN: Joi.string(),
    judet: Joi.string(),
    oras: Joi.string(),
    hasWebsite: Joi.string().valid('true', 'false'),
    hasContact: Joi.string().valid('true', 'false'),
  }),
};

module.exports = {
  exportCompanies,
};
