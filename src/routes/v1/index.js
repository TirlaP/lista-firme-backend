// src/routes/v1/index.js
const express = require('express');
const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const companyRoute = require('./company.route');
const docsRoute = require('./docs.route');
const caenRoute = require('./caen.route');
const exportRoute = require('./export.route');
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
    path: '/companies',
    route: companyRoute,
  },
  {
    path: '/caen',
    route: caenRoute,
  },
  {
    path: '/export',
    route: exportRoute,
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

/* istanbul ignore next */
if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

module.exports = router;
