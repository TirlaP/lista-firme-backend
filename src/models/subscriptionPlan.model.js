const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const subscriptionPlanSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: ['free', 'basic', 'premium', 'enterprise', 'lifetime'],
    },
    displayName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      amount: {
        type: Number,
        required: true,
        min: 0,
      },
      currency: {
        type: String,
        required: true,
        default: 'RON',
      },
      billingPeriod: {
        type: String,
        enum: ['monthly', 'yearly', 'lifetime'],
        required: true,
      },
    },
    features: [
      {
        name: {
          type: String,
          required: true,
        },
        description: {
          type: String,
        },
        included: {
          type: Boolean,
          default: true,
        },
      },
    ],
    limits: {
      maxCompanyViews: {
        type: Number,
        required: true,
        min: 0,
      },
      maxExports: {
        type: Number,
        required: true,
        min: 0,
      },
      maxSearches: {
        type: Number,
        required: true,
        min: 0,
      },
      allowedExportFormats: {
        type: [String],
        enum: ['csv', 'xlsx', 'pdf', 'json'],
        default: ['csv'],
      },
      advancedFilters: {
        type: Boolean,
        default: false,
      },
      dataFields: {
        type: [String],
        default: ['name', 'cui', 'address', 'status'],
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

subscriptionPlanSchema.index({ name: 1 }, { unique: true });
subscriptionPlanSchema.index({ isActive: 1 });
subscriptionPlanSchema.index({ displayOrder: 1 });

subscriptionPlanSchema.plugin(toJSON);

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

module.exports = SubscriptionPlan;
