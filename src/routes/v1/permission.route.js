const express = require('express');
const { auth, checkPermissions } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const permissionValidation = require('../../validations/permission.validation');
const permissionController = require('../../controllers/permission.controller');

const router = express.Router();

router
  .route('/')
  .post(
    auth(),
    checkPermissions('managePermissions'),
    validate(permissionValidation.createPermission),
    permissionController.createPermission
  )
  .get(auth(), checkPermissions('viewPermissions'), permissionController.getPermissions);

router.route('/categories').get(auth(), checkPermissions('viewPermissions'), permissionController.getCategories);

router
  .route('/:permissionId')
  .get(
    auth(),
    checkPermissions('viewPermissions'),
    validate(permissionValidation.getPermission),
    permissionController.getPermission
  )
  .patch(
    auth(),
    checkPermissions('managePermissions'),
    validate(permissionValidation.updatePermission),
    permissionController.updatePermission
  )
  .delete(
    auth(),
    checkPermissions('managePermissions'),
    validate(permissionValidation.deletePermission),
    permissionController.deletePermission
  );

module.exports = router;
