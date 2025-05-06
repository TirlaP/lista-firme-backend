const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const roleValidation = require('../../validations/role.validation');
const roleController = require('../../controllers/role.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('manageRoles'), validate(roleValidation.createRole), roleController.createRole)
  .get(auth('manageRoles'), validate(roleValidation.getRoles), roleController.getRoles);

router
  .route('/:roleId')
  .get(auth('manageRoles'), validate(roleValidation.getRole), roleController.getRole)
  .patch(auth('manageRoles'), validate(roleValidation.updateRole), roleController.updateRole)
  .delete(auth('manageRoles'), validate(roleValidation.deleteRole), roleController.deleteRole);

module.exports = router;
