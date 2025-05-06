const httpStatus = require('http-status');
const { Permission } = require('../models');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const createPermission = catchAsync(async (req, res) => {
  const permission = await Permission.create(req.body);
  res.status(httpStatus.CREATED).send(permission);
});

const getPermissions = catchAsync(async (req, res) => {
  const { category } = req.query;
  const filter = {};

  if (category) {
    filter.category = category;
  }

  const permissions = await Permission.find(filter);
  res.send(permissions);
});

const getPermission = catchAsync(async (req, res) => {
  const permission = await Permission.findById(req.params.permissionId);
  if (!permission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Permission not found');
  }
  res.send(permission);
});

const updatePermission = catchAsync(async (req, res) => {
  const permission = await Permission.findById(req.params.permissionId);
  if (!permission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Permission not found');
  }

  Object.assign(permission, req.body);
  await permission.save();

  res.send(permission);
});

const deletePermission = catchAsync(async (req, res) => {
  const permission = await Permission.findById(req.params.permissionId);
  if (!permission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Permission not found');
  }

  await permission.deleteOne();
  res.status(httpStatus.NO_CONTENT).send();
});

const getCategories = catchAsync(async (req, res) => {
  const categories = await Permission.distinct('category');
  res.send(categories);
});

module.exports = {
  createPermission,
  getPermissions,
  getPermission,
  updatePermission,
  deletePermission,
  getCategories,
};
