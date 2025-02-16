const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { subscriptionService } = require('../services');
const { SubscriptionPlan } = require('../models/subscription.model');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');

const getSubscriptionPlans = catchAsync(async (req, res) => {
  const plans = await SubscriptionPlan.find({ isActive: true }).select('-__v');
  res.send(plans);
});

const createSubscription = catchAsync(async (req, res) => {
  const subscriptionData = {
    ...req.body,
    user: req.user.id,
  };

  const subscription = await subscriptionService.createSubscription(subscriptionData);
  const paymentResponse = await subscriptionService.initializePayment(subscription, req.user);

  res.status(httpStatus.CREATED).send({
    subscription,
    paymentUrl: paymentResponse.paymentUrl,
  });
});

const getSubscriptions = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'plan']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await subscriptionService.querySubscriptions(filter, options);
  res.send(result);
});

const getSubscription = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.getSubscriptionById(req.params.subscriptionId);
  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found');
  }
  res.send(subscription);
});

const getUserSubscription = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.getUserActiveSubscription(req.user.id);
  if (!subscription) {
    const freePlan = await SubscriptionPlan.findOne({ name: 'free' });
    return res.send({
      plan: freePlan,
      status: 'none',
      endDate: null,
    });
  }
  res.send(subscription);
});

const updateSubscription = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.updateSubscriptionById(req.params.subscriptionId, req.body);
  res.send(subscription);
});

const handlePaymentNotification = catchAsync(async (req, res) => {
  const notificationData = JSON.parse(req.body);
  await subscriptionService.handlePaymentNotification(notificationData);
  res.status(httpStatus.OK).json({ errorCode: 0 });
});

const cancelSubscription = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.cancelSubscription(req.params.subscriptionId);
  res.send(subscription);
});

module.exports = {
  getSubscriptionPlans,
  createSubscription,
  getSubscriptions,
  getSubscription,
  getUserSubscription,
  updateSubscription,
  handlePaymentNotification,
  cancelSubscription,
};
