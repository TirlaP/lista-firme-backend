const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { SubscriptionPlan, UserSubscription, User } = require('../models');
const { Netopia } = require('netopia-card');
const paymentService = require('./payment.service');

class SubscriptionService {
  // constructor() {
  //   this.netopia = new Netopia({
  //     apiKey: process.env.NETOPIA_API_KEY,
  //     sandbox: process.env.NODE_ENV !== 'production',
  //   });
  // }

  async createSubscription(subscriptionBody) {
    const plan = await SubscriptionPlan.findOne({
      name: subscriptionBody.planId,
      isActive: true,
    });

    if (!plan) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Subscription plan not found');
    }

    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (subscriptionBody.billingCycle === 'yearly' ? 12 : 1));

    const subscription = await UserSubscription.create({
      user: subscriptionBody.user,
      plan: subscriptionBody.planId,
      startDate: new Date(),
      endDate,
      status: 'pending',
      billingCycle: subscriptionBody.billingCycle,
      usage: {
        companiesViewed: 0,
        exportsCount: 0,
        lastResetDate: new Date(),
      },
    });

    await User.findByIdAndUpdate(subscriptionBody.user, {
      'subscriptionInfo.currentPlan': subscriptionBody.planId,
      'subscriptionInfo.status': 'pending',
      'subscriptionInfo.expiresAt': endDate,
    });

    return subscription;
  }

  async getUserActiveSubscription(userId) {
    const subscription = await UserSubscription.findOne({
      user: userId,
      status: 'active',
      endDate: { $gt: new Date() },
    }).sort({ endDate: -1 });

    if (!subscription) {
      return null;
    }

    const plan = await SubscriptionPlan.findOne({ name: subscription.plan });
    return {
      ...subscription.toJSON(),
      plan,
    };
  }

  async updateSubscriptionById(subscriptionId, updateBody) {
    const subscription = await UserSubscription.findById(subscriptionId);
    if (!subscription) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found');
    }

    Object.assign(subscription, updateBody);
    await subscription.save();

    await User.findByIdAndUpdate(subscription.user, {
      'subscriptionInfo.currentPlan': subscription.plan,
      'subscriptionInfo.status': subscription.status,
      'subscriptionInfo.expiresAt': subscription.endDate,
    });

    return subscription;
  }

  async cancelSubscription(subscriptionId) {
    const subscription = await UserSubscription.findById(subscriptionId);
    if (!subscription) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found');
    }

    subscription.status = 'canceled';
    await subscription.save();

    await User.findByIdAndUpdate(subscription.user, {
      'subscriptionInfo.status': 'canceled',
    });

    return subscription;
  }

  async checkAndUpdateUsage(subscriptionId, usageType) {
    const subscription = await UserSubscription.findById(subscriptionId);
    if (!subscription) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found');
    }

    const plan = await SubscriptionPlan.findOne({ name: subscription.plan });
    const currentUsage = subscription.usage[usageType];
    const limit = plan.features[usageType === 'companiesViewed' ? 'companiesPerMonth' : 'exportsPerMonth'];

    const lastReset = new Date(subscription.usage.lastResetDate);
    const now = new Date();

    if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      subscription.usage[usageType] = 1;
      subscription.usage.lastResetDate = now;
      await subscription.save();
      return true;
    }

    if (currentUsage >= limit) {
      return false;
    }

    subscription.usage[usageType] += 1;
    await subscription.save();
    return true;
  }

  async initializePayment(subscription, user) {
    const plan = await SubscriptionPlan.findOne({ name: subscription.plan });

    if (!plan) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Subscription plan not found');
    }

    const amount = subscription.billingCycle === 'yearly' ? plan.price * 12 * 0.9 : plan.price;

    try {
      const paymentResponse = await paymentService.initializePayment({
        amount,
        orderId: subscription._id.toString(),
        billing: {
          email: user.email,
          firstName: user.name.split(' ')[0],
          lastName: user.name.split(' ')[1] || 'User', // Ensure last name exists
          phone: user.phone || '0722222222', // Add phone number
        },
      });

      return paymentResponse;
    } catch (error) {
      console.error('Full payment error:', error); // Add detailed logging
      throw new ApiError(httpStatus.BAD_REQUEST, `Payment failed: ${error.message}`);
    }
  }

  async handlePaymentNotification(notificationData) {
    const { order, payment } = notificationData;
    const subscription = await UserSubscription.findById(order.orderId);

    if (!subscription) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found');
    }

    if (payment.status === 'confirmed') {
      subscription.status = 'active';
      subscription.paymentDetails = {
        netopiaTransactionId: payment.transactionId,
        lastPaymentDate: new Date(),
        nextPaymentDate: subscription.endDate,
        amount: payment.amount,
      };

      await User.findByIdAndUpdate(subscription.user, {
        'subscriptionInfo.currentPlan': subscription.plan,
        'subscriptionInfo.status': 'active',
        'subscriptionInfo.expiresAt': subscription.endDate,
        $push: {
          'subscriptionInfo.paymentHistory': {
            transactionId: payment.transactionId,
            amount: payment.amount,
            date: new Date(),
            status: 'success',
          },
        },
      });
    } else {
      subscription.status = 'expired';
      await User.findByIdAndUpdate(subscription.user, {
        'subscriptionInfo.status': 'expired',
        'subscriptionInfo.currentPlan': 'free',
      });
    }

    await subscription.save();
  }

  async handleExpiredSubscriptions() {
    const expiredSubscriptions = await UserSubscription.find({
      status: 'active',
      endDate: { $lte: new Date() },
    });

    for (const subscription of expiredSubscriptions) {
      subscription.status = 'expired';
      await subscription.save();

      await User.findByIdAndUpdate(subscription.user, {
        'subscriptionInfo.status': 'expired',
        'subscriptionInfo.currentPlan': 'free',
      });
    }
  }
}

module.exports = new SubscriptionService();
