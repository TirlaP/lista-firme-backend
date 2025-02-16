// src/controllers/location.controller.js
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { locationService } = require('../services');
const pick = require('../utils/pick');

const getCounties = catchAsync(async (req, res) => {
  const result = await locationService.getCounties();
  res.send(result);
});

const searchCounties = catchAsync(async (req, res) => {
  const { query } = req.query;
  const result = await locationService.searchCounties(query);
  res.send(result);
});

const getCities = catchAsync(async (req, res) => {
  const result = await locationService.getCities();
  res.send(result);
});

const searchCities = catchAsync(async (req, res) => {
  const { query, countyCode } = req.query;
  const result = await locationService.searchCities(query, countyCode);
  res.send(result);
});

const getCitiesByCounty = catchAsync(async (req, res) => {
  const { countyCode } = req.params;
  const result = await locationService.getCitiesByCounty(countyCode);
  res.send(result);
});

module.exports = {
  getCounties,
  searchCounties,
  getCities,
  searchCities,
  getCitiesByCounty,
};
