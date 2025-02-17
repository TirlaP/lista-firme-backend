const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const moment = require('moment');
const Company = require('./models/company.model');
const logger = require('./config/logger');

const MONGODB_URI = 'mongodb://localhost:27017/lista-firme';

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('Connected to MongoDB successfully');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

async function exportCompaniesToExcel() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Companies');

  // Define the columns based on date_generale structure
  worksheet.columns = [
    { header: 'CUI', key: 'cui', width: 12 },
    { header: 'Denumire', key: 'denumire', width: 40 },
    { header: 'Adresa', key: 'adresa', width: 50 },
    { header: 'Nr. Reg. Com', key: 'nrRegCom', width: 15 },
    { header: 'Telefon', key: 'telefon', width: 15 },
    { header: 'Fax', key: 'fax', width: 15 },
    { header: 'Cod Postal', key: 'codPostal', width: 12 },
    { header: 'Stare Inregistrare', key: 'stare_inregistrare', width: 20 },
    { header: 'Data Inregistrare', key: 'data_inregistrare', width: 15 },
    { header: 'Status RO e-Factura', key: 'statusRO_e_Factura', width: 18 },
    { header: 'Organ Fiscal Competent', key: 'organFiscalCompetent', width: 25 },
    { header: 'Forma de Proprietate', key: 'forma_de_proprietate', width: 25 },
    { header: 'Forma Organizare', key: 'forma_organizare', width: 20 },
    { header: 'Forma Juridica', key: 'forma_juridica', width: 20 },
  ];

  // Set the date range for the current week (21-28 November)
  const startDate = '2024-11-21';
  const endDate = '2024-11-28';

  logger.info('Searching for companies between:', startDate, 'and', endDate);

  // Query companies based on date_generale.data_inregistrare
  const companies = await Company.find({
    'date_generale.data_inregistrare': {
      $gte: startDate,
      $lte: endDate,
    },
  }).lean();

  logger.info(`Found ${companies.length} companies`);

  // Add the data to the worksheet
  companies.forEach((company) => {
    if (company.date_generale) {
      worksheet.addRow({
        cui: company.date_generale.cui,
        denumire: company.date_generale.denumire,
        adresa: company.date_generale.adresa,
        nrRegCom: company.date_generale.nrRegCom,
        telefon: company.date_generale.telefon,
        fax: company.date_generale.fax,
        codPostal: company.date_generale.codPostal,
        stare_inregistrare: company.date_generale.stare_inregistrare,
        data_inregistrare: company.date_generale.data_inregistrare,
        statusRO_e_Factura: company.date_generale.statusRO_e_Factura,
        organFiscalCompetent: company.date_generale.organFiscalCompetent,
        forma_de_proprietate: company.date_generale.forma_de_proprietate,
        forma_organizare: company.date_generale.forma_organizare,
        forma_juridica: company.date_generale.forma_juridica,
      });
    }
  });

  // Style the header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Save the workbook
  const fileName = `companies_export_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
  await workbook.xlsx.writeFile(fileName);
  logger.info(`Excel file created: ${fileName}`);

  // Close the database connection
  await mongoose.connection.close();
}

// Run the export process
async function run() {
  try {
    await connectToDatabase();
    await exportCompaniesToExcel();
    logger.info('Export completed successfully');
  } catch (error) {
    logger.error('Export failed:', error);
    logger.error(error.stack);
  }
}

run();
