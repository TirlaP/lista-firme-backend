const httpStatus = require('http-status');
const { User, Role } = require('../models');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const getUserRoles = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.userId).populate('roles');

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  res.send(user.roles);
});

const updateUserRoles = catchAsync(async (req, res) => {
  const { roles } = req.body;

  if (!roles || !Array.isArray(roles)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Roles array is required');
  }

  const user = await User.findById(req.params.userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const foundRoles = await Role.find({ _id: { $in: roles } });

  if (foundRoles.length !== roles.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Some roles were not found');
  }

  user.roles = roles;
  await user.save();

  const updatedUser = await User.findById(user._id).populate('roles');
  res.send(updatedUser.roles);
});

const getUserPermissions = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const permissions = await user.getAllPermissions();
  res.send(permissions);
});

const checkUserPermission = catchAsync(async (req, res) => {
  const { permissionName } = req.params;
  const user = await User.findById(req.params.userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const hasPermission = await user.hasPermission(permissionName);
  res.send({ hasPermission });
});

const syncSubscriptionRoles = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const subscriptionTier = user.subscriptionInfo.currentPlan;

  const subscriptionRole = await Role.findOne({ subscriptionTier });

  if (!subscriptionRole) {
    throw new ApiError(httpStatus.BAD_REQUEST, `No role defined for ${subscriptionTier} subscription tier`);
  }

  const userRoles = await Role.find({ _id: { $in: user.roles } });

  const nonSubscriptionRoles = userRoles.filter((role) => !role.subscriptionTier);

  user.roles = [...nonSubscriptionRoles.map((role) => role._id), subscriptionRole._id];
  await user.save();

  const updatedUser = await User.findById(user._id).populate('roles');
  res.send(updatedUser.roles);
});

module.exports = {
  getUserRoles,
  updateUserRoles,
  getUserPermissions,
  checkUserPermission,
  syncSubscriptionRoles,
};
