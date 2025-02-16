const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createSubscription = {
  body: Joi.object().keys({
    planId: Joi.string().required().valid('free', 'basic', 'premium', 'enterprise'),
    billingCycle: Joi.string().required().valid('monthly', 'yearly'),
  }),
};

const getSubscriptions = {
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'canceled', 'expired', 'pending'),
    plan: Joi.string().valid('free', 'basic', 'premium', 'enterprise'),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getSubscription = {
  params: Joi.object().keys({
    subscriptionId: Joi.string().custom(objectId),
  }),
};

const updateSubscription = {
  params: Joi.object().keys({
    subscriptionId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      status: Joi.string().valid('active', 'canceled', 'expired', 'pending'),
      planId: Joi.string().valid('free', 'basic', 'premium', 'enterprise'),
      billingCycle: Joi.string().valid('monthly', 'yearly'),
    })
    .min(1),
};

module.exports = {
  createSubscription,
  getSubscriptions,
  getSubscription,
  updateSubscription,
};
