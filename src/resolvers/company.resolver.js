const DataLoader = require('dataloader');
const { Company } = require('../models');
const mongoose = require('mongoose');

function encodeCursor(fieldName, fieldValue) {
  const payload = JSON.stringify({ fieldName, fieldValue });
  return Buffer.from(payload, 'utf8').toString('base64');
}

function decodeCursor(cursor) {
  const decoded = Buffer.from(cursor, 'base64').toString('utf8');
  return JSON.parse(decoded);
}

function getValueForSortField(company, fieldName) {
  const parts = fieldName.split('.');
  let val = company;
  for (const p of parts) {
    if (!val) break;
    val = val[p];
  }
  return val || null;
}

function transformCompany(company) {
  if (!company) return null;
  return {
    cui: company.cui,
    nume: company.denumire || company.date_generale?.denumire,
    denumire: company.denumire || company.date_generale?.denumire,
    adresa: {
      strada: company.adresa?.strada || company.adresa_anaf?.sediu_social?.sdenumire_Strada,
      numar: company.adresa?.numar || company.adresa_anaf?.sediu_social?.snumar_Strada,
      localitate: company.adresa?.localitate || company.adresa_anaf?.sediu_social?.sdenumire_Localitate,
      judet: company.adresa?.judet || company.adresa_anaf?.sediu_social?.sdenumire_Judet,
      cod_postal: company.adresa?.cod_postal || company.adresa_anaf?.sediu_social?.scod_Postal,
      tara: company.adresa?.tara || company.adresa_anaf?.sediu_social?.stara || 'România',
      cod_judet: company.adresa_anaf?.sediu_social?.scod_Judet,
      cod_judet_auto: company.adresa_anaf?.sediu_social?.scod_JudetAuto,
      cod_localitate: company.adresa_anaf?.sediu_social?.scod_Localitate,
    },
    adresa_completa: company.adresa?.completa,
    contact: {
      email: company.date_generale?.email,
      telefon: company.date_generale?.telefon,
      fax: company.date_generale?.fax,
      website: company.date_generale?.website,
    },
    cod_CAEN: company.cod_CAEN,
    inregistrare: {
      numar: company.cod_inmatriculare || company.date_generale?.nrRegCom,
      stare: company.date_generale?.stare_inregistrare,
      data: company.date_generale?.data_inregistrare,
      organ_fiscal: company.date_generale?.organFiscalCompetent,
    },
    tip_firma: {
      forma_juridica: company.date_generale?.forma_juridica,
      forma_organizare: company.date_generale?.forma_organizare,
      forma_proprietate: company.date_generale?.forma_de_proprietate,
    },
    caen: null,
    date_generale: company.date_generale,
    adresa_anaf: company.adresa_anaf,
  };
}

const companyLoader = new DataLoader(async (cuis) => {
  const companies = await Company.find({ cui: { $in: cuis } }).lean();
  return cuis.map((cui) => companies.find((co) => co.cui === cui) || null);
});

function transformAutocomplete(company) {
  return {
    companyId: company.cod_inmatriculare || '',
    companyName: company.denumire || '',
    locality: company.adresa?.localitate || '',
    county: company.adresa?.judet || '',
    streetName: company.adresa?.strada || '',
    streetNr: company.adresa?.numar || '',
    block: null,
    VAT: !!company.date_generale?.nrRegCom,
    staircase: null,
    apartment: null,
    taxId: company.cui ? company.cui.toString() : '',
    status: company.date_generale?.stare_inregistrare || '',
  };
}

const resolvers = {
  Query: {
    companies: async (_, { input }) => {
      const { first = 50, after, cod_CAEN, judet, oras, hasWebsite, hasContact, sortBy } = input;
      const filter = {};
      if (cod_CAEN) filter.cod_CAEN = cod_CAEN;
      if (judet) filter['adresa.judet'] = judet;
      if (oras) filter['adresa.localitate'] = oras;
      if (hasWebsite) filter['date_generale.website'] = { $exists: true, $ne: '' };
      if (hasContact) {
        filter.$or = [
          { 'date_generale.telefon': { $exists: true, $ne: '' } },
          { 'date_generale.email': { $exists: true, $ne: '' } },
        ];
      }
      let fieldName = 'date_generale.data_inregistrare';
      let direction = -1;
      if (sortBy) {
        const { field, direction: dir } = sortBy;
        direction = dir === 'DESC' ? -1 : 1;
        if (field === 'REGISTRATION_DATE') fieldName = 'date_generale.data_inregistrare';
        if (field === 'CUI') fieldName = 'cui';
        if (field === 'NUME') fieldName = 'denumire';
      }
      if (after) {
        const { fieldName: cursorField, fieldValue } = decodeCursor(after);
        if (cursorField === fieldName) {
          if (direction === 1) filter[fieldName] = { $gt: fieldValue };
          else filter[fieldName] = { $lt: fieldValue };
        }
      }
      const sortObj = { [fieldName]: direction };
      const totalCount = 1932691;
      // const totalCount = await Company.countDocuments(filter);
      const results = await Company.find(filter)
        .sort(sortObj)
        .limit(first + 1)
        .lean();
      const hasNextPage = results.length > first;
      const sliced = results.slice(0, first);
      const edges = sliced.map((company) => {
        const val = getValueForSortField(company, fieldName);
        let fieldValue = val;
        if (val instanceof Date) fieldValue = val.toISOString();
        if (!val) fieldValue = '';
        return {
          node: transformCompany(company),
          cursor: encodeCursor(fieldName, fieldValue),
        };
      });
      return {
        edges,
        pageInfo: {
          hasNextPage,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        },
        totalCount,
      };
    },
    company: async (_, { cui }) => {
      const company = await companyLoader.load(cui);
      return transformCompany(company);
    },
    companyStats: async () => {
      const [totalCompanies, activeCompanies, withWebsite, withContact] = await Promise.all([
        Company.estimatedDocumentCount(),
        Company.countDocuments({ stare_firma: '1' }),
        Company.countDocuments({ 'date_generale.website': { $exists: true, $ne: '' } }),
        Company.countDocuments({
          $or: [
            { 'date_generale.telefon': { $exists: true, $ne: '' } },
            { 'date_generale.email': { $exists: true, $ne: '' } },
          ],
        }),
      ]);
      return {
        totalCompanies,
        activeCompanies,
        withWebsite,
        withContact,
      };
    },
    autocomplete: async (_, { text }) => {
      const isNumeric = /^\d+$/.test(text);
      const filter = {};
      if (isNumeric) {
        const cuiNumber = parseInt(text, 10);
        filter.cui = cuiNumber;
      } else {
        filter.denumire = { $regex: text, $options: 'i' };
      }
      const results = await Company.find(filter).limit(10).lean();
      return results.map(transformAutocomplete);
    },
  },
};

module.exports = resolvers;
