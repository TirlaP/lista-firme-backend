// src/controllers/caen.controller.js
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { caenService } = require('../services');

const searchCAENCodes = catchAsync(async (req, res) => {
  const results = await caenService.searchCAENCodes(req.query.q);
  res.send(results);
});

const getAllCAENCodes = catchAsync(async (req, res) => {
  const results = await caenService.getAllCAENCodes();
  res.send(results);
});

const getCAENByCode = catchAsync(async (req, res) => {
  const caen = await caenService.getCAENByCode(req.params.code);
  if (!caen) {
    res.status(httpStatus.NOT_FOUND).send();
    return;
  }
  res.send(caen);
});

module.exports = {
  searchCAENCodes,
  getAllCAENCodes,
  getCAENByCode,
};
