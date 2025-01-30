const ExcelJS = require('exceljs');
const ApiError = require('../../utils/ApiError');
const httpStatus = require('http-status');
const BaseExportService = require('./baseExport.service');
const { Company } = require('../../models');

class ExcelExportService extends BaseExportService {
  constructor() {
    super();
    this.workbook = null;
    this.worksheet = null;
  }

  async exportCompanies(filter, res, format = 'xlsx') {
    let cursor = null;
    try {
      const query = this._buildFilter(filter);
      const sort = this._buildSort(filter.sortBy);

      console.log('Export query:', JSON.stringify(query, null, 2));

      const count = await Company.countDocuments(query);
      console.log('Documents to export:', count);

      await this._initializeExcel();
      this._setHeaders(res, format);

      cursor = Company.find(query).sort(sort).lean().cursor();
      await this._processBatches(cursor, res);

      await this.workbook.xlsx.write(res);
      console.log('Excel export completed successfully');
    } catch (error) {
      console.error('Excel export failed:', error);
      if (!res.headersSent) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Export processing failed');
      }
    } finally {
      if (cursor) {
        try {
          await cursor.close();
        } catch (error) {
          console.error('Error closing cursor:', error);
        }
      }
    }
  }

  async exportLatestCompanies(filter, res, format = 'xlsx') {
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

      await this._initializeExcel();
      this._setHeaders(res, format, true);

      cursor = Company.aggregate(pipeline).cursor({ batchSize: this.batchSize }).exec();
      await this._processBatches(cursor, res);

      await this.workbook.xlsx.write(res);
      console.log('Latest Excel export completed successfully');
    } catch (error) {
      console.error('Latest Excel export failed:', error);
      if (!res.headersSent) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Export processing failed');
      }
    } finally {
      if (cursor) {
        try {
          await cursor.close();
        } catch (error) {
          console.error('Error closing cursor:', error);
        }
      }
    }
  }

  async _initializeExcel() {
    this.workbook = new ExcelJS.Workbook();
    this.worksheet = this.workbook.addWorksheet('Companies');

    // Configure columns with proper width and headers
    this.worksheet.columns = this.fields.map((field) => ({
      header: field.label,
      key: field.value.replace(/\./g, '_'),
      width: 20,
      style: {
        alignment: { vertical: 'middle', horizontal: 'left' },
      },
    }));

    // Style header row
    const headerRow = this.worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Freeze the header row
    this.worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];
  }

  async _processBatches(cursor, res) {
    let processedCount = 0;
    let rowNum = 2; // Start from row 2 (after headers)

    while (true) {
      const doc = await cursor.next();
      if (!doc) break;

      const transformedDoc = await this._transformCompany(doc);
      await this._addRowToExcel(transformedDoc, rowNum++);
      processedCount++;

      if (processedCount % this.batchSize === 0) {
        console.log(`Processed ${processedCount} documents`);
      }
    }

    // Auto-filter for all columns
    this.worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rowNum - 1, column: this.fields.length },
    };

    console.log(`Processed ${processedCount} documents (total)`);
  }

  async _addRowToExcel(data, rowNum) {
    const flattenedData = {};

    // Flatten nested objects for Excel
    this.fields.forEach((field) => {
      const path = field.value.split('.');
      let value = data;
      for (const key of path) {
        value = value?.[key];
      }
      flattenedData[field.value.replace(/\./g, '_')] = value || '';
    });

    const row = this.worksheet.getRow(rowNum);
    row.values = flattenedData;

    // Style row cells
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

      // Add thin borders
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  }
}

module.exports = new ExcelExportService();
