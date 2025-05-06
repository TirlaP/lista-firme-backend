const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userService, roleService } = require('../services');

const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(httpStatus.CREATED).send(user);
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'role', 'email', 'roleId']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  res.send(user);
});

const getUserWithRole = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  let userWithRole = user.toJSON();

  if (user.roleId) {
    try {
      const role = await roleService.getRoleById(user.roleId);
      if (role) {
        userWithRole.roleInfo = role;
      }
    } catch (error) {
      // Continue even if role fetching fails
      console.error('Error fetching role:', error);
    }
  }

  res.send(userWithRole);
});

const getCurrentUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.user.id);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  let userWithRole = user.toJSON();

  if (user.roleId) {
    try {
      const role = await roleService.getRoleById(user.roleId);
      if (role) {
        userWithRole.roleInfo = role;
      }
    } catch (error) {
      // Continue even if role fetching fails
      console.error('Error fetching role:', error);
    }
  }

  res.send(userWithRole);
});

const getUserStats = catchAsync(async (req, res) => {
  await req.user.resetDailyUsageIfNeeded();

  const userLimits = await req.user.getLimits();

  const stats = {
    usage: {
      companiesViewed: req.user.usageLimits.companiesViewedToday.count,
      exportsCount: req.user.usageLimits.exportsToday.count,
    },
    limits: userLimits,
    hasReachedLimit: {
      companiesViewed:
        userLimits.companiesPerDay !== -1 && req.user.usageLimits.companiesViewedToday.count >= userLimits.companiesPerDay,
      exports: userLimits.exportsPerDay !== -1 && req.user.usageLimits.exportsToday.count >= userLimits.exportsPerDay,
    },
  };

  res.send(stats);
});

const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(req.params.userId, req.body);
  res.send(user);
});

const updateMe = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(req.user.id, req.body);
  res.send(user);
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(req.params.userId);
  res.status(httpStatus.NO_CONTENT).send();
});

const assignRoleToUser = catchAsync(async (req, res) => {
  const { roleId } = req.body;
  if (!roleId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Role ID is required');
  }

  const user = await userService.assignRoleToUser(req.params.userId, roleId);
  res.send(user);
});

const incrementCompanyView = catchAsync(async (req, res) => {
  const count = await req.user.incrementCompanyViews();
  res.send({ count });
});

const incrementExport = catchAsync(async (req, res) => {
  const count = await req.user.incrementExports();
  res.send({ count });
});

module.exports = {
  createUser,
  getUsers,
  getUser,
  getUserWithRole,
  getCurrentUser,
  getUserStats,
  updateUser,
  updateMe,
  deleteUser,
  assignRoleToUser,
  incrementCompanyView,
  incrementExport,
};
