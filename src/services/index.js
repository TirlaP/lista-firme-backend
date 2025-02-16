// src/services/index.js
module.exports.authService = require('./auth.service');
module.exports.emailService = require('./email.service');
module.exports.tokenService = require('./token.service');
module.exports.userService = require('./user.service');
module.exports.companyService = require('./company.service');
module.exports.caenService = require('./caen.service');
module.exports.cacheService = require('./cache.service'); // Use this instead of redis.service
module.exports.paymentService = require('./payment.service');
module.exports.subscriptionService = require('./subscription.service');
module.exports.locationService = require('./location.service');

module.exports.exportService = require('./export.service');
module.exports.latestExportService = require('./latestExport.service');
module.exports.latestCompaniesService = require('./latestCompanies.service');
module.exports.csvExportService = require('./export/csvExport.service');
module.exports.xlsExportService = require('./export/xlsExport.service');
