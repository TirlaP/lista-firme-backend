const httpStatus = require('http-status');
const { User, Role } = require('../models');
const ApiError = require('../utils/ApiError');

const createUser = async (userBody) => {
  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  // Assign default role if not specified
  if (!userBody.roleId) {
    const defaultRole = await Role.findOne({ name: 'user' });
    if (defaultRole) {
      userBody.roleId = defaultRole._id;
    }
  }

  return User.create(userBody);
};

const queryUsers = async (filter, options) => {
  const users = await User.paginate(filter, options);
  return users;
};

const getUserById = async (id) => {
  return User.findById(id).populate('roleId');
};

const getUserByEmail = async (email) => {
  return User.findOne({ email }).populate('roleId');
};

const updateUserById = async (userId, updateBody) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (updateBody.email && (await User.isEmailTaken(updateBody.email, userId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  Object.assign(user, updateBody);
  await user.save();
  return user;
};

const deleteUserById = async (userId) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  await user.remove();
  return user;
};

const assignRoleToUser = async (userId, roleId) => {
  const [user, role] = await Promise.all([getUserById(userId), Role.findById(roleId)]);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }

  user.roleId = role._id;
  await user.save();
  return user;
};

const updateUserRoleBasedOnSubscription = async (userId, subscriptionPlan) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Find the role that corresponds to the subscription plan
  const role = await Role.findOne({ name: subscriptionPlan });
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, `Role for subscription plan ${subscriptionPlan} not found`);
  }

  user.roleId = role._id;
  user.subscriptionInfo.currentPlan = subscriptionPlan;
  await user.save();
  return user;
};

const checkUserAccess = async (userId, permission) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  return await user.hasPermission(permission);
};

const checkUserQuota = async (userId, quotaType) => {
  const user = await getUserById(userId).populate('roleId');
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  await user.resetDailyUsageIfNeeded();

  let currentUsage, limit;

  if (quotaType === 'companiesView') {
    currentUsage = user.usageLimits.companiesViewedToday.count;
    limit = user.roleId?.limits?.companiesPerDay || 0;
  } else if (quotaType === 'exports') {
    currentUsage = user.usageLimits.exportsToday.count;
    limit = user.roleId?.limits?.exportsPerDay || 0;
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid quota type');
  }

  // -1 means unlimited
  if (limit === -1) {
    return { hasQuota: true, current: currentUsage, limit: 'unlimited' };
  }

  return {
    hasQuota: currentUsage < limit,
    current: currentUsage,
    limit,
    remaining: Math.max(0, limit - currentUsage),
  };
};

module.exports = {
  createUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  deleteUserById,
  assignRoleToUser,
  updateUserRoleBasedOnSubscription,
  checkUserAccess,
  checkUserQuota,
};
