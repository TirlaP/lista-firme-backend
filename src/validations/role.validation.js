const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createRole = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    description: Joi.string().required(),
    permissions: Joi.array().items(Joi.string()).required(),
    limits: Joi.object().keys({
      companiesPerDay: Joi.number().integer().required(),
      exportsPerDay: Joi.number().integer().required(),
      maxExportRecords: Joi.number().integer().required(),
    }),
    isDefault: Joi.boolean(),
  }),
};

const getRoles = {
  query: Joi.object().keys({
    name: Joi.string(),
    isDefault: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getRole = {
  params: Joi.object().keys({
    roleId: Joi.string().custom(objectId),
  }),
};

const updateRole = {
  params: Joi.object().keys({
    roleId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      description: Joi.string(),
      permissions: Joi.array().items(Joi.string()),
      limits: Joi.object().keys({
        companiesPerDay: Joi.number().integer(),
        exportsPerDay: Joi.number().integer(),
        maxExportRecords: Joi.number().integer(),
      }),
      isDefault: Joi.boolean(),
    })
    .min(1),
};

const deleteRole = {
  params: Joi.object().keys({
    roleId: Joi.string().custom(objectId),
  }),
};

module.exports = {
  createRole,
  getRoles,
  getRole,
  updateRole,
  deleteRole,
};
