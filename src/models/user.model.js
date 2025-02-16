const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const { toJSON, paginate } = require('./plugins');
const { roles } = require('../config/roles');

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error('Invalid email');
        }
      },
    },
    password: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      validate(value) {
        if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
          throw new Error('Password must contain at least one letter and one number');
        }
      },
      private: true, // used by the toJSON plugin
    },
    role: {
      type: String,
      enum: roles,
      default: 'user',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    subscriptionInfo: {
      currentPlan: {
        type: String,
        enum: ['free', 'basic', 'premium', 'enterprise'],
        default: 'free',
      },
      status: {
        type: String,
        enum: ['active', 'canceled', 'expired', 'pending', 'none'],
        default: 'none',
      },
      expiresAt: {
        type: Date,
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
      paymentHistory: [
        {
          transactionId: String,
          amount: Number,
          date: Date,
          status: {
            type: String,
            enum: ['success', 'failed', 'pending'],
            required: true,
          },
        },
      ],
    },
    lastLoginAt: {
      type: Date,
    },
    preferences: {
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      defaultExportFormat: {
        type: String,
        enum: ['csv', 'xlsx'],
        default: 'csv',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ 'subscriptionInfo.currentPlan': 1 });
userSchema.index({ 'subscriptionInfo.status': 1 });
userSchema.index({ 'subscriptionInfo.expiresAt': 1 });

// Add plugins
userSchema.plugin(toJSON);
userSchema.plugin(paginate);

/**
 * Check if email is taken
 * @param {string} email - The user's email
 * @param {ObjectId} [excludeUserId] - The id of the user to be excluded
 * @returns {Promise<boolean>}
 */
userSchema.statics.isEmailTaken = async function (email, excludeUserId) {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

/**
 * Check if password matches the user's password
 * @param {string} password
 * @returns {Promise<boolean>}
 */
userSchema.methods.isPasswordMatch = async function (password) {
  const user = this;
  return bcrypt.compare(password, user.password);
};

/**
 * Reset monthly usage counters if needed
 */
userSchema.methods.resetUsageIfNeeded = async function () {
  const user = this;
  const lastReset = new Date(user.subscriptionInfo.usage.lastResetDate);
  const now = new Date();

  if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
    user.subscriptionInfo.usage.companiesViewed = 0;
    user.subscriptionInfo.usage.exportsCount = 0;
    user.subscriptionInfo.usage.lastResetDate = now;
    await user.save();
  }
};

/**
 * Update company view count
 */
userSchema.methods.incrementCompanyViews = async function () {
  const user = this;
  await user.resetUsageIfNeeded();
  user.subscriptionInfo.usage.companiesViewed += 1;
  await user.save();
};

/**
 * Update export count
 */
userSchema.methods.incrementExports = async function () {
  const user = this;
  await user.resetUsageIfNeeded();
  user.subscriptionInfo.usage.exportsCount += 1;
  await user.save();
};

// Hash password before saving
userSchema.pre('save', async function (next) {
  const user = this;
  if (user.isModified('password')) {
    user.password = await bcrypt.hash(user.password, 8);
  }
  next();
});

/**
 * @typedef User
 */
const User = mongoose.model('User', userSchema);

module.exports = User;
