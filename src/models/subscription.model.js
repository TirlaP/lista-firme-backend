const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const subscriptionPlanSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      enum: ['free', 'basic', 'premium', 'enterprise'],
      unique: true,
    },
    price: {
      type: Number,
      required: true,
    },
    billingCycle: {
      type: String,
      required: true,
      enum: ['monthly', 'yearly'],
    },
    features: {
      companiesPerMonth: {
        type: Number,
        required: true,
      },
      exportsPerMonth: {
        type: Number,
        required: true,
      },
      searchFilters: {
        type: Boolean,
        default: false,
      },
      advancedStats: {
        type: Boolean,
        default: false,
      },
      bulkExport: {
        type: Boolean,
        default: false,
      },
      apiAccess: {
        type: Boolean,
        default: false,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const userSubscriptionSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
    },
    plan: {
      type: String,
      required: true,
      enum: ['free', 'basic', 'premium', 'enterprise'],
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'canceled', 'expired', 'pending'],
      default: 'pending',
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    billingCycle: {
      type: String,
      required: true,
      enum: ['monthly', 'yearly'],
    },
    usage: {
      companiesViewed: {
        type: Number,
        default: 0,
      },
      exportsCount: {
        type: Number,
        default: 0,
      },
      lastResetDate: {
        type: Date,
        default: Date.now,
      },
    },
    paymentDetails: {
      netopiaTransactionId: String,
      lastPaymentDate: Date,
      nextPaymentDate: Date,
      amount: Number,
    },
  },
  {
    timestamps: true,
  }
);

subscriptionPlanSchema.plugin(toJSON);
userSubscriptionSchema.plugin(toJSON);

userSubscriptionSchema.index({ user: 1, status: 1 });
userSubscriptionSchema.index({ endDate: 1 });

module.exports.SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
module.exports.UserSubscription = mongoose.model('UserSubscription', userSubscriptionSchema);
