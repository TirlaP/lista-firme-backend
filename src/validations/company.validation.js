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

const getLatestCompanies = {
  query: Joi.object()
    .keys({
      timeRange: Joi.string().valid('today', 'yesterday', 'last7days', 'last30days'),
      customStartDate: Joi.date().iso(),
      customEndDate: Joi.date().iso().min(Joi.ref('customStartDate')),
      page: Joi.number().integer().min(1),
      limit: Joi.number().integer().min(1).max(100),
    })
    .custom((value, helpers) => {
      if (value.customStartDate && !value.customEndDate) {
        return helpers.error('any.invalid');
      }
      if (!value.customStartDate && value.customEndDate) {
        return helpers.error('any.invalid');
      }
      if (value.customStartDate && value.timeRange) {
        return helpers.error('any.invalid');
      }
      if (!value.customStartDate && !value.timeRange) {
        // Default to last7days if neither is provided
        value.timeRange = 'last7days';
      }
      return value;
    })
    .messages({
      'any.invalid': 'Either provide timeRange OR both customStartDate and customEndDate',
    }),
};

const getLatestStats = {
  query: Joi.object()
    .keys({
      timeRange: Joi.string().valid('today', 'yesterday', 'last7days', 'last30days'),
      customStartDate: Joi.date().iso(),
      customEndDate: Joi.date().iso().min(Joi.ref('customStartDate')),
    })
    .custom((value, helpers) => {
      if (value.customStartDate && !value.customEndDate) {
        return helpers.error('any.invalid');
      }
      if (!value.customStartDate && value.customEndDate) {
        return helpers.error('any.invalid');
      }
      if (value.customStartDate && value.timeRange) {
        return helpers.error('any.invalid');
      }
      if (!value.customStartDate && !value.timeRange) {
        // Default to last7days if neither is provided
        value.timeRange = 'last7days';
      }
      return value;
    })
    .messages({
      'any.invalid': 'Either provide timeRange OR both customStartDate and customEndDate',
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
  getLatestCompanies,
  getLatestStats,
};
