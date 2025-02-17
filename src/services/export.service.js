const { Company, CAEN } = require('../models');
const { Parser } = require('json2csv');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const logger = require('../config/logger');

class ExportService {
  constructor() {
    this.fields = [
      { label: 'CUI', value: 'cui' },
      { label: 'Denumire', value: 'denumire' },
      { label: 'Cod CAEN', value: 'caen.cod' },
      { label: 'Activitate CAEN', value: 'caen.activitate' },
      { label: 'Nr. Înregistrare', value: 'inregistrare.numar' },
      { label: 'Data Înregistrare', value: 'inregistrare.data' },
      { label: 'Telefon', value: 'contact.telefon' },
      { label: 'Email', value: 'contact.email' },
      { label: 'Website', value: 'contact.website' },
      { label: 'Stare Firmă', value: 'inregistrare.stare' },
      { label: 'Adresă Completă', value: 'adresa_completa' },
      { label: 'Județ', value: 'adresa.judet' },
      { label: 'Localitate', value: 'adresa.localitate' },
      { label: 'Stradă', value: 'adresa.strada' },
      { label: 'Număr', value: 'adresa.numar' },
      { label: 'Cod Poștal', value: 'adresa.cod_postal' },
      { label: 'Fax', value: 'contact.fax' },
      { label: 'Organ Fiscal', value: 'inregistrare.organ_fiscal' },
      { label: 'Formă Juridică', value: 'tip_firma.forma_juridica' },
      { label: 'Formă Organizare', value: 'tip_firma.forma_organizare' },
      { label: 'Formă Proprietate', value: 'tip_firma.forma_proprietate' },
    ];
    this.batchSize = 1000;
    this.caenCache = new Map();
  }

  async _getCaenName(code) {
    if (!code) return '';

    if (this.caenCache.has(code)) {
      return this.caenCache.get(code);
    }

    try {
      const caenData = await CAEN.findOne({ code }, { name: 1 }).lean();
      const name = caenData?.name || '';
      this.caenCache.set(code, name);
      return name;
    } catch (error) {
      logger.error(`Error fetching CAEN name for code ${code}:`, error);
      return '';
    }
  }

  async exportCompanies(filter, res) {
    if (!res) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Response object is required');
    }

    let cursor = null;
    try {
      const query = this._buildFilter(filter);
      const sort = this._buildSort(filter.sortBy);

      logger.info('Export query:', JSON.stringify(query, null, 2));

      const count = await Company.countDocuments(query);
      logger.info('Documents to export:', count);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=companies-export-${Date.now()}.csv`);
      res.write('\ufeff'); // BOM for Excel UTF-8 compatibility

      const parser = new Parser({
        fields: this.fields,
        header: true,
        defaultValue: '',
      });

      cursor = Company.find(query).sort(sort).lean().cursor();

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
          const csv = parser.parse(batch);
          if (!isFirstBatch) {
            res.write('\n');
          }
          res.write(csv);
          batch = [];
          isFirstBatch = false;
          logger.info(`Processed ${processedCount} documents`);
        }
      }

      if (batch.length > 0) {
        const csv = parser.parse(batch);
        if (!isFirstBatch) {
          res.write('\n');
        }
        res.write(csv);
        logger.info(`Processed ${processedCount} documents (final batch)`);
      }

      res.end();
      logger.info('Export completed successfully');
    } catch (error) {
      logger.error('Export failed:', error);
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

  _buildSort(sortBy) {
    if (sortBy === 'registration_date_asc') {
      return { 'date_generale.data_inregistrare': 1 };
    }
    return { 'date_generale.data_inregistrare': -1 };
  }

  _buildFilter(filter) {
    const query = {};

    if (filter.cod_CAEN) {
      query.cod_CAEN = filter.cod_CAEN;
    }

    if (filter.judet) {
      query['adresa_anaf.sediu_social.sdenumire_Judet'] = {
        $regex: new RegExp(filter.judet, 'i'),
      };
    }

    if (filter.oras) {
      query['adresa_anaf.sediu_social.sdenumire_Localitate'] = {
        $regex: new RegExp(filter.oras, 'i'),
      };
    }

    if (filter.hasWebsite === 'true') {
      query['date_generale.website'] = { $exists: true, $ne: '' };
    }

    if (filter.hasContact === 'true') {
      query.$or = [
        { 'date_generale.telefon': { $exists: true, $ne: '' } },
        { 'date_generale.email': { $exists: true, $ne: '' } },
      ];
    }

    if (filter.dateStart || filter.dateEnd) {
      query['date_generale.data_inregistrare'] = {};

      if (filter.dateStart) {
        query['date_generale.data_inregistrare'].$gte = filter.dateStart;
      }

      if (filter.dateEnd) {
        query['date_generale.data_inregistrare'].$lte = filter.dateEnd;
      }
    }

    return query;
  }

  async _transformCompany(company) {
    const anafAddress = company.adresa_anaf?.sediu_social;
    const dateGenerale = company.date_generale;
    const caenName = await this._getCaenName(company.cod_CAEN);

    return {
      cui: company.cui,
      denumire: company.denumire,
      caen: {
        cod: company.cod_CAEN || '',
        activitate: caenName,
      },
      inregistrare: {
        numar: company.cod_inmatriculare || dateGenerale?.nrRegCom || '',
        data: dateGenerale?.data_inregistrare || '',
        stare: dateGenerale?.stare_inregistrare || '',
        organ_fiscal: dateGenerale?.organFiscalCompetent || '',
      },
      contact: {
        telefon: dateGenerale?.telefon || '',
        email: dateGenerale?.email || '',
        website: dateGenerale?.website || '',
        fax: dateGenerale?.fax || '',
      },
      adresa_completa: this._formatAnafAddress(anafAddress),
      adresa: {
        judet: anafAddress?.sdenumire_Judet || '',
        localitate: anafAddress?.sdenumire_Localitate || '',
        strada: anafAddress?.sdenumire_Strada || '',
        numar: anafAddress?.snumar_Strada || '',
        cod_postal: anafAddress?.scod_Postal || '',
      },
      tip_firma: {
        forma_juridica: dateGenerale?.forma_juridica || '',
        forma_organizare: dateGenerale?.forma_organizare || '',
        forma_proprietate: dateGenerale?.forma_de_proprietate || '',
      },
    };
  }

  _formatAnafAddress(anafAddress) {
    if (!anafAddress) return '';

    const parts = [];

    if (anafAddress.sdenumire_Strada?.trim()) {
      parts.push(anafAddress.sdenumire_Strada.trim());
    }

    if (anafAddress.snumar_Strada?.trim()) {
      parts.push(`Nr. ${anafAddress.snumar_Strada.trim()}`);
    }

    if (anafAddress.sdetalii_Adresa?.trim()) {
      parts.push(anafAddress.sdetalii_Adresa.trim());
    }

    if (anafAddress.sdenumire_Localitate?.trim()) {
      parts.push(anafAddress.sdenumire_Localitate.trim());
    }

    if (anafAddress.sdenumire_Judet?.trim()) {
      parts.push(`Jud. ${anafAddress.sdenumire_Judet.trim()}`);
    }

    if (anafAddress.scod_Postal?.trim()) {
      parts.push(`CP ${anafAddress.scod_Postal.trim()}`);
    }

    return parts.join(', ');
  }
}

module.exports = new ExportService();
