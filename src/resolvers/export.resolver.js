const { Company } = require('../models');
const { Parser } = require('json2csv');
const logger = require('../config/logger');

const buildExportDateFilter = (customStartDate, customEndDate) => {
  let start = new Date(customStartDate);
  let end = new Date(customEndDate);
  if (!customStartDate || !customEndDate) {
    start = new Date();
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setHours(23, 59, 59, 999);
  }
  return {
    $gte: start.toISOString().split('T')[0],
    $lte: end.toISOString().split('T')[0],
  };
};

const transformExportCompany = (company) => ({
  cui: company.cui,
  denumire: company.denumire,
  caen: company.cod_CAEN || '',
  nrRegCom: company.cod_inmatriculare || (company.date_generale && company.date_generale.nrRegCom) || '',
  telefon: (company.date_generale && company.date_generale.telefon) || '',
  fax: (company.date_generale && company.date_generale.fax) || '',
  codPostal: (company.adresa && company.adresa.cod_postal) || '',
  stare_inregistrare: (company.date_generale && company.date_generale.stare_inregistrare) || '',
  data_inregistrare: (company.date_generale && company.date_generale.data_inregistrare) || '',
  statusRO_e_Factura: (company.date_generale && company.date_generale.statusRO_e_Factura) || '',
  organFiscalCompetent: (company.date_generale && company.date_generale.organFiscalCompetent) || '',
  forma_de_proprietate: (company.date_generale && company.date_generale.forma_de_proprietate) || '',
  forma_organizare: (company.date_generale && company.date_generale.forma_organizare) || '',
  forma_juridica: (company.date_generale && company.date_generale.forma_juridica) || '',
});

const exportLatestCompanies = {
  Query: {
    exportLatestCompanies: async (_, { input }) => {
      try {
        const { customStartDate, customEndDate, format } = input;
        const dateFilter = buildExportDateFilter(customStartDate, customEndDate);
        const filter = { 'date_generale.data_inregistrare': dateFilter };
        logger.info('Export filter:', JSON.stringify(filter));
        const companies = await Company.find(filter).lean();
        const transformed = companies.map(transformExportCompany);
        const fields = [
          { label: 'CUI', value: 'cui' },
          { label: 'Denumire', value: 'denumire' },
          { label: 'Cod CAEN', value: 'caen' },
          { label: 'Nr. Înregistrare', value: 'nrRegCom' },
          { label: 'Telefon', value: 'telefon' },
          { label: 'Fax', value: 'fax' },
          { label: 'Cod Postal', value: 'codPostal' },
          { label: 'Stare Inregistrare', value: 'stare_inregistrare' },
          { label: 'Data Înregistrare', value: 'data_inregistrare' },
          { label: 'Status RO e-Factura', value: 'statusRO_e_Factura' },
          { label: 'Organ Fiscal Competent', value: 'organFiscalCompetent' },
          { label: 'Forma de Proprietate', value: 'forma_de_proprietate' },
          { label: 'Forma Organizare', value: 'forma_organizare' },
          { label: 'Forma Juridica', value: 'forma_juridica' },
        ];
        const parser = new Parser({ fields, header: true, defaultValue: '' });
        const csv = parser.parse(transformed);
        return {
          fileName: `latest_companies_export_${Date.now()}.csv`,
          content: csv,
        };
      } catch (error) {
        logger.error('Error exporting latest companies:', error);
        throw new Error('Export failed');
      }
    },
  },
};

module.exports = exportLatestCompanies;
