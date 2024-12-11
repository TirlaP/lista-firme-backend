const { Company } = require('../models');
const { Parser } = require('json2csv');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

class ExportService {
  constructor() {
    this.fields = [
      {
        label: 'CUI',
        value: 'cui',
      },
      {
        label: 'Company Name',
        value: 'nume',
      },
      {
        label: 'CAEN Code',
        value: 'cod_CAEN',
      },
      {
        label: 'Full Address',
        value: 'adresa_completa',
      },
      {
        label: 'County',
        value: 'adresa.judet',
      },
      {
        label: 'City',
        value: 'adresa.localitate',
      },
      {
        label: 'Street',
        value: 'adresa.strada',
      },
      {
        label: 'Number',
        value: 'adresa.numar',
      },
      {
        label: 'Phone',
        value: 'contact.telefon',
      },
      {
        label: 'Email',
        value: 'contact.email',
      },
      {
        label: 'Website',
        value: 'contact.website',
      },
      {
        label: 'Fax',
        value: 'contact.fax',
      },
      {
        label: 'Registration Number',
        value: 'inregistrare.numar',
      },
      {
        label: 'Status',
        value: 'inregistrare.stare',
      },
      {
        label: 'Registration Date',
        value: 'inregistrare.data',
      },
      {
        label: 'Fiscal Authority',
        value: 'inregistrare.organ_fiscal',
      },
      {
        label: 'Legal Form',
        value: 'tip_firma.forma_juridica',
      },
      {
        label: 'Organization Form',
        value: 'tip_firma.forma_organizare',
      },
      {
        label: 'Property Form',
        value: 'tip_firma.forma_proprietate',
      },
    ];
    this.batchSize = 1000;
  }

  _buildFilter(filter) {
    const query = {};

    if (filter.cod_CAEN) {
      query.cod_CAEN = filter.cod_CAEN;
    }

    if (filter.judet) {
      query['adresa_anaf.sediu_social.sdenumire_Judet'] = {
        $regex: filter.judet,
        $options: 'i',
      };
    }

    if (filter.oras) {
      query['adresa_anaf.sediu_social.sdenumire_Localitate'] = {
        $regex: filter.oras,
        $options: 'i',
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

    return query;
  }

  _transformCompany(company) {
    const anafAddress = company.adresa_anaf?.sediu_social;
    const dateGenerale = company.date_generale;

    return {
      cui: company.cui,
      nume: company.denumire,
      cod_CAEN: company.cod_CAEN || '',
      adresa: {
        strada: anafAddress?.sdenumire_Strada || '',
        numar: anafAddress?.snumar_Strada || '',
        localitate: anafAddress?.sdenumire_Localitate || '',
        judet: anafAddress?.sdenumire_Judet || '',
        cod_postal: anafAddress?.scod_Postal || '',
        detalii: anafAddress?.sdetalii_Adresa || '',
        tara: anafAddress?.stara || 'România',
      },
      adresa_completa: this._formatAnafAddress(anafAddress),
      contact: {
        email: dateGenerale?.email || '',
        telefon: dateGenerale?.telefon || '',
        fax: dateGenerale?.fax || '',
        website: dateGenerale?.website || '',
      },
      inregistrare: {
        numar: company.cod_inmatriculare || dateGenerale?.nrRegCom || '',
        stare: dateGenerale?.stare_inregistrare || '',
        data: dateGenerale?.data_inregistrare || '',
        organ_fiscal: dateGenerale?.organFiscalCompetent || '',
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
    if (anafAddress.sdenumire_Strada?.trim()) parts.push(anafAddress.sdenumire_Strada.trim());
    if (anafAddress.snumar_Strada?.trim()) parts.push(`Nr. ${anafAddress.snumar_Strada.trim()}`);
    if (anafAddress.sdenumire_Localitate?.trim()) parts.push(anafAddress.sdenumire_Localitate.trim());
    if (anafAddress.sdenumire_Judet?.trim()) parts.push(`Jud. ${anafAddress.sdenumire_Judet.trim()}`);
    return parts.join(', ');
  }

  async startCompanyExport(filter, res) {
    try {
      const mongoFilter = this._buildFilter(filter);

      // Initialize parser with fields
      const parser = new Parser({
        fields: this.fields,
        header: true,
        defaultValue: '',
      });

      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=companies-export-${Date.now()}.csv`);

      // Write BOM for Excel compatibility
      res.write('\ufeff');

      // Create cursor for streaming
      const cursor = await Company.find(mongoFilter).cursor();
      let batch = [];

      try {
        for await (const doc of cursor) {
          const transformedCompany = this._transformCompany(doc);
          batch.push(transformedCompany);

          if (batch.length === this.batchSize) {
            const csv = parser.parse(batch);
            res.write(batch.length === this.batchSize ? '\n' + csv : csv);
            batch = [];
          }
        }

        // Write remaining records
        if (batch.length > 0) {
          const csv = parser.parse(batch);
          res.write(batch.length === this.batchSize ? '\n' + csv : csv);
        }

        res.end();
      } catch (error) {
        cursor.close();
        throw error;
      }
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  }
}

module.exports = new ExportService();
