// src/validations/location.validation.js
const Joi = require('joi');

const getCounties = {
  query: Joi.object().keys({}),
};

const searchCounties = {
  query: Joi.object().keys({
    query: Joi.string().min(1).required(),
  }),
};

const getCities = {
  query: Joi.object().keys({}),
};

const searchCities = {
  query: Joi.object().keys({
    query: Joi.string().min(1).required(),
    countyCode: Joi.string(),
  }),
};

const getCitiesByCounty = {
  params: Joi.object().keys({
    countyCode: Joi.string().required(),
  }),
};

module.exports = {
  getCounties,
  searchCounties,
  getCities,
  searchCities,
  getCitiesByCounty,
};
