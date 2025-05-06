const httpStatus = require('http-status');
const { Role, User } = require('../models');
const ApiError = require('../utils/ApiError');

const createRole = async (roleBody) => {
  if (await Role.findOne({ name: roleBody.name })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Role name already taken');
  }
  return Role.create(roleBody);
};

const queryRoles = async (filter, options) => {
  const roles = await Role.paginate(filter, options);
  return roles;
};

const getRoleById = async (id) => {
  return Role.findById(id);
};

const getRoleByName = async (name) => {
  return Role.findOne({ name });
};

const updateRoleById = async (roleId, updateBody) => {
  const role = await getRoleById(roleId);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  if (updateBody.name && (await Role.findOne({ name: updateBody.name, _id: { $ne: roleId } }))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Role name already taken');
  }
  Object.assign(role, updateBody);
  await role.save();
  return role;
};

const deleteRoleById = async (roleId) => {
  const role = await getRoleById(roleId);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }

  const usersWithRole = await User.countDocuments({ roleId });
  if (usersWithRole > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot delete role: ${usersWithRole} users are currently assigned to this role`
    );
  }

  await role.remove();
  return role;
};

const initDefaultRoles = async () => {
  const defaultRoles = [
    {
      name: 'admin',
      description: 'Administrator with full access',
      permissions: [
        'manageUsers',
        'manageRoles',
        'viewCompanies',
        'editCompanies',
        'viewCompanyDetails',
        'exportCompanies',
        'bulkExport',
        'advancedSearch',
        'viewAnalytics',
      ],
      limits: {
        companiesPerDay: -1, // Unlimited
        exportsPerDay: -1, // Unlimited
        maxExportRecords: -1, // Unlimited
      },
      isDefault: true,
    },
    {
      name: 'user',
      description: 'Regular user with basic access',
      permissions: ['viewCompanies'],
      limits: {
        companiesPerDay: 10,
        exportsPerDay: 0,
        maxExportRecords: 0,
      },
      isDefault: true,
    },
    {
      name: 'premium',
      description: 'Premium subscriber with expanded access',
      permissions: ['viewCompanies', 'viewCompanyDetails', 'exportCompanies', 'advancedSearch'],
      limits: {
        companiesPerDay: 100,
        exportsPerDay: 5,
        maxExportRecords: 1000,
      },
      isDefault: true,
    },
    {
      name: 'enterprise',
      description: 'Enterprise user with full feature access',
      permissions: [
        'viewCompanies',
        'viewCompanyDetails',
        'exportCompanies',
        'bulkExport',
        'advancedSearch',
        'viewAnalytics',
      ],
      limits: {
        companiesPerDay: 500,
        exportsPerDay: 20,
        maxExportRecords: 5000,
      },
      isDefault: true,
    },
  ];

  for (const roleData of defaultRoles) {
    await Role.findOneAndUpdate({ name: roleData.name }, roleData, { upsert: true, new: true });
  }
};

module.exports = {
  createRole,
  queryRoles,
  getRoleById,
  getRoleByName,
  updateRoleById,
  deleteRoleById,
  initDefaultRoles,
};
