const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const subscriptionValidation = require('../../validations/subscription.validation');
const subscriptionController = require('../../controllers/subscription.controller');
const { rawTextBodyParser } = require('netopia-card');

const router = express.Router();

router.get('/plans', subscriptionController.getSubscriptionPlans);

router.post('/', auth(), validate(subscriptionValidation.createSubscription), subscriptionController.createSubscription);

router.get('/current', auth(), subscriptionController.getUserSubscription);

router
  .route('/:subscriptionId')
  .get(auth(), validate(subscriptionValidation.getSubscription), subscriptionController.getSubscription)
  .patch(auth(), validate(subscriptionValidation.updateSubscription), subscriptionController.updateSubscription);

router.post('/payment/notify', rawTextBodyParser, subscriptionController.handlePaymentNotification);

module.exports = router;
