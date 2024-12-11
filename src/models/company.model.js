// src/models/company.model.js
const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const companySchema = mongoose.Schema(
  {
    cui: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    denumire: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    cod_inmatriculare: {
      type: String,
      trim: true,
      sparse: true,
    },
    stare_firma: {
      type: String,
      trim: true,
      index: true,
    },
    adresa: {
      completa: String,
      tara: String,
      localitate: {
        type: String,
        trim: true,
        index: true,
      },
      judet: {
        type: String,
        trim: true,
        index: true,
      },
      strada: String,
      numar: String,
      bloc: String,
      scara: String,
      etaj: String,
      apartament: String,
      cod_postal: String,
      sector: String,
    },
    adresa_anaf: {
      sediu_social: {
        sdenumire_Strada: String,
        snumar_Strada: String,
        sdenumire_Localitate: String,
        scod_Localitate: String,
        sdenumire_Judet: String,
        scod_Judet: String,
        scod_JudetAuto: String,
        stara: String,
        sdetalii_Adresa: String,
        scod_Postal: String,
      },
      domiciliu_fiscal: {
        ddenumire_Strada: String,
        dnumar_Strada: String,
        ddenumire_Localitate: String,
        dcod_Localitate: String,
        ddenumire_Judet: String,
        dcod_Judet: String,
        dcod_JudetAuto: String,
        dtara: String,
        ddetalii_Adresa: String,
        dcod_Postal: String,
      },
    },
    cod_CAEN: {
      type: String,
      trim: true,
      index: true,
    },
    date_generale: {
      cui: Number,
      denumire: String,
      adresa: String,
      nrRegCom: String,
      telefon: String,
      fax: String,
      codPostal: String,
      stare_inregistrare: String,
      data_inregistrare: String,
      statusRO_e_Factura: Boolean,
      organFiscalCompetent: String,
      forma_de_proprietate: String,
      forma_organizare: String,
      forma_juridica: String,
      website: {
        type: String,
        sparse: true,
      },
      email: {
        type: String,
        sparse: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Optimize indexes for common queries
companySchema.index({ cui: 1 });
companySchema.index({ 'adresa_anaf.sediu_social.sdenumire_Judet': 1, cui: 1 });
companySchema.index({ 'adresa_anaf.sediu_social.sdenumire_Localitate': 1, cui: 1 });
companySchema.index({ cod_CAEN: 1, cui: 1 });

// Compound indexes for common filter combinations
companySchema.index({
  'adresa_anaf.sediu_social.sdenumire_Judet': 1,
  'adresa_anaf.sediu_social.sdenumire_Localitate': 1,
  cui: 1,
});

// Optimized indexes for contact filtering
companySchema.index(
  { 'date_generale.website': 1, cui: 1 },
  {
    partialFilterExpression: { 'date_generale.website': { $exists: true, $ne: '' } },
    sparse: true,
  }
);

companySchema.index(
  { 'date_generale.telefon': 1, cui: 1 },
  {
    partialFilterExpression: { 'date_generale.telefon': { $exists: true, $ne: '' } },
    sparse: true,
  }
);

companySchema.index(
  { 'date_generale.email': 1, cui: 1 },
  {
    partialFilterExpression: { 'date_generale.email': { $exists: true, $ne: '' } },
    sparse: true,
  }
);

companySchema.plugin(toJSON);
companySchema.plugin(paginate);

const Company = mongoose.model('Company', companySchema);

module.exports = Company;
