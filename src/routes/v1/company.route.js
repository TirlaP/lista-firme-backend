// src/routes/v1/company.route.js
const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const companyValidation = require('../../validations/company.validation');
const companyController = require('../../controllers/company.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Companies
 *   description: Company information management and retrieval
 *
 * /v1/companies:
 *   get:
 *     summary: Get filtered list of companies
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cod_CAEN
 *         schema:
 *           type: string
 *         description: Filter by CAEN code
 *       - in: query
 *         name: judet
 *         schema:
 *           type: string
 *         description: Filter by county
 *       - in: query
 *         name: oras
 *         schema:
 *           type: string
 *         description: Filter by city
 *       - in: query
 *         name: hasWebsite
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter companies with websites
 *       - in: query
 *         name: hasContact
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter companies with contact information
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Results per page
 *     responses:
 *       200:
 *         description: Success
 *         headers:
 *           X-Results-Type:
 *             schema:
 *               type: string
 *               enum: [partial, complete]
 *             description: Indicates if results are partial or complete
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid parameters
 */
router.route('/').get(auth(), validate(companyValidation.getCompanies), companyController.getCompanies);

/**
 * @swagger
 * /v1/companies/search:
 *   get:
 *     summary: Search companies by name
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Search query
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Results per page
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid search parameters
 */
router.route('/search').get(auth(), validate(companyValidation.searchCompanies), companyController.searchCompanies);

/**
 * @swagger
 * /v1/companies/stats:
 *   get:
 *     summary: Get company statistics
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalCompanies:
 *                   type: integer
 *                   description: Total number of companies
 *                 activeCompanies:
 *                   type: integer
 *                   description: Number of active companies
 *                 withWebsite:
 *                   type: integer
 *                   description: Number of companies with websites
 *                 withContact:
 *                   type: integer
 *                   description: Number of companies with contact information
 *       401:
 *         description: Unauthorized
 */
router.route('/stats').get(auth(), companyController.getStats);

/**
 * @swagger
 * /v1/companies/{cui}:
 *   get:
 *     summary: Get company by CUI
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cui
 *         required: true
 *         schema:
 *           type: integer
 *         description: Company CUI (Unique Identification Code)
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Company not found
 *       400:
 *         description: Invalid CUI format
 */
router.route('/:cui').get(auth(), validate(companyValidation.getCompany), companyController.getCompany);

module.exports = router;
