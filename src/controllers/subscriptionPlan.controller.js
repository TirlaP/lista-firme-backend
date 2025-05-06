const httpStatus = require('http-status');
const { SubscriptionPlan, Role } = require('../models');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const createSubscriptionPlan = catchAsync(async (req, res) => {
  const existingPlan = await SubscriptionPlan.findOne({ name: req.body.name });
  if (existingPlan) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Subscription plan already exists');
  }

  const plan = await SubscriptionPlan.create(req.body);

  const existingRole = await Role.findOne({ subscriptionTier: plan.name });
  if (!existingRole) {
    await Role.create({
      name: `${plan.name} subscriber`,
      description: `Default role for ${plan.displayName} subscribers`,
      subscriptionTier: plan.name,
      isSystem: true,
      permissions: [],
    });
  }

  res.status(httpStatus.CREATED).send(plan);
});

const getSubscriptionPlans = catchAsync(async (req, res) => {
  const { active } = req.query;
  const filter = {};

  if (active !== undefined) {
    filter.isActive = active === 'true';
  }

  const plans = await SubscriptionPlan.find(filter).sort({ displayOrder: 1 });
  res.send(plans);
});

const getSubscriptionPlan = catchAsync(async (req, res) => {
  const plan = await SubscriptionPlan.findById(req.params.planId);
  if (!plan) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Subscription plan not found');
  }
  res.send(plan);
});

const getSubscriptionPlanByName = catchAsync(async (req, res) => {
  const plan = await SubscriptionPlan.findOne({ name: req.params.name });
  if (!plan) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Subscription plan not found');
  }
  res.send(plan);
});

const updateSubscriptionPlan = catchAsync(async (req, res) => {
  const plan = await SubscriptionPlan.findById(req.params.planId);
  if (!plan) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Subscription plan not found');
  }

  if (req.body.name && req.body.name !== plan.name) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Subscription plan name cannot be changed');
  }

  Object.assign(plan, req.body);
  await plan.save();

  res.send(plan);
});

const updateSubscriptionPlanLimits = catchAsync(async (req, res) => {
  const plan = await SubscriptionPlan.findById(req.params.planId);
  if (!plan) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Subscription plan not found');
  }

  if (!req.body.limits) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Limits are required');
  }

  Object.assign(plan.limits, req.body.limits);
  await plan.save();

  res.send(plan);
});

const deleteSubscriptionPlan = catchAsync(async (req, res) => {
  const plan = await SubscriptionPlan.findById(req.params.planId);
  if (!plan) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Subscription plan not found');
  }

  const linkedRole = await Role.findOne({ subscriptionTier: plan.name });
  if (linkedRole) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This plan cannot be deleted because it has a linked role. Update the role first.'
    );
  }

  await plan.deleteOne();
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createSubscriptionPlan,
  getSubscriptionPlans,
  getSubscriptionPlan,
  getSubscriptionPlanByName,
  updateSubscriptionPlan,
  updateSubscriptionPlanLimits,
  deleteSubscriptionPlan,
};
