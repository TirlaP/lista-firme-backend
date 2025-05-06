const express = require('express');
const { auth, checkPermissions } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const userRoleValidation = require('../../validations/userRole.validation');
const userRoleController = require('../../controllers/userRole.controller');

const router = express.Router();

router
  .route('/:userId/roles')
  .get(auth(), checkPermissions('viewUsers'), validate(userRoleValidation.getUserRoles), userRoleController.getUserRoles)
  .put(
    auth(),
    checkPermissions('manageUsers'),
    validate(userRoleValidation.updateUserRoles),
    userRoleController.updateUserRoles
  );

router
  .route('/:userId/permissions')
  .get(
    auth(),
    checkPermissions('viewUsers'),
    validate(userRoleValidation.getUserRoles),
    userRoleController.getUserPermissions
  );

router
  .route('/:userId/permissions/:permissionName')
  .get(
    auth(),
    checkPermissions('viewUsers'),
    validate(userRoleValidation.checkUserPermission),
    userRoleController.checkUserPermission
  );

router
  .route('/:userId/sync-subscription-roles')
  .post(
    auth(),
    checkPermissions('manageUsers'),
    validate(userRoleValidation.getUserRoles),
    userRoleController.syncSubscriptionRoles
  );

module.exports = router;
