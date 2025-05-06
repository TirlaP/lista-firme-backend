const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { subscriptionService } = require('../services');
const { SubscriptionPlan } = require('../models');

const checkSubscriptionAccess = (requiredFeature) => async (req, res, next) => {
  try {
    const subscription = await subscriptionService.getUserActiveSubscription(req.user.id);

    if (!subscription) {
      const freePlan = await SubscriptionPlan.findOne({ name: 'free' });
      req.userSubscription = {
        plan: freePlan,
        usage: {
          companiesViewed: 0,
          exportsCount: 0,
        },
      };

      if (requiredFeature && !freePlan.features[requiredFeature]) {
        throw new ApiError(httpStatus.PAYMENT_REQUIRED, `This feature requires a paid subscription`);
      }

      return next();
    }

    if (subscription.status !== 'active' || subscription.endDate < new Date()) {
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Your subscription has expired');
    }

    const plan = await SubscriptionPlan.findOne({ name: subscription.plan });

    if (requiredFeature && !plan.features[requiredFeature]) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `This feature requires a ${getMinimumRequiredPlan(requiredFeature)} plan or higher`
      );
    }

    req.userSubscription = {
      plan,
      usage: subscription.usage,
      subscription,
    };

    next();
  } catch (error) {
    next(error);
  }
};

const checkUsageLimit = (usageType) => async (req, res, next) => {
  try {
    const subscription = await subscriptionService.getUserActiveSubscription(req.user.id);

    if (!subscription) {
      const freePlan = await SubscriptionPlan.findOne({ name: 'free' });
      const limit = freePlan.features[usageType === 'companiesViewed' ? 'companiesPerMonth' : 'exportsPerMonth'];

      const usage = await subscriptionService.getFreePlanUsage(req.user.id, usageType);
      if (usage >= limit) {
        throw new ApiError(
          httpStatus.TOO_MANY_REQUESTS,
          `You have reached your ${usageType} limit. Please upgrade your plan.`
        );
      }

      await subscriptionService.incrementFreePlanUsage(req.user.id, usageType);
      return next();
    }

    const hasAvailableUsage = await subscriptionService.checkAndUpdateUsage(subscription._id, usageType);

    if (!hasAvailableUsage) {
      throw new ApiError(httpStatus.TOO_MANY_REQUESTS, `You have reached your ${usageType} limit for this month`);
    }

    next();
  } catch (error) {
    next(error);
  }
};

const checkExportAccess = async (req, res, next) => {
  try {
    const subscription = await subscriptionService.getUserActiveSubscription(req.user.id);

    if (!subscription) {
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Exports are only available for paid subscriptions');
    }

    if (subscription.status !== 'active' || subscription.endDate < new Date()) {
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Your subscription has expired');
    }

    const plan = await SubscriptionPlan.findOne({ name: subscription.plan });
    if (!plan.features.bulkExport) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Bulk export is only available for Premium and Enterprise plans');
    }

    const hasAvailableExports = await subscriptionService.checkAndUpdateUsage(subscription._id, 'exportsCount');

    if (!hasAvailableExports) {
      throw new ApiError(httpStatus.TOO_MANY_REQUESTS, 'You have reached your export limit for this month');
    }

    req.userSubscription = {
      plan,
      usage: subscription.usage,
      subscription,
    };

    next();
  } catch (error) {
    next(error);
  }
};

const getMinimumRequiredPlan = (feature) => {
  const featurePlanMap = {
    searchFilters: 'basic',
    advancedStats: 'premium',
    bulkExport: 'premium',
    apiAccess: 'enterprise',
  };
  return featurePlanMap[feature] || 'basic';
};

module.exports = {
  checkSubscriptionAccess,
  checkUsageLimit,
  checkExportAccess,
};
