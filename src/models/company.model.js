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

// Optimized indexes for date-based queries and exports
companySchema.index(
  {
    'date_generale.data_inregistrare': -1,
    cui: 1,
  },
  {
    name: 'date_registration_desc',
  }
);

companySchema.index(
  {
    'date_generale.data_inregistrare': 1,
    cui: 1,
  },
  {
    name: 'date_registration_asc',
  }
);

// Compound index for latest companies with CAEN filter
companySchema.index(
  {
    'date_generale.data_inregistrare': -1,
    cod_CAEN: 1,
    cui: 1,
  },
  {
    name: 'latest_companies_caen',
  }
);

// Compound index for latest companies with location filter
companySchema.index(
  {
    'date_generale.data_inregistrare': -1,
    'adresa_anaf.sediu_social.sdenumire_Judet': 1,
    'adresa_anaf.sediu_social.sdenumire_Localitate': 1,
    cui: 1,
  },
  {
    name: 'latest_companies_location',
  }
);

// Base indexes for individual field queries
companySchema.index({ cui: 1 }, { name: 'cui_index' });
companySchema.index(
  {
    'adresa_anaf.sediu_social.sdenumire_Judet': 1,
    cui: 1,
  },
  {
    name: 'judet_index',
  }
);
companySchema.index(
  {
    'adresa_anaf.sediu_social.sdenumire_Localitate': 1,
    cui: 1,
  },
  {
    name: 'localitate_index',
  }
);
companySchema.index({ cod_CAEN: 1, cui: 1 }, { name: 'caen_index' });

// Compound index for location-based queries
companySchema.index(
  {
    'adresa_anaf.sediu_social.sdenumire_Judet': 1,
    'adresa_anaf.sediu_social.sdenumire_Localitate': 1,
    cui: 1,
  },
  {
    name: 'location_compound_index',
  }
);

// Optimized sparse indexes for contact information
companySchema.index(
  { 'date_generale.website': 1, cui: 1 },
  {
    partialFilterExpression: { 'date_generale.website': { $exists: true, $ne: '' } },
    sparse: true,
    name: 'website_index',
  }
);

companySchema.index(
  { 'date_generale.telefon': 1, cui: 1 },
  {
    partialFilterExpression: { 'date_generale.telefon': { $exists: true, $ne: '' } },
    sparse: true,
    name: 'phone_index',
  }
);

companySchema.index(
  { 'date_generale.email': 1, cui: 1 },
  {
    partialFilterExpression: { 'date_generale.email': { $exists: true, $ne: '' } },
    sparse: true,
    name: 'email_index',
  }
);

// Index for export optimizations with essential fields
companySchema.index(
  {
    'date_generale.data_inregistrare': -1,
    cod_CAEN: 1,
    'adresa_anaf.sediu_social.sdenumire_Judet': 1,
    cui: 1,
    'date_generale.website': 1,
    'date_generale.email': 1,
    'date_generale.telefon': 1,
  },
  {
    name: 'export_optimization_index',
    partialFilterExpression: {
      'date_generale.data_inregistrare': { $exists: true },
    },
    sparse: true,
  }
);

// Add text index for search functionality
companySchema.index(
  {
    denumire: 'text',
    cod_CAEN: 'text',
    'adresa_anaf.sediu_social.sdenumire_Judet': 'text',
    'adresa_anaf.sediu_social.sdenumire_Localitate': 'text',
  },
  {
    name: 'text_search_index',
    weights: {
      denumire: 10,
      cod_CAEN: 5,
      'adresa_anaf.sediu_social.sdenumire_Judet': 3,
      'adresa_anaf.sediu_social.sdenumire_Localitate': 3,
    },
  }
);

companySchema.plugin(toJSON);
companySchema.plugin(paginate);

const Company = mongoose.model('Company', companySchema);

module.exports = Company;
