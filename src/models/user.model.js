const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const { toJSON, paginate } = require('./plugins');

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
      private: true,
    },
    roleId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Role',
    },
    role: {
      type: String,
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
    usageLimits: {
      companiesViewedToday: {
        count: { type: Number, default: 0 },
        lastReset: { type: Date, default: Date.now },
      },
      exportsToday: {
        count: { type: Number, default: 0 },
        lastReset: { type: Date, default: Date.now },
      },
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

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ 'subscriptionInfo.currentPlan': 1 });
userSchema.index({ 'subscriptionInfo.status': 1 });
userSchema.index({ 'subscriptionInfo.expiresAt': 1 });
userSchema.index({ roleId: 1 });

userSchema.plugin(toJSON);
userSchema.plugin(paginate);

userSchema.statics.isEmailTaken = async function (email, excludeUserId) {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

userSchema.methods.isPasswordMatch = async function (password) {
  const user = this;
  return bcrypt.compare(password, user.password);
};

userSchema.methods.hasPermission = async function (requiredPermission) {
  const role = await mongoose.model('Role').findById(this.roleId);
  return role && role.permissions.includes(requiredPermission);
};

userSchema.methods.getPermissions = async function () {
  const role = await mongoose.model('Role').findById(this.roleId);
  return role ? role.permissions : [];
};

userSchema.methods.getLimits = async function () {
  const role = await mongoose.model('Role').findById(this.roleId);
  return role
    ? role.limits
    : {
        companiesPerDay: 10,
        exportsPerDay: 0,
        maxExportRecords: 0,
      };
};

userSchema.methods.resetDailyUsageIfNeeded = async function () {
  const now = new Date();
  const user = this;
  let reset = false;

  const lastCompanyReset = new Date(user.usageLimits.companiesViewedToday.lastReset);
  if (
    lastCompanyReset.getDate() !== now.getDate() ||
    lastCompanyReset.getMonth() !== now.getMonth() ||
    lastCompanyReset.getFullYear() !== now.getFullYear()
  ) {
    user.usageLimits.companiesViewedToday.count = 0;
    user.usageLimits.companiesViewedToday.lastReset = now;
    reset = true;
  }

  const lastExportReset = new Date(user.usageLimits.exportsToday.lastReset);
  if (
    lastExportReset.getDate() !== now.getDate() ||
    lastExportReset.getMonth() !== now.getMonth() ||
    lastExportReset.getFullYear() !== now.getFullYear()
  ) {
    user.usageLimits.exportsToday.count = 0;
    user.usageLimits.exportsToday.lastReset = now;
    reset = true;
  }

  if (reset) {
    await user.save();
  }

  return reset;
};

userSchema.methods.incrementCompanyViews = async function () {
  await this.resetDailyUsageIfNeeded();
  this.usageLimits.companiesViewedToday.count += 1;
  await this.save();
  return this.usageLimits.companiesViewedToday.count;
};

userSchema.methods.incrementExports = async function () {
  await this.resetDailyUsageIfNeeded();
  this.usageLimits.exportsToday.count += 1;
  await this.save();
  return this.usageLimits.exportsToday.count;
};

userSchema.pre('save', async function (next) {
  const user = this;
  if (user.isModified('password')) {
    user.password = await bcrypt.hash(user.password, 8);
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
