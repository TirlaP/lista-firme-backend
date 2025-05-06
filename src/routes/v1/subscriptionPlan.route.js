const express = require('express');
const { auth, checkPermissions } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const subscriptionPlanValidation = require('../../validations/subscriptionPlan.validation');
const subscriptionPlanController = require('../../controllers/subscriptionPlan.controller');

const router = express.Router();

router
  .route('/')
  .post(
    auth(),
    checkPermissions('manageSubscriptionPlans'),
    validate(subscriptionPlanValidation.createSubscriptionPlan),
    subscriptionPlanController.createSubscriptionPlan
  )
  .get(auth(), checkPermissions('viewSubscriptionPlans'), subscriptionPlanController.getSubscriptionPlans);

router.route('/public').get(subscriptionPlanController.getSubscriptionPlans);

router
  .route('/:planId')
  .get(
    auth(),
    checkPermissions('viewSubscriptionPlans'),
    validate(subscriptionPlanValidation.getSubscriptionPlan),
    subscriptionPlanController.getSubscriptionPlan
  )
  .patch(
    auth(),
    checkPermissions('manageSubscriptionPlans'),
    validate(subscriptionPlanValidation.updateSubscriptionPlan),
    subscriptionPlanController.updateSubscriptionPlan
  )
  .delete(
    auth(),
    checkPermissions('manageSubscriptionPlans'),
    validate(subscriptionPlanValidation.deleteSubscriptionPlan),
    subscriptionPlanController.deleteSubscriptionPlan
  );

router
  .route('/:planId/limits')
  .patch(
    auth(),
    checkPermissions('manageSubscriptionPlans'),
    validate(subscriptionPlanValidation.updateSubscriptionPlanLimits),
    subscriptionPlanController.updateSubscriptionPlanLimits
  );

router
  .route('/name/:name')
  .get(
    auth(),
    checkPermissions('viewSubscriptionPlans'),
    validate(subscriptionPlanValidation.getSubscriptionPlanByName),
    subscriptionPlanController.getSubscriptionPlanByName
  );

module.exports = router;
