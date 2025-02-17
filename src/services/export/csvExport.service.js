const { Parser } = require('json2csv');
const ApiError = require('../../utils/ApiError');
const httpStatus = require('http-status');
const BaseExportService = require('./baseExport.service');
const { Company } = require('../../models');
const logger = require('../../config/logger');

class CSVExportService extends BaseExportService {
  constructor() {
    super();
    this.parser = new Parser({
      fields: this.fields,
      header: true,
      defaultValue: '',
    });
  }

  async exportCompanies(filter, res, format = 'csv') {
    let cursor = null;
    try {
      const query = this._buildFilter(filter);
      const sort = this._buildSort(filter.sortBy);

      logger.info('Export query:', JSON.stringify(query, null, 2));

      const count = await Company.countDocuments(query);
      logger.info('Documents to export:', count);

      this._setHeaders(res, format);

      cursor = Company.find(query).sort(sort).lean().cursor();
      await this._processBatches(cursor, res);

      res.end();
      logger.info('CSV export completed successfully');
    } catch (error) {
      logger.error('CSV export failed:', error);
      if (!res.headersSent) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Export processing failed');
      }
    } finally {
      if (cursor) {
        try {
          await cursor.close();
        } catch (error) {
          logger.error('Error closing cursor:', error);
        }
      }
    }
  }

  async exportLatestCompanies(filter, res, format = 'csv') {
    let cursor = null;
    try {
      const pipeline = [
        {
          $addFields: {
            registrationDate: {
              $dateFromString: {
                dateString: '$date_generale.data_inregistrare',
                format: '%Y-%m-%d',
              },
            },
          },
        },
        {
          $match: this._buildDateFilter(filter),
        },
        {
          $sort: { registrationDate: -1, cui: 1 },
        },
      ];

      this._setHeaders(res, format, true);

      cursor = Company.aggregate(pipeline).cursor({ batchSize: this.batchSize }).exec();
      await this._processBatches(cursor, res);

      res.end();
      logger.info('Latest CSV export completed successfully');
    } catch (error) {
      logger.error('Latest CSV export failed:', error);
      if (!res.headersSent) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Export processing failed');
      }
    } finally {
      if (cursor) {
        try {
          await cursor.close();
        } catch (error) {
          logger.error('Error closing cursor:', error);
        }
      }
    }
  }

  async _processBatches(cursor, res) {
    let batch = [];
    let isFirstBatch = true;
    let processedCount = 0;

    while (true) {
      const doc = await cursor.next();
      if (!doc) break;

      const transformedDoc = await this._transformCompany(doc);
      batch.push(transformedDoc);
      processedCount++;

      if (batch.length === this.batchSize) {
        await this._writeBatch(batch, res, isFirstBatch);
        batch = [];
        isFirstBatch = false;
        logger.info(`Processed ${processedCount} documents`);
      }
    }

    if (batch.length > 0) {
      await this._writeBatch(batch, res, isFirstBatch);
      logger.info(`Processed ${processedCount} documents (final batch)`);
    }
  }

  async _writeBatch(batch, res, isFirstBatch) {
    const csv = this.parser.parse(batch);
    if (!isFirstBatch) {
      res.write('\n');
    }
    res.write(csv);
  }
}

module.exports = new CSVExportService();
