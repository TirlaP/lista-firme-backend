const passport = require('passport');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');

const verifyCallback = (req, resolve, reject, requiredRights) => async (err, user, info) => {
  if (err || info || !user) {
    return reject(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
  }

  req.user = user;

  if (requiredRights.length) {
    try {
      // Special handling for admin role - admins have all permissions
      if (user.role === 'admin') {
        return resolve();
      }

      // Check permissions based on roleId
      let hasPermission = false;

      if (user.roleId) {
        const Role = mongoose.model('Role');
        const role = await Role.findById(user.roleId);

        if (role && role.permissions) {
          // Check if the role has any of the required permissions
          hasPermission = requiredRights.some((permission) => role.permissions.includes(permission));
        }
      }

      if (!hasPermission) {
        return reject(new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access this resource'));
      }

      // Add permissions and limits to the request for later use
      if (user.roleId) {
        const Role = mongoose.model('Role');
        const role = await Role.findById(user.roleId);
        req.userPermissions = role ? role.permissions : [];
        req.userLimits = role
          ? role.limits
          : {
              companiesPerDay: 10,
              exportsPerDay: 0,
              maxExportRecords: 0,
            };
      }

      // Reset daily usage if needed
      await user.resetDailyUsageIfNeeded();
    } catch (error) {
      console.error('Permission check error:', error);
      return reject(new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error checking permissions'));
    }
  }

  resolve();
};

const auth =
  (...requiredRights) =>
  async (req, res, next) => {
    return new Promise((resolve, reject) => {
      passport.authenticate('jwt', { session: false }, verifyCallback(req, resolve, reject, requiredRights))(req, res, next);
    })
      .then(() => next())
      .catch((err) => next(err));
  };

module.exports = auth;
