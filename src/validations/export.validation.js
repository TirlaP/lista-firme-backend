const Joi = require('joi');

const exportCompanies = {
  query: Joi.object().keys({
    cod_CAEN: Joi.string(),
    judet: Joi.string(),
    oras: Joi.string(),
    hasWebsite: Joi.string(),
    hasContact: Joi.string(),
    sortBy: Joi.string().valid('registration_date_desc', 'registration_date_asc'),
    format: Joi.string().valid('csv', 'xlsx').default('csv'),
  }),
};

const exportLatestCompanies = {
  query: Joi.object()
    .keys({
      timeRange: Joi.string().valid('today', 'yesterday', 'last7days', 'last30days', 'custom'),
      customStartDate: Joi.string().isoDate(),
      customEndDate: Joi.string().isoDate(),
      format: Joi.string().valid('csv', 'xlsx').default('csv'),
    })
    .custom((value, helpers) => {
      // If we have custom dates, assume custom timeRange
      if (value.customStartDate || value.customEndDate) {
        value.timeRange = 'custom';
      }

      // Must have either timeRange or both custom dates
      if (!value.timeRange && !(value.customStartDate && value.customEndDate)) {
        return helpers.error('any.invalid');
      }

      // If using custom dates, must have both
      if ((value.customStartDate && !value.customEndDate) || (!value.customStartDate && value.customEndDate)) {
        return helpers.error('any.invalid');
      }

      // If custom dates are provided, validate their order
      if (value.customStartDate && value.customEndDate) {
        const startDate = new Date(value.customStartDate);
        const endDate = new Date(value.customEndDate);

        if (endDate < startDate) {
          return helpers.error('date.minDate');
        }
      }

      return value;
    })
    .messages({
      'any.invalid': 'Provide either timeRange OR both customStartDate and customEndDate',
      'date.minDate': 'End date must be after or equal to start date',
    }),
};

module.exports = {
  exportCompanies,
  exportLatestCompanies,
};
