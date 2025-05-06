const express = require('express');
const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const docsRoute = require('./docs.route');
const caenRoute = require('./caen.route');
const subscriptionRoute = require('./subscription.route');
const locationRoute = require('./location.route');
const roleRoute = require('./role.route');
const config = require('../../config/config');

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/users',
    route: userRoute,
  },
  {
    path: '/caen',
    route: caenRoute,
  },
  {
    path: '/subscriptions',
    route: subscriptionRoute,
  },
  {
    path: '/locations',
    route: locationRoute,
  },
  {
    path: '/roles',
    route: roleRoute,
  },
];

const devRoutes = [
  {
    path: '/docs',
    route: docsRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

module.exports = router;
