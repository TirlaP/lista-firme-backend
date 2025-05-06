const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const permissionSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['user', 'company', 'subscription', 'export', 'admin', 'system'],
      default: 'system',
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

permissionSchema.plugin(toJSON);

permissionSchema.statics.createDefaultPermissions = async function () {
  const defaultPermissions = [
    { name: 'viewCompanies', description: 'View companies list', category: 'company' },
    { name: 'viewCompanyDetails', description: 'View company details', category: 'company' },
    { name: 'searchCompanies', description: 'Search companies', category: 'company' },
    { name: 'exportCompanies', description: 'Export companies data', category: 'export' },
    { name: 'advancedFilters', description: 'Use advanced search filters', category: 'company' },
    { name: 'viewLatestCompanies', description: 'View latest registered companies', category: 'company' },
    { name: 'viewAnalytics', description: 'View analytics and statistics', category: 'company' },
    { name: 'bulkExport', description: 'Perform bulk exports', category: 'export' },
    { name: 'accessAPI', description: 'Access API endpoints', category: 'system' },
    { name: 'manageUsers', description: 'Manage user accounts', category: 'admin' },
    { name: 'manageRoles', description: 'Manage roles and permissions', category: 'admin' },
    { name: 'manageSubscriptions', description: 'Manage subscription plans', category: 'admin' },
    { name: 'viewAdminDashboard', description: 'Access admin dashboard', category: 'admin' },
    { name: 'editCompanies', description: 'Edit company information', category: 'admin' },
  ];

  for (const permission of defaultPermissions) {
    await this.findOneAndUpdate({ name: permission.name }, permission, { upsert: true, new: true });
  }
};

const Permission = mongoose.model('Permission', permissionSchema);

module.exports = Permission;
