const { auth, checkPermissions } = require('./auth');
const { checkSubscriptionAccess, checkUsageLimit, checkExportAccess } = require('./subscription.middleware');

const protectedEndpoint = (permissions = [], subscriptionFeature = null, usageType = null) => {
  const middlewares = [auth()];

  if (permissions.length > 0) {
    middlewares.push(checkPermissions(...permissions));
  }

  if (subscriptionFeature) {
    middlewares.push(checkSubscriptionAccess(subscriptionFeature));
  }

  if (usageType) {
    middlewares.push(checkUsageLimit(usageType));
  }

  return middlewares;
};

const exportEndpoint = (permissions = []) => {
  return [auth(), ...(permissions.length > 0 ? [checkPermissions(...permissions)] : []), checkExportAccess];
};

module.exports = {
  protectedEndpoint,
  exportEndpoint,
};
