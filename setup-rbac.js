const mongoose = require('mongoose');
const config = require('./src/config/config');
const bcrypt = require('bcryptjs');
const { Role, Permission, User } = require('./src/models');
const logger = require('./src/config/logger');

async function createDefaultPermissions() {
  logger.info('Creating default permissions...');

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
    { name: 'getUsers', description: 'View users list', category: 'admin' },
  ];

  const permissions = {};

  for (const permData of defaultPermissions) {
    const perm = await Permission.findOneAndUpdate(
      { name: permData.name },
      { ...permData, isActive: true },
      { upsert: true, new: true }
    );

    permissions[permData.name] = perm._id;
    logger.info(`Permission created/updated: ${perm.name}`);
  }

  return permissions;
}

async function createDefaultRoles(permissions) {
  logger.info('Creating default roles...');

  const roles = {
    admin: await Role.findOneAndUpdate(
      { name: 'admin' },
      {
        name: 'admin',
        description: 'Administrator with full access',
        permissions: Object.values(permissions).map((id) => id.toString()),
        limits: {
          companiesPerDay: -1, // Unlimited
          exportsPerDay: -1,
          maxExportRecords: -1,
        },
        isDefault: true,
      },
      { upsert: true, new: true }
    ),

    user: await Role.findOneAndUpdate(
      { name: 'user' },
      {
        name: 'user',
        description: 'Basic user with limited access',
        permissions: [permissions.viewCompanies.toString(), permissions.viewLatestCompanies.toString()],
        limits: {
          companiesPerDay: 10,
          exportsPerDay: 0,
          maxExportRecords: 0,
        },
        isDefault: true,
      },
      { upsert: true, new: true }
    ),

    basic: await Role.findOneAndUpdate(
      { name: 'basic' },
      {
        name: 'basic',
        description: 'User with basic subscription',
        permissions: [
          permissions.viewCompanies.toString(),
          permissions.viewCompanyDetails.toString(),
          permissions.searchCompanies.toString(),
          permissions.viewLatestCompanies.toString(),
          permissions.exportCompanies.toString(),
        ],
        limits: {
          companiesPerDay: 50,
          exportsPerDay: 2,
          maxExportRecords: 500,
        },
        isDefault: true,
      },
      { upsert: true, new: true }
    ),

    premium: await Role.findOneAndUpdate(
      { name: 'premium' },
      {
        name: 'premium',
        description: 'User with premium subscription',
        permissions: [
          permissions.viewCompanies.toString(),
          permissions.viewCompanyDetails.toString(),
          permissions.searchCompanies.toString(),
          permissions.exportCompanies.toString(),
          permissions.advancedFilters.toString(),
          permissions.viewLatestCompanies.toString(),
          permissions.viewAnalytics.toString(),
          permissions.bulkExport.toString(),
        ],
        limits: {
          companiesPerDay: 200,
          exportsPerDay: 10,
          maxExportRecords: 5000,
        },
        isDefault: true,
      },
      { upsert: true, new: true }
    ),

    enterprise: await Role.findOneAndUpdate(
      { name: 'enterprise' },
      {
        name: 'enterprise',
        description: 'User with enterprise subscription',
        permissions: [
          permissions.viewCompanies.toString(),
          permissions.viewCompanyDetails.toString(),
          permissions.searchCompanies.toString(),
          permissions.exportCompanies.toString(),
          permissions.advancedFilters.toString(),
          permissions.viewLatestCompanies.toString(),
          permissions.viewAnalytics.toString(),
          permissions.bulkExport.toString(),
          permissions.accessAPI.toString(),
        ],
        limits: {
          companiesPerDay: -1,
          exportsPerDay: -1,
          maxExportRecords: 50000,
        },
        isDefault: true,
      },
      { upsert: true, new: true }
    ),
  };

  logger.info(`Created/updated ${Object.keys(roles).length} roles`);
  return roles;
}

async function updateExistingUsers(roles) {
  logger.info('Updating existing users...');

  // Update the admin user
  const adminUser = await User.findOne({ role: 'admin' });
  if (adminUser) {
    adminUser.roleId = roles.admin._id;
    await adminUser.save();
    logger.info(`Updated admin user: ${adminUser.email}`);
  }

  // Update regular users
  const regularUsers = await User.find({ role: 'user' });
  for (const user of regularUsers) {
    user.roleId = roles.user._id;
    await user.save();
    logger.info(`Updated regular user: ${user.email}`);
  }
}

async function createTestUsers(roles) {
  logger.info('Creating test users...');

  const testUsers = [
    {
      name: 'Basic User',
      email: 'basic@example.com',
      password: 'Pass1234',
      role: 'basic',
      roleId: roles.basic._id,
      isEmailVerified: true,
      subscriptionInfo: {
        currentPlan: 'basic',
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      },
    },
    {
      name: 'Premium User',
      email: 'premium@example.com',
      password: 'Pass1234',
      role: 'premium',
      roleId: roles.premium._id,
      isEmailVerified: true,
      subscriptionInfo: {
        currentPlan: 'premium',
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      },
    },
    {
      name: 'Enterprise User',
      email: 'enterprise@example.com',
      password: 'Pass1234',
      role: 'enterprise',
      roleId: roles.enterprise._id,
      isEmailVerified: true,
      subscriptionInfo: {
        currentPlan: 'enterprise',
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      },
    },
  ];

  for (const userData of testUsers) {
    // Check if user already exists
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      existingUser.roleId = userData.roleId;
      existingUser.role = userData.role;
      existingUser.subscriptionInfo = userData.subscriptionInfo;
      await existingUser.save();
      logger.info(`Updated existing test user: ${existingUser.email}`);
    } else {
      // Hash the password
      const hashedPassword = await bcrypt.hash(userData.password, 8);

      // Create the user
      const newUser = await User.create({
        ...userData,
        password: hashedPassword,
        usageLimits: {
          companiesViewedToday: {
            count: 0,
            lastReset: new Date(),
          },
          exportsToday: {
            count: 0,
            lastReset: new Date(),
          },
        },
      });

      logger.info(`Created new test user: ${newUser.email}`);
    }
  }
}

async function main() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Connected to MongoDB');

    const permissions = await createDefaultPermissions();
    const roles = await createDefaultRoles(permissions);
    await updateExistingUsers(roles);
    await createTestUsers(roles);

    logger.info('RBAC setup completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error setting up RBAC:', error);
    process.exit(1);
  }
}

main();
