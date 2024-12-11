const passport = require('passport');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

const verifyCallback = (req, resolve, reject, requiredRights) => {
  return async (err, user, info) => {
    try {
      if (err || info || !user) {
        reject(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
        return;
      }

      req.user = user;

      if (requiredRights.length) {
        const userRights = user.role === 'admin' ? ['getUsers', 'manageUsers'] : [];
        const hasRequiredRights = requiredRights.every((requiredRight) => userRights.includes(requiredRight));
        if (!hasRequiredRights && req.params.userId !== user.id) {
          reject(new ApiError(httpStatus.FORBIDDEN, 'Forbidden'));
          return;
        }
      }

      resolve();
    } catch (error) {
      reject(error);
    }
  };
};

const auth =
  (...requiredRights) =>
  async (req, res, next) => {
    try {
      await new Promise((resolve, reject) => {
        passport.authenticate('jwt', { session: false }, verifyCallback(req, resolve, reject, requiredRights))(
          req,
          res,
          next
        );
      });
      next();
    } catch (err) {
      next(err);
    }
  };

module.exports = auth;
