const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { subscriptionService } = require('../services');
const { SubscriptionPlan } = require('../models/subscription.model');

/**
 * Check if user has an active subscription and access to features
 */
const checkSubscriptionAccess = (requiredFeature) => async (req, res, next) => {
  try {
    const subscription = await subscriptionService.getUserActiveSubscription(req.user.id);

    // If no active subscription, default to free plan limits
    if (!subscription) {
      const freePlan = await SubscriptionPlan.findOne({ name: 'free' });
      req.userSubscription = {
        plan: freePlan,
        usage: {
          companiesViewed: 0,
          exportsCount: 0,
        },
      };

      // If requiring a feature not available in free plan
      if (requiredFeature && !freePlan.features[requiredFeature]) {
        throw new ApiError(httpStatus.PAYMENT_REQUIRED, `This feature requires a paid subscription`);
      }

      return next();
    }

    // Check if subscription is active and not expired
    if (subscription.status !== 'active' || subscription.endDate < new Date()) {
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Your subscription has expired');
    }

    const plan = await SubscriptionPlan.findOne({ name: subscription.plan });

    // Check if the required feature is available in the plan
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

/**
 * Check and update usage limits
 */
const checkUsageLimit = (usageType) => async (req, res, next) => {
  try {
    const subscription = await subscriptionService.getUserActiveSubscription(req.user.id);

    // If no subscription, check free plan limits
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

/**
 * Special middleware for export functionality
 */
const checkExportAccess = async (req, res, next) => {
  try {
    const subscription = await subscriptionService.getUserActiveSubscription(req.user.id);

    // Block exports for free plan
    if (!subscription) {
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Exports are only available for paid subscriptions');
    }

    // Check subscription status
    if (subscription.status !== 'active' || subscription.endDate < new Date()) {
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Your subscription has expired');
    }

    // Check if plan allows bulk export
    const plan = await SubscriptionPlan.findOne({ name: subscription.plan });
    if (!plan.features.bulkExport) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Bulk export is only available for Premium and Enterprise plans');
    }

    // Check export count limit
    const hasAvailableExports = await subscriptionService.checkAndUpdateUsage(subscription._id, 'exportsCount');

    if (!hasAvailableExports) {
      throw new ApiError(httpStatus.TOO_MANY_REQUESTS, 'You have reached your export limit for this month');
    }

    // Add subscription info to request for potential use in controllers
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

// Helper function to determine minimum required plan for a feature
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
